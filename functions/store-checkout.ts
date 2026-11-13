// /store-checkout — the SMP store checkout (plan 3fb Phase 3; Kevin 2026-11-13 "SMP is the engine ... transfer the
// store TODAY"). Cloudflare Pages Function on the SMP project.
//
//   POST /store-checkout { counts: { "<book sku>": qty }, email?, country?, returnPath?, site?, utm? }
//     -> { url }          Stripe Checkout Session URL
//     -> { disabled }     no Stripe key bound
//     -> 400 { error }    invalid_selection | empty | too_many_items | bulk_quote_required | country_not_served
//
// Prices, discounts, far-band, margin floor and the author-royalty sale metadata come from the ONE store engine
// (src/store-engine/, a manifest-checked copy of FHB src/lib/storeEngine.ts). This file only does HTTP and Stripe.
// BOOKS ONLY: Bibles stay on fathersheartbible.com's own checkout. Stripe account = the Spirit Media store account
// FHB /print already charges into (one account, sales split by metadata[site]); fulfilment runs through FHB's
// print-webhook exactly as for FHB orders (metadata[kind]=dvc_print).
import { BOOK_SKUS } from '../src/store-engine/lib/order-pricing.ts';
import {
	checkoutForm,
	encodeForm,
	firstOrderPromo,
	isFirstOrder,
	type OrderPayload,
} from '../src/store-engine/lib/storeEngine.ts';

interface Env {
	STRIPE_STORE_SECRET_KEY?: string;
}

/** Sites that may start an SMP checkout (contract 3fe sites registry). */
export const SITES: Record<string, { utm_source: string }> = {
	smp: { utm_source: 'spiritmediapublishing.com' },
	fhb: { utm_source: 'fathersheartbible.com' },
	vaneure: { utm_source: 'vaneure.com' },
};
const STRIPE_META_KEYS_MAX = 50;
const clip = (v: unknown) =>
	String(v ?? '')
		.replace(/[^\w .:/@-]/g, '')
		.slice(0, 60);

/** The Stripe form for one SMP order, or the refusal. Pure apart from the engine's injected lookups. */
export async function smpCheckoutForm(
	payload: OrderPayload & { site?: string; utm?: Record<string, string> },
	requestUrl: string,
	key: string | undefined,
) {
	const counts = payload.counts ?? {};
	// books only: any non-book SKU with a quantity is refused before the engine sees it
	if (Object.entries(counts).some(([sku, n]) => Number(n) > 0 && !BOOK_SKUS[sku])) {
		return { status: 400, body: { error: 'invalid_selection' } } as const;
	}
	const r = await checkoutForm(payload, requestUrl, {
		enabled: Boolean(key),
		isFirstOrder: (em) => isFirstOrder(em, key as string),
		firstOrderPromo: () => firstOrderPromo(key as string),
	});
	if (!('form' in r)) return r;
	const site = SITES[String(payload.site)] ? String(payload.site) : 'smp';
	const extra: Record<string, string> = { 'metadata[site]': site };
	const utm = payload.utm ?? {};
	for (const k of ['source', 'medium', 'campaign', 'content'])
		if (utm[k]) extra[`metadata[utm_${k}]`] = clip(utm[k]);
	// never past Stripe's 50 metadata keys: site first, then utm in order (contract 3fe item 5)
	const used = Object.keys(r.form).filter((k) => k.startsWith('metadata[')).length;
	for (const [k, v] of Object.entries(extra).slice(0, Math.max(0, STRIPE_META_KEYS_MAX - used)))
		r.form[k] = v;
	return r;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	const json = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
	let payload: OrderPayload & { site?: string; utm?: Record<string, string> };
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'bad_request' }, 400);
	}
	// The first-order 15% is for Bibles only (Kevin 11-10); books never take it, so there is nothing to look up.
	if (payload.firstOrderCheck) return json({ status: 'unknown' });
	let r: Awaited<ReturnType<typeof smpCheckoutForm>>;
	try {
		r = await smpCheckoutForm(payload, request.url, env.STRIPE_STORE_SECRET_KEY);
	} catch (e) {
		console.error('store-checkout threw', e);
		return json({ error: 'exception' }, 500);
	}
	if (!('form' in r)) return json(r.body, r.status);
	const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${env.STRIPE_STORE_SECRET_KEY}`,
			'content-type': 'application/x-www-form-urlencoded',
		},
		body: encodeForm(r.form),
	});
	if (!res.ok) return json({ error: 'stripe_error', detail: await res.text() }, 502);
	const session = (await res.json()) as { url?: string };
	return session.url ? json({ url: session.url }) : json({ error: 'no_session_url' }, 502);
};
