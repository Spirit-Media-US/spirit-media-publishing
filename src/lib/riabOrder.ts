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
//      the engine's own offer stands (list, or the store-wide first-order 15%); at 25+ the tier replaces it, never both.
//  (b) AUTOGRAPHED, Kevin 11-20 00:05Z "same price": a signed copy is the SAME SKU at the SAME price, carried as its
//      own line + metadata[signed]. FULFILMENT ROUTE IS UNCONFIRMED (Van / Angus Barn signs; Kevin confirms before any
//      live order). FHB print-webhook does not read metadata[signed] yet, so it would list signed copies on the
//      Ingram lines: signed copies are therefore refused on a live key until RIAB_SIGNED_ROUTE is set.
//  (c) DONATION to SM Charities' Cheyenne Foundation fund: NOT BUILT. One card entry across two Stripe accounts needs
//      SM Charities connected to the SMP store account (Stripe Connect: save the card on the platform, clone the
//      PaymentMethod to SMC, direct charge there, docs.stripe.com/connect/direct-charges-multiple-accounts). No such
//      connection and no test keys exist (2026-11-20). Until then a donation is REFUSED before any Stripe call, and it
//      is never, in any path, added to the SMP charge.
import bookSkus from '../store-engine/data/book-skus.json' with { type: 'json' };
import { unitAfter } from '../store-engine/lib/order-pricing.ts';

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
export type RiabEnv = {
	/** SM Charities' Stripe account as a CONNECTED account of the SMP store platform (acct_...). Unset today. */
	SMC_CONNECTED_ACCOUNT?: string;
};
/** Why a donation cannot be taken (null = no donation asked). There is no donation money path yet: see (c) above. */
export function donationRefusal(
	cents: unknown,
	env: RiabEnv,
): { error: string; message: string } | null {
	if (cents === undefined || cents === null || cents === '' || Number(cents) === 0) return null;
	const n = Number(cents);
	if (!Number.isInteger(n) || n < DONATION_MIN_CENTS || n > DONATION_MAX_CENTS || n % 100 !== 0)
		return {
			error: 'invalid_donation',
			message: 'Please enter a whole-dollar gift between $1 and $10,000.',
		};
	return {
		error: 'donation_unavailable',
		message: env.SMC_CONNECTED_ACCOUNT
			? 'Gifts to the Cheyenne Foundation fund are not open yet. Nothing was charged.'
			: 'Gifts to the Cheyenne Foundation fund are not connected yet. Nothing was charged.',
	};
}

const isTestKey = (key: string | undefined) => /^(sk|rk)_test_/.test(String(key ?? ''));
export type RiabGateEnv = RiabEnv & {
	STRIPE_STORE_SECRET_KEY?: string;
	/** a TEST-mode key for the SMP store account; the RIAB checkout prefers it (bind on the preview env only) */
	STRIPE_STORE_TEST_SECRET_KEY?: string;
	/** 'kevin-approved' lets the RIAB checkout take LIVE payments. Unset = test mode only. */
	RIAB_LIVE?: string;
	/** set once Kevin confirms who fulfils signed copies; until then signed copies sell in test mode only */
	RIAB_SIGNED_ROUTE?: string;
};
/** The key the RIAB checkout may use, or the refusal. NOTHING LIVE without Kevin: a live key needs RIAB_LIVE. */
export function riabKey(
	env: RiabGateEnv,
	hasSigned: boolean,
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
	if (hasSigned && !test && !env.RIAB_SIGNED_ROUTE)
		return {
			status: 400,
			body: {
				error: 'signed_not_available',
				message: 'Autographed copies are not available yet.',
			},
		};
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
	// below a tier the engine's unit stands (list, or its per-unit first-order 15% abroad): never re-priced here
	const engineUnit: Record<string, number> = {};
	for (const it of items.filter((x) => x && isBook(x)))
		engineUnit[String(it['[price_data][product_data][description]']).split(' ')[0]] = Number(
			it['[price_data][unit_amount]'],
		);
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
			'[price_data][unit_amount]': q.pct > 0 ? l.unit_cents : (engineUnit[fmt] ?? l.unit_cents),
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

	if (q.pct > 0) {
		// the tier replaces any first-order coupon: best discount, never both (store rule)
		delete form['discounts[0][promotion_code]'];
		form['metadata[pct_off]'] = q.pct;
		form['metadata[offer]'] = 'riab_bulk';
		for (const [k, v] of Object.entries(form)) {
			if (!/^metadata\[book_\d+\]$/.test(k)) continue;
			const sku = /format=Hardback/.test(String(v)) ? RIAB_HB : RIAB_PB;
			form[k] = String(v).replace(
				/unit_cents=\d+/,
				`unit_cents=${unitAfter(riabList(sku), q.pct)}`,
			);
		}
	}
	const signedHb = counts[`${RIAB_HB}-signed`] ?? 0;
	const signedPb = counts[`${RIAB_PB}-signed`] ?? 0;
	form['metadata[brand]'] = RIAB_BRAND;
	if (signedHb + signedPb > 0) {
		form['metadata[signed]'] = `${RIAB_HB}:${signedHb},${RIAB_PB}:${signedPb}`;
		// fulfilment route is Kevin's to confirm (Van / Angus Barn); the order email must not send these to Ingram
		form['metadata[signed_route]'] = 'UNCONFIRMED_do_not_order_signed_from_ingram';
	}
	const origin = String(form.success_url ?? '').replace(/\/order\?.*$/, '');
	form.cancel_url = `${origin}${RIAB_RETURN_PATH}?order=canceled`;
	form['custom_text[submit][message]'] =
		'Raised in a Barn by Van Eure. Sold and shipped by Spirit Media Publishing.';
	return form;
}
