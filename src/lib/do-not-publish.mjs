// DO NOT PUBLISH (Kevin 2026-11-16, kevin-decisions.md: "These should NOT show on SMP at all").
// The list lives in src/data/books/do-not-publish.json; this is the ONE matcher every surface uses:
// the bookstore cards + Published Titles count (BookstoreBody.astro), the /books/<slug>/ route, llms.txt
// (scripts/llms-books.mjs) and the merchant feed (scripts/gen-merchant-feed.mjs). The Sanity documents stay as they
// are; a card is excluded by its Sanity id (with or without the drafts. prefix) or by its title / display title
// (exact, or the part before a subtitle colon, after normalising case, accents, quotes and punctuation).
// Test: scripts/do-not-publish.test.mjs.

/** lower-case, accents and punctuation folded to single spaces (curly and straight apostrophes match) */
export const normT = (t) =>
	String(t ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/['’‘`]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

/** the URL slug a title would get */
export const slugT = (t) => normT(t).replace(/ /g, '-');

/** list = do-not-publish.json; returns (book) => true when the book must not show. book: { _id?, title?, display_title?, slug? } */
export function dnpMatcher(list) {
	const rows = list?.titles ?? [];
	const ids = new Set(rows.map((r) => r.sanityId).filter(Boolean));
	const titles = new Set(rows.map((r) => normT(r.title)));
	const slugs = new Set(rows.map((r) => slugT(r.title)));
	const titleHit = (t) => {
		if (!t) return false;
		const n = normT(t);
		return titles.has(n) || titles.has(normT(String(t).split(':')[0]));
	};
	return (b) =>
		!!b &&
		(ids.has(String(b._id ?? '').replace(/^drafts\./, '')) ||
			titleHit(b.title) ||
			titleHit(b.display_title) ||
			(b.slug != null && slugs.has(String(b.slug))));
}
