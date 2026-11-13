// node --test scripts/store-checkout.test.mjs — /store-checkout (plan 3fb Phase 3) with Stripe mocked.
import assert from 'node:assert/strict';
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

test('a Bible SKU is refused here (Bibles keep their own FHB checkout)', async () => {
	const r = await post({ counts: { 'moms-hb': 1 }, country: 'US' });
	assert.deepEqual([r.status, r.json.error, r.calls.length], [400, 'invalid_selection', 0]);
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
});

// Books M4 (pmseoaeo 22:53Z; Kevin approved SMP book pages 11-13): one page per ship_ready title, and only those.
test('book pages: every ready title built, nothing else; no Offer while unsellable; no Amazon button; calm; FAQ = visible', async () => {
	const fs = await import('node:fs');
	const set = JSON.parse(fs.readFileSync(new URL('../src/data/books/shipset-3fo.json', import.meta.url), 'utf8'));
	const dist = new URL('../dist/books/', import.meta.url);
	assert.equal(set.titles.length, 30);
	for (const t of set.titles) {
		if (t.slug === 'jesus-had-a-little-lamb') continue;
		const html = fs.readFileSync(new URL(`${t.slug}/index.html`, dist), 'utf8');
		assert.match(html, new RegExp(`<h1[^>]*>${t.book.h1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, '(?:\'|&#39;)')}`), `${t.slug}: h1`);
		assert.doesNotMatch(html, /"@type":"Offer"/, `${t.slug}: no Offer while no SKU sells`);
		assert.match(html, /Available soon from our store\./, `${t.slug}: pending note`);
		assert.doesNotMatch(html, />[^<]*Buy on Amazon/i, `${t.slug}: no Amazon button`);
		const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
		assert.ok(main.length > 500, `${t.slug}: <main> found`);
		assert.doesNotMatch(main, /class="[^"]*\b(bg|text)-red/, `${t.slug}: no red in the page body (site header/footer are global)`);
		const faq = [...html.matchAll(/"@type":"Question","name":"([^"]+)"/g)].length;
		const visible = [...html.matchAll(/<summary[^>]*>/g)].length;
		assert.equal(faq, visible, `${t.slug}: FAQPage questions == visible questions`);
	}
	const built = fs.readdirSync(dist).filter((d) => fs.existsSync(new URL(`${d}/index.html`, dist)));
	const allowed = new Set([...set.titles.map((t) => t.slug), 'jesus-had-a-little-lamb']);
	for (const d of built) assert.ok(allowed.has(d), `unexpected book page /books/${d}/ (not ship_ready)`);
});
