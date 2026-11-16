// BUILD-CHECK: tool-inventory.py "cover hero height measure" (25 hits, all print-cover/colour tools; none sizes a web hero)
//   + ls src/lib (clamp-description, do-not-publish, pagespeed, sanity: none touches the hero)
// NEAREST: the inline hero <img> in src/pages/books/[slug]/index.astro (a fixed 340px WIDTH box)
// NOT-REUSED-BECAUSE: the rule must be shared by the page, its build test and the Playwright check, so the numbers live
//   in one module instead of three copies; the page keeps the markup, this only holds the arithmetic
// APPROVED-BY: Kevin 2026-11-16 brief pmprint-full-page-inspection-20261116 FIXES ("cover size rule test: every hero
//   cover renders >= the common height at 1440"; "Perfer larger as possible")
//
// HERO COVER SIZE RULE (Kevin 2026-11-16: "Some of the covers a bigger which is better on desktop. Others are smaller.
// Perfer larger as possible."). Every book page's hero cover is drawn to ONE common height, its width following its own
// aspect, and never wider than the hero column. Before this the box was a fixed 340px WIDTH, so a 2:3 3D render stood
// 475px tall and a square picture book 343px. Shared by the page (src/pages/books/[slug]/index.astro), its build test
// (scripts/cover-hero.test.mjs) and the Playwright check (scripts/cover-hero-measure.mjs).
//
// HERO_H.desktop = 490: the tallest cover today was 475 (a 2:3 3D render at 340 wide). The hero column at >=1024px is
// (max-w-5xl 1024 - gap 40) / 2 = 492px, and the squarest 3D render (600x617) at 490 tall is 477 wide, so 490 is the
// tallest height every square picture book can reach without leaving its column. Only a LANDSCAPE cover (wider than
// tall) is width-bound below 490; it then fills the column's full width instead.
// HERO_H.mobile = 336: the tallest cover at 390 today (240 wide 2:3) was 335, so no 2:3 cover shrinks and square
// covers grow from 240 to ~330 (the 390 column is 358).
// The 3D sources are 600px wide, so neither height upscales past the file at 1x; a 1200w file joins the srcset
// when the title has one (cover-sized.json hero3d.w1200).
export const HERO_H = { desktop: 490, mobile: 336 };
export const HERO_COL = { desktop: 492, mobile: 358 };
export const HERO_BP = 768; // md: the two-column hero starts here

/** aspect = width / height of the cover file (falls back to 2:3 when unknown) */
export function heroAspect(w, h) {
	return w > 0 && h > 0 ? w / h : 2 / 3;
}

/** The rendered width (CSS px) at the widest layout for each breakpoint: min(column, commonHeight x aspect). */
export function heroWidths(w, h) {
	const ar = heroAspect(w, h);
	return {
		desktop: Math.round(Math.min(HERO_COL.desktop, HERO_H.desktop * ar)),
		mobile: Math.round(Math.min(HERO_COL.mobile, HERO_H.mobile * ar)),
	};
}

/** img sizes attribute matching what is drawn, so the browser picks the right file */
export function heroSizes(w, h) {
	const x = heroWidths(w, h);
	return `(min-width: ${HERO_BP}px) ${x.desktop}px, ${x.mobile}px`;
}

/** srcset: 300 / 600 and the 1200 file when the title has one */
export function heroSrcset(cover) {
	if (!cover?.w300) return undefined;
	return [`${cover.w300} 300w`, `${cover.src} 600w`, cover.w1200 ? `${cover.w1200} 1200w` : null].filter(Boolean).join(', ');
}

/** inline style carrying the aspect into the .book-cover CSS rule */
export function heroStyle(w, h) {
	return `--ar: ${heroAspect(w, h).toFixed(4)};`;
}
