// BUILD-CHECK: tool-inventory.py "do not publish exclude" (nothing near) + scripts/*.test.mjs read
// NEAREST: scripts/store-checkout.test.mjs (bookstore collection tests) + scripts/llms-books.test.mjs + scripts/merchant-feed.test.mjs
// NOT-REUSED-BECAUSE: each covers ONE surface for a different property (partitions / every live page listed / feed =
//   offers); this checks one list (do-not-publish.json) ABSENT across all four surfaces at once, so it reads the list
//   once and runs beside them in the build's node --test line rather than being split across three files
// APPROVED-BY: Kevin 2026-11-16 brief pmprint-every-book-page-20261116 #3 ("exclude by id/title in BookstoreBody with a test")
//
// node --test scripts/do-not-publish.test.mjs — the DO NOT PUBLISH titles (src/data/books/do-not-publish.json; Kevin
// 2026-11-16 "These should NOT show on SMP at all") are on NO surface of the built site: no card on /bookstore/ or any
// collection page (nor in the page's embedded book data, so not counted in Published Titles), no /books/ page, no
// merchant-feed item, no llms.txt / llms-full.txt entry. Read off the BUILT files (dist/) plus public/llms*.txt.
// The last test injects a title back and proves each check rejects it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { dnpMatcher, normT, slugT } from '../src/lib/do-not-publish.mjs';

const LIST = JSON.parse(fs.readFileSync(new URL('../src/data/books/do-not-publish.json', import.meta.url), 'utf8'));
const isDnp = dnpMatcher(LIST);
const unesc = (s) =>
	String(s)
		.replace(/&#39;|&#x27;/g, "'")
		.replace(/&#8217;|&rsquo;/g, '’')
		.replace(/&quot;/g, '"')
		.replace(/&#38;|&amp;/g, '&');
// the title anywhere in the text, tolerant of quotes / punctuation / entities between words
const titleRe = (t) => new RegExp(`\\b${normT(t).split(' ').join('(?:[^a-z0-9]|&#?[a-z0-9]+;)+')}\\b`, 'i');

/** Every DNP hit on one bookstore page's HTML: cards (id, key, alt), embedded Sanity ids, the title anywhere. */
export function bookstoreHits(html) {
	const hits = [];
	for (const m of html.matchAll(/<div data-card="([^"]*)"(?: data-key="([^"]*)")?[\s\S]*?alt="([^"]*)"/g)) {
		const id = unesc(m[1]).split('|')[0];
		if (isDnp({ _id: id, title: unesc(m[3]) }) || isDnp({ title: id }) || (m[2] && isDnp({ title: m[2] })))
			hits.push(`card ${m[1]}`);
	}
	for (const r of LIST.titles) {
		if (html.includes(r.sanityId)) hits.push(`sanity id ${r.sanityId} (${r.title})`);
		if (titleRe(r.title).test(html)) hits.push(`title text "${r.title}"`);
	}
	return hits;
}

/** DNP lines in an llms text (any "- /books/<slug>/ — <title> by ..." entry naming one). */
export function llmsHits(text) {
	return text
		.split('\n')
		.filter((l) => l.startsWith('- /books/'))
		.filter((l) => {
			const m = /^- \/books\/([^/]+)\/ — (.*?)(?: by |\. )/.exec(l);
			return m && (isDnp({ slug: m[1] }) || isDnp({ title: m[2] }));
		});
}

/** DNP items in a merchant feed. */
export function feedHits(xml) {
	return [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)]
		.map((m) => m[0])
		.filter((it) => {
			const title = unesc(/<title>([\s\S]*?)<\/title>/.exec(it)?.[1] ?? '').replace(
				/ \((Hardcover|Hardback|Paperback|eBook|Audiobook)\)$/,
				'',
			);
			const slug = /<g:item_group_id>([^<]*)</.exec(it)?.[1];
			return isDnp({ title, slug });
		});
}

const built = fs.existsSync('dist/bookstore/index.html');
const storePages = built
	? [
			'dist/bookstore/index.html',
			...fs
				.readdirSync('dist/bookstore', { withFileTypes: true })
				.filter((d) => d.isDirectory() && fs.existsSync(`dist/bookstore/${d.name}/index.html`))
				.map((d) => `dist/bookstore/${d.name}/index.html`),
		]
	: [];

test('the matcher: every listed title by id, drafts id, title, subtitle form, slug, apostrophe form; never a neighbour', () => {
	assert.equal(LIST.titles.length, 5);
	for (const r of LIST.titles) {
		assert.ok(isDnp({ _id: r.sanityId }), `${r.title} by id`);
		assert.ok(isDnp({ _id: `drafts.${r.sanityId}` }), `${r.title} by drafts id`);
		assert.ok(isDnp({ title: r.title }), `${r.title} by title`);
		assert.ok(isDnp({ title: `${r.title.toUpperCase()}: A Subtitle` }), `${r.title} with a subtitle`);
		assert.ok(isDnp({ slug: slugT(r.title) }), `${r.title} by slug`);
	}
	assert.ok(isDnp({ title: "Your Very Own Children's Book" }), 'straight apostrophe');
	assert.ok(isDnp({ title: 'Why bless Israel' }), 'Sanity casing');
	for (const t of ['The Blessing Trail', 'Ascension Living Beyond', 'How I Became', 'Who Am I?', 'Beloved Identity'])
		assert.ok(!isDnp({ title: t }), `${t} is not excluded`);
});

test(`bookstore: none of the 5 on /bookstore/ or any collection page`, (t) => {
	if (!built) return t.skip('no dist build');
	assert.ok(storePages.length >= 5, `the index + collection pages were found (${storePages.length})`);
	for (const f of storePages) assert.deepEqual(bookstoreHits(fs.readFileSync(f, 'utf8')), [], f);
	console.log(`# checked ${storePages.length} bookstore pages: ${storePages.join(' ')}`);
});

test('book pages: no /books/ page for any of the 5', (t) => {
	if (!fs.existsSync('dist/books')) return t.skip('no dist build');
	for (const r of LIST.titles) assert.ok(!fs.existsSync(`dist/books/${slugT(r.title)}`), `dist/books/${slugT(r.title)}`);
	for (const d of fs.readdirSync('dist/books')) {
		const f = `dist/books/${d}/index.html`;
		if (!fs.existsSync(f)) continue;
		const h1 = unesc((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(fs.readFileSync(f, 'utf8'))?.[1] ?? '').replace(/<[^>]+>/g, ''));
		assert.ok(!isDnp({ slug: d, title: h1.trim() }), `dist/books/${d} is "${h1.trim()}"`);
	}
});

test('merchant feed: no item for any of the 5', (t) => {
	if (!fs.existsSync('dist/merchant-feed.xml')) return t.skip('no dist build');
	assert.deepEqual(feedHits(fs.readFileSync('dist/merchant-feed.xml', 'utf8')), []);
});

for (const f of ['public/llms.txt', 'public/llms-full.txt', 'dist/llms.txt', 'dist/llms-full.txt'])
	test(`${f}: no entry for any of the 5`, (t) => {
		if (!fs.existsSync(f)) return t.skip('not built');
		assert.deepEqual(llmsHits(fs.readFileSync(f, 'utf8')), []);
	});

test('the checks FAIL when a title is injected back (proof each gate can reject)', (t) => {
	if (!built) return t.skip('no dist build');
	const html = fs.readFileSync('dist/bookstore/index.html', 'utf8');
	const card =
		'<div data-card="XbySjk53DxBxwdnL2kwj73" data-key="how i became me" data-colls="smp" class="group"><a href="https://www.amazon.com/dp/B0H7YNTS8V"><img src="x.jpg" alt="How I Became Me"></a></div>';
	const hits = bookstoreHits(html.replace('id="book-grid"', `id="book-grid" data-x="1">${card}<span hidden`));
	assert.ok(hits.includes('card XbySjk53DxBxwdnL2kwj73'), hits.join('; '));
	console.log(`# injected-failure proof (bookstore): ${hits.join('; ')}`);
	const llms = `${fs.readFileSync('public/llms.txt', 'utf8')}\n- /books/why-bless-israel/ — Why Bless Israel by Charles Shefler. x\n`;
	assert.equal(llmsHits(llms).length, 1);
	console.log(`# injected-failure proof (llms): ${llmsHits(llms)[0]}`);
	const feed = '<item><title>The Awakening Glossary (Paperback)</title><g:item_group_id>the-awakening-glossary</g:item_group_id></item>';
	assert.equal(feedHits(feed).length, 1);
	console.log('# injected-failure proof (feed): The Awakening Glossary (Paperback)');
});
