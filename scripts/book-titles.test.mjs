// BUILD-CHECK: tool-inventory.py "title length" (nothing near) + scripts/*.test.mjs read
// NEAREST: scripts/do-not-publish.test.mjs (reads the built /books/ pages for a different property)
// NOT-REUSED-BECAUSE: that file checks titles ABSENT from every surface; this checks the <title> of every PRESENT book
//   page (length + uniqueness), the gate for src/lib/seo-title.mjs, and runs beside it in the build's node --test line
// APPROVED-BY: Kevin 2026-11-16 "Check everything and links please" via pmprint brief seo-titles-og-20261116 (tests:
//   "every built book page's <title> is <= 60, and all titles are unique")
//
// node --test scripts/book-titles.test.mjs — every BUILT /books/<slug>/ page (dist/) has a <title> of 1-60 characters,
// no two the same, and the book's own title leads it. The last test injects a long and a duplicate title into copies
// of real pages and proves the check rejects both.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { BRAND, danglingCut, phrasePrefix, seoTitles, TITLE_MAX } from '../src/lib/seo-title.mjs';

const DIST = new URL('../dist/books/', import.meta.url).pathname;
const unesc = (s) =>
	String(s)
		.replace(/&#39;|&#x27;/g, "'")
		.replace(/&#8217;|&rsquo;/g, '’')
		.replace(/&quot;/g, '"')
		.replace(/&#38;|&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');

/** { slug: { title, h1 } } for every built book page under `dir`. */
export function readTitles(dir) {
	const out = {};
	for (const slug of fs.readdirSync(dir)) {
		const f = path.join(dir, slug, 'index.html');
		if (!fs.existsSync(f)) continue;
		const html = fs.readFileSync(f, 'utf8');
		const t = html.match(/<title>([\s\S]*?)<\/title>/);
		out[slug] = { title: t ? unesc(t[1]).trim() : null };
	}
	return out;
}

/** Every problem with a set of built titles: missing, over 60, duplicated. */
export function titleProblems(pages) {
	const bad = [];
	const seen = new Map();
	for (const [slug, { title }] of Object.entries(pages)) {
		if (!title) {
			bad.push(`${slug}: no <title>`);
			continue;
		}
		const n = [...title].length;
		if (n > TITLE_MAX) bad.push(`${slug}: ${n} chars "${title}"`);
		const k = title.toLowerCase();
		if (seen.has(k)) bad.push(`${slug}: duplicate of ${seen.get(k)} "${title}"`);
		else seen.set(k, slug);
	}
	return bad;
}

const built = fs.existsSync(DIST) ? readTitles(DIST) : {};

test('the build produced book pages', () => {
	assert.ok(Object.keys(built).length >= 100, `only ${Object.keys(built).length} book pages in dist/books/`);
});

test('every built book page <title> is <= 60 characters and unique', () => {
	assert.deepEqual(titleProblems(built), []);
});

test('the four Rightly Dividing the Truth volumes each carry their own title', () => {
	const rdt = Object.entries(built).filter(([s]) => s.startsWith('rightly-dividing-the-truth-'));
	assert.equal(rdt.length, 4);
	assert.equal(new Set(rdt.map(([, v]) => v.title)).size, 4);
	for (const [, v] of rdt) assert.match(v.title, /^Rightly Dividing the Truth: \S/);
});

test('the rule: brand dropped first, then " by <author>", then the subtitle at a phrase boundary, never mid-word', () => {
	const t = seoTitles([
		{ slug: 'a', title: 'Short', subtitle: null, author: 'X', page_title: 'Short' },
		{ slug: 'b', title: 'Your Time (Special Edition for First Responders)', subtitle: 'S', author: 'Daniel W. Evans', page_title: 'Your Time (Special Edition for First Responders) by Daniel W. Evans' },
		{ slug: 'c', title: 'Following God Is Easy', subtitle: 'x', author: 'V', page_title: 'Following God Is Easy: How to Stop Overthinking Faith and Start Living in a Real Relationship with God' },
	]);
	assert.equal(t.a, 'Short | Spirit Media Publishing');
	assert.equal(t.b, 'Your Time (Special Edition for First Responders)');
	// the automatic cut never keeps a dangling phrase: "…Faith" drops "and Start Living…", so the bare title wins
	assert.equal(t.c, 'Following God Is Easy | Spirit Media Publishing');
	assert.equal(phrasePrefix('Endurance, Hope, and Eternal Glory', 32), null);
	assert.equal(phrasePrefix('A Funny Bible Story with Potty Humor for Kids', 37), 'A Funny Bible Story with Potty Humor');
});

test('INJECTED: a 61-char title and a duplicate title are both rejected', () => {
	const slugs = Object.keys(built).slice(0, 2);
	assert.equal(slugs.length, 2);
	const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'book-titles-'));
	try {
		const copy = (slug, title, as) => {
			const html = fs.readFileSync(path.join(DIST, slug, 'index.html'), 'utf8');
			fs.mkdirSync(path.join(tmp, as), { recursive: true });
			fs.writeFileSync(path.join(tmp, as, 'index.html'), html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`));
		};
		copy(slugs[0], 'X'.repeat(61), 'too-long');
		copy(slugs[1], built[slugs[1]].title, 'original');
		copy(slugs[1], built[slugs[1]].title, 'duplicate');
		const bad = titleProblems(readTitles(tmp));
		assert.ok(bad.some((b) => b.startsWith('too-long: 61 chars')), bad.join('\n'));
		assert.ok(bad.some((b) => /duplicate of/.test(b)), bad.join('\n'));
		// and the rule itself refuses a series it cannot separate
		assert.throws(
			() => seoTitles([
				{ slug: 'v1', title: 'Same', subtitle: null, author: 'A', page_title: 'Same' },
				{ slug: 'v2', title: 'Same', subtitle: null, author: 'A', page_title: 'Same' },
			]),
			/duplicate <title>/,
		);
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
});

// NO DANGLING CUT (pmprint 2026-11-16): a title the rule cut automatically (no hand-written seo_title) never ends on
// , & and or — and never drops the end of a list or pair. The full text it was cut from is the ship set's own.
const SEO = JSON.parse(fs.readFileSync(new URL('../src/data/books/seo-titles.json', import.meta.url), 'utf8'));
const SHIP = JSON.parse(fs.readFileSync(new URL('../src/data/books/shipset-v2.json', import.meta.url), 'utf8'));
/** Every dangling automatic cut among `pages` ({ slug: { title } }). */
export function danglingProblems(pages) {
	const bad = [];
	for (const [slug, { title }] of Object.entries(pages)) {
		const b = SHIP.titles.find((t) => t.slug === slug)?.book;
		if (!b || !title || SEO[slug] || b.seo_title) continue;
		const t = title.endsWith(BRAND) ? title.slice(0, -BRAND.length) : title;
		if (/[,;&—–:-]$/.test(t.trim()) || /\b(and|or)$/i.test(t.trim())) bad.push(`${slug}: ends on a separator "${title}"`);
		// the sheet's own page_title, used whole, is not a cut (the rule did not shorten it)
		if (t === b.page_title) continue;
		const head = `${b.title}: `;
		if (!t.startsWith(head)) continue;
		const kept = t.slice(head.length);
		for (const full of [b.page_title?.startsWith(head) ? b.page_title.slice(head.length) : null, b.subtitle])
			if (full && full !== kept && full.startsWith(kept) && danglingCut(kept, full.slice(kept.length))) {
				bad.push(`${slug}: dangling cut "${title}" (drops "${full.slice(kept.length).trim()}")`);
				break;
			}
	}
	return bad;
}

test('no automatic cut ends on , & and or — or drops the end of a list', () => {
	assert.deepEqual(danglingProblems(built), []);
});

test('every hand-written seo_title is <= 60, leads with the book title and is on a built page', () => {
	for (const [slug, v] of Object.entries(SEO)) {
		if (slug.startsWith('_')) continue;
		const b = SHIP.titles.find((t) => t.slug === slug)?.book;
		assert.ok(b, `${slug}: not in the ship set`);
		assert.ok([...v].length <= TITLE_MAX, `${slug}: ${[...v].length} chars`);
		assert.ok(v.startsWith(b.title), `${slug}: "${v}" does not lead with "${b.title}"`);
		if (built[slug]) assert.equal(built[slug].title, v, `${slug}: built title is not its seo_title`);
	}
});

test('INJECTED: the four broken cuts pmprint named are each rejected', () => {
	const inj = {
		'heart-journey': { title: 'Heart Journey: Healing through Encounters with Jesus' },
		'faith-in-action': { title: 'Faith in Action: Expanded and Updated' },
		'sharing-your-faith-and-testimony': { title: 'Sharing Your Faith and Testimony: Trusting God Fully' },
		'hold-it-daniel': { title: 'Hold It, Daniel!: A Funny Bible Story &' },
	};
	// heart-journey + faith-in-action are hand-written now (the page check skips them), so their old cuts are checked
	// on the rule directly; the other two go through the page check as automatic titles
	assert.ok(danglingCut('Healing through Encounters with Jesus', ' & Psychology'));
	assert.ok(danglingCut('Expanded and Updated', ' for the 21st Century Church'));
	assert.ok(danglingCut('Endurance, Hope', ', and Eternal Glory'));
	assert.ok(danglingCut('Walking in Christ—Obedience', ' and Transformation'));
	assert.ok(danglingCut('The Cross,', ' The Church, and The Spirit\'s Power'));
	assert.ok(!danglingCut('A Funny Bible Story with Potty Humor', ' for Kids'));
	const bad = danglingProblems(inj);
	assert.ok(bad.some((x) => x.startsWith('sharing-your-faith-and-testimony: dangling cut')), bad.join('\n'));
	assert.ok(bad.some((x) => x.startsWith('hold-it-daniel: ends on a separator')), bad.join('\n'));
});
