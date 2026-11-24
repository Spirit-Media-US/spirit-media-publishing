// node --test scripts/store-webhook.test.mjs — SMP /store-webhook, MOVED from FHB functions/print-webhook.ts with its
// tests (FHB scripts/window-confirmations.test.mjs: one-store subjects, Contact-us Reply-To, the 7-line signature, the
// eBook link, the RIAB gift receipt). Map smp-store-one-home-v1 §4 moves 1+2 (Kevin 2026-11-20 ~18:51Z).
// BUILD-CHECK: searched store webhook test, window confirmations (tool-inventory.py) + ls scripts/ in FHB and SMP
// NEAREST: FHB scripts/window-confirmations.test.mjs (its webhook tests are ported here verbatim in substance)
// NOT-REUSED-BECAUSE: those tests import FHB's endpoint; the endpoint MOVED to SMP, so its tests move with it.
// APPROVED-BY: Kevin 2026-11-20 ~18:51Z "2 this needs to be moved. You are inheriting OLD instead of making it new" (brief jobs/smp-store-one-home-brief.md)
// NEW here: DUPLICATE SAFETY. During the switch Stripe sends every event to BOTH this endpoint and FHB /print-webhook;
// the fake Stripe below implements Stripe's idempotency rules (same key + same body = replay; same key + other body =
// 400 idempotency_error; same key while the first is in flight = 409), and the tests prove exactly ONE set of emails.
// No real Stripe, Mailgun or card is touched.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {
	buyerBrand,
	CLAIM_BY,
	claimKey,
	claimSession,
	NOTIFY_FROM,
	SIGNATURE,
	onRequestPost as webhook,
} from '../functions/store-webhook.ts';
import { verifyEbookLink, windowOrigin } from '../src/lib/ebookLink.ts';
import bookSkus from '../src/store-engine/data/book-skus.json' with { type: 'json' };
import { EBOOK_SKUS, ebookCheckoutForm, ebookForBook, ebookOnSale, familyOf, storeTagErrors, storeTags } from '../src/store-engine/lib/storeEngine.ts';

const secret = 'whsec_test';
const FHB_BY = 'fhb-print-webhook'; // what FHB /print-webhook writes when it claims (the same claimSession, ported back)

// ---- a fake Stripe with Stripe's idempotency semantics + a Mailgun recorder ------------------------------------------
function fakeStripe({ delayMs = 0 } = {}) {
	const sessions = {}; // sid -> metadata
	const idem = new Map(); // key -> { body, done, status, json }
	const mail = [];
	const calls = [];
	const handle = async (url, init = {}) => {
		const u = String(url);
		if (u.includes('mailgun')) {
			mail.push(Object.fromEntries(init.body));
			return new Response('{}', { status: 200 });
		}
		const m = /^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/([^/?]+)/.exec(u);
		if (!m) throw new Error(`unexpected fetch ${u}`);
		const sid = decodeURIComponent(m[1]);
		calls.push(`${init.method ?? 'GET'} ${sid}`);
		sessions[sid] ??= {};
		if ((init.method ?? 'GET') === 'GET') return new Response(JSON.stringify({ id: sid, metadata: { ...sessions[sid] } }));
		const body = String(init.body);
		const key = init.headers?.['Idempotency-Key'];
		if (key) {
			const prior = idem.get(key);
			if (prior && !prior.done) return new Response(JSON.stringify({ error: { type: 'idempotency_error', code: 'idempotency_key_in_use' } }), { status: 409 });
			if (prior && prior.body !== body)
				return new Response(JSON.stringify({ error: { type: 'idempotency_error', message: 'Keys for idempotent requests can only be used with the same parameters they were first used with.' } }), { status: 400 });
			if (prior) return new Response(prior.json, { status: prior.status, headers: { 'idempotent-replayed': 'true' } });
			idem.set(key, { body, done: false });
		}
		if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
		for (const [k, v] of new URLSearchParams(body)) {
			const mk = /^metadata\[(.+)\]$/.exec(k);
			if (mk) sessions[sid][mk[1]] = v;
		}
		const json = JSON.stringify({ id: sid, metadata: { ...sessions[sid] } });
		if (key) idem.set(key, { body, done: true, status: 200, json });
		return new Response(json, { status: 200 });
	};
	return { sessions, idem, mail, calls, handle };
}

function signed(event) {
	const raw = JSON.stringify(event);
	const t = Math.floor(Date.now() / 1000);
	const v1 = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
	return new Request('https://spiritmediapublishing.com/store-webhook', { method: 'POST', body: raw, headers: { 'stripe-signature': `t=${t},v1=${v1}` } });
}
const ENV = { STRIPE_STORE_WEBHOOK_SECRET: secret, STRIPE_STORE_SECRET_KEY: 'rk_test_stub', MAILGUN_API_KEY: 'k', PRINT_ORDER_NOTIFY_TO: 'orders@test' };
function printEvent(metadata, { email = 'buyer@test', amount = 3198, kind = 'dvc_print', id = 'cs_test_window000001', name, created } = {}) {
	return {
		type: 'checkout.session.completed',
		data: { object: { id, created, amount_total: amount, currency: 'usd', customer_details: { email, name, phone: '+15555550123' },
			metadata: { kind, total: '2', pct_off: '0', offer: 'none', breakdown: 'moms-pb:2', ...metadata },
			collected_information: { shipping_details: { name: name ?? 'Ann Reader', address: { line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' } } } } },
	};
}
async function run(event, { env = ENV, stripe = fakeStripe() } = {}) {
	const real = globalThis.fetch;
	globalThis.fetch = stripe.handle;
	try {
		const res = await webhook({ request: signed(event), env });
		return { status: res.status, sent: stripe.mail, stripe };
	} finally {
		globalThis.fetch = real;
	}
}
export async function confirm(metadata, opts = {}) {
	const r = await run(printEvent(metadata, opts));
	const email = opts.email ?? 'buyer@test';
	return { status: r.status, kevin: r.sent.find((m) => m.to === 'orders@test'), buyer: r.sent.find((m) => m.to === email), sent: r.sent, stripe: r.stripe };
}

// ---- ONE STORE (Kevin 2026-11-20 ~16:07Z "the store is NOW Spirit Media Publishing whether it is FHB or not") ----
test('one store: FHB-window AND SMP-window orders both -> Spirit Media Publishing subject, no window line', async () => {
	const fhb = await confirm({ site: 'fhb', window: 'fhb', family: 'bible' });
	assert.equal(fhb.status, 200);
	const smp = await confirm({ site: 'smp', window: 'smp', family: 'smp_book' });
	const riab = await confirm({});
	for (const r of [fhb, smp, riab]) {
		assert.equal(r.buyer.subject, 'Your Spirit Media Publishing order — $31.98');
		assert.ok(r.buyer.text.endsWith(`straight to us — please include your order reference above.\n\n${SIGNATURE}\n`), 'no window line');
		assert.doesNotMatch(`${r.buyer.subject}\n${r.buyer.text.split('What you ordered:')[0]}`, /Father.s Heart Bible/, 'FHB never named as the seller');
	}
	assert.equal(fhb.buyer.text, smp.buyer.text, 'same body from both windows');
});

test('item 8: a session from before the tags is branded by its site (smp/vaneure -> SMP; fhb or none -> FHB)', () => {
	assert.equal(buyerBrand({ site: 'smp' }, '$1').window, 'smp');
	assert.equal(buyerBrand({ site: 'vaneure' }, '$1').window, 'smp');
	assert.equal(buyerBrand({ site: 'fhb' }, '$1').window, 'fhb');
	assert.equal(buyerBrand({}, '$1').window, 'fhb');
	assert.equal(buyerBrand({ site: 'smp', window: 'fhb' }, '$1').window, 'fhb', 'the window tag wins');
});

test('item 9: buyer emails Reply-To hello@; Kevin’s notice (his inbox, Reply-To the buyer, SMP heading, shop window line)', async () => {
	const r = await confirm({ site: 'fhb', window: 'fhb', family: 'bible' });
	assert.equal(r.buyer['h:Reply-To'], 'hello@spiritmediapublishing.com');
	assert.equal(r.kevin['h:Reply-To'], 'buyer@test');
	assert.match(r.kevin.subject, /^📚 Print order — 2 copies · \$31\.98$/);
	assert.ok(r.kevin.text.startsWith('New print order — Spirit Media Publishing\n\nShop window: fathersheartbible.com\n'));
	const smp = await confirm({ site: 'vaneure', window: 'smp', family: 'book' });
	assert.ok(smp.kevin.text.startsWith('New print order — Spirit Media Publishing\n\nShop window: spiritmediapublishing.com\n'));
	const e = await confirm({ site: 'fhb', window: 'fhb', family: 'bible_ebook' }, { kind: 'ebook_direct', amount: 749, id: 'cs_test_bibleEbook0001' });
	assert.equal(e.buyer['h:Reply-To'], 'hello@spiritmediapublishing.com');
	assert.equal(e.buyer.subject, 'Your eBook — Father’s Heart Bible', 'product named, not the store');
	assert.match(e.buyer.text, /https:\/\/fathersheartbible\.com\/ebook-download\?s=cs_test_bibleEbook0001\n/, 'the Bible eBook keeps its session link (FHB forwards to SMP)');
	assert.equal(e.kevin['h:Reply-To'], 'buyer@test');
});

// Kevin 2026-11-24 identity footer: statement + contact + 3 URLs + one-line address, on every buyer email.
const SEVEN = [
	"Spirit Media Publishing publishes Christian books and the Father's Heart Bible™ in Divine Voice™ Color. We deliver them through The Believer's Library: one app for every believer worldwide providing free Bibles and access to all Christian books.",
	'', 'Spirit Media Publishing', 'Phone: 1-888-800-3744', 'Email: hello@spiritmediapublishing.com',
	'', 'spiritmediapublishing.com', 'fathersheartbible.com', 'thebelieverslibrary.com',
	'', '205 S Academy St, Unit 3251, Cary, NC 27519, USA',
];
const endsWithSeven = (text) => text.trimEnd().split('\n').slice(-SEVEN.length).join('\n') === SEVEN.join('\n');
test('item 10: every order email is From "SMP Orders"; every buyer email ends with the identity footer (Kevin 2026-11-24)', async () => {
	assert.equal(NOTIFY_FROM, 'SMP Orders <orders@send.spiritmediapublishing.com>');
	const all = [
		await confirm({ site: 'fhb', window: 'fhb', family: 'bible' }),
		await confirm({ site: 'smp', window: 'smp', family: 'smp_book' }),
		await confirm({ site: 'fhb', window: 'fhb', family: 'bible_ebook' }, { kind: 'ebook_direct', amount: 749 }),
	];
	for (const r of all) {
		for (const m of [r.buyer, r.kevin]) assert.match(m.from, /^SMP Orders </, `${m.subject}: From name`);
		assert.ok(endsWithSeven(r.buyer.text), `${r.buyer.subject}: signature`);
		assert.ok(r.buyer.html.includes('205 S Academy St, Unit 3251'), `${r.buyer.subject}: html part too`);
		assert.equal(r.buyer.text.split('Phone: 1-888-800-3744').length, 2, 'the signature once');
	}
	assert.equal(endsWithSeven('Thanks\n\nSpirit Media Publishing\n'), false, 'the check rejects a partial signature');
});

test('Ingram lines: a book SKU prints its ISBN line; a Bible SKU and a signed (AUTOGRAPHED) key never do', async () => {
	const skus = JSON.parse(fs.readFileSync(new URL('../src/store-engine/data/book-skus.json', import.meta.url), 'utf8')).skus;
	const bookSku = Object.keys(skus).find((k) => k.startsWith('raised-in-a-barn-hb'));
	assert.ok(bookSku, 'RIAB hardback is in the registry');
	const r = await confirm({ site: 'vaneure', window: 'smp', brand: 'riab', breakdown: `${bookSku}:1,Raised-in-a-Barn-Hardback-AUTOGRAPHED-by-Van-Eure:2` });
	assert.match(r.kevin.text, /Ingram order lines \(non-Bible books\):\n {2}ISBN \d{13} × 1 /);
	assert.equal((r.kevin.text.match(/ {2}ISBN /g) ?? []).length, 1, 'the signed copies are listed, never sent to Ingram');
	assert.match(r.kevin.text, /2 × Raised-in-a-Barn-Hardback-AUTOGRAPHED-by-Van-Eure/);
	const bible = await confirm({ site: 'fhb', window: 'fhb', family: 'bible' });
	assert.doesNotMatch(bible.kevin.text, /Ingram order lines/);
	assert.match(bible.buyer.text, /2 × Mom’s Bible — Divine Voice Color, Paperback/);
});

// ---- RIAB GIFT (Kevin 2026-11-20 ~16:15Z "Each order with donation receives 2 emails ...") — FHB 31554c93 logic ----
const GIFT_META = { donation_cents: '10000', designation: 'split', fee_covered: 'true', donation_fee_cover_cents: '299', donation_total_cents: '10299', donation_transfer_cents: '10000' };
const giftOrder = (meta, amount = 3198 + 10299) =>
	run(printEvent({ brand: 'riab', site: 'vaneure', window: 'smp', family: 'smp_book', total: '1', breakdown: 'raised-in-a-barn-hb:1', ...meta }, { email: 'donor@test', name: 'Ann Donor', amount, created: 1795190400, id: 'cs_test_gift00000001' }));

test('RIAB gift: an order WITH a gift sends TWO buyer emails (SMP purchase + SMC tax receipt) and the notice shows the designation', async () => {
	const r = await giftOrder(GIFT_META);
	assert.equal(r.status, 200);
	const buyer = r.sent.filter((m) => m.to === 'donor@test');
	assert.equal(buyer.length, 2, 'two separate buyer emails');
	const [purchase, receipt] = buyer;
	assert.equal(purchase.from, NOTIFY_FROM);
	assert.match(purchase.subject, /^Your Spirit Media Publishing order/);
	assert.match(purchase.text, /This includes your \$102\.99 gift to charity; Spirit Media Charities is emailing you its receipt separately\./);
	assert.doesNotMatch(purchase.text, /501\(c\)\(3\)|EIN|tax-deductible|No goods or services/);
	assert.equal(receipt.from, 'Spirit Media Charities <receipts@send.spiritmediapublishing.com>');
	assert.equal(receipt.bcc, 'orders@test');
	assert.equal(receipt.subject, 'Your gift receipt from Spirit Media Charities — $102.99');
	for (const re of [/Donor: Ann Donor/, /Date of gift: November \d+, 2026/, /Amount of gift: \$102\.99 \(your gift of \$100\.00 plus \$2\.99/, /Designation: Split 50\/50/, /Cheyenne Foundation: \$51\.50/, /Foundation of Hope: \$51\.49/, /EIN 88-4352701/, /501\(c\)\(3\)/, /No goods or services were provided in exchange for this gift/, /100% of the amount Spirit Media Charities receives goes to the charity you choose/])
		assert.match(receipt.text, re);
	assert.doesNotMatch(`${receipt.subject}\n${receipt.text}`, /Father|FHB/);
	const notice = r.sent.find((m) => m.to === 'orders@test');
	assert.match(notice.text, /Designation: split = Split 50\/50/);
	assert.match(notice.text, /Transferred to Spirit Media Charities: \$100\.00/);
	assert.match(notice.text, /Books total \(Total minus the gift\): \$31\.98/);
	if (process.env.SHOW_MESSAGE) for (const m of [notice, purchase, receipt]) console.log(`\n--- to ${m.to} from ${m.from ?? ''} | ${m.subject} ---\n${m.text}`);
});

test('RIAB gift: a gift-free order sends ONE buyer email and no gift lines anywhere', async () => {
	const r = await giftOrder({}, 2999);
	const buyer = r.sent.filter((m) => m.to === 'donor@test');
	assert.equal(buyer.length, 1);
	assert.doesNotMatch(buyer[0].text, /gift to charity|Spirit Media Charities/i);
	assert.doesNotMatch(r.sent.find((m) => m.to === 'orders@test').text, /GIFT TO CHARITY/);
});

test('RIAB gift: uncovered fee and a single designation print the right charity and transfer', async () => {
	const r = await giftOrder({ donation_cents: '2500', designation: 'cf', fee_covered: 'false', donation_fee_cover_cents: '0', donation_total_cents: '2500', donation_transfer_cents: '2428' }, 5499);
	const receipt = r.sent.find((m) => m.subject?.startsWith('Your gift receipt'));
	assert.match(receipt.text, /Amount of gift: \$25\.00\n/);
	assert.match(receipt.text, /Designation: Cheyenne Foundation\n {2}Cheyenne Foundation: \$25\.00/);
	assert.match(r.sent.find((m) => m.to === 'orders@test').text, /\(fee not covered\)\nTransferred to Spirit Media Charities: \$24\.28/);
});

// ---- eBook (recorded fixture, moved from FHB) ----
const FIX = JSON.parse(fs.readFileSync(new URL('./fixtures/ebook-session-completed.json', import.meta.url), 'utf8'));
const SESSION = FIX.data.object;
const SKU = 'fixture-book-ebook';
EBOOK_SKUS[SKU] = { title: 'Fixture Book', isbn: '9790000000000', listCents: 599, bookSlug: 'fixture-book', img: null, selectUntil: null };
const deps = (first = false) => ({ enabled: true, isFirstOrder: async () => first, firstOrderPromo: async () => (first ? 'promo_WELCOME15' : null) });

test('EBOOK fixture is EXACTLY what the engine sends Stripe for its order (it cannot drift)', async () => {
	const o = FIX._order;
	const r = await ebookCheckoutForm(o, 'https://spiritmediapublishing.com/store-checkout', deps(o.firstOrder), new Date(o.now));
	assert.ok('form' in r, JSON.stringify(r));
	Object.assign(r.form, storeTags(o.site, familyOf(o.counts)));
	const meta = Object.fromEntries(Object.entries(r.form).filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), String(v)]));
	assert.deepEqual(meta, SESSION.metadata);
	assert.equal(r.form.success_url, SESSION.success_url);
});

test('EBOOK WEBHOOK: with SMP’s signing secret the email carries a v2 SIGNED link on the SMP window', async () => {
	const r = await run(FIX, { env: { ...ENV, EBOOK_LINK_SECRET: 'smp_link_secret_test' } });
	assert.equal(r.status, 200);
	const buyer = r.sent.find((m) => m.to === 'buyer@example.com');
	assert.equal(buyer.subject, 'Your eBook — Fixture Book');
	const link = buyer.text.match(/https:\/\/\S+/)[0];
	assert.match(link, /^https:\/\/spiritmediapublishing\.com\/ebook-download\?s=cs_test_[^&]+&e=fixture-book-ebook&t=[A-Za-z0-9_-]{43}&v=2$/);
	const u = new URL(link);
	assert.equal(await verifyEbookLink('smp_link_secret_test', u.searchParams.get('s'), u.searchParams.get('e'), u.searchParams.get('t')), true);
	assert.ok(endsWithSeven(buyer.text));
	assert.match(r.sent.find((m) => m.to === 'orders@test').text, /eBook SKU: fixture-book-ebook · window: smp/);
	assert.equal(windowOrigin('smp'), 'https://spiritmediapublishing.com');
});

test('EBOOK WEBHOOK: no signing secret bound -> the session link (re-signed on click), never an unworkable link', async () => {
	const r = await run(FIX);
	const link = r.sent.find((m) => m.to === 'buyer@example.com').text.match(/https:\/\/\S+/)[0];
	assert.equal(link, `https://spiritmediapublishing.com/ebook-download?s=${SESSION.id}`);
	const bad = await run({ ...FIX, data: { object: { ...SESSION, id: 'cs_bad' } } });
	assert.equal(bad.status, 500, 'a malformed session is never emailed a link');
	assert.equal(bad.sent.filter((m) => m.to === 'buyer@example.com').length, 0);
});

// ---- DUPLICATE SAFETY: old FHB endpoint + new SMP endpoint both receive the event --------------------------------------
test('DUPLICATE-SAFE: the same event delivered to BOTH endpoints at once sends exactly one set of emails (either wins)', async () => {
	for (const fhbFirst of [false, true]) {
		const sid = fhbFirst ? 'cs_test_dup000000001b' : 'cs_test_dup000000001a';
		const stripe = fakeStripe({ delayMs: 15 });
		const ev = printEvent({ site: 'fhb', window: 'fhb', family: 'bible' }, { id: sid });
		const real = globalThis.fetch;
		globalThis.fetch = stripe.handle;
		try {
			// FHB's endpoint runs the identical claim under its own name (FHB functions/print-webhook.ts claimSession)
			// deterministic interleaving: the second endpoint starts its claim while the first one's is IN FLIGHT
			const inFlight = async () => {
				while (!stripe.idem.has(claimKey(sid))) await new Promise((r) => setTimeout(r, 1));
			};
			const fhbClaim = async () => {
				if (!fhbFirst) await inFlight();
				return claimSession('rk_fhb_stub', sid, FHB_BY);
			};
			const smpRun = async () => {
				if (fhbFirst) await inFlight();
				return webhook({ request: signed(ev), env: ENV });
			};
			const [smp, fhb] = await Promise.all([smpRun(), fhbClaim()]);
			const winners = [smp.status === 200 && stripe.mail.length === 2, fhb === 'ours'].filter(Boolean).length;
			assert.equal(winners, 1, `exactly one endpoint owns the session (fhbFirst=${fhbFirst})`);
			if (fhbFirst) {
				assert.equal(smp.status, 503, 'SMP lost while FHB was in flight: Stripe is asked to redeliver, nothing sent');
				assert.equal(stripe.mail.length, 0);
				stripe.sessions[sid].notified_at = '2026-11-20T00:00:00Z'; // FHB sent its two emails and stamped the session
				assert.equal((await webhook({ request: signed(ev), env: ENV })).status, 200, 'the redelivery is acknowledged');
				assert.equal(stripe.mail.length, 0, 'and still sends nothing');
				assert.equal(stripe.sessions[sid].notify_claim, FHB_BY);
			} else {
				assert.equal(fhb, 'retry', 'FHB, in flight behind SMP, is told to retry (409), never to send');
				assert.equal(stripe.mail.length, 2, 'one notice + one buyer email');
				assert.equal(await claimSession('rk_fhb_stub', sid, FHB_BY), 'done', 'FHB redelivery: already notified');
				assert.equal(stripe.sessions[sid].notify_claim, CLAIM_BY);
				assert.ok(stripe.sessions[sid].notified_at, 'stamped for the reconciler');
			}
		} finally {
			globalThis.fetch = real;
		}
	}
});

test('DUPLICATE-SAFE: FHB claimed first -> SMP acknowledges and sends NOTHING (both before and after FHB finishes)', async () => {
	const stripe = fakeStripe();
	const real = globalThis.fetch;
	globalThis.fetch = stripe.handle;
	try {
		assert.equal(await claimSession('rk_fhb_stub', 'cs_test_dup0000000002', FHB_BY), 'ours');
	} finally {
		globalThis.fetch = real;
	}
	const ev = printEvent({ site: 'smp', window: 'smp', family: 'smp_book' }, { id: 'cs_test_dup0000000002' });
	const r = await run(ev, { stripe });
	assert.equal(r.status, 200);
	assert.equal(r.sent.length, 0, 'no email from the endpoint that lost the claim');
	// the claim metadata alone (Stripe's 24h idempotency window long gone) still says it is FHB's
	stripe.idem.clear();
	const later = await run(ev, { stripe });
	assert.equal(later.sent.length, 0);
});

test('DUPLICATE-SAFE: the lost claim is Stripe’s idempotency_error (same key, other body), even with no metadata read', async () => {
	const stripe = fakeStripe();
	const real = globalThis.fetch;
	globalThis.fetch = stripe.handle;
	try {
		assert.equal(await claimSession('k', 'cs_test_dup0000000003', FHB_BY), 'ours');
		stripe.sessions.cs_test_dup0000000003 = {}; // simulate a read that has not seen the write yet
		assert.equal(await claimSession('k', 'cs_test_dup0000000003', CLAIM_BY), 'theirs');
		assert.equal(stripe.idem.get(claimKey('cs_test_dup0000000003')).body, 'metadata%5Bnotify_claim%5D=fhb-print-webhook');
	} finally {
		globalThis.fetch = real;
	}
});

test('DUPLICATE-SAFE: a Stripe REdelivery to the endpoint that owns the claim re-sends (a failed email is retried, as before)', async () => {
	const stripe = fakeStripe();
	let fail = true;
	const real = globalThis.fetch;
	globalThis.fetch = async (url, init) => {
		if (String(url).includes('mailgun') && fail) return new Response('down', { status: 500 });
		return stripe.handle(url, init);
	};
	try {
		const ev = printEvent({ site: 'smp', window: 'smp' }, { id: 'cs_test_dup0000000004' });
		assert.equal((await webhook({ request: signed(ev), env: ENV })).status, 500, 'Mailgun down: Stripe is asked to retry');
		assert.equal(await claimSession('k', 'cs_test_dup0000000004', FHB_BY), 'theirs', 'the other endpoint still stays out');
		fail = false;
		assert.equal((await webhook({ request: signed(ev), env: ENV })).status, 200);
		assert.equal(stripe.mail.length, 2, 'sent on the retry');
		assert.equal((await webhook({ request: signed(ev), env: ENV })).status, 200);
		assert.equal(stripe.mail.length, 2, 'a stray third delivery after success sends nothing (notified_at)');
	} finally {
		globalThis.fetch = real;
	}
});

test('DUPLICATE-SAFE failure path: WITHOUT the claim both endpoints would send (the test can fail)', async () => {
	const stripe = fakeStripe();
	const ev = printEvent({}, { id: 'cs_test_dup0000000005' });
	await run(ev, { stripe, env: { ...ENV, STRIPE_STORE_SECRET_KEY: undefined } });
	await run(ev, { stripe, env: { ...ENV, STRIPE_STORE_SECRET_KEY: undefined } });
	assert.equal(stripe.mail.length, 4, 'no key = no coordination: proves the claim is what dedupes');
});

test('signature: a bad signature is refused (400) and an unconfigured endpoint only acknowledges', async () => {
	const ev = printEvent({});
	const bad = new Request('https://spiritmediapublishing.com/store-webhook', { method: 'POST', body: JSON.stringify(ev), headers: { 'stripe-signature': 't=1,v1=00' } });
	const stripe = fakeStripe();
	const real = globalThis.fetch;
	globalThis.fetch = stripe.handle;
	try {
		assert.equal((await webhook({ request: bad, env: ENV })).status, 400);
		assert.equal((await webhook({ request: signed(ev), env: { ...ENV, STRIPE_STORE_WEBHOOK_SECRET: undefined } })).status, 200);
		assert.equal(stripe.mail.length, 0);
	} finally {
		globalThis.fetch = real;
	}
});

// ---- eBook ENGINE + REGISTRY tests, MOVED from FHB scripts/window-confirmations.test.mjs (store move 5): the engine's
// master and the eBook registry live in SMP, so their tests do too.
test('EBOOK ENGINE: no shipping, carries the tags, takes the first-order 15%', async () => {
	const r = await ebookCheckoutForm({ counts: { [SKU]: 1 }, email: 'new@example.com', returnPath: '/books/fixture-book/' }, 'https://spiritmediapublishing.com/store-checkout', deps(true));
	assert.ok('form' in r);
	const f = { ...r.form, ...storeTags('smp', familyOf({ [SKU]: 1 })) };
	assert.deepEqual(storeTagErrors(f), [], 'tagged');
	assert.equal(f['metadata[family]'], 'smp_ebook');
	assert.equal(f['metadata[kind]'], 'ebook_direct');
	assert.equal(f['discounts[0][promotion_code]'], 'promo_WELCOME15', 'first order: WELCOME15 pre-applied');
	assert.equal(f['metadata[offer]'], 'first_order');
	assert.match(f['metadata[book_1]'], /unit_cents=509\|/, '15% off 5.99 recorded for author reporting');
	assert.ok(!Object.keys(f).some((k) => /shipping|phone_number/.test(k)), 'no shipping, no phone: nothing ships');
	assert.equal(f['line_items[0][price_data][product_data][tax_code]'], 'txcd_10202001', 'e-book tax code');
	assert.equal(f.billing_address_collection, 'required');
	const rep = await ebookCheckoutForm({ counts: { [SKU]: 1 }, email: 'old@example.com' }, 'https://x.pages.dev/store-checkout', deps(false));
	assert.equal(rep.form['discounts[0][promotion_code]'], undefined, 'repeat buyer: list price');
	assert.equal(rep.form.cancel_url, 'https://x.pages.dev/bookstore/?order=canceled', 'unknown return path: the bookstore, never an open redirect');
	const prod = await ebookCheckoutForm({ counts: { [SKU]: 1 } }, 'https://spirit-media-publishing.pages.dev/store-checkout', deps());
	assert.match(prod.form.success_url, /^https:\/\/spiritmediapublishing\.com\/ebook-download\?s=/, 'the production Pages host returns to the .com');
});

test('EBOOK ENGINE REFUSES: a mixed cart, two copies, an unknown SKU, an eBook in an active KDP Select term', async () => {
	const url = 'https://spiritmediapublishing.com/store-checkout';
	const pb = Object.keys(bookSkus.skus)[0];
	assert.equal((await ebookCheckoutForm({ counts: { [SKU]: 1, [pb]: 1 } }, url, deps())).body.error, 'ebook_separate');
	assert.equal((await ebookCheckoutForm({ counts: { [SKU]: 2 } }, url, deps())).body.error, 'invalid_selection');
	assert.equal((await ebookCheckoutForm({ counts: { 'no-such-ebook': 1 } }, url, deps())).body.error, 'invalid_selection');
	assert.equal((await ebookCheckoutForm({ counts: {} }, url, deps())).body.error, 'invalid_selection');
	EBOOK_SKUS['select-book-ebook'] = { ...EBOOK_SKUS[SKU], bookSlug: 'select-book', selectUntil: '2026-12-20' };
	try {
		const before = new Date('2026-12-19T23:00:00Z');
		assert.equal(ebookOnSale('select-book-ebook', before), false, 'in its Select term: not on sale');
		assert.equal(ebookForBook('select-book', before), null, 'its page keeps the Amazon button');
		assert.equal((await ebookCheckoutForm({ counts: { 'select-book-ebook': 1 } }, url, deps(), before)).body.error, 'not_on_sale');
		const after = new Date('2026-12-20T00:00:01Z');
		assert.equal(ebookOnSale('select-book-ebook', after), true, 'the day the term ends it joins our store');
		assert.ok('form' in (await ebookCheckoutForm({ counts: { 'select-book-ebook': 1 } }, url, deps(), after)));
	} finally {
		delete EBOOK_SKUS['select-book-ebook'];
	}
	const off = await ebookCheckoutForm({ counts: { [SKU]: 1 } }, url, { ...deps(), enabled: false });
	assert.equal(off.body.disabled, true, 'no Stripe key: disabled, never a session');
});

// Price provenance: a live Kindle ASIN, OR (a book with no Kindle edition / off SMP's KDP shelf, SMP batch 3 2026-11-20
// "Find them. Add them for sale now.") asin null with the recorded basis of the live-listing read and its date.
const priceProven = (r) => {
	const p = r.price_source ?? {};
	if (/^B0[A-Z0-9]{8}$/.test(p.asin ?? '')) return true;
	return p.asin === null && typeof p.basis === 'string' && p.basis.trim().length >= 10 && /^\d{4}-\d{2}-\d{2}T/.test(p.checked ?? '');
};
test('EBOOK REGISTRY: price provenance refuses a row with no ASIN and no recorded basis (failure path)', () => {
	assert.equal(priceProven({ price_source: { asin: 'B0BT9ZBSQF', checked: '2026-11-20T00:00:00Z' } }), true);
	assert.equal(priceProven({ price_source: { asin: null, basis: 'off-shelf live listing read (amazon-book.mjs)', checked: '2026-11-20T16:12:03+00:00' } }), true);
	assert.equal(priceProven({ price_source: { asin: null, checked: '2026-11-20T16:12:03+00:00' } }), false, 'no basis');
	assert.equal(priceProven({ price_source: { asin: null, basis: 'off-shelf live listing read' } }), false, 'no check date');
	assert.equal(priceProven({ price_source: { asin: 'not-an-asin', basis: 'x'.repeat(20), checked: '2026-11-20T00:00:00Z' } }), false, 'bad ASIN is never excused');
	assert.equal(priceProven({}), false, 'no provenance');
});

test('EBOOK REGISTRY: every committed eBook row is complete, priced, has its private file, never sits in skus', () => {
	const rows = bookSkus.ebooks ?? {};
	const files = JSON.parse(fs.readFileSync(new URL('../src/data/ebook-files.json', import.meta.url), 'utf8')).files;
	for (const [sku, r] of Object.entries(rows)) {
		assert.equal(r.format, 'eBook', sku);
		assert.ok(Number.isInteger(r.list_cents) && r.list_cents > 0, `${sku}: a price`);
		assert.ok(priceProven(r), `${sku}: priced from a live Kindle listing (or a recorded no-Kindle basis + check date)`);
		assert.ok(r.book && r.checkout_name, `${sku}: book + title`);
		assert.ok(files[sku]?.key && /\.epub$/.test(files[sku].key), `${sku}: a private EPUB on R2`);
		assert.ok(!bookSkus.skus[sku], `${sku}: never a print sku`);
		if (r.select_until) assert.match(r.select_until, /^\d{4}-\d{2}-\d{2}$/, `${sku}: Select term end date`);
	}
	for (const sku of Object.keys(files)) assert.ok(rows[sku], `${sku}: a file with no registry row`);
	for (const sku of Object.keys(bookSkus.skus)) assert.equal(EBOOK_SKUS[sku], undefined, `${sku}: a print sku is never an eBook`);
});


// ---- the paid order becomes an Ingram order: MOVED from FHB scripts/beloved-identity.test.mjs (store move 5) ----
test('webhook (Beloved Identity): the fulfilment email carries ISBN, quantity, address, phone and the Ingram print site', async () => {
	const r = await confirm({ site: 'fhb', window: 'fhb', family: 'book', total: '3', breakdown: 'beloved-identity-pb:3' }, { amount: 2997 });
	assert.equal(r.status, 200);
	for (const want of ['ISBN 9798893072396 × 3', 'Beloved Identity', '96pp, 5 x 8 in', 'Ann Reader', '1 Main St', 'Austin, TX 78701', '+15555550123', 'Ingram print site for US: US', 'Copies: 3'])
		assert.ok(r.kevin.text.includes(want), want);
	assert.ok(!r.kevin.text.includes('MISSING'));
	assert.match(r.kevin.subject, /3 copies/);
	const bible = await confirm({ breakdown: 'teen-pb:1', total: '1' });
	assert.ok(!bible.kevin.text.includes('Ingram order lines'), 'a Bible-only order has no Ingram book lines');
});

// ---- TBL audiobooks (I22 item 7, 2026-11-23): a TBL audiobook_direct sale reaches this shared webhook ----------------
// TBL's own /api/library/stripe-webhook DELIVERS it (My Library entitlement); this endpoint only tells Kevin, ONCE, and
// sends the buyer nothing (TBL owns that email). It is also a store order, so it ends the buyer's first order.
test('TBL audiobook_direct: Kevin gets one sale notice, the buyer gets no SMP email; it ends the first order', async () => {
	const r = await confirm(
		{ audiobook_sku: 'invisible-wounds-audiobook', library_slug: 'invisible-wounds-audiobook', book_1: 'title=Invisible Wounds|isbn=none|format=Audiobook|qty=1|unit_cents=1499' },
		{ kind: 'audiobook_direct', amount: 1499, id: 'cs_test_tblAudio00001' },
	);
	assert.equal(r.status, 200);
	assert.ok(r.kevin, 'Kevin is told');
	assert.match(r.kevin.subject, /^🎧 Audiobook sale — \$14\.99$/);
	assert.match(r.kevin.text, /Invisible Wounds/);
	assert.match(r.kevin.text, /Audiobook SKU: invisible-wounds-audiobook/);
	assert.match(r.kevin.text, /Delivered by The Believer's Library \(My Library\)/);
	assert.equal(r.buyer, undefined, 'no buyer email from SMP');
	assert.equal(r.sent.length, 1);
	const { STORE_ORDER_KINDS } = await import('../src/store-engine/lib/storeEngine.ts');
	assert.ok(STORE_ORDER_KINDS.includes('audiobook_direct'), 'a TBL audiobook ends the first order on every window');
});

test('TBL language eBook (tbl_ebook) + series bundle (ebook_bundle): one Kevin notice each, no buyer email, both end the first order', async () => {
	const e = await confirm({ ebook_sku: 'lang-ar-ebook', book_1: 'title=Father’s Heart Bible — Arabic|isbn=none|format=eBook|qty=1|unit_cents=999' }, { kind: 'tbl_ebook', amount: 999, id: 'cs_test_tblLangEb0001' });
	assert.equal(e.status, 200);
	assert.match(e.kevin.subject, /^📖 eBook sale — \$9\.99$/);
	assert.match(e.kevin.text, /eBook SKU: lang-ar-ebook/);
	assert.equal(e.buyer, undefined);
	assert.equal(e.sent.length, 1);
	const b = await confirm({ bundle_sku: 'the-blessing-trail-ebook-bundle', book_1: 'title=The Blessing Trail: 3-Book eBook Bundle|isbn=none' }, { kind: 'ebook_bundle', amount: 2078, id: 'cs_test_tblBundle0001' });
	assert.match(b.kevin.subject, /^📖 eBook bundle sale — \$20\.78$/);
	assert.equal(b.sent.length, 1);
	const { STORE_ORDER_KINDS } = await import('../src/store-engine/lib/storeEngine.ts');
	for (const k of ['tbl_ebook', 'ebook_bundle']) assert.ok(STORE_ORDER_KINDS.includes(k), k);
});

// ---- TBL ORDERS (Kevin D99 2026-11-23 "Make sure order emails are worded as Spirit Media Publishing Order through The Believer's Library.") ----
test('TBL order: a print order sold through The Believer\u2019s Library is worded "Spirit Media Publishing Order through The Believer\u2019s Library"', async () => {
	const line = "Spirit Media Publishing Order through The Believer's Library";
	for (const host of ['thebelieverslibrary.com', 'www.thebelieverslibrary.com', 'tbl.community-cm1.pages.dev']) {
		const r = await confirm({ site: 'smp', window: 'smp', family: 'smp_book', utm_source: host });
		assert.equal(r.status, 200);
		assert.equal(r.buyer.subject, `${line} — $31.98`, host);
		assert.ok(r.buyer.text.startsWith(`${line}\n\nThank you for your order.`), host);
		assert.ok(endsWithSeven(r.buyer.text), 'signature unchanged');
		assert.equal(r.buyer.from, 'SMP Orders <orders@send.spiritmediapublishing.com>', 'From stays SMP Orders');
	}
	// not TBL: SMP's own utm, FHB, a look-alike host -> the one-store wording, no TBL line
	for (const meta of [{ site: 'smp', window: 'smp', utm_source: 'google' }, { site: 'fhb', window: 'fhb' }, { site: 'smp', window: 'smp', utm_source: 'thebelieverslibrary.com.evil.example' }]) {
		const r = await confirm(meta);
		assert.equal(r.buyer.subject, 'Your Spirit Media Publishing order — $31.98', JSON.stringify(meta));
		assert.doesNotMatch(r.buyer.text.split('Phone:')[0].replace(SEVEN[0], ''), /Believer/, 'no TBL line outside the identity footer');
	}
});

test('TBL order: an eBook sold through The Believer\u2019s Library gets the TBL subject + first line; SMP eBooks unchanged', async () => {
	const line = "Spirit Media Publishing Order through The Believer's Library";
	const tbl = { ...FIX, data: { object: { ...SESSION, metadata: { ...SESSION.metadata, utm_source: 'thebelieverslibrary.com' } } } };
	const r = await run(tbl);
	const buyer = r.sent.find((m) => m.to === 'buyer@example.com');
	assert.equal(buyer.subject, `${line} — Fixture Book`);
	assert.ok(buyer.text.startsWith(`${line}\n\nThank you — your eBook is ready.`));
	assert.ok(endsWithSeven(buyer.text));
	const plain = (await run(FIX)).sent.find((m) => m.to === 'buyer@example.com');
	assert.equal(plain.subject, 'Your eBook — Fixture Book');
});
