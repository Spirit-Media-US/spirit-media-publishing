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

// Books M4 (pmseoaeo 22:53Z; Kevin approved SMP book pages 11-13) + ONE PAGE PER BOOK (Kevin via pmseoaeo 23:19Z: "All I
// see is check out form? Where is the page?"; "Never render internal wording or TBD").
const LEAK = /\b(the Doc\b|Doc (says|lists|calls|describes|names|files|suggests|audience|has)|per the Doc|\(Doc\b|sheet\.json|the sheet\b|the page (makes|attributes|does|publishes|names|claims)|makes no claim|the interior (has|mentions|names|is)|\d+ mentions\b|mentions? [\w' ]{1,24} \d+ times|TBD\b|OMIT\b|UNMEASURED|unconfirmed|pmpublish|pmprint|pmseoaeo|PROPOSED\b|lead term|search volume|unit \d[a-z]{2}\b|no subtitle|live listing|the Record\b|printed on the interior|\[slot\b)/i; // 3gs: a '[Slot: ...]' placeholder reached LOVE God's Way's author bio. 3ge: a Record 'subtitle' of '(no subtitle)' rendered under the h1
const textOf = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
test('book pages: one full page per book; order form ON the sellable ones; no internal wording; no Offer while unsellable; calm', async () => {
	const fs = await import('node:fs');
	const set = JSON.parse(fs.readFileSync(new URL('../src/data/books/shipset-v2.json', import.meta.url), 'utf8'));
	const sold = JSON.parse(fs.readFileSync(new URL('../src/store-engine/data/books.json', import.meta.url), 'utf8')).books;
	const dist = new URL('../dist/books/', import.meta.url);
	const REG = JSON.parse(fs.readFileSync(new URL('../src/store-engine/data/book-skus.json', import.meta.url), 'utf8')).skus;
	assert.equal(set.titles.length, 60); // 30 (3fu) + 8 (3gc) + 6 (3ge) + 5 (3gf) + 1 (3gi) + 3 (3gk) + 2 (3gl) + 5 (3gs)
	const read = (slug) => fs.readFileSync(new URL(`${slug}/index.html`, dist), 'utf8');
	const mainOf = (html) => html.slice(html.indexOf('<main'), html.indexOf('</main>'));
	for (const t of set.titles) {
		const html = read(t.slug);
		const main = mainOf(html);
		assert.ok(main.length > 500, `${t.slug}: <main> found`);
		assert.match(main, /<h1[^>]*>/, `${t.slug}: h1`);
		assert.doesNotMatch(html, /"@type":"Offer"/, `${t.slug}: no Offer while no SKU sells`);
		// pmseoaeo #4 "B": a title whose SKUs are in the store registry carries the US-only order form at #order
		if (t.skus && Object.keys(t.skus).some((k) => REG[k])) {
			assert.match(main, /<form id="order"[^>]*data-status="live"/, `${t.slug}: order form ON the page`);
			const es = t.book?.language === 'es'; // 3ge: a Spanish page carries its chrome in Spanish
			const abroad = Object.keys(t.skus).filter((k) => REG[k]).every((k) => REG[k].cost_key); // pmpublish-measured
			if (abroad) {
				assert.match(main, /<option value="GB"[^>]*>/, `${t.slug}: ships abroad (measured landed cost)`);
				assert.doesNotMatch(main, /Ships to more countries soon\.|Pronto enviaremos/, `${t.slug}: no 'soon' note when it ships abroad`);
			} else {
			assert.match(main, es ? /<option value="US" selected[^>]*>Estados Unidos<\/option>\s*<\/select>/ : /<option value="US" selected[^>]*>United States<\/option>\s*<\/select>/, `${t.slug}: US only`);
			assert.match(main, es ? /Pronto enviaremos a más países\./ : /Ships to more countries soon\./, `${t.slug}: non-US note`);
			}
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
		assert.equal([...html.matchAll(/"@type":"Question"/g)].length, [...main.matchAll(/<summary[^>]*>/g)].length, `${t.slug}: FAQPage == visible`);
	}
	for (const b of []) { // 3gh: FHB books have no SMP page (301 to FHB, asserted below)
		const main = mainOf(read(b.slug));
		assert.match(main, /<form id="order"[^>]*data-status="live"/, `${b.slug}: order form on the book page`);
		assert.match(main, /<h2[^>]*>About the book<\/h2>/, `${b.slug}: the full page, not just a checkout`);
		for (const sku of b.formats) assert.match(main, new RegExp(`name="${sku}"`), `${b.slug}: ${sku} quantity`);
		assert.equal(textOf(main).match(LEAK), null, `${b.slug}: internal wording`);
		assert.ok(!fs.existsSync(new URL(`${b.slug}/buy/index.html`, dist)), `${b.slug}: no separate /buy/ page`);
	}
	const redirects = fs.readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8');
	assert.match(redirects, /^\/books\/:slug\/buy\/ \/books\/:slug\/#order 301$/m, '/buy/ 301s to #order');
	const built = fs.readdirSync(dist).filter((d) => fs.existsSync(new URL(`${d}/index.html`, dist)));
	const allowed = new Set(set.titles.map((t) => t.slug));
	for (const b of [...sold.map((x) => x.slug), 'jesus-had-a-little-lamb']) assert.ok(!fs.existsSync(new URL(`${b}/index.html`, dist)), `no SMP page for ${b}`);
	for (const b of sold) assert.match(redirects, new RegExp(`^/books/${b.slug}/ https://fathersheartbible.com/books/${b.slug}/ 301$`, 'm'), `${b.slug} 301s to FHB`);
	// 3gh #1: the bookstore links every book we sell to its own page, and none of them to a store listing
	const store = fs.readFileSync(new URL('../dist/bookstore/index.html', import.meta.url), 'utf8');
	for (const t of set.titles) assert.ok(store.includes(`href="/books/${t.slug}/"`) || !store.includes(t.book.title), `bookstore card -> /books/${t.slug}/`);

	for (const d of built) assert.ok(allowed.has(d), `unexpected book page /books/${d}/`);
});

// pmseoaeo 23:26Z #4 "B" (plan D5): an SMP ship-set book sells US-only at list price; its margin is recorded unmeasured.
test('SMP book SKU: US at list with measured net; abroad at break-even handling where pmpublish measured it; refused where not', async () => {
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
	// a book pmpublish has not measured stays US-only: refused abroad, nothing sent to Stripe
	const gb = await post({ counts: { 'the-forgotten-witness-pb': 1 }, country: 'GB', returnPath: '/books/the-forgotten-witness/' });
	assert.equal(gb.status, 400);
	assert.equal(gb.calls.filter((u) => u.includes('checkout/sessions')).length, 0);
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
