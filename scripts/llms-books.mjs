// BUILD-CHECK: searched tool-inventory.py "llms" (nothing) + /srv/sites/FHB/scripts, /srv/sites/community/scripts
// NEAREST: /srv/sites/FHB/scripts/llms-answer-pages.mjs (same GENERATED-block + apply() pattern, copied here)
// NOT-REUSED-BECAUSE: it lives in the FHB repo and collects FHB src/pages folders + FHB books.json; it cannot read
//   SMP's pages-live.json switch or the SMP ship set, and a cross-repo import would break SMP's standalone build
// APPROVED-BY: pmseoaeo brief pmprint-smp-growth-20261116 #1 (Kevin L1138 "SEO plan improvements ship")
//
// Book-page index for public/llms.txt and public/llms-full.txt.
// WHY: both files were hand-written and listed 0 of the live /books/<slug>/ pages, so AI engines that read llms.txt
// never saw a single SMP book. The list is DERIVED from src/data/books/pages-live.json (the BOOK PAGES SWITCH, the
// same list the page route builds) on every build, with each book's one-line description from the same data the
// page uses (store-engine books.json for the FHB-owned titles, the ship set for the rest). Never hand-edit the block.
// Test: scripts/llms-books.test.mjs fails if any live page is missing from either file.
import fs from 'node:fs';
import path from 'node:path';
import { dnpMatcher } from '../src/lib/do-not-publish.mjs';

export const BEGIN =
	'<!-- GENERATED:book-pages (scripts/llms-books.mjs — edit the script or the book data, not this block) -->';
export const END = '<!-- /GENERATED:book-pages -->';
export const FILES = ['llms.txt', 'llms-full.txt'];

const readJson = (root, rel) => JSON.parse(fs.readFileSync(path.resolve(root, rel), 'utf8'));
// the page's own copy gate strips this tail (src/pages/books/[slug]/index.astro copy()); do the same
const strip = (s) =>
	String(s ?? '')
		.replace(/,?\s+per the Doc\b/gi, '')
		.replace(/\s+/g, ' ')
		.trim();

// DO NOT PUBLISH (Kevin 2026-11-16 "These should NOT show on SMP at all"): src/data/books/do-not-publish.json
const dnp = (root) => dnpMatcher(readJson(root, 'src/data/books/do-not-publish.json'));

export function liveSlugs(root = process.cwd()) {
	const isDnp = dnp(root);
	return readJson(root, 'src/data/books/pages-live.json').slugs.filter((slug) => !isDnp({ slug }));
}

/** One entry per live page: { slug, url, title, author, description }. Throws if a live slug has no data. */
export function collect(root = process.cwd()) {
	const engine = readJson(root, 'src/store-engine/data/books.json').books;
	const set = readJson(root, 'src/data/books/shipset-v2.json').titles;
	const bySlug = new Map();
	for (const b of engine)
		bySlug.set(b.slug, { title: b.title, author: b.author?.name, desc: b.short });
	for (const t of set)
		if (!bySlug.has(t.slug))
			bySlug.set(t.slug, {
				title: t.book.title,
				author: t.book.author?.name,
				desc: t.book.short || t.book.meta,
			});
	return liveSlugs(root)
		.map((slug) => {
			const b = bySlug.get(slug);
			if (!b)
				throw new Error(
					`llms-books: live slug "${slug}" has no book data (engine books.json or shipset-v2.json)`,
				);
			return {
				slug,
				url: `/books/${slug}/`,
				title: strip(b.title),
				author: strip(b.author),
				description: strip(b.desc),
			};
		})
		.filter((e) => !dnp(root)({ slug: e.slug, title: e.title }))
		.sort((a, b) => a.title.localeCompare(b.title));
}

const join = (title) => (/[.!?…]$/.test(title) ? `${title} ` : `${title}. `);
export function render(entries) {
	const out = [
		BEGIN,
		'## Books (every live book page, generated from the site on each build)',
		'',
		'Books published by Spirit Media Publishing, each with its own page:',
		'',
	];
	for (const e of entries)
		out.push(
			`- ${e.url} — ${join(`${e.title}${e.author ? ` by ${e.author}` : ''}`)}${e.description}`.trimEnd(),
		);
	out.push('', END);
	return out.join('\n');
}

// Replace the block in `text`, or insert it before "## Contact" the first time.
export function apply(text, block) {
	const a = text.indexOf(BEGIN);
	const b = text.indexOf(END);
	if (a !== -1 && b > a) return text.slice(0, a) + block + text.slice(b + END.length);
	const c = text.indexOf('\n## Contact');
	if (c === -1) throw new Error('llms-books: no "## Contact" anchor to insert the book-pages block');
	return `${text.slice(0, c + 1)}${block}\n\n${text.slice(c + 1)}`;
}

/** The live /books/ URLs missing from an llms text (the test's assertion, exported so it can be proven to fail). */
export function missing(text, slugs) {
	return slugs.filter((s) => !text.includes(`- /books/${s}/ — `));
}

export function generate(root = process.cwd()) {
	const entries = collect(root);
	const block = render(entries);
	const res = {};
	for (const name of FILES) {
		const f = path.resolve(root, 'public', name);
		const cur = fs.readFileSync(f, 'utf8');
		const next = apply(cur, block);
		if (next !== cur) fs.writeFileSync(f, next);
		res[name] = entries.length;
	}
	return res;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log('llms-books', generate());
