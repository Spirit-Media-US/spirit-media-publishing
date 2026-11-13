// node --test scripts/store-checkout.test.mjs — /store-checkout (plan 3fb Phase 3) with Stripe mocked.
import assert from 'node:assert/strict';
import test from 'node:test';

const A = 'https://spiritmediapublishing.com/store-checkout';
async function post(payload, { key = 'sk_test' } = {}) {
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
		request: new Request(A, { method: 'POST', body: JSON.stringify(payload) }),
		env: key ? { STRIPE_STORE_SECRET_KEY: key } : {},
	});
	return { status: res.status, json: await res.json(), form: new URLSearchParams(body), calls };
}

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
