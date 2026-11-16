// node --test scripts/store-checkout.test.mjs — /store-checkout (plan 3fb Phase 3) with Stripe mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const A = 'https://spiritmediapublishing.com/store-checkout';
async function post(payload, { key = 'sk_test', origin } = {}) {
	const calls = [];
	let body = '';
	globalThis.fetch = async (url, init) => {
		calls.push(String(url));
		if (init?.method === 'POST') {
			body = init.body;
			return new Response(JSON.stringify({ url: 'https://stripe.test/s' }));
		}
		return new Response(JSON.stringify({ data: [] }));
	};
	const { onRequestPost } = await import('../functions/store-checkout.ts');
	const res = await onRequestPost({
		request: new Request(A, { method: 'POST', body: JSON.stringify(payload), headers: origin ? { origin } : {} }),
		env: key ? { STRIPE_STORE_SECRET_KEY: key } : {},
	});
	return { status: res.status, json: await res.json(), form: new URLSearchParams(body), calls, headers: res.headers };
}

test('an order form ON the FHB book page (Kevin L1999): CORS for FHB only, site=fhb, buyer returns to FHB', async () => {
	const r = await post(
		{ counts: { 'who-am-i-hb': 1 }, country: 'US', returnPath: '/books/who-am-i/', site: 'smp' },
		{ origin: 'https://fathersheartbible.com' },
	);
	assert.equal(r.status, 200);
	assert.equal(r.headers.get('access-control-allow-origin'), 'https://fathersheartbible.com');
	assert.equal(r.form.get('metadata[site]'), 'fhb', 'site derived from Origin, not the payload');
	assert.equal(r.form.get('success_url'), 'https://fathersheartbible.com/order?s={CHECKOUT_SESSION_ID}');
	assert.equal(r.form.get('cancel_url'), 'https://fathersheartbible.com/books/who-am-i/?order=canceled#order');
	// a preview of FHB returns to itself; the production Pages host is rewritten to the .com
	const p = await post({ counts: { 'who-am-i-pb': 1 }, country: 'US', returnPath: '/books/who-am-i/' }, { origin: 'https://dev.fathersheartbible.pages.dev' });
	assert.equal(p.form.get('cancel_url'), 'https://dev.fathersheartbible.pages.dev/books/who-am-i/?order=canceled#order');
	const prod = await post({ counts: { 'who-am-i-pb': 1 }, country: 'US', returnPath: '/books/who-am-i/' }, { origin: 'https://fathersheartbible.pages.dev' });
	assert.equal(prod.form.get('success_url'), 'https://fathersheartbible.com/order?s={CHECKOUT_SESSION_ID}');
});

test('a foreign Origin is refused with no CORS header and nothing sent to Stripe; preflight only for FHB', async () => {
	for (const origin of ['https://evil.example', 'https://fathersheartbible.com.evil.example', 'http://fathersheartbible.com']) {
		const r = await post({ counts: { 'who-am-i-pb': 1 }, country: 'US' }, { origin });
		assert.equal(r.status, 403, origin);
		assert.equal(r.headers.get('access-control-allow-origin'), null);
		assert.equal(r.calls.length, 0);
	}
	const { onRequestOptions } = await import('../functions/store-checkout.ts');
	const ok = await onRequestOptions({ request: new Request(A, { method: 'OPTIONS', headers: { origin: 'https://fathersheartbible.com' } }) });
	assert.equal(ok.status, 204);
	assert.equal(ok.headers.get('access-control-allow-origin'), 'https://fathersheartbible.com');
	const no = await onRequestOptions({ request: new Request(A, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }) });
	assert.equal(no.status, 403);
	// same-origin (the SMP buy page) carries an Origin equal to itself: still served, no CORS header needed
	const same = await post({ counts: { 'who-am-i-pb': 1 }, country: 'US', returnPath: '/books/who-am-i/buy/' }, { origin: 'https://spiritmediapublishing.com' });
	assert.equal(same.status, 200);
	assert.equal(same.form.get('metadata[site]'), 'smp');
});

test('a US book order becomes the engine session, returned to SMP, recorded per site + utm', async () => {
	const r = await post({
		counts: { 'who-am-i-pb': 2 },
		country: 'US',
		returnPath: '/books/who-am-i/buy/',
		site: 'fhb',
		utm: { source: 'fathersheartbible.com', medium: 'referral', campaign: 'buy-button', content: 'book-page' },
	});
	assert.equal(r.status, 200);
	assert.equal(r.json.url, 'https://stripe.test/s');
	const f = r.form;
	assert.equal(f.get('metadata[kind]'), 'dvc_print', 'fulfilment runs through FHB print-webhook');
	assert.equal(f.get('line_items[0][price_data][unit_amount]'), '1599');
	assert.equal(f.get('line_items[0][quantity]'), '2');
	assert.match(f.get('metadata[book_1]'), /^title=.*\|isbn=9798893075595\|format=Paperback\|qty=2\|unit_cents=1599\|/);
	assert.equal(f.get('success_url'), 'https://spiritmediapublishing.com/order?s={CHECKOUT_SESSION_ID}');
	assert.equal(f.get('cancel_url'), 'https://spiritmediapublishing.com/books/who-am-i/buy/?order=canceled#order');
	assert.equal(f.get('metadata[site]'), 'fhb');
	assert.equal(f.get('metadata[utm_campaign]'), 'buy-button');
	assert.equal(f.get('discounts[0][promotion_code]'), null, 'books never take the first-order coupon');
	assert.deepEqual(r.calls, ['https://api.stripe.com/v1/checkout/sessions'], 'no first-order lookup for books');
});

test('a Bible sells only in the FHB window: refused from an SMP page, sold from the FHB Bible box (Option C)', async () => {
	const r = await post({ counts: { 'moms-hb': 1 }, country: 'US' });
	assert.deepEqual([r.status, r.json.error, r.calls.length], [400, 'invalid_selection', 0]);
	const v = await post({ counts: { 'moms-hb': 1 }, country: 'US', site: 'vaneure' });
	assert.deepEqual([v.status, v.json.error], [400, 'invalid_selection']);
	const f = await post({ counts: { 'moms-hb': 1 }, country: 'US', returnPath: '/bibles/moms-bible/' }, { origin: 'https://fathersheartbible.com' });
	assert.equal(f.status, 200);
	assert.equal(f.headers.get('access-control-allow-origin'), 'https://fathersheartbible.com');
	assert.equal(f.form.get('cancel_url'), 'https://fathersheartbible.com/bibles/moms-bible/?order=canceled#order');
});

// ── OPTION C (Kevin 2026-11-16 "1 store SMP. 2 shop windows FHB and SMP") ─────────────────────────────────────────
const tagsOf = (f) => [f.get('metadata[site]'), f.get('metadata[window]'), f.get('metadata[family]')];
test('item 1: every session is tagged site + window + family (FHB Bible box, FHB book box, SMP book page, vaneure)', async () => {
	const fhbBible = await post({ counts: { 'moms-hb': 2 }, country: 'US' }, { origin: 'https://fathersheartbible.com' });
	assert.deepEqual(tagsOf(fhbBible.form), ['fhb', 'fhb', 'bible']);
	const fhbBook = await post({ counts: { 'who-am-i-pb': 1 }, country: 'US', returnPath: '/books/who-am-i/' }, { origin: 'https://fathersheartbible.com' });
	assert.deepEqual(tagsOf(fhbBook.form), ['fhb', 'fhb', 'fh_book']);
	const smpBook = await post({ counts: { 'the-pyramid-principle-pb': 1 }, country: 'US' });
	assert.deepEqual(tagsOf(smpBook.form), ['smp', 'smp', 'smp_book']);
	const vaneure = await post({ counts: { 'the-pyramid-principle-pb': 1 }, country: 'US', site: 'vaneure' });
	assert.deepEqual(tagsOf(vaneure.form), ['vaneure', 'smp', 'smp_book']);
	const mixed = await post({ counts: { 'moms-pb': 1, 'who-am-i-hb': 1 }, country: 'US' }, { origin: 'https://fathersheartbible.com' });
	assert.deepEqual(tagsOf(mixed.form), ['fhb', 'fhb', 'bible+fh_book']);
});

test('item 1 FAILURE PATH: a session without the tags FAILS — refused 500 untagged, nothing sent to Stripe', async () => {
	const { createSession, smpCheckoutForm } = await import('../functions/store-checkout.ts');
	const calls = [];
	globalThis.fetch = async (url) => (calls.push(String(url)), new Response(JSON.stringify({ url: 'https://stripe.test/s', data: [] })));
	const r = await smpCheckoutForm({ counts: { 'moms-hb': 1 }, country: 'US', site: 'fhb' }, 'https://fathersheartbible.com/store-checkout', 'sk_test');
	assert.ok('form' in r);
	for (const k of ['metadata[site]', 'metadata[window]', 'metadata[family]']) {
		const untagged = { ...r.form };
		delete untagged[k];
		calls.length = 0;
		const s = await createSession(untagged, 'sk_test');
		assert.deepEqual([s.status, s.body.error, calls.length], [500, 'untagged', 0], `without ${k}`);
	}
	calls.length = 0;
	const ok = await createSession(r.form, 'sk_test');
	assert.deepEqual([ok.status, calls], [200, ['https://api.stripe.com/v1/checkout/sessions']], 'the tagged form is sent');
});

// item 2 PARITY: the FHB Bible box used to post to FHB /dvc-checkout; it now posts here. For the fixed carts FHB's parity
// gate uses (scripts/fixtures/fhb-dvc-checkout-golden.json = FHB scripts/fixtures/store-engine-golden.json, sha256
// 2feaa8fa…, recorded on /dvc-checkout), this endpoint must send the BYTE-IDENTICAL Stripe request and the same Stripe
// calls in the same order. The only permitted difference: the three Option C tags appended at the end.
const CARTS = [
	{ id: 'bible-us-volume', counts: { 'moms-hb': 12 }, email: 'x@y.co', country: 'US', repeat: true },
	{ id: 'bible-us-first-order', counts: { 'moms-hb': 1 }, email: 'new@y.co', country: 'US' },
	{ id: 'book-us', counts: { 'who-am-i-pb': 2 }, email: 'new@y.co', country: 'US' },
	{ id: 'mixed-us-first-order', counts: { 'moms-pb': 1, 'beloved-identity-pb': 1, 'who-am-i-hb': 1 }, email: 'new@y.co', country: 'US', returnPath: '/books/who-am-i/' },
	{ id: 'far-band-first-order', counts: { 'moms-hb': 3 }, email: 'new@y.co', country: 'PH' },
	{ id: 'far-band-bulk-refused', counts: { 'moms-hb': 10 }, email: 'new@y.co', country: 'PH' },
	{ id: 'intl-gb-mixed-handling', counts: { 'moms-hb': 2, 'moms-pb': 3 }, email: 'new@y.co', country: 'GB', returnPath: '/print/order/' },
	{ id: 'intl-gb-volume-repeat', counts: { 'moms-pb': 30 }, email: 'x@y.co', country: 'GB', repeat: true },
	{ id: 'book-abroad', counts: { 'beloved-identity-pb': 1 }, email: 'new@y.co', country: 'DE' },
	{ id: 'empty', counts: {}, email: 'new@y.co', country: 'US' },
	{ id: 'no-email', counts: { 'moms-pb': 5 }, email: '', country: 'US', returnPath: '/bibles/spanish-bible/' },
];
const TAGS_TAIL = /&metadata%5Bsite%5D=fhb&metadata%5Bwindow%5D=fhb&metadata%5Bfamily%5D=[a-z_%2B]+$/;
test('item 2: FHB Bible box carts -> /store-checkout send the IDENTICAL Stripe request /dvc-checkout sent (+ tags only)', async () => {
	const fs = await import('node:fs');
	const want = JSON.parse(fs.readFileSync(new URL('./fixtures/fhb-dvc-checkout-golden.json', import.meta.url), 'utf8'));
	assert.deepEqual(CARTS.map((c) => c.id), Object.keys(want));
	const { onRequestPost } = await import('../functions/store-checkout.ts');
	const day = (v) => JSON.parse(JSON.stringify(v).replace(/date%3D\d{4}-\d\d-\d\d|date=\d{4}-\d\d-\d\d/g, 'date=<day>'));
	for (const c of CARTS) {
		const calls = [];
		let body = '';
		globalThis.fetch = async (url, init) => {
			const u = String(url);
			calls.push(`${init?.method ?? 'GET'} ${u}`);
			const j = (o) => new Response(JSON.stringify(o), { status: 200 });
			if (u.includes('promotion_codes')) return j({ data: [{ id: 'promo_1', coupon: { valid: true, percent_off: 15 } }] });
			if (u.includes('checkout/sessions') && init?.method === 'POST') {
				body = init.body;
				return j({ url: 'https://stripe.test/x' });
			}
			if (u.includes('checkout/sessions')) return j({ data: c.repeat ? [{ payment_status: 'paid', metadata: { kind: 'dvc_print' } }] : [] });
			return j({ data: [] });
		};
		// exactly what the Bible box (FHB src/scripts/order-form.ts) posts, from the FHB page
		const res = await onRequestPost({
			request: new Request(A, {
				method: 'POST',
				headers: { origin: 'https://fathersheartbible.com' },
				body: JSON.stringify({ counts: c.counts, email: c.email, country: c.country, returnPath: c.returnPath, site: 'fhb' }),
			}),
			env: { STRIPE_STORE_SECRET_KEY: 'sk_test' },
		});
		const got = { status: res.status, json: await res.json(), calls, body };
		if (body) {
			assert.match(got.body, TAGS_TAIL, `${c.id}: tags at the end`);
			got.body = got.body.replace(TAGS_TAIL, '');
		}
		assert.deepEqual(day(got), day(want[c.id]), `cart ${c.id}: Stripe request differs from /dvc-checkout`);
	}
});

test('item 2: the FHB Bible box first-order check answers from the store (FHB origin only, CORS), SMP pages get unknown', async () => {
	const store = new Map();
	globalThis.caches = { default: { match: async (k) => store.get(String(k.url ?? k)), put: async (k, v) => void store.set(String(k.url ?? k), v) } };
	const { onRequestPost } = await import('../functions/store-checkout.ts');
	const calls = [];
	const ask = async (origin) => {
		globalThis.fetch = async (url, init) => {
			calls.push(`${init?.method ?? 'GET'} ${url}`);
			// a live WELCOME15 at 15%, and no paid store session for this email
			return new Response(JSON.stringify(String(url).includes('promotion_codes') ? { data: [{ id: 'promo_1', coupon: { valid: true, percent_off: 15 } }] } : { data: [] }));
		};
		const res = await onRequestPost({
			request: new Request(A, { method: 'POST', headers: { origin }, body: JSON.stringify({ firstOrderCheck: true, email: 'new@y.co' }) }),
			env: { STRIPE_STORE_SECRET_KEY: 'sk_test' },
		});
		return { json: await res.json(), headers: res.headers };
	};
	try {
		const first = await ask('https://fathersheartbible.com');
		assert.equal(first.headers.get('access-control-allow-origin'), 'https://fathersheartbible.com');
		assert.equal(first.json.status, 'first', 'a new email gets the first-order answer');
		assert.equal(calls.filter((u) => u.startsWith('POST')).length, 0, 'a lookup creates no session');
		const smp = await ask('https://spiritmediapublishing.com');
		assert.equal(smp.json.status, 'unknown');
	} finally {
		delete globalThis.caches;
	}
});

test('an unknown site falls back to smp; a returnPath outside the allowlist cannot redirect elsewhere', async () => {
	const r = await post({ counts: { 'beloved-identity-pb': 1 }, country: 'US', site: 'evil', returnPath: 'https://evil.example/' });
	assert.equal(r.form.get('metadata[site]'), 'smp');
	assert.match(r.form.get('cancel_url'), /^https:\/\/spiritmediapublishing\.com\//);
});

test('no Stripe key bound -> disabled, nothing sent', async () => {
	const r = await post({ counts: { 'who-am-i-hb': 1 }, country: 'US' }, { key: '' });
	assert.equal(r.json.disabled, true);
	assert.equal(r.calls.length, 0);
});

test('the first-order check answers unknown (books never take the 15%)', async () => {
	const r = await post({ firstOrderCheck: true, email: 'a@b.co' });
	assert.equal(r.json.status, 'unknown');
});

test('/order shows a paid order read live from Stripe; a bad reference gets a 404 page, never a crash', async () => {
	globalThis.fetch = async () =>
		new Response(JSON.stringify({ id: 'cs_live_abcdefghijklmnop', payment_status: 'paid', currency: 'usd', amount_total: 3198,
			line_items: { data: [{ description: 'Who Am I? <b>PB</b>', quantity: 2, amount_total: 3198 }] },
			shipping_details: { name: 'A Reader', address: { city: 'Cary', state: 'NC', country: 'US' } } }));
	const { onRequestGet } = await import('../functions/order.ts');
	const ok = await onRequestGet({ request: new Request('https://spiritmediapublishing.com/order?s=cs_live_abcdefghijklmnop'), env: { STRIPE_STORE_SECRET_KEY: 'k' } });
	const h = await ok.text();
	assert.equal(ok.status, 200);
	assert.match(h, /Thank you for your order/);
	assert.match(h, /\$31\.98/);
	assert.match(h, /&lt;b&gt;PB&lt;\/b&gt;/, 'escaped');
	assert.match(h, /noindex,nofollow/);
	const bad = await onRequestGet({ request: new Request('https://spiritmediapublishing.com/order?s=x"><script>'), env: { STRIPE_STORE_SECRET_KEY: 'k' } });
	assert.equal(bad.status, 404);
	// Option C item 9 (Kevin 2026-11-16 CONTACT US rule): a "Contact us" button to hello@, the address never printed
	const printed = (x) => x.replace(/href="[^"]*"/g, '').includes('@spiritmediapublishing.com');
	globalThis.fetch = async () => new Response('down', { status: 500 });
	const down = await onRequestGet({ request: new Request('https://spiritmediapublishing.com/order?s=cs_live_abcdefghijklmnop'), env: { STRIPE_STORE_SECRET_KEY: 'k' } });
	for (const [k, x] of [['paid', h], ['not found', await bad.text()], ['stripe down', await down.text()]]) {
		assert.match(x, /<a class="contact" href="mailto:hello@spiritmediapublishing\.com[^"]*">Contact us<\/a>/, `${k}: Contact us button`);
		assert.equal(printed(x), false, `${k}: the address is printed`);
	}
	assert.equal(printed('<a href="mailto:hello@spiritmediapublishing.com">hello@spiritmediapublishing.com</a>'), true, 'the check catches it');
});

// Books M4 (pmseoaeo 22:53Z; Kevin approved SMP book pages 11-13) + ONE PAGE PER BOOK (Kevin via pmseoaeo 23:19Z: "All I
// see is check out form? Where is the page?"; "Never render internal wording or TBD").
const LEAK = /\b(the Doc\b|Doc (says|lists|calls|describes|names|files|suggests|audience|has)|per the Doc|\(Doc\b|sheet\.json|the sheet\b|the page (makes|attributes|does|publishes|names|claims)|makes no claim|the interior (has|mentions|names|is)|\d+ mentions\b|mentions? [\w' ]{1,24} \d+ times|TBD\b|OMIT\b|UNMEASURED|unconfirmed|pmpublish|pmprint|pmseoaeo|PROPOSED\b|lead term|search volume|unit \d[a-z]{2}\b|no subtitle|live listing|the Record\b|printed on the interior|\[slot\b)/i; // 3gs: a '[Slot: ...]' placeholder reached LOVE God's Way's author bio. 3ge: a Record 'subtitle' of '(no subtitle)' rendered under the h1
// DUPLICATE RULE (store-168 item 2, Kevin 2026-11-16 "SMP not FHB will be #1 retailer ..."; brief: FH books KEEP the FHB
// canonical, the SMP page is the retail listing with rel=canonical -> FHB; every other SMP book page is self-canonical).
// canonicalErrs() is the ONE check, used on the built pages below and proven to fail on a wrong canonical.
const canonicalOf = (html) => [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((m) => m[1]);
const canonicalErrs = (slug, html, want) => {
	const got = canonicalOf(html);
	const errs = [];
	if (got.length !== 1) errs.push(`${slug}: ${got.length} canonical tags`);
	else if (got[0] !== want) errs.push(`${slug}: canonical ${got[0]}, want ${want}`);
	// a page whose canonical is elsewhere declares no merchant listing of its own in its JSON-LD (one listing per GTIN).
	// Only ld+json counts: the plain application/json #smp-retail-offers block feeding the SMP Merchant feed is not markup.
	const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join(' ');
	if (want !== `https://spiritmediapublishing.com/books/${slug}/` && /"@type":(\["Book","Product"\]|"Product")|"@type":"Offer"/.test(ld))
		errs.push(`${slug}: canonical is elsewhere but the page declares Product/Offer`);
	return errs;
};
test('duplicate rule check FAILS on a wrong canonical (proof the gate can reject)', () => {
	const fhb = 'https://fathersheartbible.com/books/who-am-i/';
	const smp = 'https://spiritmediapublishing.com/books/who-am-i/';
	assert.deepEqual(canonicalErrs('who-am-i', `<link rel="canonical" href="${fhb}">`, fhb), []);
	assert.equal(canonicalErrs('who-am-i', `<link rel="canonical" href="${smp}">`, fhb).length, 1, 'SMP self-canonical on an FH book must fail');
	assert.equal(canonicalErrs('who-am-i', '<p>no tag</p>', fhb).length, 1, 'a missing canonical must fail');
	assert.equal(canonicalErrs('who-am-i', `<link rel="canonical" href="${fhb}"><script type="application/ld+json">{"@type":["Book","Product"]}</script>`, fhb).length, 1, 'Product markup on a non-canonical page must fail');
	assert.deepEqual(canonicalErrs('who-am-i', `<link rel="canonical" href="${fhb}"><script type="application/json" id="smp-retail-offers">[{"offers":{"@type":"Offer"}}]</script>`, fhb), [], 'the feed data block is not markup');
	assert.deepEqual(canonicalErrs('gifts', '<link rel="canonical" href="https://spiritmediapublishing.com/books/gifts/">', 'https://spiritmediapublishing.com/books/gifts/'), []);
	assert.equal(canonicalErrs('gifts', '<link rel="canonical" href="https://fathersheartbible.com/books/gifts/">', 'https://spiritmediapublishing.com/books/gifts/').length, 1, 'an SMP book pointing away must fail');
});
const textOf = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
test('book pages: one full page per book; order form ON the sellable ones; no internal wording; no Offer while unsellable; calm', async () => {
	const fs = await import('node:fs');
	const set = JSON.parse(fs.readFileSync(new URL('../src/data/books/shipset-v2.json', import.meta.url), 'utf8'));
	const sold = JSON.parse(fs.readFileSync(new URL('../src/store-engine/data/books.json', import.meta.url), 'utf8')).books;
	const dist = new URL('../dist/books/', import.meta.url);
	const REG = JSON.parse(fs.readFileSync(new URL('../src/store-engine/data/book-skus.json', import.meta.url), 'utf8')).skus;
	assert.equal(set.titles.length, 144); // 30 (3fu) + 8 (3gc) + 6 (3ge) + 5 (3gf) + 1 (3gi) + 3 (3gk) + 2 (3gl) + 5 (3gs) + 84 (pmprint lane 5, 2026-11-16: lane-0 intake PRINT + DIGITAL-ONLY)
	// BOOK PAGES SWITCH: production builds only Kevin-approved pages (src/data/books/pages-live.json);
	// a BOOKS_PREVIEW_ALL=1 preview builds every one. An unapproved page that builds on production fails here.
	const ALL = process.env.BOOKS_PREVIEW_ALL === '1';
	const LIVE = JSON.parse(fs.readFileSync(new URL('../src/data/books/pages-live.json', import.meta.url), 'utf8')).slugs;
	const titles = set.titles.filter((t) => ALL || LIVE.includes(t.slug));
	if (!ALL) for (const t of set.titles.filter((x) => !LIVE.includes(x.slug))) assert.ok(!fs.existsSync(new URL(`${t.slug}/index.html`, dist)), `${t.slug}: not approved, must not build on production`);
	const read = (slug) => fs.readFileSync(new URL(`${slug}/index.html`, dist), 'utf8');
	const mainOf = (html) => html.slice(html.indexOf('<main'), html.indexOf('</main>'));
	for (const t of titles) {
		const html = read(t.slug);
		const main = mainOf(html);
		assert.ok(main.length > 500, `${t.slug}: <main> found`);
		assert.deepEqual(canonicalErrs(t.slug, html, `https://spiritmediapublishing.com/books/${t.slug}/`), [], `${t.slug}: SMP book self-canonical`);
		assert.match(main, /<h1[^>]*>/, `${t.slug}: h1`);
		// Offers only where the store sells (Book+Product per format, riab-pilot 2026-11-14), each at the registry's list
		// price; a page that sells nothing declares none.
		const offers = [...html.matchAll(/"@type":"Offer","price":"([\d.]+)".*?"sku":"([^"]+)"/g)];
		if (!(t.skus && Object.keys(t.skus).some((k) => REG[k]))) assert.equal(offers.length, 0, `${t.slug}: no Offer while no SKU sells`);
		for (const [, price, sku] of offers) assert.equal(Math.round(Number(price) * 100), REG[sku]?.list_cents, `${t.slug}: Offer ${sku} = list price`);
		// pmseoaeo #4 "B": a title whose SKUs are in the store registry carries the US-only order form at #order
		if (t.skus && Object.keys(t.skus).some((k) => REG[k])) {
			assert.match(main, /<form id="order"[^>]*data-status="live"/, `${t.slug}: order form ON the page`);
			const es = t.book?.language === 'es'; // 3ge: a Spanish page carries its chrome in Spanish
			// ONE ENGINE (Kevin 2026-11-15): every sellable book ships wherever the engine ships (own measured cost, else
			// the country's Bible cost for the same binding), so every order form offers the engine's countries.
			assert.match(main, /<option value="GB"[^>]*>/, `${t.slug}: ships abroad (one engine)`);
			assert.doesNotMatch(main, /Ships to more countries soon\.|Pronto enviaremos|Bientôt livré/, `${t.slug}: no 'soon' note`);
			if (es) {
				assert.match(html, /<html lang="es"/, `${t.slug}: html lang es`);
				assert.match(html, /"inLanguage":"es"/, `${t.slug}: Book inLanguage es`);
				assert.doesNotMatch(main, />(Look inside|Questions|Product details|Checkout →)</, `${t.slug}: no English chrome`);
			}
			for (const k of Object.keys(t.skus)) if (REG[k]) assert.match(main, new RegExp(`name="${k}"`), `${t.slug}: ${k} quantity`);
		} else {
			assert.match(main, /id="order"[^>]*data-status="pending"/, `${t.slug}: #order anchor (pending)`);
			assert.match(main, { es: /Pronto disponible en nuestra tienda\./, fr: /Bientôt disponible dans notre librairie\./ }[t.book?.language] ?? /Available soon from our store\./, `${t.slug}: pending note`);
		}
		assert.doesNotMatch(main, />[^<]*Buy on Amazon/i, `${t.slug}: no Amazon button`);
		assert.doesNotMatch(main, /class="[^"]*\b(bg|text)-red/, `${t.slug}: no red in the page body`);
		const leak = textOf(main).match(LEAK);
		assert.equal(leak, null, `${t.slug}: internal wording on the page: "${leak?.[0]}"`);
		const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join(' ');
		assert.equal(ld.match(LEAK), null, `${t.slug}: internal wording in JSON-LD`);
		// Amazon is never a buy option on our page (Kevin 11-13 L1973): no link to it, no 'buy/order/available on Amazon'.
		// A book's own words may name it (SM's Guide contents: "Chapter 9: Respect King Amazon"), so the bare word is allowed.
		assert.doesNotMatch(main, /href="[^"]*amazon\./i, `${t.slug}: no Amazon link in the page body`);
		assert.doesNotMatch(textOf(main), /\b(buy|order|purchase|available|find it|get it)\b[^.]{0,40}\bamazon\b/i, `${t.slug}: Amazon offered as a place to buy`);
		// the order box's choices are <summary data-choice>, not questions
		assert.equal([...html.matchAll(/"@type":"Question"/g)].length, [...main.matchAll(/<summary(?![^>]*data-choice)[^>]*>/g)].length, `${t.slug}: FAQPage == visible`);
		// support is a Contact us BUTTON, never a printed address (Kevin 2026-11-15)
		assert.doesNotMatch(textOf(main), /[\w.+-]+@[\w-]+\.[\w.]+/, `${t.slug}: an email address printed on the page`);
	}
	for (const b of []) { // 3gh: FHB books have no SMP page (301 to FHB, asserted below)
		const main = mainOf(read(b.slug));
		assert.match(main, /<form id="order"[^>]*data-status="live"/, `${b.slug}: order form on the book page`);
		assert.match(main, /<input[^>]*type="email"[^>]*name="email"[^>]*required/, `${b.slug}: email field (first-order 15% needs it)`);
		assert.match(main, /<h2[^>]*>About the book<\/h2>/, `${b.slug}: the full page, not just a checkout`);
		for (const sku of b.formats) assert.match(main, new RegExp(`name="${sku}"`), `${b.slug}: ${sku} quantity`);
		assert.equal(textOf(main).match(LEAK), null, `${b.slug}: internal wording`);
		assert.ok(!fs.existsSync(new URL(`${b.slug}/buy/index.html`, dist)), `${b.slug}: no separate /buy/ page`);
	}
	const redirects = fs.readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8');
	assert.match(redirects, /^\/books\/:slug\/buy\/ \/books\/:slug\/#order 301$/m, '/buy/ 301s to #order');
	const built = fs.readdirSync(dist).filter((d) => fs.existsSync(new URL(`${d}/index.html`, dist)));
	// OPTION C (Kevin 2026-11-16 "1 store SMP. 2 shop windows FHB and SMP"): FHB is the ONE window for every Father's
	// Heart product. The FH books have NO SMP page (not built, not in pages-live), their SMP URLs 301 to the FHB page,
	// and the bookstore card links there.
	const allowed = new Set(titles.map((t) => t.slug));
	// lane 5 (2026-11-16): the Lamb is now a ship-set title (lane-0 intake PRINT, price still pending) -> a preview page;
	// production stays shut until Kevin approves it in pages-live.json
	if (!ALL && !LIVE.includes('jesus-had-a-little-lamb')) assert.ok(!fs.existsSync(new URL('jesus-had-a-little-lamb/index.html', dist)), 'no SMP page for the unlisted Lamb');
	const storeHtml = fs.readFileSync(new URL('../dist/bookstore/index.html', import.meta.url), 'utf8');
	for (const b of sold) {
		const fhb = `https://fathersheartbible.com/books/${b.slug}/`;
		assert.ok(!LIVE.includes(b.slug), `${b.slug}: an FH book is not in pages-live.json`);
		assert.ok(!fs.existsSync(new URL(`${b.slug}/index.html`, dist)), `${b.slug}: no SMP page (FHB is its window)`);
		for (const from of [`/books/${b.slug}/`, `/books/${b.slug}`])
			assert.ok(redirects.split('\n').includes(`${from} ${fhb} 301`), `${from} 301 -> ${fhb}`);
		assert.ok(storeHtml.includes(`href="${fhb}"`), `bookstore card -> ${fhb}`);
		assert.ok(!storeHtml.includes(`href="/books/${b.slug}/"`), `bookstore: no link to the SMP /books/${b.slug}/`);
	}
	const sitemap = fs.readdirSync(new URL('../dist/', import.meta.url)).filter((f) => /^sitemap-\d+\.xml$/.test(f)).map((f) => fs.readFileSync(new URL(`../dist/${f}`, import.meta.url), 'utf8')).join('');
	assert.ok(sitemap.length > 0, 'sitemap built');
	for (const b of sold) assert.ok(!sitemap.includes(`spiritmediapublishing.com/books/${b.slug}/`), `${b.slug}: not in the SMP sitemap`);
	// 3gh #1: the bookstore links every book we sell to its own page, and none of them to a store listing
	const store = fs.readFileSync(new URL('../dist/bookstore/index.html', import.meta.url), 'utf8');
	for (const t of titles) assert.ok(store.includes(`href="/books/${t.slug}/"`) || !store.includes(t.book.title), `bookstore card -> /books/${t.slug}/`);
	// a card never links to a page that is not built
	for (const t of set.titles.filter((x) => !titles.includes(x))) assert.ok(!store.includes(`href="/books/${t.slug}/"`), `bookstore: no link to unbuilt /books/${t.slug}/`);

	for (const d of built) assert.ok(allowed.has(d), `unexpected book page /books/${d}/`);
});

// pmseoaeo 23:26Z #4 "B" (plan D5): an SMP ship-set book sells US-only at list price; its margin is recorded unmeasured.
test('SMP book SKU: US at list with measured net; abroad at break-even handling; an unmeasured book sells abroad on the one-engine fallback', async () => {
	const fs = await import('node:fs');
	const { handlingFeeCents, netPerItemUsd } = await import('../src/store-engine/lib/marginGuard.ts');
	const { LIVE_COUNTRIES } = await import('../src/store-engine/lib/shipCountries.ts');
	const usCost = JSON.parse(fs.readFileSync(new URL('../src/store-engine/data/book-us-costs.json', import.meta.url), 'utf8')).usd;
	const us = await post({ counts: { 'the-pyramid-principle-pb': 2 }, country: 'US', returnPath: '/books/the-pyramid-principle/' });
	assert.equal(us.status, 200);
	assert.equal(us.form.get('line_items[0][price_data][unit_amount]'), '1899');
	assert.equal(us.form.get('line_items[0][quantity]'), '2');
	// US net = list - Stripe US card fee - the MEASURED US landed cost (pmpublish smp-books-landed-20261113), x qty
	const net = ((18.99 - 18.99 * 0.029 - 0.3 - usCost['the-pyramid-principle-pb']) * 2).toFixed(2);
	assert.match(us.form.get('metadata[book_1]'), new RegExp(`isbn=9798893071153\\|format=Paperback\\|qty=2\\|unit_cents=1899\\|.*net_usd=${net}$`));
	assert.equal(us.form.get('cancel_url'), 'https://spiritmediapublishing.com/books/the-pyramid-principle/?order=canceled#order');
	// abroad: the handling line is exactly marginGuard's break-even fee (floor 0, Kevin 11-10), never more
	for (const code of ['GB', 'AU', 'JP']) {
		const dest = LIVE_COUNTRIES.find((c) => c.code === code);
		const fee = handlingFeeCents('the-pyramid-principle-pb', 1899, dest);
		const r = await post({ counts: { 'the-pyramid-principle-pb': 1 }, country: code, returnPath: '/books/the-pyramid-principle/' });
		assert.equal(r.status, 200, code);
		assert.equal(Number(r.form.get('metadata[handling_cents]')), fee, `${code} handling`);
		const n = netPerItemUsd('the-pyramid-principle-pb', 1899, dest, fee);
		// break-even SHIPPING: a fee only when list price does not cover the landed cost, and then never more than the
		// shortfall rounded up to the next x.99 (net under \$1); where list covers it, no fee and the book keeps its margin
		assert.ok(n >= 0 && (fee === 0 || n < 1.0), `${code}: fee ${fee}, net ${n}`);
	}
	// ONE ENGINE (Kevin 2026-11-15): a book pmpublish has not measured sells abroad, sized on the Bible cost
	const gb = await post({ counts: { 'the-forgotten-witness-pb': 1 }, country: 'GB', returnPath: '/books/the-forgotten-witness/' });
	assert.equal(gb.status, 200);
	// FAILURE PATH: an unknown country is still refused before Stripe
	const zz = await post({ counts: { 'the-forgotten-witness-pb': 1 }, country: 'ZZ', returnPath: '/books/the-forgotten-witness/' });
	assert.equal(zz.status, 400);
	assert.equal(zz.calls.filter((u) => u.includes('checkout/sessions')).length, 0);
});

// pmseoaeo QA 3fx (2026-11-14): SMP orders return under SMP's OWN promise page, never FHB's (which names fathersheartbible.com).
test('returns: SMP has /returns/ with the 30-day promise and every book order form links to it', async () => {
	const fs = await import('node:fs');
	const page = fs.readFileSync(new URL('../dist/returns/index.html', import.meta.url), 'utf8');
	assert.match(page, /30 days of delivery/);
	assert.match(page, /placed on spiritmediapublishing\.com/);
	assert.doesNotMatch(page, /placed on fathersheartbible\.com/);
	const dist = new URL('../dist/books/', import.meta.url);
	for (const d of fs.readdirSync(dist)) {
		const f = new URL(`${d}/index.html`, dist);
		if (!fs.existsSync(f)) continue;
		const html = fs.readFileSync(f, 'utf8');
		if (!html.includes('<form id="order"')) continue;
		assert.match(html, /href="\/returns\/"/, `${d}: returns link`);
		assert.doesNotMatch(html, /fathersheartbible\.com\/returns/, `${d}: never FHB's returns page`);
	}
});

test('item 2: an FHB-window order POST still reports checkout_server to FHB /_evt (3ef-1 kept); SMP pages do not', async () => {
	const { onRequestPost } = await import('../functions/store-checkout.ts');
	const run = async (origin) => {
		const evts = [];
		const waits = [];
		globalThis.fetch = async (url, init) => {
			if (String(url).endsWith('/_evt')) evts.push(JSON.parse(init.body));
			return new Response(JSON.stringify({ url: 'https://stripe.test/s', data: [] }));
		};
		await onRequestPost({
			request: new Request(A, { method: 'POST', headers: { origin, 'user-agent': 'Mozilla/5.0 Chrome/130' }, body: JSON.stringify({ counts: { 'moms-hb': 1 }, country: 'ZZ', returnPath: '/bibles/moms-bible/' }) }),
			env: { STRIPE_STORE_SECRET_KEY: 'sk_test' },
			waitUntil: (p) => waits.push(p),
		});
		await Promise.all(waits);
		return evts;
	};
	const fhb = await run('https://fathersheartbible.com');
	assert.equal(fhb.length, 1);
	assert.deepEqual([fhb[0].kind, fhb[0].tag, fhb[0].status, fhb[0].path], ['checkout_server', 'site', 400, '/bibles/moms-bible/']);
	assert.equal((await run('https://dev.fathersheartbible.pages.dev'))[0].tag, 'qa');
	assert.equal((await run('https://spiritmediapublishing.com')).length, 0);
});

// BOOKSTORE COLLECTIONS (Kevin 2026-11-16, kevin-decisions.md: "Make it: All, SMP only (all without FHB), FHB English
// (which shows ALL english editions), FHB Languages (showing all the foreign lanuage editions), FHB Books" + "Sorry add
// Express Books back after SMP only" + "after 2 add a new 3: SMP worldwide ..."). Read off the BUILT pages (the cards a visitor gets), counted against definitions
// taken from the source data, not from the classifier under test.
const PARTITION = ['smp', 'fhb-english', 'fhb-languages', 'fhb-books'];
const COLL_CHIPS = [
	['All', '/bookstore/'],
	['SMP only', '/bookstore/smp/'],
	['SMP worldwide', '/bookstore/smp-worldwide/'],
	['Express Books', '/bookstore/express-books/'],
	['FHB English', '/bookstore/fhb-english/'],
	['FHB Languages', '/bookstore/fhb-languages/'],
	['FHB Books', '/bookstore/fhb-books/'],
];
// every card of All in exactly one of the 4 partition pages, and no partition card missing from All
const exactlyOneErrors = (pages, all) => {
	const seen = new Map();
	for (const key of PARTITION) for (const id of pages[key] || []) seen.set(id, [...(seen.get(id) || []), key]);
	const errs = all.filter((id) => (seen.get(id) || []).length !== 1).map((id) => `${id}: in ${(seen.get(id) || []).join(', ') || 'none'}`);
	const allSet = new Set(all);
	for (const id of seen.keys()) if (!allSet.has(id)) errs.push(`${id}: not in All`);
	return errs;
};
const cardsOf = (html) => {
	const grid = html.slice(html.indexOf('id="book-grid"'), html.indexOf('id="no-results"'));
	return [...grid.matchAll(/<div data-card="([^"]*)" data-colls="([^"]*)"(?: data-live="1")?[^>]*>[\s\S]*?<a href="([^"]*)"/g)].map((m) => ({
		id: m[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&'),
		colls: m[2].split(' '),
		live: m[0].includes('data-live="1"'),
		href: m[3],
	}));
};
const cardsTitles = (html) => {
	const grid = html.slice(html.indexOf('id="book-grid"'), html.indexOf('id="no-results"'));
	return [...grid.matchAll(/<img src="[^"]*" alt="([^"]*)"/g)].map((m) => m[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
};
const storePage = (slug) => fs.readFileSync(new URL(`../dist/bookstore/${slug ? `${slug}/` : ''}index.html`, import.meta.url), 'utf8');

test('bookstore collections: the 7 chips, counts = definitions, every card in exactly one, Express Books inside SMP only', () => {
	const allHtml = storePage('');
	const chips = [...allHtml.matchAll(/<a href="([^"]+)" data-collection(?:="[^"]*")? class="collection-chip[^>]*>([^<]+)<\/a>/g)].map((m) => [m[2], m[1]]);
	const retired = !fs.existsSync(new URL('../dist/bookstore/smp-worldwide/index.html', import.meta.url));
	assert.deepEqual(chips, COLL_CHIPS.filter(([n]) => !(retired && n === 'SMP worldwide')), 'exactly the collections, in order');
	const all = cardsOf(allHtml);
	const ids = all.map((c) => c.id);
	assert.ok(all.length > 150, `All lists ${all.length} cards`);
	assert.equal(new Set(ids).size, ids.length, 'card ids are unique');
	const pages = Object.fromEntries(['smp', 'express-books', 'fhb-english', 'fhb-languages', 'fhb-books'].map((k) => [k, cardsOf(storePage(k))]));
	// definitions from the source data
	const fhbEd = JSON.parse(fs.readFileSync(new URL('../src/data/fhb-editions.json', import.meta.url), 'utf8'));
	const engine = JSON.parse(fs.readFileSync(new URL('../src/store-engine/data/books.json', import.meta.url), 'utf8'));
	const FHB = 'https://fathersheartbible.com/';
	const def = {
		'fhb-languages': all.filter((c) => fhbEd.editions.some((e) => e.group === 'language' && e.href === c.href)).length,
		'fhb-books': all.filter((c) => engine.books.some((b) => c.href === `${FHB}books/${b.slug}/`)).length,
		'fhb-english': all.filter((c) => c.href.startsWith(FHB) && !c.href.startsWith(`${FHB}books/`) && !fhbEd.editions.some((e) => e.group === 'language' && e.href === c.href)).length,
	};
	def.smp = all.filter((c) => !c.href.startsWith(FHB)).length;
	assert.equal(def['fhb-languages'], fhbEd.language, 'every language edition in the FHB data is carded');
	assert.equal(def['fhb-books'], engine.books.length, 'every FH book the engine sells is carded');
	for (const k of PARTITION) {
		assert.equal(pages[k].length, def[k], `${k}: ${pages[k].length} cards, definition ${def[k]}`);
		for (const c of pages[k]) assert.deepEqual(c.colls.filter((x) => PARTITION.includes(x)), [k], `${c.id} on ${k} is tagged ${k}`);
	}
	assert.deepEqual(exactlyOneErrors(Object.fromEntries(PARTITION.map((k) => [k, pages[k].map((c) => c.id)])), ids), []);
	assert.equal(PARTITION.reduce((n, k) => n + pages[k].length, 0), all.length, 'the 4 partitions sum to All');
	// Express Books: cross-cutting (a subset of All, any partition, Kevin 2026-11-16 "You are missing express books"),
	// and every title express-books.json proves Express (plus Beloved Identity, the Sanity member that is an FH book) is on it
	const smpIds = new Set(pages.smp.map((c) => c.id));
	const allIds = new Set(ids);
	const exp = pages['express-books'];
	for (const c of exp) assert.ok(allIds.has(c.id), `Express Book ${c.id} is in All`);
	assert.equal(exp.length, all.filter((c) => c.colls.includes('express-books')).length);
	const expTitles = cardsTitles(storePage('express-books'));
	const normT = (t) => String(t).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
	const extra = JSON.parse(fs.readFileSync(new URL('../src/data/books/express-books.json', import.meta.url), 'utf8')).titles;
	for (const t of extra) assert.ok(expTitles.some((x) => normT(x).startsWith(normT(t.title))), `Express Books carries ${t.title}`);
	assert.ok(exp.some((c) => c.href === 'https://fathersheartbible.com/books/beloved-identity/'), 'Express Books carries Beloved Identity');
	// SMP worldwide: a subset of SMP only, every member's own page carries the order box, and every SMP-only card whose
	// page carries one is a member (both ways, read off the built book pages)
	const orderBox = (href) => {
		const m = /^\/books\/([^/]+)\/$/.exec(href);
		const f = m && new URL(`../dist/books/${m[1]}/index.html`, import.meta.url);
		return !!f && fs.existsSync(f) && /<form id="order"/.test(fs.readFileSync(f, 'utf8'));
	};
	const ww = all.filter((c) => c.colls.includes('smp-worldwide'));
	for (const c of ww) {
		assert.ok(smpIds.has(c.id), `SMP worldwide ${c.id} is in SMP only`);
		assert.ok(orderBox(c.href), `SMP worldwide ${c.id}: ${c.href} has an order box`);
	}
	for (const c of pages.smp) assert.equal(c.colls.includes('smp-worldwide'), orderBox(c.href), `${c.id}: SMP worldwide iff its page has an order box`);
	if (retired) assert.equal(ww.length, pages.smp.length, 'retired only when it equals SMP only');
	else {
		assert.ok(ww.length > 0 && ww.length < pages.smp.length, `SMP worldwide ${ww.length} of SMP only ${pages.smp.length}`);
		assert.equal(cardsOf(storePage('smp-worldwide')).length, ww.length, 'the SMP worldwide page lists every member');
		assert.doesNotMatch(fs.readFileSync(new URL('../dist/_redirects', import.meta.url), 'utf8'), /smp-worldwide/, 'not retired: no 301');
	}
	// SMP only: the cards whose SMP page is built on this build (pages-live.json; every page on a BOOKS_PREVIEW_ALL=1
	// preview) lead, and a card is "live" exactly when its page was built
	const built = (href) => /^\/books\/[^/]+\/$/.test(href) && fs.existsSync(new URL(`../dist${href}index.html`, import.meta.url));
	for (const c of pages.smp) assert.equal(c.live, built(c.href), `${c.id}: live iff its page is built`);
	const firstNotLive = pages.smp.findIndex((c) => !c.live);
	assert.ok(firstNotLive > 0 && pages.smp.slice(firstNotLive).every((c) => !c.live), 'SMP only: live cards first');
});

test('bookstore collections: the exactly-one check FAILS on a card injected into two collections', () => {
	const all = ['a', 'b', 'c', 'd'];
	const pages = { smp: ['a'], 'fhb-english': ['b'], 'fhb-languages': ['c'], 'fhb-books': ['d'] };
	assert.deepEqual(exactlyOneErrors(pages, all), []);
	const twice = { ...pages, smp: ['a', 'b'] };
	assert.deepEqual(exactlyOneErrors(twice, all), ['b: in smp, fhb-english']);
	// and on the built pages: one real FHB English card injected into SMP only
	const real = Object.fromEntries(PARTITION.map((k) => [k, cardsOf(storePage(k)).map((c) => c.id)]));
	const allIds = cardsOf(storePage('')).map((c) => c.id);
	const injected = { ...real, smp: [...real.smp, real['fhb-english'][0]] };
	const errs = exactlyOneErrors(injected, allIds);
	assert.equal(errs.length, 1);
	assert.match(errs[0], /: in smp, fhb-english$|: in fhb-english, smp$/);
	console.log(`# injected-failure proof: ${errs[0]}`);
});

test('bookstore collections: the 3 retired FHB URLs 301, Express Books keeps its URL, All SMP Books -> /bookstore/smp-worldwide/', () => {
	const red = fs.readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8');
	for (const [from, to] of [
		['fathers-heart-bible-fhb', 'fhb-english'],
		['fathers-heart-bible-audience-editions', 'fhb-english'],
		['fathers-heart-bible-language-editions', 'fhb-languages'],
	]) {
		assert.match(red, new RegExp(`^/bookstore/${from}/ /bookstore/${to}/ 301$`, 'm'));
		assert.ok(!fs.existsSync(new URL(`../dist/bookstore/${from}/index.html`, import.meta.url)), `${from}: no page (it redirects)`);
	}
	assert.doesNotMatch(red, /^\/bookstore\/express-books/m, 'Express Books is not redirected');
	const bo = fs.readFileSync(new URL('../src/components/BookOrder.astro', import.meta.url), 'utf8');
	assert.match(bo, /<a href="\/bookstore\/smp-worldwide\/">All SMP Books<\/a>/);
	const live = JSON.parse(fs.readFileSync(new URL('../src/data/books/pages-live.json', import.meta.url), 'utf8')).slugs;
	const page = fs.readFileSync(new URL(`../dist/books/${live[0]}/index.html`, import.meta.url), 'utf8');
	assert.match(page, /<a href="\/bookstore\/smp-worldwide\/"[^>]*>All SMP Books<\/a>/, `${live[0]}: All SMP Books -> /bookstore/smp-worldwide/`);
});

test('bookstore collections: SMP worldwide retires itself to a 301 when it equals SMP only (and only then)', async () => {
	const os = await import('node:os');
	const path = await import('node:path');
	const { default: config } = await import('../astro.config.mjs');
	const hook = config.integrations.find((i) => i.name === 'smp-worldwide-retire').hooks['astro:build:done'];
	const was = globalThis.__smpWorldwideRetired;
	const run = (flag) => {
		const out = fs.mkdtempSync(path.join(os.tmpdir(), 'smp-ww-'));
		fs.writeFileSync(path.join(out, '_redirects'), '/a /b 301\n');
		fs.mkdirSync(path.join(out, 'bookstore', 'smp-worldwide'), { recursive: true });
		fs.writeFileSync(path.join(out, 'bookstore', 'smp-worldwide', 'index.html'), 'x');
		globalThis.__smpWorldwideRetired = flag;
		hook({ dir: new URL(`file://${out}/`) });
		const r = { red: fs.readFileSync(path.join(out, '_redirects'), 'utf8'), page: fs.existsSync(path.join(out, 'bookstore', 'smp-worldwide', 'index.html')) };
		fs.rmSync(out, { recursive: true, force: true });
		return r;
	};
	try {
		const live = run(false);
		assert.ok(live.page && !/smp-worldwide/.test(live.red), 'not equal: page kept, no 301');
		const gone = run(true);
		assert.ok(!gone.page, 'equal: page dropped');
		assert.match(gone.red, /^\/bookstore\/smp-worldwide\/ \/bookstore\/smp\/ 301$/m, 'equal: 301 -> /bookstore/smp/');
	} finally {
		globalThis.__smpWorldwideRetired = was;
	}
});

test('bookstore: tagline + Publish Your Book in the hero, offer line + marquee under the search controls, no "Showing" line (Kevin 2026-11-16)', async () => {
	const html = storePage('');
	const { LIVE_COUNTRIES } = await import('../src/store-engine/lib/shipCountries.ts').catch(() => ({}));
	const tag = html.indexOf('Over 550 titles by Kingdom Messengers. New books added every week.');
	assert.ok(tag > 0, 'tagline');
	assert.doesNotMatch(html, /Over 300 titles by Kingdom Messengers/);
	const offer = html.search(/<p class="eo-offer[^"]*"[^>]*>15% off first order \+ free standard shipping to \d+ countries<\/p>/);
	const band = html.search(/<div class="eo-marquee[^"]*" role="region"/);
	const cta = html.indexOf('>Publish Your Book →</a>');
	const heroEnd = html.indexOf('</section>', tag);
	const chips = html.indexOf('class="collection-chip');
	const sort = html.indexOf('id="sort-order"');
	const grid = html.indexOf('id="book-grid"');
	assert.ok(cta > tag && cta < heroEnd, 'Publish Your Book in the hero, beside the title + tagline');
	assert.ok(chips > heroEnd && sort > chips && offer > sort && band > offer && grid > band, 'hero -> chips -> search/author/sort -> offer line -> marquee -> grid');
	assert.doesNotMatch(html, /Showing \d+ of \d+ titles|id="book-count"/, 'no "Showing N of N titles"');
	assert.equal(html.split('>Publish Your Book →</a>').length - 1, 1, 'one Publish Your Book button');
	assert.match(html, /<title>Christian Bookstore — 550\+ Spirit Media Published Titles<\/title>/);
	if (LIVE_COUNTRIES) assert.match(html, new RegExp(`free standard shipping to ${LIVE_COUNTRIES.length} countries</p>`));
	assert.doesNotMatch(storePage('smp'), /data-ship-band/, 'the hero band is on /bookstore/ only');
	// no YouVersion banner on any bookstore page (Kevin 2026-11-16 16:0xZ: it stacked on the country marquee)
	for (const slug of ['', 'smp', 'express-books', 'fhb-english']) assert.ok(!storePage(slug).includes('FHB+DVC on YouVersion'), `/bookstore/${slug}: no banner`);
});
