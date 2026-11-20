// BUILD-CHECK: searched tool-inventory.py bulk tier autographed signed donation checkout riab (2026-11-20)
// NEAREST: src/store-engine/lib/storeEngine.ts checkoutForm + order-pricing.ts (the ONE store engine; this module CALLS it)
// NOT-REUSED-BECAUSE: the engine is byte-synced to FHB (MANIFEST.json + store-engine-sync test) and puts books on NO
//   volume ladder; RIAB's own ladder/signed split is SMP-only, so it wraps the engine's form instead of forking it.
// APPROVED-BY: Kevin 2026-11-20 00:20Z "1-3 go" (RIAB checkout hand-off to the SMP store seat, kevin-decisions.md)
//
// RAISED IN A BARN — the branded SMP checkout for Van Eure's book (pmseoaeo 2026-11-20; Kevin 2026-11-19 23:45Z "do it
// 100% same as FHB ... branding is customized for RIAB by Van Eure", 2026-11-20 00:05Z "same price with donation to
// charity box ... 1 check out", 00:20Z domain = raisedinabarn.org). Every Buy button on raisedinabarn.org LINKS to
// /checkout/raised-in-a-barn/ on SMP (no cross-origin POST), which posts /store-checkout with brand 'riab'.
//
// SMP-ONLY on purpose: src/store-engine/ is byte-synced to FHB, so nothing RIAB lives there. functions/store-checkout.ts
// takes the engine's own Stripe form (shipping, tax, Option C tags, author-sale metadata, far-band refusals unchanged)
// and this module changes only what is RIAB's: the bulk ladder, the autographed split, the branded text, the cancel URL.
//
//  (d) BULK, Kevin 2026-11-12 table (HB $29.99 / PB $19.99): 15/20/25/30/40% at 25/50/100/250/500 copies, HB + PB
//      counted TOGETHER (mix and match, like the FHB ladder), US only (bookmark: "US bulk order discounts"). Below 25
//      = LIST PRICE. NO FIRST-ORDER 15% ON RIAB, ever (Kevin 2026-11-20 ~05:00Z "needs our SMP order form without the
//      discount"; other SMP books keep the store-wide 15%): /store-checkout never hands the engine a RIAB buyer's email
//      (so no first-order lookup runs) and brandRiabForm strips any coupon and re-prices every line from riabQuote.
//  (b) AUTOGRAPHED, Kevin 11-20 00:05Z "same price": a signed copy is the SAME SKU at the SAME price, carried as its
//      own line + metadata[signed]. ROUTE (Kevin 2026-11-20 ~15:20Z "5. Van signs! SMP ships! Stop asking. You take
//      the orders. I will get these fulfilled."): RIAB_SIGNED_ROUTE = SMP manual fulfilment, NEVER Ingram. The order
//      notice to kevin@ is the store's existing one (FHB functions/print-webhook.ts, Mailgun, SMP Orders): it lists
//      metadata[breakdown] under "Editions" and prints an "Ingram order lines" ISBN row ONLY for a SKU in BOOK_SKUS.
//      So brandRiabForm writes signed copies into the breakdown under their own readable key (RIAB_SIGNED_KEY,
//      deliberately NOT a BOOK_SKUS key): the notice lists them, the Ingram lines carry only unsigned copies.
//  (c) GIFT TO CHARITY (Kevin 2026-11-20 ~16:10Z "we want to offer all order option to make OPTIONAL donation to
//      charity asking them to designate to: CF, FOH, or 50/50 to both. This can be toggle option if they want to give";
//      ~16:20Z "receipted from spirit media charities with 100% going to the charities"; ~16:30Z "100% of the amount
//      received --- Example: $100 if fees paid or $97 if not"). ONE checkout: the books stay on SMP; the gift rides the
//      same Stripe session as its own line and is TRANSFERRED to Spirit Media Charities' Stripe account as a Connect
//      connected account (destination charge, payment_intent_data[transfer_data][amount] = the gift only). The card fee
//      on the gift is NEVER absorbed by SMP: the buyer may tick "cover the card fee" (+riabFeeCover), else the fee comes
//      out of the gift (riabGiftPlan.transfer_cents). Gift money NEVER stays in SMP's account.
//      SWITCH: closed until SMC is a connected account of the SMP store platform. The server opens only when
//      SMC_CONNECTED_ACCOUNT (acct_...) is bound; the form shows the gift box only when RIAB_GIFT_UI_OPEN is true (or on
//      a preview host / ?gift=preview, which still posts to the closed server). 2026-11-20 16:45Z MEASURED: the SMP store
//      account has 0 connected accounts, so both stay closed. Turn-on = bind SMC_CONNECTED_ACCOUNT + flip the constant.
import bookSkus from '../store-engine/data/book-skus.json' with { type: 'json' };
import { packBreakdown, unitAfter } from '../store-engine/lib/order-pricing.ts';

export const RIAB_SLUG = 'raised-in-a-barn';
export const RIAB_BRAND = 'riab';
/** The store site the session is tagged with (STORE_SITES: vaneure -> window smp); vaneure.com forwards to RIAB. */
export const RIAB_SITE = 'vaneure';
export const RIAB_RETURN_PATH = '/checkout/raised-in-a-barn/';
export const RIAB_AUTHOR = 'Van Eure';
export const RIAB_HB = 'raised-in-a-barn-hb';
export const RIAB_PB = 'raised-in-a-barn-pb';
/** The SKUs the branded form may post: each print SKU, and its autographed twin (same SKU, same price). */
export const RIAB_INPUTS = [RIAB_HB, `${RIAB_HB}-signed`, RIAB_PB, `${RIAB_PB}-signed`] as const;
/** Over this many copies the buyer calls us. */
export const RIAB_MAX_COPIES = 5000;
/** Where signed copies go (Kevin 2026-11-20 "Van signs! SMP ships!"): SMP fulfils by hand; never an Ingram line. */
export const RIAB_SIGNED_ROUTE = 'smp_manual_van_signs';
/** The breakdown key of a signed copy: what the order notice (kevin@) and the buyer's confirmation print for it, as the
 *  existing webhook prints an unknown key verbatim. Never a BOOK_SKUS key, so it can never become an Ingram line. */
export const RIAB_SIGNED_KEY: Record<string, string> = {
	'raised-in-a-barn-hb': 'Raised-in-a-Barn-Hardback-AUTOGRAPHED-by-Van-Eure',
	'raised-in-a-barn-pb': 'Raised-in-a-Barn-Paperback-AUTOGRAPHED-by-Van-Eure',
};

/** Kevin 2026-11-12 table, highest first. */
export const RIAB_TIERS: readonly { min: number; pct: number }[] = [
	{ min: 500, pct: 40 },
	{ min: 250, pct: 30 },
	{ min: 100, pct: 25 },
	{ min: 50, pct: 20 },
	{ min: 25, pct: 15 },
];
/** The bulk percent for `copies` (HB + PB together) shipping to `country`; 0 below 25 and outside the US. */
export const riabTierPct = (copies: number, country = 'US'): number =>
	String(country).toUpperCase() !== 'US' ? 0 : (RIAB_TIERS.find((t) => copies >= t.min)?.pct ?? 0);

const SKUS = (
	bookSkus as { skus: Record<string, { list_cents: number; format: string; checkout_img: string }> }
).skus;
export const riabList = (sku: string): number => SKUS[sku].list_cents;

export type RiabLine = { sku: string; signed: boolean; qty: number; unit_cents: number };
export type RiabQuote = { copies: number; pct: number; lines: RiabLine[]; subtotal: number };

/** Parse the branded form's counts: whole, non-negative, RIAB inputs only. null = invalid. */
export function riabCounts(
	raw: Record<string, unknown> | undefined,
): Record<string, number> | null {
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(raw ?? {})) {
		const n = Number(v);
		if (!(RIAB_INPUTS as readonly string[]).includes(k)) {
			if (n > 0) return null; // anything else in a RIAB cart is refused, never silently dropped
			continue;
		}
		if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) return null;
		out[k] = n;
	}
	return out;
}

/** The real print SKUs the engine prices and ships: a signed copy is its format's SKU. */
export const engineCounts = (counts: Record<string, number>): Record<string, number> => ({
	[RIAB_HB]: (counts[RIAB_HB] ?? 0) + (counts[`${RIAB_HB}-signed`] ?? 0),
	[RIAB_PB]: (counts[RIAB_PB] ?? 0) + (counts[`${RIAB_PB}-signed`] ?? 0),
});

/** The price the buyer sees and the server charges: list x qty, less the bulk tier. Same arithmetic both sides. */
export function riabQuote(counts: Record<string, number>, country = 'US'): RiabQuote {
	const copies = RIAB_INPUTS.reduce((s, k) => s + (counts[k] ?? 0), 0);
	const pct = riabTierPct(copies, country);
	const lines: RiabLine[] = [];
	for (const sku of [RIAB_HB, RIAB_PB]) {
		for (const signed of [false, true]) {
			const qty = counts[signed ? `${sku}-signed` : sku] ?? 0;
			if (qty > 0) lines.push({ sku, signed, qty, unit_cents: unitAfter(riabList(sku), pct) });
		}
	}
	return { copies, pct, lines, subtotal: lines.reduce((s, l) => s + l.unit_cents * l.qty, 0) };
}

const DONATION_MIN_CENTS = 100;
const DONATION_MAX_CENTS = 1_000_000;
/** The visitor-facing gift box. false = hidden on production (Connect does not exist yet, 2026-11-20). */
export const RIAB_GIFT_UI_OPEN = false;
export const SMC_NAME = 'Spirit Media Charities';
/** Spirit Media Charities (DBA SM Gives), 501(c)(3) effective 2022-12-05. */
export const SMC_EIN = '88-4352701';
export const RIAB_DESIGNATIONS = {
	cf: 'Cheyenne Foundation',
	foh: 'Foundation of Hope',
	split: 'Split 50/50: Cheyenne Foundation and Foundation of Hope',
} as const;
export type RiabDesignation = keyof typeof RIAB_DESIGNATIONS;
/** Kevin's wording (addendums 1 + 3, 2026-11-20): on the form, the Stripe line and both emails. */
export const RIAB_GIFT_COPY =
	'Receipted by Spirit Media Charities, a 501(c)(3). 100% of the amount Spirit Media Charities receives goes to the charity you choose (Cheyenne Foundation, Foundation of Hope, or split 50/50).';
/** Stripe's standard US card rate, percent part, in basis points. The fixed 30c is paid once per order by the books. */
export const STRIPE_CARD_BP = 290;
/** What the buyer adds so that, after Stripe's percentage fee on the gift + cover, the charity still receives the gift. */
export const riabFeeCover = (giftCents: number): number =>
	Math.ceil((giftCents * STRIPE_CARD_BP) / (10_000 - STRIPE_CARD_BP));
/** Stripe's percentage fee on an amount (what comes out of an uncovered gift). */
export const riabCardFee = (cents: number): number => Math.round((cents * STRIPE_CARD_BP) / 10_000);
/** Each charity's share of `cents` for a designation (split: Cheyenne Foundation takes the odd cent). */
export function riabShares(
	designation: RiabDesignation,
	cents: number,
): { cf: number; foh: number } {
	if (designation === 'cf') return { cf: cents, foh: 0 };
	if (designation === 'foh') return { cf: 0, foh: cents };
	const foh = Math.floor(cents / 2);
	return { cf: cents - foh, foh };
}
export type RiabEnv = {
	/** Spirit Media Charities' Stripe account as a CONNECTED account of the SMP store platform (acct_...). Unset today. */
	SMC_CONNECTED_ACCOUNT?: string;
};
export type RiabGiftPlan = {
	gift_cents: number;
	designation: RiabDesignation;
	fee_covered: boolean;
	fee_cover_cents: number;
	/** what the donor gives (gift + cover): the receipt amount */
	total_cents: number;
	/** what Spirit Media Charities receives */
	transfer_cents: number;
	account: string;
};
type Refusal = { error: string; message: string };
const smcAccount = (env: RiabEnv) =>
	/^acct_[A-Za-z0-9]+$/.test(String(env.SMC_CONNECTED_ACCOUNT ?? ''))
		? String(env.SMC_CONNECTED_ACCOUNT)
		: '';

/** The gift on this order: null = no gift, a Refusal, or the plan. Every refusal runs before any Stripe call. */
export function riabGiftPlan(
	p: { donation_cents?: unknown; designation?: unknown; fee_cover?: unknown },
	env: RiabEnv,
): RiabGiftPlan | Refusal | null {
	const cents = p.donation_cents;
	if (cents === undefined || cents === null || cents === '' || Number(cents) === 0) return null;
	const n = Number(cents);
	if (!Number.isInteger(n) || n < DONATION_MIN_CENTS || n > DONATION_MAX_CENTS || n % 100 !== 0)
		return {
			error: 'invalid_donation',
			message: 'Please enter a whole-dollar gift between $1 and $10,000.',
		};
	const d = String(p.designation ?? '');
	if (!Object.hasOwn(RIAB_DESIGNATIONS, d))
		return {
			error: 'designation_required',
			message:
				'Please choose where your gift goes: Cheyenne Foundation, Foundation of Hope, or split 50/50.',
		};
	const account = smcAccount(env);
	if (!account)
		return {
			error: 'donation_unavailable',
			message: 'Gifts to charity open soon. Nothing was charged.',
		};
	const fee_covered = p.fee_cover === true || p.fee_cover === 'true' || p.fee_cover === 1;
	const fee_cover_cents = fee_covered ? riabFeeCover(n) : 0;
	return {
		gift_cents: n,
		designation: d as RiabDesignation,
		fee_covered,
		fee_cover_cents,
		total_cents: n + fee_cover_cents,
		transfer_cents: fee_covered ? n : n - riabCardFee(n),
		account,
	};
}
/** Back-compat: why a donation cannot be taken (null = none asked, or it can be taken). */
export function donationRefusal(
	cents: unknown,
	env: RiabEnv,
	extra: { designation?: unknown; fee_cover?: unknown } = {},
) {
	const r = riabGiftPlan({ donation_cents: cents, ...extra }, env);
	return r && 'error' in r ? r : null;
}

/** Add the gift to a branded RIAB form: its own line(s), the transfer to SMC, the metadata. Book lines untouched. */
export function addRiabGift(form: Form, g: RiabGiftPlan): Form {
	let li = 0;
	while (form[`line_items[${li}][quantity]`] !== undefined) li++;
	const line = (name: string, cents: number, description: string) => {
		Object.assign(form, {
			[`line_items[${li}][quantity]`]: 1,
			[`line_items[${li}][price_data][currency]`]: 'usd',
			[`line_items[${li}][price_data][unit_amount]`]: cents,
			[`line_items[${li}][price_data][tax_behavior]`]: 'exclusive',
			[`line_items[${li}][price_data][product_data][name]`]: name,
			[`line_items[${li}][price_data][product_data][description]`]: description,
			[`line_items[${li}][price_data][product_data][tax_code]`]: 'txcd_00000000',
		});
		li++;
	};
	line(`Gift to charity: ${RIAB_DESIGNATIONS[g.designation]}`, g.gift_cents, RIAB_GIFT_COPY);
	if (g.fee_covered)
		line(
			'Card processing fee on your gift (you chose to cover it)',
			g.fee_cover_cents,
			'So the charity receives your full gift. Part of your gift to Spirit Media Charities.',
		);
	form['payment_intent_data[transfer_data][destination]'] = g.account;
	form['payment_intent_data[transfer_data][amount]'] = g.transfer_cents;
	form['metadata[donation_cents]'] = g.gift_cents;
	form['metadata[designation]'] = g.designation;
	form['metadata[fee_covered]'] = String(g.fee_covered);
	form['metadata[donation_fee_cover_cents]'] = g.fee_cover_cents;
	form['metadata[donation_total_cents]'] = g.total_cents;
	form['metadata[donation_transfer_cents]'] = g.transfer_cents;
	form['custom_text[submit][message]'] =
		`${form['custom_text[submit][message]'] ?? ''} Your gift is receipted separately by Spirit Media Charities, a 501(c)(3).`.trim();
	return form;
}

const isTestKey = (key: string | undefined) => /^(sk|rk)_test_/.test(String(key ?? ''));
export type RiabGateEnv = RiabEnv & {
	STRIPE_STORE_SECRET_KEY?: string;
	/** a TEST-mode key for the SMP store account; the RIAB checkout prefers it (bind on the preview env only) */
	STRIPE_STORE_TEST_SECRET_KEY?: string;
	/** 'kevin-approved' lets the RIAB checkout take LIVE payments. Unset = test mode only. */
	RIAB_LIVE?: string;
};
/** The key the RIAB checkout may use, or the refusal. NOTHING LIVE without Kevin: a live key needs RIAB_LIVE. */
export function riabKey(
	env: RiabGateEnv,
): { key: string; test: boolean } | { status: number; body: Record<string, unknown> } {
	const key = env.STRIPE_STORE_TEST_SECRET_KEY || env.STRIPE_STORE_SECRET_KEY;
	if (!key)
		return { status: 200, body: { disabled: true, message: 'Checkout is not enabled yet.' } };
	const test = isTestKey(key);
	if (!test && env.RIAB_LIVE !== 'kevin-approved')
		return {
			status: 200,
			body: {
				disabled: true,
				error: 'riab_test_only',
				message: 'This checkout is a preview. Orders open soon.',
			},
		};
	// signed copies need no gate of their own: their route is settled (RIAB_SIGNED_ROUTE, Kevin 2026-11-20)
	return { key, test };
}

type Form = Record<string, string | number>;
const LINE_RE = /^line_items\[(\d+)\](.+)$/;

/** Rewrite the engine's form for a RIAB cart: tier price, signed lines, branded text, RIAB cancel URL, metadata. */
export function brandRiabForm(form: Form, counts: Record<string, number>, country = 'US'): Form {
	const q = riabQuote(counts, country);
	// the engine's line items: its RIAB book lines, then any per-copy handling lines (kept as they are)
	const items: Record<string, string | number>[] = [];
	for (const [k, v] of Object.entries(form)) {
		const m = LINE_RE.exec(k);
		if (!m) continue;
		const i = Number(m[1]);
		items[i] ??= {};
		items[i][m[2]] = v;
		delete form[k];
	}
	const isBook = (it: Record<string, string | number>) =>
		/^(Hardback|Paperback) · by /.test(String(it['[price_data][product_data][description]'] ?? ''));
	const handling = items.filter((it) => it && !isBook(it));
	let li = 0;
	const put = (it: Record<string, string | number>) => {
		for (const [k, v] of Object.entries(it)) form[`line_items[${li}]${k}`] = v;
		li++;
	};
	for (const l of q.lines) {
		const fmt = SKUS[l.sku].format; // Hardback | Paperback
		put({
			'[quantity]': l.qty,
			'[price_data][currency]': 'usd',
			// riabQuote's unit, always: list below 25, the tier at 25+; never the engine's first-order price
			'[price_data][unit_amount]': l.unit_cents,
			'[price_data][tax_behavior]': 'exclusive',
			'[price_data][product_data][name]': `Raised in a Barn — ${fmt}${l.signed ? ' (autographed by Van Eure)' : ''}`,
			'[price_data][product_data][description]': [
				`${fmt} · by ${RIAB_AUTHOR}`,
				l.signed ? 'signed copy' : '',
				q.pct > 0 ? `${q.pct}% bulk discount` : '',
				'sold by Spirit Media Publishing',
				'free shipping',
			]
				.filter(Boolean)
				.join(' · '),
			'[price_data][product_data][images][0]': SKUS[l.sku].checkout_img,
			'[price_data][product_data][tax_code]': 'txcd_99999999',
		});
	}
	for (const h of handling) put(h);

	// NO first-order coupon on RIAB (Kevin 11-20): stripped whatever the engine did; the tier (25+) or list price stands
	delete form['discounts[0][promotion_code]'];
	form['metadata[pct_off]'] = q.pct;
	form['metadata[offer]'] = q.pct > 0 ? 'riab_bulk' : 'none';
	for (const [k, v] of Object.entries(form)) {
		if (!/^metadata\[book_\d+\]$/.test(k)) continue;
		const sku = /format=Hardback/.test(String(v)) ? RIAB_HB : RIAB_PB;
		form[k] = String(v).replace(/unit_cents=\d+/, `unit_cents=${unitAfter(riabList(sku), q.pct)}`);
	}
	const signedHb = counts[`${RIAB_HB}-signed`] ?? 0;
	const signedPb = counts[`${RIAB_PB}-signed`] ?? 0;
	form['metadata[brand]'] = RIAB_BRAND;
	if (signedHb + signedPb > 0) {
		form['metadata[signed]'] = `${RIAB_HB}:${signedHb},${RIAB_PB}:${signedPb}`;
		form['metadata[signed_route]'] = RIAB_SIGNED_ROUTE;
	}
	// The breakdown the order notice reads: unsigned under the real SKU (-> Ingram line), signed under its own key
	// (-> listed in the notice, NO Ingram line). Replaces the engine's merged tally; same copy total.
	for (const k of Object.keys(form)) if (/^metadata\[breakdown(_\d+)?\]$/.test(k)) delete form[k];
	Object.assign(
		form,
		packBreakdown({
			[RIAB_HB]: counts[RIAB_HB] ?? 0,
			[RIAB_SIGNED_KEY[RIAB_HB]]: signedHb,
			[RIAB_PB]: counts[RIAB_PB] ?? 0,
			[RIAB_SIGNED_KEY[RIAB_PB]]: signedPb,
		}),
	);
	const origin = String(form.success_url ?? '').replace(/\/order\?.*$/, '');
	form.cancel_url = `${origin}${RIAB_RETURN_PATH}?order=canceled`;
	form['custom_text[submit][message]'] =
		'Raised in a Barn by Van Eure. Sold and shipped by Spirit Media Publishing.';
	return form;
}
