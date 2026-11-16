// BUILD-CHECK: searched tool-inventory.py "merchant feed" + FHB scripts/merchant-feed-verify.mjs, openai-feed.test.mjs
// NEAREST: /srv/sites/FHB/scripts/merchant-feed-verify.mjs (live-URL verifier for FHB's feed)
// NOT-REUSED-BECAUSE: it checks one FHB feed against live FHB pages over the network; this gates the SMP build
//   offline and adds the cross-business rule (no GTIN in both the SMP and FHB feeds), which no existing tool checks
// APPROVED-BY: pmseoaeo brief pmprint-smp-growth-20261116 #3 + Kevin brief pmprint-store-168-strategy-20261116 #3
//
// node --test scripts/merchant-feed.test.mjs — dist/merchant-feed.xml is exactly the sellable book Offers the built
// pages declare, every field Merchant Center requires is present, and no GTIN is also listed in FHB's feed
// (Merchant Center: one listing per GTIN per business).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { collect } from './gen-merchant-feed.mjs';

const FEED = 'dist/merchant-feed.xml';
const FHB_LOCAL = process.env.FHB_FEED ?? '/srv/sites/FHB/dist/merchant-feed.xml'; // FHB_FEED: point at another build
const FHB_URL = 'https://fathersheartbible.com/merchant-feed.xml';

const un = (s) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const tag = (b, t) => {
	const m = new RegExp(`<${t}>(.*?)</${t}>`, 's').exec(b);
	return m ? un(m[1]) : '';
};
export const parse = (xml) =>
	[...xml.matchAll(/<item>(.*?)<\/item>/gs)].map((m) => ({
		id: tag(m[1], 'g:id'),
		title: tag(m[1], 'title'),
		desc: tag(m[1], 'description'),
		link: tag(m[1], 'link'),
		image: tag(m[1], 'g:image_link'),
		price: tag(m[1], 'g:price'),
		availability: tag(m[1], 'g:availability'),
		gtin: tag(m[1], 'g:gtin'),
		brand: tag(m[1], 'g:brand'),
		cat: tag(m[1], 'g:google_product_category'),
		ship: tag(m[1], 'g:shipping'),
	}));
export const isbn13 = (g) =>
	/^97[89]\d{10}$/.test(g) && [...g].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0;
/** GTINs present in both feeds (must be empty). */
export const overlap = (a, b) => {
	const B = new Set(b.map((i) => i.gtin));
	return [...new Set(a.map((i) => i.gtin))].filter((g) => B.has(g));
};

const built = fs.existsSync(FEED);
const items = built ? parse(fs.readFileSync(FEED, 'utf8')) : [];

test('feed = every Offer the built book pages declare (one item per SKU)', (t) => {
	if (!built) return t.skip('no dist build');
	const offers = collect('dist');
	assert.ok(items.length > 0, 'empty feed');
	assert.deepEqual(items.map((i) => i.id).sort(), [...offers.keys()].sort());
	for (const i of items) {
		const o = offers.get(i.id);
		assert.equal(i.price, `${o.price} ${o.currency}`, `${i.id} price`);
		assert.equal(i.gtin, o.gtin, `${i.id} gtin`);
	}
});

test('every item carries the fields Merchant Center requires', (t) => {
	if (!built) return t.skip('no dist build');
	const seen = new Set();
	for (const i of items) {
		assert.ok(!seen.has(i.id), `${i.id} duplicate id`);
		seen.add(i.id);
		for (const f of ['id', 'title', 'desc', 'link', 'image', 'price', 'gtin', 'brand', 'cat', 'ship'])
			assert.ok(i[f], `${i.id} missing ${f}`);
		assert.ok(isbn13(i.gtin), `${i.id} GTIN ${i.gtin} not a valid ISBN-13`);
		assert.match(i.price, /^\d+\.\d\d USD$/, `${i.id} price format`);
		assert.equal(i.availability, 'in_stock', `${i.id} availability`);
		assert.match(i.link, /^https:\/\/spiritmediapublishing\.com\/books\/[a-z0-9-]+\/#order$/, `${i.id} link`);
		assert.match(i.image, /^https:\/\//, `${i.id} image`);
	}
	assert.equal(new Set(items.map((i) => i.gtin)).size, items.length, 'a GTIN is listed twice');
});

test('every live page with an order form is in the feed', (t) => {
	if (!built) return t.skip('no dist build');
	const inFeed = new Set(items.map((i) => i.link.replace(/#order$/, '')));
	const live = JSON.parse(fs.readFileSync('src/data/books/pages-live.json', 'utf8')).slugs;
	let n = 0;
	for (const s of live) {
		const html = fs.readFileSync(`dist/books/${s}/index.html`, 'utf8');
		const url = `https://spiritmediapublishing.com/books/${s}/`;
		if (!/id="order"/.test(html) || /Available soon/.test(html)) continue; // not sellable
		n++;
		assert.ok(inFeed.has(url), `${s} sells (order form) but has no feed item`);
	}
	t.diagnostic(`${n} sellable live pages, all in the feed`);
});

// OPTION C (Kevin 2026-11-16 "1 store SMP. 2 shop windows FHB and SMP"): SMP's feed = SMP-author books ONLY. Every
// Father's Heart product (Bibles + the FH books in store-engine books.json) is FHB's window and FHB's feed.
export const fhErrs = (feed, fhBooks, reg) => {
	const errs = [];
	const fhSku = new Set(fhBooks.flatMap((b) => b.formats ?? []));
	const fhGtin = new Set([...fhSku].map((k) => reg[k]?.isbn).filter(Boolean));
	const fhSlug = new Set(fhBooks.map((b) => b.slug));
	for (const i of feed) {
		if (fhSku.has(i.id)) errs.push(`${i.id}: a Father's Heart book SKU`);
		if (fhGtin.has(i.gtin)) errs.push(`${i.id}: GTIN ${i.gtin} is a Father's Heart book`);
		const slug = i.link?.match(/\/books\/([^/]+)\//)?.[1];
		if (fhSlug.has(slug)) errs.push(`${i.id}: links to the FH book ${slug}`);
		if (/Father.s Heart Bible/i.test(i.title ?? '')) errs.push(`${i.id}: a Father's Heart Bible`);
	}
	return errs;
};
const FH_BOOKS = JSON.parse(fs.readFileSync('src/store-engine/data/books.json', 'utf8')).books;
const REG = JSON.parse(fs.readFileSync('src/store-engine/data/book-skus.json', 'utf8')).skus;

test('the SMP feed carries no Father\'s Heart product (Option C: FHB is their one window)', (t) => {
	if (!built) return t.skip('no dist build');
	assert.ok(FH_BOOKS.length >= 2, 'store-engine books.json lists the FH books');
	assert.deepEqual(fhErrs(items, FH_BOOKS, REG), []);
	for (const b of FH_BOOKS) assert.ok(!fs.existsSync(`dist/books/${b.slug}/index.html`), `${b.slug}: no SMP page (301 to FHB)`);
});

test('the FH-product check FAILS on an injected FH book (proof it can reject)', () => {
	const sku = FH_BOOKS[0].formats[0];
	const bad = [{ id: sku, gtin: REG[sku].isbn, title: 'x', link: `https://spiritmediapublishing.com/books/${FH_BOOKS[0].slug}/#order` }];
	assert.equal(fhErrs(bad, FH_BOOKS, REG).length, 3);
	assert.equal(fhErrs([{ id: 'x', gtin: '1', title: "Father's Heart Bible (Hardcover)", link: '' }], FH_BOOKS, REG).length, 1);
});

test('no GTIN is in both the SMP and FHB feeds (one listing per GTIN per business)', async (t) => {
	if (!built) return t.skip('no dist build');
	let xml = null;
	if (fs.existsSync(FHB_LOCAL)) xml = fs.readFileSync(FHB_LOCAL, 'utf8');
	else
		xml = await fetch(FHB_URL)
			.then((r) => (r.ok ? r.text() : null))
			.catch(() => null);
	if (!xml) return t.skip('FHB feed not reachable');
	const fhb = parse(xml);
	assert.ok(fhb.length > 0, 'FHB feed parsed to 0 items');
	assert.deepEqual(overlap(items, fhb), [], 'GTIN listed by both businesses');
});

test('the disjoint check FAILS on an injected duplicate GTIN (proof it can reject)', () => {
	const smp = [{ gtin: '9798893072761' }, { gtin: '9798893075595' }];
	const fhb = [{ gtin: '9798893000000' }];
	assert.deepEqual(overlap(smp, fhb), []);
	assert.deepEqual(overlap(smp, [...fhb, { gtin: '9798893075595' }]), ['9798893075595']);
});
