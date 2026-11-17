#!/usr/bin/env node
// BUILD-CHECK: searched tool-inventory.py "merchant feed" (no merchant generator outside FHB) + /srv/sites/FHB/scripts
// NEAREST: /srv/sites/FHB/scripts/gen-merchant-feed.mjs (this file is its SMP port: same walk, same item shape)
// NOT-REUSED-BECAUSE: it is hard-wired to FHB's dist/bibles/ and FHB brand/category, and runs inside the FHB build;
//   it cannot see SMP's dist/books/ (a different repo and a different Pages project)
// APPROVED-BY: pmseoaeo brief pmprint-smp-growth-20261116 #3 + Kevin brief pmprint-store-168-strategy-20261116 #3
/**
 * gen-merchant-feed.mjs — Google Merchant Center product feed for the SMP store (every sellable book).
 *
 * SOURCE OF TRUTH = the BUILT book pages' own Book/Product + Offer JSON-LD (dist/books/<slug>/), which
 * src/pages/books/[slug]/index.astro emits one Offer per sellable format: a format the store engine sells
 * (src/store-engine/data/book-skus.json, ISBN + list price) to at least one live country. The price, GTIN (ISBN-13),
 * availability and per-country shipping are therefore exactly what the page and the checkout say; "Available soon"
 * pages and formats without a price declare no Offer, so they are excluded by construction.
 * OPTION C (Kevin 2026-11-16 "1 store SMP. 2 shop windows FHB and SMP"): this feed = SMP-author books ONLY. Every
 * Father's Heart product (the Bibles and the FH books in src/store-engine/data/books.json) is listed by FHB's feed, on
 * its FHB page; SMP builds no page for an FH book (its URL 301s to FHB), and any FH SKU is dropped here by construction.
 * One listing per GTIN per business: scripts/merchant-feed.test.mjs fails if a GTIN is also in FHB's feed.
 *
 * Runs AFTER `astro build` (writes dist/merchant-feed.xml, served at https://spiritmediapublishing.com/merchant-feed.xml).
 * Nothing is submitted anywhere by this script.
 * OPENAI (pmprint brief pmprint-smp-merchant-channels-20261117 B3, mirroring FHB unit 2ra): the SAME item list also
 * writes dist/merchant-feed-openai.jsonl (ChatGPT merchant product feed, https://developers.openai.com/commerce/specs/feed,
 * read 2026-11-17): one JSON object per line with the 11 required fields (item_id, title, description, url, brand,
 * seller_name, image_url, availability, price, target_countries, store_country) plus gtin, condition, product_category,
 * shipping_price (US), return_policy / accepts_returns / return_deadline_in_days (from the Offer's MerchantReturnPolicy),
 * and, only for a book sold in 2+ formats, group_id + listing_has_variations + variant_dict {format} (the 2026-11-17 spec:
 * group_id without those does not form a variant group). Same ids/prices/availability/links/images/GTINs as the XML by
 * construction; scripts/openai-feed.test.mjs enforces parity. No second price list.
 * Usage: node scripts/gen-merchant-feed.mjs [--dist dist] [--out dist/merchant-feed.xml]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dnpMatcher } from '../src/lib/do-not-publish.mjs';

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
export const esc = (s) =>
	String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BIND = {
	'https://schema.org/Hardcover': 'Hardcover',
	'https://schema.org/Paperback': 'Paperback',
	'https://schema.org/EBook': 'eBook',
	'https://schema.org/AudiobookFormat': 'Audiobook',
};
const imgUrl = (i) => (i && typeof i === 'object' ? i.contentUrl || i.url : i);

/** The Father's Heart book SKUs (FHB's window, never this feed): store-engine books.json formats. */
export const fhSkus = (root = '.') =>
	new Set(
		JSON.parse(readFileSync(`${root}/src/store-engine/data/books.json`, 'utf8')).books.flatMap((b) => b.formats ?? []),
	);

/** Every Offer in the built book pages, keyed by SKU (Father's Heart SKUs excluded: FHB's window). */
export function collect(dist = 'dist', fh = fhSkus()) {
	const items = new Map();
	const walk = (n, ctx) => {
		if (Array.isArray(n)) return n.forEach((x) => walk(x, ctx));
		if (!n || typeof n !== 'object') return;
		const offer = n.offers && !Array.isArray(n.offers) ? n.offers : undefined;
		if (offer?.sku && offer.gtin13 && !items.has(offer.sku) && !fh.has(offer.sku)) {
			const fmt = BIND[n.bookFormat];
			const base = String(n.name ?? ctx.name).replace(/ \((Hardcover|Hardback|Paperback|eBook|Audiobook)\)$/, '');
			items.set(offer.sku, {
				id: offer.sku,
				slug: ctx.slug,
				format: fmt,
				condition: offer.itemCondition,
				returns: [].concat(offer.hasMerchantReturnPolicy ?? [])[0],
				title: `${base}${fmt ? ` (${fmt})` : ''}`,
				description: String(n.description || ctx.desc || base)
					.replace(/\s+/g, ' ')
					.trim()
					.slice(0, 4900),
				link: offer.url,
				image: imgUrl(n.image) || ctx.image,
				price: offer.price,
				currency: offer.priceCurrency,
				availability: offer.availability,
				gtin: offer.gtin13,
				author: ctx.author,
				ship: offer.shippingDetails,
			});
		}
		for (const v of Object.values(n)) walk(v, ctx);
	};
	// DO NOT PUBLISH (Kevin 2026-11-16 "These should NOT show on SMP at all"): never a feed item, even if a page leaked
	const isDnp = dnpMatcher(JSON.parse(readFileSync(new URL('../src/data/books/do-not-publish.json', import.meta.url), 'utf8')));
	for (const d of readdirSync(`${dist}/books`).sort()) {
		const f = `${dist}/books/${d}/index.html`;
		if (!existsSync(f) || isDnp({ slug: d })) continue;
		const html = readFileSync(f, 'utf8');
		for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)) {
			let j;
			try {
				j = JSON.parse(m[1]);
			} catch {
				continue;
			}
			if (isDnp({ title: j.name })) continue;
			walk(j, {
				slug: d,
				name: j.name,
				desc: j.description,
				image: imgUrl(j.image),
				author: j.author?.name,
			});
		}
	}
	return items;
}

const num = (q, k) => q?.[k] ?? '';
/**
 * Countries where Merchant Center will not show an offer priced in another currency (no currency conversion).
 * A <g:shipping> block for one of these makes Google target the item there and flag it "Unsupported currency"
 * (MC 5402182771, 2026-11-17: 191/191 items, "Prevents from showing in South Korea"; FHB 5891954461 had the same).
 * The store still ships there; only the Google feed leaves the country out unless the price is already local.
 */
export const MC_LOCAL_CURRENCY_ONLY = { KR: 'KRW' };
const mcShippable = (cc, currency) => !MC_LOCAL_CURRENCY_ONLY[cc] || MC_LOCAL_CURRENCY_ONLY[cc] === currency;
export function render(items) {
	const rows = [...items.values()].map((i) => {
		// One <g:shipping> per OfferShippingDetails (one per live country the engine serves). None = fail loudly.
		const details = [].concat(i.ship ?? []);
		if (!details.length) throw new Error(`merchant-feed: ${i.id} has no shippingDetails in its page JSON-LD`);
		const ship = details
			.filter((d) => mcShippable([].concat(d.shippingDestination)[0]?.addressCountry, i.currency))
			.map((d) => {
				const dt = d.deliveryTime;
				const cc = [].concat(d.shippingDestination)[0]?.addressCountry;
				return (
					`<g:shipping><g:country>${esc(cc)}</g:country><g:service>${esc(d.name ?? 'Standard')}</g:service><g:price>${Number(d.shippingRate?.value ?? 0).toFixed(2)} ${esc(d.shippingRate?.currency ?? 'USD')}</g:price>` +
					`<g:min_handling_time>${num(dt?.handlingTime, 'minValue')}</g:min_handling_time><g:max_handling_time>${num(dt?.handlingTime, 'maxValue')}</g:max_handling_time>` +
					`<g:min_transit_time>${num(dt?.transitTime, 'minValue')}</g:min_transit_time><g:max_transit_time>${num(dt?.transitTime, 'maxValue')}</g:max_transit_time></g:shipping>`
				);
			})
			.join('\n');
		return `<item>
<g:id>${esc(i.id)}</g:id>
<title>${esc(i.title)}</title>
<description>${esc(i.description)}</description>
<link>${esc(i.link)}</link>
<g:image_link>${esc(i.image)}</g:image_link>
<g:price>${esc(i.price)} ${esc(i.currency)}</g:price>
<g:availability>${String(i.availability).endsWith('InStock') ? 'in_stock' : 'out_of_stock'}</g:availability>
<g:condition>new</g:condition>
<g:gtin>${esc(i.gtin)}</g:gtin>
<g:brand>Spirit Media Publishing</g:brand>
<g:identifier_exists>yes</g:identifier_exists>
<g:google_product_category>Media &gt; Books</g:google_product_category>
<g:product_type>Books</g:product_type>
<g:item_group_id>${esc(i.slug)}</g:item_group_id>
${ship}
</item>`;
	});
	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>Spirit Media Publishing — books</title>
<link>https://spiritmediapublishing.com/bookstore/</link>
<description>Books published by Spirit Media Publishing, ordered direct at spiritmediapublishing.com</description>
${rows.join('\n')}
</channel>
</rss>
`;
}

const AVAIL = (a) => (String(a).endsWith('InStock') ? 'in_stock' : 'out_of_stock'); // = the XML's mapping
const COND = { 'https://schema.org/UsedCondition': 'used', 'https://schema.org/RefurbishedCondition': 'refurbished' };
/** The OpenAI (ChatGPT merchant) feed: JSONL, one record per item of the SAME Map render() uses. */
export function renderOpenAI(items) {
	const perGroup = new Map();
	for (const i of items.values()) perGroup.set(i.slug, (perGroup.get(i.slug) ?? 0) + 1);
	return (
		[...items.values()]
			.map((i) => {
				const us = [].concat(i.ship ?? []).find((d) => [].concat(d.shippingDestination)[0]?.addressCountry === 'US');
				const ret = i.returns;
				const days = Number(ret?.merchantReturnDays);
				const variant = perGroup.get(i.slug) > 1 && i.format && i.slug !== i.id;
				return JSON.stringify({
					item_id: String(i.id),
					title: i.title,
					description: i.description,
					url: i.link,
					brand: 'Spirit Media Publishing',
					seller_name: 'Spirit Media Publishing',
					image_url: i.image,
					availability: AVAIL(i.availability),
					price: `${i.price} ${i.currency}`,
					target_countries: ['US'],
					store_country: 'US',
					gtin: String(i.gtin),
					condition: COND[i.condition] ?? 'new',
					product_category: 'Media > Books',
					...(us?.shippingRate
						? { shipping_price: `${Number(us.shippingRate.value ?? 0).toFixed(2)} ${us.shippingRate.currency ?? 'USD'}` }
						: {}),
					...(ret?.merchantReturnLink ? { return_policy: ret.merchantReturnLink } : {}),
					...(days > 0 ? { accepts_returns: true, return_deadline_in_days: days } : {}),
					...(variant ? { group_id: i.slug, listing_has_variations: true, variant_dict: { format: i.format } } : {}),
				});
			})
			.join('\n') + '\n'
	);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const dist = arg('--dist', 'dist');
	const out = arg('--out', `${dist}/merchant-feed.xml`);
	const items = collect(dist);
	if (!items.size) throw new Error('merchant-feed: 0 items — no Offer JSON-LD found in dist/books');
	writeFileSync(out, render(items));
	const outJsonl = `${out.replace(/\.xml$/, '')}-openai.jsonl`;
	writeFileSync(outJsonl, renderOpenAI(items));
	console.log(`merchant-feed: ${items.size} records -> ${outJsonl}`);
	console.log(
		`merchant-feed: ${items.size} items from ${new Set([...items.values()].map((i) => i.slug)).size} book pages -> ${out}`,
	);
}
