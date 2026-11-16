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
 * Usage: node scripts/gen-merchant-feed.mjs [--dist dist] [--out dist/merchant-feed.xml]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

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
	for (const d of readdirSync(`${dist}/books`).sort()) {
		const f = `${dist}/books/${d}/index.html`;
		if (!existsSync(f)) continue;
		const html = readFileSync(f, 'utf8');
		for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)) {
			let j;
			try {
				j = JSON.parse(m[1]);
			} catch {
				continue;
			}
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
export function render(items) {
	const rows = [...items.values()].map((i) => {
		// One <g:shipping> per OfferShippingDetails (one per live country the engine serves). None = fail loudly.
		const details = [].concat(i.ship ?? []);
		if (!details.length) throw new Error(`merchant-feed: ${i.id} has no shippingDetails in its page JSON-LD`);
		const ship = details
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

if (import.meta.url === `file://${process.argv[1]}`) {
	const dist = arg('--dist', 'dist');
	const out = arg('--out', `${dist}/merchant-feed.xml`);
	const items = collect(dist);
	if (!items.size) throw new Error('merchant-feed: 0 items — no Offer JSON-LD found in dist/books');
	writeFileSync(out, render(items));
	console.log(
		`merchant-feed: ${items.size} items from ${new Set([...items.values()].map((i) => i.slug)).size} book pages -> ${out}`,
	);
}
