// BUILD-CHECK: tool-inventory.py "title length" (nothing near: fhb title MT check, session titling) + grep src/ scripts/
//   for a 60-char title rule: only the inline brand test in books/[slug] and bookstore/[collection].astro
// NEAREST: the inline docTitle line in src/pages/books/[slug]/index.astro (this replaces it) + src/lib/clamp-description.ts
// NOT-REUSED-BECAUSE: the inline line only drops the brand, it cannot shorten a page_title that is itself over 60 or make
//   series titles unique; clamp-description clamps with an ellipsis, which a <title> must not carry. Lifted to a module
//   so the build test (scripts/book-titles.test.mjs) runs the same rule the page does.
// APPROVED-BY: Kevin 2026-11-16 "Check everything and links please" via pmprint brief seo-titles-og-20261116 #1 ("Add a
//   rule or data so every title fits <= 60")
//
// <title> for /books/<slug>/ (pmseoaeo metadata audit 2026-11-16): every title <= 60 characters (what a results page
// shows), the book's own title always first, unique across the site.
//
// THE RULE — the first candidate that fits wins, so a title that already fits is never changed:
//   0. seo_title: hand-written, src/data/books/seo-titles.json (or the ship set's book.seo_title); over 60 fails the build
//   1. page_title + " | Spirit Media Publishing"      (the brand is the least important suffix: dropped first)
//   2. page_title
//   3. page_title without its " by <author>" tail   (+ brand when that fits)
//   4. the book title + the longest PHRASE of the subtitle that fits: cut only before punctuation (, ; : —) or before a
//      joining word (with, for, from, ...), never mid-word, at least two words, no brand, and NEVER A DANGLING CUT
//      (danglingCut below: ends on , & and — or drops the end of a list/pair; pmprint 2026-11-16). A cut that would
//      read broken falls through to 5; write a seo_title when the book deserves more than its bare title.
//   5. the book title (+ brand when that fits)
// Two pages that land on the same title (a series: four "Rightly Dividing the Truth" volumes) are rebuilt from
// "<title>: <subtitle>" through the same ladder so each carries its volume subtitle; still equal = build error.
export const TITLE_MAX = 60;
export const BRAND = ' | Spirit Media Publishing';

const JOIN =
	/^(and|or|with|for|from|through|in|into|on|of|to|by|at|as|&|beyond|without|about)$/i;
const len = (s) => [...s].length;
const tidy = (s) => s.replace(/[\s,;:—–-]+$/, '').trim();
const bare = (w) => w.replace(/^[^\p{L}&]+|[^\p{L}&]+$/gu, '');

/**
 * True when `kept` (what a cut keeps) followed by `dropped` (what it drops) reads as broken: it ends on a separator
 * or coordinator (, ; & and or — –), the dropped tail continues a list or pair (starts with , & and or —), or the kept
 * part opened a list (a comma) whose end is dropped. "Endurance, Hope" / "Walking in Christ—Obedience" /
 * "Healing through Encounters with Jesus" (& Psychology) / "Expanded and Updated" (for the 21st Century Church) are all
 * dangling.
 */
export function danglingCut(kept, dropped) {
	const k = kept.trim();
	const d = (dropped ?? '').trim();
	if (!d) return false;
	if (/[,;&—–:-]$/.test(k) || /\b(and|or)$/i.test(k)) return true;
	if (/^([,;&—–]|and\b|or\b)/i.test(d)) return true;
	// a list (comma) or a pair (and, &, or, a dash) opened in the kept part loses its end or its shared complement
	return /[,—–&]/.test(k) || /\b(and|or)\b/i.test(k);
}

/** The longest prefix of `phrase` that is <= max chars, cut at a phrase boundary, never dangling. null when none fits. */
export function phrasePrefix(phrase, max) {
	if (len(phrase) <= max) return phrase;
	// boundaries: after a word ending in , ; : — or before a joining word (never before an article or "who": that cuts
	// a verb from its object); an em-dash inside a word counts too
	const words = phrase.replace(/—/g, '— ').split(/\s+/);
	let best = null;
	for (let i = 1; i < words.length; i++) {
		const atPunct = /[,;:—–]$/.test(words[i - 1]);
		const atJoin = JOIN.test(bare(words[i]));
		if (!atPunct && !atJoin) continue;
		const cand = tidy(words.slice(0, i).join(' ').replace(/— /g, '—'));
		if (!cand || JOIN.test(bare(cand.split(/\s+/).pop() ?? ''))) continue;
		const raw = words.slice(0, i).join(' ').replace(/— /g, '—');
		if (danglingCut(raw, words.slice(i).join(' ').replace(/— /g, '—'))) continue;
		if (len(cand) <= max) best = cand;
		else break;
	}
	return best;
}

/** All candidates for one page, in order. */
function ladder({ seo_title, page_title, title, subtitle, author }, base) {
	if (seo_title) return [seo_title];
	const out = [];
	const withBrand = (s) => [`${s}${BRAND}`, s];
	const pt = base ?? page_title ?? title;
	out.push(...withBrand(pt));
	const byTail = author ? ` by ${author}` : null;
	if (byTail && pt.endsWith(byTail)) out.push(...withBrand(pt.slice(0, -byTail.length)));
	// title + subtitle phrase: the page title's own "Title: rest" when it starts with the book title, else the subtitle
	const rest = pt.startsWith(`${title}: `) ? pt.slice(title.length + 2) : subtitle;
	if (rest) {
		// no brand here: more of the book's own words beats the brand (a fragment of one word is no phrase)
		const head = `${title}: `;
		const ph = phrasePrefix(rest, TITLE_MAX - len(head));
		if (ph && ph.split(/\s+/).length >= 2) out.push(`${head}${ph}`);
	}
	out.push(...withBrand(title));
	return out;
}

/** The <title> for one book page. */
export function seoTitle(book, base) {
	if (book.seo_title && len(book.seo_title) > TITLE_MAX)
		throw new Error(`seo_title over ${TITLE_MAX}: ${book.slug} "${book.seo_title}" (${len(book.seo_title)})`);
	const hit = ladder(book, base).find((c) => len(c) <= TITLE_MAX);
	if (!hit) throw new Error(`no <title> fits ${TITLE_MAX} for ${book.slug}: book title "${book.title}"`);
	return hit;
}

/** Titles for every page: { slug: title }. Duplicates are rebuilt from title + subtitle; any left fail the build. */
export function seoTitles(books) {
	const out = new Map(books.map((b) => [b.slug, seoTitle(b)]));
	const dupes = () => {
		const by = new Map();
		for (const [slug, t] of out) by.set(t.toLowerCase(), [...(by.get(t.toLowerCase()) ?? []), slug]);
		return [...by.values()].filter((s) => s.length > 1).flat();
	};
	for (const slug of dupes()) {
		const b = books.find((x) => x.slug === slug);
		if (b.subtitle && !b.seo_title) out.set(slug, seoTitle(b, `${b.title}: ${b.subtitle}`));
	}
	const left = dupes();
	if (left.length)
		throw new Error(`duplicate <title> on book pages: ${left.map((s) => `${s} "${out.get(s)}"`).join(', ')}`);
	return Object.fromEntries(out);
}
