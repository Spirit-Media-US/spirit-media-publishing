// /store-webhook — Stripe webhook for every store sale (Cloudflare Pages Function on the SMP site).
//
// MOVED from FHB functions/print-webhook.ts (map smp-store-one-home-v1 §4 moves 1+2): the SMP store takes the payment,
// so the SMP site now does everything after it. On `checkout.session.completed` it emails us the fulfilment details
// (Kevin's notice, incl. Ingram lines and signed copies) and the buyer their confirmation, sends the Spirit Media
// Charities gift receipt when the order carries a gift, then stamps `notified_at` on the session so an order nobody was
// told about can be found later (bin/fhb-order-reconcile.py). Covers all three kinds the store creates: `dvc_print`
// (every print order, FHB Bibles and books), `print_bulk` (the retired 25-copy path) and `ebook_direct`.
// Signature-verified with STRIPE_STORE_WEBHOOK_SECRET (this endpoint's own Stripe signing secret).
//
// DUPLICATE-SAFE (move 1): during the switch BOTH this endpoint and FHB /print-webhook receive every event. Before any
// email, each endpoint CLAIMS the session in Stripe with an Idempotency-Key unique to the session and a body unique to
// the endpoint (claimSession below). Stripe executes the first claim and refuses the other (idempotency_error), so
// exactly one endpoint sends; a Stripe redelivery to the SAME endpoint replays its own claim and re-sends as before.
// A session already stamped notified_at, or claimed by the other endpoint, is acknowledged without a send.
//
// It ACKs 2xx for anything it deliberately ignores, but answers 5xx when an email genuinely failed, so Stripe
// redelivers instead of the order vanishing quietly.
// BUILD-CHECK: searched ebook link signer, store webhook, order page (tool-inventory.py) + ls functions/ src/lib in FHB and SMP
// NEAREST: FHB functions/print-webhook.ts (this file, ported; same tests in scripts/store-webhook.test.mjs)
// NOT-REUSED-BECAUSE: this IS that code, MOVED into SMP (a Pages project cannot import another's files); FHB's endpoint
//   is retired in move 5 once this one is live and proven.
// APPROVED-BY: Kevin 2026-11-20 ~18:51Z "2 this needs to be moved. You are inheriting OLD instead of making it new" (brief jobs/smp-store-one-home-brief.md)

import { ebookLinkUrl, windowOrigin } from '../src/lib/ebookLink.ts';
import { fmtAddr, fmtOrder, ingramLines } from '../src/lib/orderText.ts';
import { readBreakdown, releaseDateText } from '../src/store-engine/lib/order-pricing.ts';
import { countryFor } from '../src/store-engine/lib/shipCountries.ts';
import { EBOOK_SKUS } from '../src/store-engine/lib/storeEngine.ts';

interface Env {
	STRIPE_STORE_WEBHOOK_SECRET?: string;
	// The store account's key: claims the session (claimSession) and stamps notified_at (markNotified).
	STRIPE_STORE_SECRET_KEY?: string;
	// SMP's own eBook link signing secret (src/lib/ebookLink.ts v2). Unbound: the email carries the session link.
	EBOOK_LINK_SECRET?: string;
	MAILGUN_API_KEY?: string;
	MAILGUN_SENDING_DOMAIN?: string;
	PRINT_ORDER_NOTIFY_TO?: string;
}

// Kevin 2026-11-16 (Option C item 10): "The order emails show FHB Orders. Should be SMP Orders." Every order email.
export const NOTIFY_FROM = 'SMP Orders <orders@send.spiritmediapublishing.com>';
// TBL's own sale kinds (I22 2026-11-23): TBL delivers them, this endpoint only notifies Kevin.
export const TBL_DELIVERED_KINDS: readonly string[] = [
	'audiobook_direct',
	'tbl_ebook',
	'ebook_bundle',
];
// ...and "add our address to the bottom signature of each email": every BUYER order email (print, both windows, and the
// eBook email) ends with this, verbatim, below the item-8 window line. Mirrored in bin/fhb-order-reconcile.py.
// Kevin 2026-11-24 ~14:4xZ (pmshipping, kevin-decisions): EVERY email carries the identity statement + this footer
// "at the bottom to avoid any confusion" (supersedes the 11-16 address-only signature). Mirrored in
// bin/fhb-order-reconcile.py + bin/fhb-order-ship.py. Never edit one without the others.
// Kevin 2026-11-26 ~20:5xZ: "Always show my name Kevin White, CEO above SMP" (ALL correspondence).
export const SIGNATURE = [
	"Spirit Media Publishing publishes Christian books and the Father's Heart Bible™ in Divine Voice™ Color. We deliver them through The Believer's Library: one app for every believer worldwide providing free Bibles and access to all Christian books.",
	'',
	'Kevin White, CEO',
	'Spirit Media Publishing',
	'Phone: 1-888-800-3744',
	'Email: hello@spiritmediapublishing.com',
	'',
	'spiritmediapublishing.com',
	'fathersheartbible.com',
	'thebelieverslibrary.com',
	'',
	'205 S Academy St, Unit 3251, Cary, NC 27519, USA',
].join('\n');
const NOTIFY_TO_DEFAULT = 'kevin@spiritmediapublishing.com';
// Contact us = hello@ at every step (Kevin 2026-11-16): the BUYER's emails reply there. Kevin's internal notification
// keeps its own Reply-To (the buyer) and its own recipient.
export const BUYER_REPLY_TO = 'hello@spiritmediapublishing.com';

// ONE STORE = Spirit Media Publishing for every order, FHB or not (Kevin 2026-11-20 ~16:07Z: "This needs to be cleaned up
// NOW and everywhere as the store is NOW Spirit Media Publishing whether it is FHB or not. It is confusing for SMP books
// to show order confrimation FHB."). Supersedes the 2026-11-16 "1A" two-window subjects/sign-offs: every buyer email is
// "Your Spirit Media Publishing order" with NO window line above the address signature (Kevin 2026-11-16 15:42Z: the
// signature already says it). Product names (Father's Heart Bible editions) stay in the line items.
// `window` is still computed (session Option C tag, else site) because it routes the SIGNED eBook link to its own site
// (windowOrigin) and is logged on Kevin's notice; it no longer brands anything the buyer reads.
// signoffBlock() stays the one place a window line could be written: it now always receives ''.
// TBL ORDERS (Kevin D99 2026-11-23: "Make sure order emails are worded as Spirit Media Publishing Order through The
// Believer's Library."). A session sold through The Believer's Library carries the TBL host as metadata utm_source
// (community src/lib/library-billing-store.ts tblCheckoutForm/audiobookForm). Its BUYER email subject + first line say
// TBL_ORDER_LINE; From stays "SMP Orders", the body + signature are unchanged, and every FHB/SMP order is untouched.
export const TBL_ORDER_LINE = "Spirit Media Publishing Order through The Believer's Library";
const TBL_HOST_RE =
	/^(?:(?:www\.)?thebelieverslibrary\.com|tbl[a-z0-9-]*\.community-cm1\.pages\.dev)$/i;
/** True when the session was sold through The Believer's Library (its utm_source is a TBL host). */
export const viaTbl = (m: Record<string, string> | null | undefined) =>
	TBL_HOST_RE.test(String(m?.utm_source ?? '').trim());
export function buyerBrand(m: Record<string, string> | null | undefined, amount: string) {
	const w = m?.window || (m?.site && m.site !== 'fhb' ? 'smp' : 'fhb');
	const tbl = viaTbl(m);
	return {
		window: w === 'smp' ? 'smp' : 'fhb',
		subject: tbl
			? `${TBL_ORDER_LINE} — ${amount}`
			: `Your Spirit Media Publishing order — ${amount}`,
		/** The buyer email's first line ('' = none): TBL orders only. */
		heading: tbl ? `${TBL_ORDER_LINE}\n\n` : '',
		tbl,
		signoff: '',
	};
}
export const signoffBlock = (signoff: string) => (signoff ? `${signoff}\n\n` : '');

// PRE-ORDER (Kevin 2026-11-24 MMFI: "payment confirmation sent with note of delivery in January"): a session the engine
// marked metadata preorder=true + ship_after=YYYY-MM-DD. The buyer email says when it ships IN PLACE of the in-stock
// delivery estimate (which would be wrong for a book not yet released); Kevin's notice says not to place it early.
/** The release date text of a pre-order session ("January 7, 2027"), or null for an ordinary order. */
export function preorderDate(m: Record<string, string> | null | undefined): string | null {
	const d = String(m?.ship_after ?? '');
	return m?.preorder === 'true' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? releaseDateText(d) : null;
}
export const preorderBuyerLine = (date: string) =>
	`This is a pre-order. Your book ships at release. Releasing ${date}. Shipping is free.\n\n`;

// GIFT TO CHARITY on a RIAB order (SMP src/lib/riabOrder.ts (c); Kevin 2026-11-20 ~16:10Z optional gift designated CF /
// FOH / 50-50, ~16:20Z "receipted from spirit media charities with 100% going to the charities", ~16:25Z "Each order
// with donation receives 2 emails one for purchase confirmation. One for donation confirmation to be used as tax
// deductible receipt.", ~16:30Z "100% of the amount received"). The session carries metadata donation_cents (the gift),
// designation (cf|foh|split), fee_covered, donation_fee_cover_cents, donation_total_cents (what the donor gave = the
// receipt amount), donation_transfer_cents (what Spirit Media Charities receives). The gift is transferred to SMC's
// Stripe account by the charge itself; this webhook only tells people.
export const SMC_NAME = 'Spirit Media Charities';
export const SMC_EIN = '88-4352701';
export const SMC_FROM = 'Spirit Media Charities <receipts@send.spiritmediapublishing.com>';
export const SMC_ADDRESS = ['205 S Academy St Unit 3251', 'Cary, NC 27519', 'USA'].join('\n');
export const GIFT_COPY =
	'Receipted by Spirit Media Charities, a 501(c)(3). 100% of the amount Spirit Media Charities receives goes to the charity you choose (Cheyenne Foundation, Foundation of Hope, or split 50/50).';
const DESIGNATION: Record<string, string> = {
	cf: 'Cheyenne Foundation',
	foh: 'Foundation of Hope',
	split: 'Split 50/50: Cheyenne Foundation and Foundation of Hope',
};
const usd = (c: number) =>
	(c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export type Gift = {
	gift: number;
	cover: number;
	total: number;
	transfer: number;
	designation: string;
	label: string;
	cf: number;
	foh: number;
};
/** The gift on a session, or null (no gift, or metadata that does not describe one). */
export function giftOf(m: Record<string, string> | null | undefined): Gift | null {
	const gift = Number(m?.donation_cents);
	const d = String(m?.designation ?? '');
	if (!Number.isInteger(gift) || gift <= 0 || !DESIGNATION[d]) return null;
	const cover = Number(m?.donation_fee_cover_cents) || 0;
	const total = Number(m?.donation_total_cents) || gift + cover;
	const transfer = Number(m?.donation_transfer_cents) || gift;
	const foh = d === 'foh' ? total : d === 'split' ? Math.floor(total / 2) : 0;
	return {
		gift,
		cover,
		total,
		transfer,
		designation: d,
		label: DESIGNATION[d],
		cf: total - foh,
		foh,
	};
}
/** The designation as the receipt and the notice print it: each charity's part of what the donor gave. */
export const giftSplit = (g: Gift) =>
	g.designation === 'split'
		? `  Cheyenne Foundation: ${usd(g.cf)}\n  Foundation of Hope: ${usd(g.foh)}`
		: `  ${g.label}: ${usd(g.total)}`;
/** The SEPARATE tax receipt from Spirit Media Charities. Stands alone: name, date, amount, designation, EIN, IRS line. */
export function giftReceipt(
	g: Gift,
	donor: string,
	date: string,
	ref: string,
): { subject: string; text: string } {
	return {
		subject: `Your gift receipt from Spirit Media Charities — ${usd(g.total)}`,
		text:
			`Thank you for your gift.\n\n` +
			`DONATION RECEIPT\n` +
			`Donor: ${donor}\n` +
			`Date of gift: ${date}\n` +
			`Amount of gift: ${usd(g.total)}` +
			(g.cover > 0
				? ` (your gift of ${usd(g.gift)} plus ${usd(g.cover)} you added to cover the card processing fee)`
				: '') +
			`\n` +
			`Designation: ${g.label}\n${giftSplit(g)}\n` +
			`Receipt reference: ${ref}\n\n` +
			`${GIFT_COPY}\n\n` +
			`No goods or services were provided in exchange for this gift. (Any books on the same order were purchased\n` +
			`separately from Spirit Media Publishing and are not part of this gift.)\n\n` +
			`Spirit Media Charities is a tax-exempt organization under section 501(c)(3) of the Internal Revenue Code,\n` +
			`EIN ${SMC_EIN}. Your gift is tax-deductible to the extent allowed by law. Please keep this receipt for your records.\n\n` +
			`${SMC_NAME}\n${SMC_ADDRESS}\n`,
	};
}

function hexToBytes(hex: string): Uint8Array | null {
	if (hex.length % 2 !== 0) return null;
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		const b = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		if (Number.isNaN(b)) return null;
		out[i] = b;
	}
	return out;
}
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

// Verify Stripe's "t=…,v1=…" signature over "<t>.<rawBody>" (HMAC-SHA256).
async function verify(raw: string, header: string, secret: string): Promise<boolean> {
	const parts = Object.fromEntries(
		header.split(',').map((s) => s.trim().split('=', 2) as [string, string]),
	);
	const t = Number(parts.t);
	if (!Number.isFinite(t) || Math.abs(Math.floor(Date.now() / 1000) - t) > 300) return false;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const sig = new Uint8Array(
		await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)),
	);
	const v1 = hexToBytes(parts.v1 ?? '');
	return !!v1 && timingSafeEqual(sig, v1);
}

// THE CLAIM (duplicate safety, see the header). One Idempotency-Key per session, shared by every endpoint; the body
// names the endpoint, so a second endpoint's claim is a DIFFERENT request under the same key and Stripe refuses it
// (400 idempotency_error) while the first is stored. Stripe keeps keys 24h; the claim is also written to the session
// (metadata notify_claim) and read back first, so a redelivery days later still sees who owns it.
export const CLAIM_BY = 'smp-store-webhook';
export const claimKey = (sid: string) => `store-notify-claim-${sid}`;
export type Claim = 'ours' | 'theirs' | 'done' | 'retry';
export async function claimSession(
	key: string | undefined,
	sid: string,
	by = CLAIM_BY,
): Promise<Claim> {
	if (!key || !sid) return 'ours'; // no key bound (tests, preview without Stripe): nothing to coordinate with
	const auth = { Authorization: `Bearer ${key}` };
	try {
		const g = await fetch(
			`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`,
			{ headers: auth },
		);
		if (g.ok) {
			const m = ((await g.json()) as { metadata?: Record<string, string> }).metadata ?? {};
			if (m.notified_at) return 'done';
			if (m.notify_claim && m.notify_claim !== by) return 'theirs';
		}
		const r = await fetch(
			`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`,
			{
				method: 'POST',
				headers: {
					...auth,
					'Content-Type': 'application/x-www-form-urlencoded',
					'Idempotency-Key': claimKey(sid),
				},
				body: new URLSearchParams({ 'metadata[notify_claim]': by }),
			},
		);
		if (r.ok) return 'ours';
		const e = ((await r.json().catch(() => ({}))) as { error?: { type?: string } }).error;
		if (r.status === 400 && e?.type === 'idempotency_error') return 'theirs';
		return 'retry'; // 409 (the other claim is in flight) or Stripe unreachable: let Stripe redeliver
	} catch {
		return 'retry';
	}
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	const ack = () => new Response('ok', { status: 200 });
	// A 5xx makes Stripe redeliver this event with backoff for up to 3 days. Used only
	// when an email actually failed: the old code swallowed that, so a Mailgun outage
	// meant an order nobody was ever told about. If one of the two sends succeeded, the
	// retry re-sends it — a duplicate confirmation is a far smaller harm than a lost
	// order, and the reconciler (fhb-order-reconcile.py) catches anything that stays
	// unsent past the retry window.
	const retry = () => new Response('email failed — please retry', { status: 500 });
	const raw = await request.text();
	const sig = request.headers.get('stripe-signature') ?? '';

	if (!env.STRIPE_STORE_WEBHOOK_SECRET) return ack(); // not configured yet
	if (!(await verify(raw, sig, env.STRIPE_STORE_WEBHOOK_SECRET))) {
		return new Response('bad signature', { status: 400 });
	}

	let event: any;
	try {
		event = JSON.parse(raw);
	} catch {
		return ack();
	}
	if (event?.type !== 'checkout.session.completed') return ack();
	const s = event.data?.object ?? {};
	// Both checkout paths land here: the retired 25-copy /print-checkout stamps
	// `print_bulk`, the live /dvc-checkout stamps `dvc_print`. Matching only the
	// former meant NO /print order notified anyone between the mix-and-match
	// rewrite and 2026-09-03, when a customer asked why he got no confirmation.
	// eBook sales (`ebook_direct`) reached this endpoint too and were dropped: no
	// notification to us, no record, and the buyer's only route to their download
	// was the success page — close that tab and the link was gone, because no email
	// ever carried it. Handled below, before the print-shaped fields are read.
	const kind = s?.metadata?.kind;
	// TBL_DELIVERED_KINDS (I22 2026-11-23): TBL's own sales (audiobook, language eBook, series bundle). TBL delivers
	// them (My Library) and emails the buyer; here only Kevin's sale notice, once (below, before the print fields).
	if (
		kind !== 'print_bulk' &&
		kind !== 'dvc_print' &&
		kind !== 'ebook_direct' &&
		!TBL_DELIVERED_KINDS.includes(kind)
	)
		return ack();

	const email = s.customer_details?.email ?? '(no email)';
	// Stripe moved the collected address to collected_information.shipping_details;
	// top-level shipping_details is null on current API versions. Try newest first.
	const ship =
		s.collected_information?.shipping_details ?? s.shipping_details ?? s.customer_details ?? {};
	const name = ship.name ?? s.customer_details?.name ?? '(no name)';
	const amount = ((s.amount_total ?? 0) / 100).toLocaleString('en-US', {
		style: 'currency',
		currency: (s.currency ?? 'usd').toUpperCase(),
	});
	const tax = s.total_details?.amount_tax
		? (s.total_details.amount_tax / 100).toLocaleString('en-US', {
				style: 'currency',
				currency: 'USD',
			})
		: '$0.00';
	const m = s.metadata ?? {};
	const gift = giftOf(m);
	const phone: string | undefined = s.customer_details?.phone || undefined;
	const destCode: string | undefined = ship.address?.country;
	const site = countryFor(destCode);

	// Duplicate safety: exactly one endpoint (this one or FHB /print-webhook) sends for a session.
	const claim = await claimSession(env.STRIPE_STORE_SECRET_KEY, s.id ?? '');
	if (claim === 'done' || claim === 'theirs') return ack();
	if (claim === 'retry') return new Response('claim pending — please retry', { status: 503 });

	// Stamp the session once its emails are away. This is what makes an un-notified
	// order *findable*: fhb-order-reconcile.py sweeps paid sessions missing
	// `notified_at` and sends them itself. Stripe holds the mark, so there is no
	// second ledger to drift out of step with the orders it describes. Best-effort —
	// a failed stamp only costs a duplicate send from the reconciler, never a miss.
	const markNotified = async () => {
		if (!env.STRIPE_STORE_SECRET_KEY || !s.id) return;
		try {
			await fetch(`https://api.stripe.com/v1/checkout/sessions/${s.id}`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${env.STRIPE_STORE_SECRET_KEY}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					'metadata[notified_at]': new Date().toISOString(),
				}),
			});
		} catch {
			/* the reconciler is the backstop */
		}
	};

	// Returns whether the message was actually accepted, so a failed send can be
	// escalated rather than swallowed (see the retry note at the end of the handler).
	const send = async (
		to: string,
		subject: string,
		body: string,
		replyTo?: string,
		opts: { from?: string; bcc?: string } = {},
	) => {
		if (!env.MAILGUN_API_KEY) return false;
		const domain = env.MAILGUN_SENDING_DOMAIN || 'send.spiritmediapublishing.com';
		const form = new URLSearchParams();
		form.set('from', opts.from ?? NOTIFY_FROM);
		if (opts.bcc) form.set('bcc', opts.bcc);
		form.set('to', to);
		form.set('subject', subject);
		form.set('text', body);
		form.set(
			'html',
			`<pre style="font:14px/1.5 ui-monospace,monospace">${body
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')}</pre>`,
		);
		form.set('o:tracking', 'no');
		if (replyTo) form.set('h:Reply-To', replyTo);
		try {
			const r = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
				method: 'POST',
				headers: {
					Authorization: `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: form,
			});
			return r.ok;
		} catch {
			return false;
		}
	};

	if (TBL_DELIVERED_KINDS.includes(kind)) {
		const label =
			kind === 'audiobook_direct'
				? 'Audiobook'
				: kind === 'ebook_bundle'
					? 'eBook bundle'
					: 'eBook';
		const sku: string | undefined = m.audiobook_sku || m.bundle_sku || m.ebook_sku || undefined;
		const title = /(?:^|\|)title=([^|]*)/.exec(m.book_1 ?? '')?.[1] || sku || label;
		const ok = await send(
			env.PRINT_ORDER_NOTIFY_TO || NOTIFY_TO_DEFAULT,
			`${kind === 'audiobook_direct' ? '🎧' : '📖'} ${label} sale — ${amount}`,
			`New ${label.toLowerCase()} sale — ${title}\n\n` +
				`Total: ${amount}\nCustomer email: ${email}\nStripe session: ${s.id ?? '?'}\n` +
				`${label} SKU: ${sku ?? '?'}\n` +
				`Delivered by The Believer's Library (My Library); no SMP email to the buyer.\n`,
			email !== '(no email)' ? email : undefined,
		);
		if (ok) {
			await markNotified();
			return ack();
		}
		return retry();
	}

	// eBook: no address, no production run — the buyer needs their download link in
	// writing, because the success page is otherwise the only place it ever appears.
	if (kind === 'ebook_direct') {
		// A book's eBook (metadata ebook_sku, SMP /store-checkout) gets the SIGNED link on its shop window's own site
		// (src/lib/ebookLink.ts); the Bible eBook keeps its v1 session link on FHB.
		const ebookSku: string | undefined = m.ebook_sku || undefined;
		const bookTitle = ebookSku ? (EBOOK_SKUS[ebookSku]?.title ?? ebookSku) : "Father's Heart Bible";
		// With SMP's signing secret bound the link is the v2 SIGNED link; without it, the session link (the success
		// redirect's own form, which /ebook-download re-reads from Stripe and signs on click), never a link that cannot work.
		const origin = windowOrigin(buyerBrand(m, amount).window);
		const sessionLink = `${ebookSku ? origin : 'https://fathersheartbible.com'}/ebook-download?s=${encodeURIComponent(s.id ?? '')}`;
		const link = ebookSku
			? env.EBOOK_LINK_SECRET
				? await ebookLinkUrl(env.EBOOK_LINK_SECRET, origin, s.id ?? '', ebookSku)
				: /^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(s.id ?? '')
					? sessionLink
					: null
			: sessionLink;
		if (!link) return retry(); // unsignable (no secret / malformed session): never email a link that cannot work
		const okKevin = await send(
			env.PRINT_ORDER_NOTIFY_TO || NOTIFY_TO_DEFAULT,
			`📖 eBook sale — ${amount}`,
			`New eBook sale — ${bookTitle}\n\n` +
				`Total: ${amount}\nCustomer email: ${email}\nStripe session: ${s.id ?? '?'}\n` +
				(ebookSku ? `eBook SKU: ${ebookSku} · window: ${buyerBrand(m, amount).window}\n` : ''),
			email !== '(no email)' ? email : undefined,
		);
		const okCust =
			email === '(no email)' ||
			(await send(
				email,
				buyerBrand(m, amount).tbl
					? `${TBL_ORDER_LINE} — ${ebookSku ? bookTitle : 'Father’s Heart Bible'}`
					: `Your eBook — ${ebookSku ? bookTitle : 'Father’s Heart Bible'}`,
				`${buyerBrand(m, amount).heading}Thank you — your eBook is ready.\n\n` +
					(ebookSku ? `${bookTitle}\n\n` : '') +
					`Download it here (the link stays valid, so keep this email):\n${link}\n\n` +
					`It's a DRM-free EPUB — open it in Apple Books, Google Play Books,\n` +
					`or any reader. Total paid: ${amount}\n\n` +
					`Order reference: ${s.id ?? '?'}\n\n` +
					`Trouble opening it? Just reply to this email.\n\n${signoffBlock(buyerBrand(m, amount).signoff)}${SIGNATURE}\n`,
				BUYER_REPLY_TO,
			));
		if (okKevin && okCust) {
			await markNotified();
			return ack();
		}
		return retry();
	}

	// One store (Kevin 2026-11-20 ~16:07Z): every order notice is headed Spirit Media Publishing; the window is logged below.
	const text =
		`New print order — Spirit Media Publishing\n\n` +
		`Shop window: ${buyerBrand(m, amount).window === 'smp' ? 'spiritmediapublishing.com' : 'fathersheartbible.com'}\n` +
		`Total: ${amount} (incl. tax ${tax})\n` +
		`Copies: ${m.total ?? '?'}  ·  Discount: ${m.pct_off ?? '?'}% off${m.offer === 'first_order' ? ' (first order, WELCOME15)' : m.offer === 'volume' ? ' (volume)' : ''}\n` +
		`Editions:\n${fmtOrder(readBreakdown(m))}\n` +
		`${ingramLines(readBreakdown(m))}\n` +
		`Ship to:\n${name}\n${fmtAddr(ship.address)}\n\n` +
		`Customer email: ${email}\n` +
		`Phone (pass to the Ingram order, carriers call international buyers): ${phone ?? '*** MISSING: email the buyer before placing the order ***'}\n` +
		`Ingram print site for ${destCode ?? '?'}: ${site ? `${site.printSite} (${site.name}, config rate ${site.shippingRate.value} ${site.shippingRate.currency})` : '*** country not in the live ship list: check before ordering ***'}\n` +
		`Stripe session: ${s.id ?? '?'}\n` +
		(preorderDate(m)
			? `\nPRE-ORDER: paid now, ships at release ${m.ship_after} (${preorderDate(m)}). SKUs: ${m.preorder_skus ?? '?'}\n` +
				`Do NOT place with Ingram before ${m.ship_after} minus the print lead time.\n`
			: '') +
		(gift
			? `\nGIFT TO CHARITY (Spirit Media Charities receipts it; NOT SMP revenue)\n` +
				`Designation: ${gift.designation} = ${gift.label}\n${giftSplit(gift)}\n` +
				`Donor gave: ${usd(gift.total)}${gift.cover > 0 ? ` (gift ${usd(gift.gift)} + fee cover ${usd(gift.cover)})` : ' (fee not covered)'}\n` +
				`Transferred to Spirit Media Charities: ${usd(gift.transfer)}\n` +
				`Books total (Total minus the gift): ${usd((s.amount_total ?? 0) - gift.total)}\n` +
				`Tax receipt emailed to the donor from Spirit Media Charities (copy to this address).\n`
			: '');
	// The buyer's own confirmation. Until 2026-09-03 we sent the customer NOTHING —
	// Stripe's payment receipt was the only thing they ever received, so a buyer had
	// no confirmation their ORDER (as opposed to their payment) existed.
	const brand = buyerBrand(m, amount);
	const custText =
		`${brand.heading}Thank you for your order.\n\n` + // Kevin 2026-11-24: "orders need to say Thank you for your order"
		`What you ordered:\n${fmtOrder(readBreakdown(m))}\n\n` +
		`Total paid: ${amount}\n` +
		(gift
			? `This includes your ${usd(gift.total)} gift to charity; Spirit Media Charities is emailing you its receipt separately.\n`
			: '') +
		`Order reference: ${s.id ?? '?'}\n\n` +
		`Shipping to:\n${name}\n${fmtAddr(ship.address)}\n` +
		`Phone for the delivery carrier: ${phone ?? '(none on file, please reply with one)'}\n\n` +
		(preorderDate(m)
			? preorderBuyerLine(preorderDate(m) as string)
			: Number(m.total) > 9
				? `Shipping is free. Larger bulk orders take about 3–4 weeks to reach you.\n\n`
				: `Shipping is free, and most orders arrive within 7–10 days.\n\n`) +
		`Need to change or ask about this order? Just reply to this email and it comes\n` +
		`straight to us — please include your order reference above.\n\n` +
		`${signoffBlock(brand.signoff)}${SIGNATURE}\n`;

	const okKevin = await send(
		env.PRINT_ORDER_NOTIFY_TO || NOTIFY_TO_DEFAULT,
		`📚 ${preorderDate(m) ? 'PRE-ORDER ' : ''}Print order — ${m.total ?? '?'} copies · ${amount}`,
		text,
		email !== '(no email)' ? email : undefined,
	);
	const okCust =
		email === '(no email)' || (await send(email, brand.subject, custText, BUYER_REPLY_TO));
	// An order WITH a gift: a SECOND, separate email, the tax receipt from Spirit Media Charities; a copy goes to the
	// order notice address for SMC's books. A gift-free order sends nothing more.
	let okGift = true;
	if (gift) {
		const donor = s.customer_details?.name || name;
		const date = new Date(
			((s.created as number) || Math.floor(Date.now() / 1000)) * 1000,
		).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: 'America/New_York',
		});
		const r = giftReceipt(gift, donor, date, s.id ?? '?');
		okGift =
			email === '(no email)'
				? await send(
						env.PRINT_ORDER_NOTIFY_TO || NOTIFY_TO_DEFAULT,
						`[no donor email] ${r.subject}`,
						r.text,
						undefined,
						{ from: SMC_FROM },
					)
				: await send(email, r.subject, r.text, BUYER_REPLY_TO, {
						from: SMC_FROM,
						bcc: env.PRINT_ORDER_NOTIFY_TO || NOTIFY_TO_DEFAULT,
					});
	}

	if (okKevin && okCust && okGift) {
		await markNotified();
		return ack();
	}
	return retry();
};
