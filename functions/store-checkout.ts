// /store-checkout — the SMP store checkout (plan 3fb Phase 3; Kevin 2026-11-13 "SMP is the engine ... transfer the
// store TODAY"). Cloudflare Pages Function on the SMP project.
//
//   POST /store-checkout { counts: { "<book sku>": qty }, email?, country?, returnPath?, site?, utm? }
//     -> { url }          Stripe Checkout Session URL
//     -> { disabled }     no Stripe key bound
//     -> 400 { error }    invalid_selection | empty | too_many_items | bulk_quote_required | country_not_served
//
// Prices, discounts, far-band, margin floor and the author-royalty sale metadata come from the ONE store engine
// (src/store-engine/, the engine's MASTER since 2026-11-16; FHB carries a byte-identical copy). This file only does HTTP and Stripe.
// ONE STORE, TWO SHOP WINDOWS (Option C, Kevin 2026-11-16 "1 store SMP. 2 shop windows FHB and SMP"): this is the
// store for every window. Books sell from any site; BIBLES sell only in the FHB window (an FHB-origin order box, or
// site fhb): Kevin 2026-11-16 "2yes", FHB Bibles stay sold on FHB only. The FHB Bible box (FHB src/scripts/order-form.ts)
// posts here exactly as the FHB book box does, and its Stripe request is the one FHB /dvc-checkout sent, plus the tags
// (golden-parity test in scripts/store-checkout.test.mjs). Stripe account = the Spirit Media store account FHB /print
// already charges into (one account, sales split by metadata[site]); fulfilment runs through FHB's print-webhook exactly
// as for FHB orders (metadata[kind]=dvc_print). Every session carries site + window + family (storeTagErrors gates it).

import { bibleEbookForm } from '../src/lib/bibleEbook.ts';
import {
	addRiabGift,
	brandRiabForm,
	engineCounts,
	RIAB_BRAND,
	RIAB_MAX_COPIES,
	RIAB_SITE,
	RIAB_SLUG,
	type RiabGateEnv,
	riabCounts,
	riabGiftPlan,
	riabKey,
	riabQuote,
	riabSignedRefusal,
} from '../src/lib/riabOrder.ts';
import {
	allowCheck,
	answerBody,
	constantTime,
	emailTag,
	type FirstStatus,
	sameOrigin,
} from '../src/store-engine/lib/firstOrderGuard.ts';
import { BOOK_SKUS } from '../src/store-engine/lib/order-pricing.ts';
import {
	checkoutForm,
	EMAIL_RE,
	ebookCheckoutForm,
	encodeForm,
	familyOf,
	familyOfSku,
	firstOrderPromo,
	forwarderCoupon,
	isEbookSku,
	isFirstOrder,
	type OrderPayload,
	shipToCredit,
	storeTagErrors,
	storeTags,
} from '../src/store-engine/lib/storeEngine.ts';

interface Env extends RiabGateEnv {
	STRIPE_STORE_SECRET_KEY?: string;
	STORE_EBOOK?: R2Bucket; // the private eBook bucket: no binding, no Bible eBook sale (nothing could deliver it)
}

/** Sites that may start an SMP checkout (contract 3fe sites registry). */
export const SITES: Record<string, { utm_source: string }> = {
	smp: { utm_source: 'spiritmediapublishing.com' },
	fhb: { utm_source: 'fathersheartbible.com' },
	vaneure: { utm_source: 'vaneure.com' },
};
/**
 * Cross-origin order forms (Kevin 2026-11-13 ~22:53Z, L1999: FHB /books/who-am-i/ "put the order form on the page").
 * A Father Heart book's FHB page carries the order form itself and posts here (contract 3fe: site derived from Origin,
 * return_origins allowlist). ONLY these origins may call cross-origin; anything else gets no CORS headers and a 403.
 * The production Pages host is rewritten to the .com by the engine; previews (dev.… / <hash>.…) return to themselves.
 */
export const RETURN_ORIGINS: Record<string, RegExp> = {
	fhb: /^https:\/\/((www\.)?fathersheartbible\.com|([a-z0-9-]+\.)?fathersheartbible\.pages\.dev)$/,
};
/** The site a cross-origin caller belongs to, or null when the Origin is not allowlisted. */
export function siteForOrigin(origin: string | null): string | null {
	if (!origin) return null;
	for (const [site, re] of Object.entries(RETURN_ORIGINS)) if (re.test(origin)) return site;
	return null;
}
const corsHeaders = (origin: string): Record<string, string> => ({
	'access-control-allow-origin': origin,
	'access-control-allow-methods': 'POST, OPTIONS',
	'access-control-allow-headers': 'content-type',
	'access-control-max-age': '86400',
	vary: 'Origin',
});
const STRIPE_META_KEYS_MAX = 50;
const clip = (v: unknown) =>
	String(v ?? '')
		.replace(/[^\w .:/@-]/g, '')
		.slice(0, 60);

/** A print order (books from any window, Bibles from the FHB window only) -> the engine's print form, or the refusal. */
async function printForm(
	payload: OrderPayload,
	requestUrl: string,
	key: string | undefined,
	site: string,
	counts: Record<string, number>,
) {
	// a book sells from any window; a Bible only from the FHB window; anything else is refused before the engine sees it
	const sellable = (sku: string) =>
		Boolean(BOOK_SKUS[sku]) || (site === 'fhb' && familyOfSku(sku) === 'bible');
	if (Object.entries(counts).some(([sku, n]) => Number(n) > 0 && !sellable(sku))) {
		return { status: 400, body: { error: 'invalid_selection' } } as const;
	}
	return checkoutForm(payload, requestUrl, {
		enabled: Boolean(key),
		isFirstOrder: (em) => isFirstOrder(em, key as string),
		firstOrderPromo: () => firstOrderPromo(key as string),
		forwarderCoupon: (f) => forwarderCoupon(key as string, f),
	});
}

/** The Stripe form for one SMP order, or the refusal. Pure apart from the engine's injected lookups. */
export async function smpCheckoutForm(
	payload: OrderPayload & { site?: string; utm?: Record<string, string> },
	requestUrl: string,
	key: string | undefined,
) {
	const counts = payload.counts ?? {};
	const site = SITES[String(payload.site)] ? String(payload.site) : 'smp';
	// EBOOKS (Kevin 2026-11-16 "We point to our own ebook sales"): a cart holding a book's eBook goes to the engine's
	// eBook form (no shipping; it refuses a cart mixing an eBook with print, and an eBook still in KDP Select).
	const ebook = Object.entries(counts).some(([sku, n]) => Number(n) > 0 && isEbookSku(sku));
	const r = ebook
		? await ebookCheckoutForm(payload, requestUrl, {
				enabled: Boolean(key),
				isFirstOrder: (em) => isFirstOrder(em, key as string),
				firstOrderPromo: () => firstOrderPromo(key as string),
			})
		: await printForm(payload, requestUrl, key, site, counts);
	if (!('form' in r)) return r;

	// Option C tags first, always (the engine reserves their keys); storeTagErrors refuses the session without them
	Object.assign(r.form, storeTags(site, familyOf(counts)));
	const extra: Record<string, string> = {};
	const utm = payload.utm ?? {};
	for (const k of ['source', 'medium', 'campaign', 'content'])
		if (utm[k]) extra[`metadata[utm_${k}]`] = clip(utm[k]);
	// never past Stripe's 50 metadata keys: site/window/family first, then utm in order (contract 3fe item 5)
	const used = Object.keys(r.form).filter((k) => k.startsWith('metadata[')).length;
	for (const [k, v] of Object.entries(extra).slice(0, Math.max(0, STRIPE_META_KEYS_MAX - used)))
		r.form[k] = v;
	return r;
}

/** RAISED IN A BARN branded checkout (src/lib/riabOrder.ts): same engine form, RIAB's ladder + signed split + branding.
 *  Refusals run before any Stripe call, in this order: bad cart, too many, gift (amount, designation, Connect switch),
 *  key/test-mode gate. A gift is its own line, transferred to Spirit Media Charities (riabOrder.ts (c)). */
export async function riabCheckout(
	payload: OrderPayload & {
		donation_cents?: unknown;
		designation?: unknown;
		fee_cover?: unknown;
		utm?: Record<string, string>;
	},
	requestUrl: string,
	env: RiabGateEnv,
) {
	const counts = riabCounts(payload.counts as Record<string, unknown>);
	if (!counts) return { status: 400, body: { error: 'invalid_selection' } } as const;
	const noSigned = riabSignedRefusal(counts);
	if (noSigned) return { status: 400, body: noSigned } as const;
	const country = String(payload.country ?? 'US').toUpperCase();
	const q = riabQuote(counts, country);
	if (q.copies < 1) return { status: 400, body: { error: 'empty' } } as const;
	if (q.copies > RIAB_MAX_COPIES)
		return {
			status: 400,
			body: {
				error: 'bulk_call',
				message: `For more than ${RIAB_MAX_COPIES} copies, please contact us.`,
			},
		} as const;
	const gift = riabGiftPlan(payload, env);
	if (gift && 'error' in gift) return { status: 400, body: gift } as const;
	const k = riabKey(env);
	if ('status' in k) return k;
	const r = await smpCheckoutForm(
		{
			counts: engineCounts(counts),
			country,
			// NO first-order 15% on RIAB (Kevin 2026-11-20): no email reaches the engine, so it never looks one up
			email: undefined,
			returnPath: `/books/${RIAB_SLUG}/`,
			site: RIAB_SITE,
			utm: payload.utm,
		},
		requestUrl,
		k.key,
	);
	if (!('form' in r)) return r;
	brandRiabForm(r.form, counts, country);
	if (gift) addRiabGift(r.form, gift);
	return createSession(r.form, k.key);
}

/** The ONE way this store creates a Checkout Session: an untagged form is refused (500 untagged) and never sent. */
export async function createSession(form: Record<string, string | number>, key: string) {
	const errs = storeTagErrors(form);
	if (errs.length) {
		console.error('store-checkout untagged session refused', errs);
		return { status: 500, body: { error: 'untagged' } } as const;
	}
	const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${key}`,
			'content-type': 'application/x-www-form-urlencoded',
		},
		body: encodeForm(form),
	});
	if (!res.ok)
		return { status: 502, body: { error: 'stripe_error', detail: await res.text() } } as const;
	const session = (await res.json()) as { url?: string };
	return session.url
		? ({ status: 200, body: { url: session.url } } as const)
		: ({ status: 502, body: { error: 'no_session_url' } } as const);
}

/** The FHB Bible box asks "is this email a first order?" before checkout (the same guarded lookup FHB /dvc-checkout
 *  answered: our-origin only, soft rate limit, one answer shape, constant time). Bibles take the 15%; books never do. */
async function firstOrderAnswer(
	request: Request,
	payload: OrderPayload,
	key: string | undefined,
): Promise<Response> {
	const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
	const reply = (status: FirstStatus) => new Response(answerBody(status), { headers });
	if (!sameOrigin(request.headers)) return reply('unknown'); // an SMP page sells books only: nothing to look up
	return constantTime(async () => {
		const em = String(payload.email ?? '')
			.trim()
			.toLowerCase();
		if (!key || em.length > 254 || !EMAIL_RE.test(em)) return reply('unknown');
		const tag = await emailTag(em);
		const ip = request.headers.get('cf-connecting-ip') ?? '';
		// No cache to count in = no way to limit = fail closed to "unknown" (list price).
		const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
		if (!(cache ? await allowCheck(cache, ip, tag) : false)) {
			console.log(`first-order-check limited tag=${tag}`);
			return reply('unknown');
		}
		const first = (await isFirstOrder(em, key)) && (await firstOrderPromo(key)) !== null;
		return reply(first ? 'first' : 'repeat');
	});
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
	const origin = request.headers.get('origin');
	return siteForOrigin(origin)
		? new Response(null, { status: 204, headers: corsHeaders(origin as string) })
		: new Response(null, { status: 403 });
};

// 3ef-1 (pmseoaeo 2026-11-13) kept through the move: FHB /dvc-checkout reported every order POST server-side to FHB's
// /_evt sink (kind checkout_server, tag site|qa, status, error code, path; aggregate only: no email, cart or IP). The
// FHB order boxes now post here, so an FHB-window POST reports the same event, or the 3ef ledger would go blind.
const QA_UA = /headless|playwright|puppeteer|python|curl|wget|node-fetch|undici|go-http|java\//i;
export function fhbCheckoutEvent(
	request: Request,
	status: number,
	body: Record<string, unknown> | null,
	reason: string,
) {
	const host = new URL(request.headers.get('origin') ?? request.url).hostname;
	const qa =
		host.endsWith('.pages.dev') ||
		/@example\.(com|org|net)$/i.test(String(body?.email ?? '')) ||
		!!request.headers.get('x-fhb-qa') ||
		QA_UA.test(request.headers.get('user-agent') ?? '');
	return {
		kind: 'checkout_server',
		tag: qa ? 'qa' : 'site',
		status,
		reason,
		path: String(body?.returnPath ?? '').slice(0, 60),
	};
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
	const copy = context.request.clone();
	const res = await handlePost(context);
	const origin = context.request.headers.get('origin');
	if (typeof context.waitUntil === 'function' && siteForOrigin(origin) === 'fhb') {
		const body = (await copy.json().catch(() => null)) as Record<string, unknown> | null;
		if (!body?.firstOrderCheck && !body?.shipToCredit) {
			const j =
				res.status >= 400
					? ((await res
							.clone()
							.json()
							.catch(() => null)) as { error?: string } | null)
					: null;
			const ev = fhbCheckoutEvent(
				context.request,
				res.status,
				body,
				res.status >= 400 ? String(j?.error ?? `http_${res.status}`) : '',
			);
			context.waitUntil(
				fetch('https://fathersheartbible.com/_evt', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(ev),
				}).catch(() => undefined),
			);
		}
	}
	return res;
};

const handlePost: PagesFunction<Env> = async ({ request, env }) => {
	const origin = request.headers.get('origin');
	const self = new URL(request.url).origin;
	const crossSite = origin && origin !== self ? siteForOrigin(origin) : null;
	const json = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), {
			status,
			headers: {
				'content-type': 'application/json',
				...(crossSite ? corsHeaders(origin as string) : {}),
			},
		});
	// a foreign Origin that is not allowlisted: refused before anything is read (no CORS headers, so no browser reads it)
	if (origin && origin !== self && !crossSite) return json({ error: 'origin_not_allowed' }, 403);
	let payload: OrderPayload & { site?: string; utm?: Record<string, string> };
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'bad_request' }, 400);
	}
	// SHIP-TO CREDIT (Kevin 2026-11-26 L3025): the order form asks when the buyer picks a ship-to country; the answer is
	// the engine's, from the country alone (never the client's claim), and null everywhere but a forwarder country, so no
	// other buyer's page ever carries the credit or the route's name. Read-only: no Stripe call, no session.
	if ((payload as { shipToCredit?: unknown }).shipToCredit === true) {
		const skus = (payload as { skus?: unknown }).skus;
		return json({
			credit: shipToCredit(payload.country, Array.isArray(skus) ? skus.slice(0, 400) : []),
		});
	}
	// The first-order 15% is for Bibles only (Kevin 11-10): the FHB Bible box asks; an SMP book page gets 'unknown'.
	if (payload.firstOrderCheck) {
		const a = await firstOrderAnswer(request, payload, env.STRIPE_STORE_SECRET_KEY);
		if (crossSite)
			for (const [k, v] of Object.entries(corsHeaders(origin as string))) a.headers.set(k, v);
		return a;
	}
	// RAISED IN A BARN: the branded page is on SMP itself (raisedinabarn.org LINKS to it), so same-origin only.
	if ((payload as { brand?: string }).brand === RIAB_BRAND) {
		if (crossSite) return json({ error: 'origin_not_allowed' }, 403);
		try {
			const r = await riabCheckout(payload, request.url, env);
			return json(r.body, r.status);
		} catch (e) {
			console.error('store-checkout riab threw', e);
			return json({ error: 'exception' }, 500);
		}
	}
	// THE FHB BIBLE EBOOK (moved from FHB /ebook-checkout, move 5): the FHB window's button posts { bibleEbook: true }.
	// FHB window only; the buyer returns to that FHB origin (its /ebook-download forwards to SMP's).
	if ((payload as { bibleEbook?: unknown }).bibleEbook === true) {
		if (crossSite !== 'fhb') return json({ error: 'bible_fhb_only' }, 400);
		if (!env.STRIPE_STORE_SECRET_KEY || !env.STORE_EBOOK)
			return json({ disabled: true, message: 'Direct download is not enabled yet.' });
		const form = bibleEbookForm(origin as string);
		if (storeTagErrors(form).length) return json({ error: 'untagged' }, 500);
		const s = await createSession(form, env.STRIPE_STORE_SECRET_KEY);
		return json(s.body, s.status);
	}
	// contract 3fe: the server derives the site from Origin. A cross-origin form returns its buyer (success + cancel)
	// to ITS OWN origin; the engine accepts /books/<slug>/ there only for a slug in its catalogue (no open redirect).
	if (crossSite) payload = { ...payload, site: crossSite };
	const engineUrl = crossSite ? `${origin}/store-checkout` : request.url;
	let r: Awaited<ReturnType<typeof smpCheckoutForm>>;
	try {
		r = await smpCheckoutForm(payload, engineUrl, env.STRIPE_STORE_SECRET_KEY);
	} catch (e) {
		console.error('store-checkout threw', e);
		return json({ error: 'exception' }, 500);
	}
	if (!('form' in r)) return json(r.body, r.status);
	const s = await createSession(r.form, env.STRIPE_STORE_SECRET_KEY as string);
	return json(s.body, s.status);
};
