// BUILD-CHECK: ported, not new — /srv/sites/FHB/scripts/openai-feed.test.mjs (FHB unit 2ra), adapted to SMP
// NEAREST: /srv/sites/FHB/scripts/openai-feed.test.mjs (same validator + parity rules)
// NOT-REUSED-BECAUSE: it lives in the FHB repo and reads FHB's dist + FHB Option C rules; SMP's build cannot import it
// APPROVED-BY: Kevin 2026-11-17 "1 yes 2 yes" via brief pmprint-smp-merchant-channels-20261117 B3
//
// node --test scripts/openai-feed.test.mjs — dist/merchant-feed-openai.jsonl (ChatGPT merchant product feed,
// https://developers.openai.com/commerce/specs/feed, read 2026-11-17) is valid against the spec's required fields
// and matches dist/merchant-feed.xml item-for-item (same ids, prices, availability, links, images, GTINs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Google feed items (local parse: importing merchant-feed.test.mjs would re-run its tests in this process)
const un = (s) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const tag = (b, t) => {
	const m = new RegExp(`<${t}>(.*?)</${t}>`, 's').exec(b);
	return m ? un(m[1]) : '';
};
export const parse = (xml) =>
	[...xml.matchAll(/<item>(.*?)<\/item>/gs)].map((m) => ({
		id: tag(m[1], 'g:id'),
		title: tag(m[1], 'title'),
		link: tag(m[1], 'link'),
		image: tag(m[1], 'g:image_link'),
		price: tag(m[1], 'g:price'),
		availability: tag(m[1], 'g:availability'),
		gtin: tag(m[1], 'g:gtin'),
	}));

const REQUIRED = ['item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'image_url', 'availability', 'price', 'store_country'];
const AVAIL = ['in_stock', 'out_of_stock', 'pre_order', 'backorder', 'unknown'];
const MONEY = /^\d+\.\d\d [A-Z]{3}$/;

/** Returns a list of error strings; empty = valid and in parity with the Google feed items. */
export function validate(jsonl, google) {
	const errs = [];
	const recs = [];
	for (const [n, l] of jsonl.split('\n').filter((x) => x.trim()).entries()) {
		try {
			recs.push(JSON.parse(l));
		} catch {
			errs.push(`line ${n + 1}: not JSON`);
		}
	}
	if (recs.length !== google.length) errs.push(`count ${recs.length} != google ${google.length}`);
	const ids = new Set();
	for (const r of recs) {
		for (const f of REQUIRED) if (typeof r[f] !== 'string' || !r[f].trim()) errs.push(`${r.item_id}: missing ${f}`);
		if (!Array.isArray(r.target_countries) || !r.target_countries.length || !r.target_countries.every((c) => /^[A-Z]{2}$/.test(c)))
			errs.push(`${r.item_id}: bad target_countries`);
		if (ids.has(r.item_id)) errs.push(`${r.item_id}: duplicate item_id`);
		ids.add(r.item_id);
		if (!AVAIL.includes(r.availability)) errs.push(`${r.item_id}: bad availability ${r.availability}`);
		if (!MONEY.test(r.price ?? '') || parseFloat(r.price) <= 0) errs.push(`${r.item_id}: bad price ${r.price}`);
		if (r.shipping_price !== undefined && (!MONEY.test(r.shipping_price) || r.shipping_price.slice(-3) !== r.price.slice(-3)))
			errs.push(`${r.item_id}: bad shipping_price`);
		for (const f of ['url', 'image_url']) if (!/^https?:\/\//.test(r[f] ?? '')) errs.push(`${r.item_id}: ${f} not absolute`);
		if (r.return_policy !== undefined && !/^https?:\/\//.test(r.return_policy)) errs.push(`${r.item_id}: bad return_policy`);
		if (r.return_deadline_in_days !== undefined && (r.accepts_returns !== true || !(r.return_deadline_in_days > 0)))
			errs.push(`${r.item_id}: return_deadline_in_days without accepts_returns`);
		if (r.gtin !== undefined && !/^(\d{8}|\d{12,14})$/.test(r.gtin)) errs.push(`${r.item_id}: bad gtin`);
		if (r.group_id !== undefined) {
			if (r.group_id === r.item_id) errs.push(`${r.item_id}: group_id equals item_id`);
			if (r.listing_has_variations !== true || !r.variant_dict || typeof r.variant_dict !== 'object')
				errs.push(`${r.item_id}: group_id without listing_has_variations + variant_dict`);
		}
		if ((r.title ?? '').length > 150) errs.push(`${r.item_id}: title > 150`);
		const g = google.find((x) => x.id === r.item_id);
		if (!g) {
			errs.push(`${r.item_id}: not in google feed`);
			continue;
		}
		if (g.price !== r.price) errs.push(`${r.item_id}: price ${r.price} != google ${g.price}`);
		if (g.availability !== r.availability) errs.push(`${r.item_id}: availability ${r.availability} != google ${g.availability}`);
		if (g.link !== r.url) errs.push(`${r.item_id}: url != google`);
		if (g.image.replace(/-3d-v2-600\.webp$/, '-3d-v2-600.jpg') !== r.image_url) errs.push(`${r.item_id}: image != google`);
		if (!/\.(jpe?g|png)(\?.*)?$/i.test(r.image_url ?? '')) errs.push(`${r.item_id}: image_url not JPEG/PNG (OpenAI spec)`);
		if (g.gtin !== r.gtin) errs.push(`${r.item_id}: gtin != google`);
		if (g.title !== r.title) errs.push(`${r.item_id}: title != google`);
	}
	return errs;
}

const JSONL = 'dist/merchant-feed-openai.jsonl';
const built = fs.existsSync(JSONL) && fs.existsSync('dist/merchant-feed.xml');
const jsonl = () => fs.readFileSync(JSONL, 'utf8');
const google = () => parse(fs.readFileSync('dist/merchant-feed.xml', 'utf8'));

test('dist: OpenAI feed is valid and in parity with the Google feed', (t) => {
	if (!built) return t.skip('no dist build');
	const g = google();
	assert.ok(g.length > 0);
	assert.deepEqual(validate(jsonl(), g), []);
});
test('validator rejects injected defects (failure path)', (t) => {
	if (!built) return t.skip('no dist build');
	const g = google();
	const recs = jsonl().trim().split('\n').map((l) => JSON.parse(l));
	const ser = (a) => a.map((r) => JSON.stringify(r)).join('\n');
	const mut = (fn) => {
		const c = structuredClone(recs);
		fn(c);
		return validate(ser(c), g);
	};
	assert.ok(mut((c) => delete c[0].seller_name).some((e) => e.includes('missing seller_name')));
	assert.ok(mut((c) => delete c[0].store_country).some((e) => e.includes('missing store_country')));
	assert.ok(mut((c) => (c[0].target_countries = [])).some((e) => e.includes('target_countries')));
	assert.ok(mut((c) => (c[0].price = '1.23 USD')).some((e) => e.includes('!= google')));
	assert.ok(mut((c) => c.pop()).some((e) => e.includes('count')));
	assert.ok(mut((c) => (c[0].availability = 'out_of_stock')).some((e) => e.includes('availability')));
	assert.ok(mut((c) => (c[0].url = 'https://x.example/')).some((e) => e.includes('url')));
	assert.ok(mut((c) => (c[0].image_url = 'https://x.example/a.jpg')).some((e) => e.includes('image')));
	assert.ok(mut((c) => (c[0].image_url = c[0].image_url.replace(/\.(jpe?g|png)$/i, '.webp'))).some((e) => e.includes('not JPEG/PNG')));
	assert.ok(mut((c) => Object.assign(c[0], { group_id: 'g', listing_has_variations: undefined })).some((e) => e.includes('variant_dict')));
});
