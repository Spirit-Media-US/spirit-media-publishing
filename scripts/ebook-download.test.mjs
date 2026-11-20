// node --test scripts/ebook-download.test.mjs — SMP /ebook-download, MOVED from FHB (map smp-store-one-home-v1 §4 move 3).
// BUILD-CHECK: searched ebook download test (tool-inventory.py) + ls scripts/ in FHB and SMP
// NEAREST: FHB scripts/window-confirmations.test.mjs EBOOK DOWNLOAD / REFUSES / Bible v1 / REGISTRY tests (ported here)
// NOT-REUSED-BECAUSE: those tests import FHB's endpoint; the endpoint MOVED to SMP, so its tests move with it.
// APPROVED-BY: Kevin 2026-11-20 ~18:51Z "2 this needs to be moved. You are inheriting OLD instead of making it new" (brief jobs/smp-store-one-home-brief.md)
// Proves: the v2 link the webhook emails downloads; refusals (unpaid, unknown, tampered with NO Stripe call, SKU swap,
// no secret); the Bible eBook v1 session path; and that a LEGACY link FHB signed before the move (a key SMP never
// holds) still delivers, through Stripe, for the paid session only. Stripe and R2 are stubbed; no card, no real file.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import EBOOK from '../functions/ebook-current.json' with { type: 'json' };
import { onRequestGet as download } from '../functions/ebook-download.ts';
import ebookFiles from '../src/data/ebook-files.json' with { type: 'json' };
import { PURPOSE_V1, signEbookLink } from '../src/lib/ebookLink.ts';
import bookSkus from '../src/store-engine/data/book-skus.json' with { type: 'json' };
import { EBOOK_SKUS } from '../src/store-engine/lib/storeEngine.ts';

const FIX = JSON.parse(fs.readFileSync(new URL('./fixtures/ebook-session-completed.json', import.meta.url), 'utf8'));
const SESSION = FIX.data.object;
const SID = SESSION.id;
const SKU = 'fixture-book-ebook';
const SECRET = 'smp_link_secret_test';
const FHB_OLD_WHSEC = 'whsec_fhb_old_never_on_smp';
EBOOK_SKUS[SKU] = { title: 'Fixture Book', isbn: '9790000000000', listCents: 599, bookSlug: 'fixture-book', img: null, selectUntil: null };
const EPUB = 'PK\u0003\u0004fixture-epub';

function stubs(sessions) {
	const calls = { stripe: [] };
	const real = globalThis.fetch;
	globalThis.fetch = async (url) => {
		const u = String(url);
		if (!u.startsWith('https://api.stripe.com/v1/checkout/sessions/')) throw new Error(`unexpected fetch ${u}`);
		calls.stripe.push(u);
		const id = u.split('/').pop().split('?')[0];
		return sessions[id] ? new Response(JSON.stringify(sessions[id])) : new Response('{"error":{}}', { status: 404 });
	};
	return { calls, restore: () => (globalThis.fetch = real) };
}
const FILE_KEY = 'fixture-book-v1.epub';
const R2 = { get: async (k) => (k === FILE_KEY || k === EBOOK.key ? { body: `${EPUB}:${k}` } : null) };
const ENV = { STRIPE_STORE_SECRET_KEY: 'rk_test_stub', EBOOK_LINK_SECRET: SECRET, STORE_EBOOK: R2 };
const get = (p, env = ENV) => download({ request: new Request(`https://spiritmediapublishing.com${p}`), env });
const withFile = async (fn) => {
	ebookFiles.files[SKU] = { key: FILE_KEY, filename: 'Fixture-Book.epub' };
	try {
		return await fn();
	} finally {
		delete ebookFiles.files[SKU];
	}
};

test('v2 link: the page and the EPUB for the paid session; the success redirect re-signs to v2', () =>
	withFile(async () => {
		const t = await signEbookLink(SECRET, SID, SKU);
		const st = stubs({ [SID]: SESSION });
		try {
			const q = `/ebook-download?s=${SID}&e=${SKU}&t=${t}&v=2`;
			const pg = await get(q);
			assert.equal(pg.status, 200);
			const html = await pg.text();
			assert.match(html, /Fixture Book/);
			assert.match(html, /&amp;v=2&amp;dl=epub">Download EPUB/);
			assert.doesNotMatch(html.replace(/href="[^"]*"/g, ''), /@spiritmediapublishing\.com/, 'address never printed');
			const file = await get(`${q}&dl=epub`);
			assert.equal(file.status, 200);
			assert.equal(file.headers.get('content-type'), 'application/epub+zip');
			assert.equal(file.headers.get('content-disposition'), 'attachment; filename="Fixture-Book.epub"');
			assert.equal(await file.text(), `${EPUB}:${FILE_KEY}`);
			const ok = await get(`/ebook-download?s=${SID}`);
			assert.equal(ok.status, 302);
			assert.equal(ok.headers.get('location'), q);
		} finally {
			st.restore();
		}
	}));

test('LEGACY v1 link (signed by FHB before the move, a key SMP never holds) still delivers: Stripe proves it, then v2', () =>
	withFile(async () => {
		const old = await signEbookLink(FHB_OLD_WHSEC, SID, SKU, PURPOSE_V1); // exactly FHB src/lib/ebookLink.ts's link
		const legacy = `/ebook-download?s=${SID}&e=${SKU}&t=${old}`;
		let st = stubs({ [SID]: SESSION });
		try {
			for (const dl of ['', '&dl=epub']) {
				const r = await get(`${legacy}${dl}`);
				assert.equal(r.status, 302, `old link${dl}`);
				const loc = r.headers.get('location');
				assert.match(loc, /&v=2$/);
				const file = await get(`${loc}&dl=epub`);
				assert.equal(await file.text(), `${EPUB}:${FILE_KEY}`, 'and the file downloads');
			}
		} finally {
			st.restore();
		}
		// the same old link for an UNPAID session, or carrying another SKU, gets nothing
		st = stubs({ [SID]: { ...SESSION, payment_status: 'unpaid', status: 'open' } });
		try {
			assert.equal((await get(legacy)).status, 403, 'unpaid');
		} finally {
			st.restore();
		}
		st = stubs({ [SID]: SESSION });
		try {
			assert.equal((await get(`/ebook-download?s=${SID}&e=other-book-ebook&t=${old}`)).status, 403, 'SKU the session did not buy');
		} finally {
			st.restore();
		}
	}));

test('REFUSES: unpaid, unknown session, tampered v2 signature (no Stripe call), SKU swap, no secret bound', () =>
	withFile(async () => {
		const t = await signEbookLink(SECRET, SID, SKU);
		const at = (sid, sku, sig, dl = '') => `/ebook-download?s=${sid}&e=${sku}&t=${sig}&v=2${dl}`;
		let st = stubs({ [SID]: { ...SESSION, payment_status: 'unpaid', status: 'open' } });
		try {
			for (const dl of ['', '&dl=epub']) assert.equal((await get(at(SID, SKU, t, dl))).status, 403, `unpaid${dl}`);
			assert.equal((await get(`/ebook-download?s=${SID}`)).status, 403, 'unpaid success redirect');
		} finally {
			st.restore();
		}
		const ghost = 'cs_test_a1NoSuchSession000000000000000000000000000000000';
		st = stubs({});
		try {
			assert.equal((await get(at(ghost, SKU, await signEbookLink(SECRET, ghost, SKU), '&dl=epub'))).status, 403, 'unknown session');
		} finally {
			st.restore();
		}
		st = stubs({ [SID]: SESSION });
		try {
			const bad = t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A');
			for (const sig of [bad, '', 'x'.repeat(43), t.toUpperCase()]) assert.equal((await get(at(SID, SKU, sig, '&dl=epub'))).status, 403);
			assert.equal(st.calls.stripe.length, 0, 'a tampered v2 link never reaches Stripe');
			ebookFiles.files['other-book-ebook'] = { key: 'other-book-v1.epub', filename: 'Other.epub' };
			assert.equal((await get(at(SID, 'other-book-ebook', await signEbookLink(SECRET, SID, 'other-book-ebook'), '&dl=epub'))).status, 403, 'SKU swap');
			delete ebookFiles.files['other-book-ebook'];
			assert.equal((await get(at(SID, SKU, t, '&dl=epub'), { ...ENV, EBOOK_LINK_SECRET: undefined })).status, 403, 'no secret');
			// failure path of the gate itself: the right secret + paid session DOES serve (so the 403s above are real refusals)
			assert.equal((await get(at(SID, SKU, t, '&dl=epub'))).status, 200);
		} finally {
			st.restore();
		}
	}));

test('the Bible eBook v1 path is unchanged (session link, no signature) and nothing serves without the R2 binding', async () => {
	const bid = 'cs_live_a1BibleEbookSession000000000000000000000000000000';
	const st = stubs({ [bid]: { id: bid, payment_status: 'paid', metadata: { kind: 'ebook_direct', site: 'fhb', window: 'fhb', family: 'bible_ebook' } } });
	try {
		const pg = await get(`/ebook-download?s=${bid}`);
		assert.equal(pg.status, 200);
		assert.match(await pg.text(), /Father’s Heart Bible eBook is ready/);
		assert.equal(await (await get(`/ebook-download?s=${bid}&dl=epub`)).text(), `${EPUB}:${EBOOK.key}`);
		const off = await get(`/ebook-download?s=${bid}&dl=epub`, { ...ENV, STORE_EBOOK: undefined });
		assert.match(await off.text(), /being switched on/);
	} finally {
		st.restore();
	}
});

// Registry (moved from FHB's EBOOK REGISTRY test): every eBook the store sells has its private file HERE, and every file
// has a row. bin/fhb-ebook-config.py --smp-write writes both; this fails the SMP build if one is missing.
test('REGISTRY: every committed eBook row has its private EPUB in src/data/ebook-files.json, and no stray files', () => {
	const rows = bookSkus.ebooks ?? {};
	const files = JSON.parse(fs.readFileSync(new URL('../src/data/ebook-files.json', import.meta.url), 'utf8')).files;
	for (const sku of Object.keys(rows)) assert.ok(files[sku]?.key && /\.epub$/.test(files[sku].key), `${sku}: a private EPUB on R2`);
	for (const sku of Object.keys(files)) assert.ok(rows[sku], `${sku}: a file with no registry row`);
	assert.match(EBOOK.key, /^fathers-heart-bible-.+\.epub$/);
	assert.equal(EBOOK.bucket, 'fhb-ebook');
});
