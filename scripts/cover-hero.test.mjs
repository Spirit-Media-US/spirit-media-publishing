// BUILD-CHECK: tool-inventory.py "cover hero height measure" (none sizes a web hero) + scripts/*.test.mjs read
// NEAREST: scripts/do-not-publish.test.mjs (reads every built /books/ page) — a different property (absence of titles)
// NOT-REUSED-BECAUSE: this asserts the hero cover's SIZE contract on every built book page; it shares the dist reader
//   pattern, not the assertion, and runs beside it in the build's node --test line
// APPROVED-BY: Kevin 2026-11-16 brief pmprint-full-page-inspection-20261116 FIXES ("cover size rule test")
//
// node --test scripts/cover-hero.test.mjs — every BUILT book page (dist/books/<slug>/index.html) draws its hero cover
// by the one rule in src/lib/cover-hero.mjs: img[data-hero-cover] with class book-cover, --ar = its own width/height,
// sizes = heroSizes(width, height), and the 1200 file of the same picture in srcset whenever cover-sized.json has one.
// The built CSS carries the common heights (490px desktop / 336px mobile, never vh). The last test injects a smaller
// cover (the old fixed 340px box) and proves the check rejects it. The rendered size is measured separately with
// Playwright: scripts/cover-hero-measure.mjs <base-url>.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { HERO_H, heroAspect, heroSizes } from '../src/lib/cover-hero.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SIZED = JSON.parse(fs.readFileSync(new URL('../src/data/books/cover-sized.json', import.meta.url), 'utf8')).covers;
const attr = (tag, a) => {
	const m = tag.match(new RegExp(`\\s${a}="([^"]*)"`));
	return m ? m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'") : null;
};

/** the 1200 file a title has for its hero picture, or null */
export function expected1200(slug) {
	const sz = SIZED[slug];
	if (!sz) return null;
	return sz.hero3d ? sz.hero3d.w1200 ?? null : sz.jpg1200 ?? null;
}

/** Every rule break in one built page's HTML (empty = passes). */
export function heroErrors(html, slug) {
	const errs = [];
	const tags = html.match(/<img\b[^>]*\bdata-hero-cover\b[^>]*>/g) ?? [];
	if (tags.length !== 1) return [`${slug}: ${tags.length} img[data-hero-cover] (want 1)`];
	const t = tags[0];
	const w = Number(attr(t, 'width'));
	const h = Number(attr(t, 'height'));
	if (!(w > 0 && h > 0)) errs.push(`${slug}: explicit width/height missing (${w}x${h})`);
	if (!/\bbook-cover\b/.test(attr(t, 'class') ?? '')) errs.push(`${slug}: no book-cover class`);
	if (/max-w-\[/.test(attr(t, 'class') ?? '')) errs.push(`${slug}: a fixed max-width box on the cover`);
	const ar = (attr(t, 'style') ?? '').match(/--ar:\s*([\d.]+)/);
	if (!ar || Math.abs(Number(ar[1]) - heroAspect(w, h)) > 0.001) errs.push(`${slug}: --ar ${ar?.[1]} != ${heroAspect(w, h).toFixed(4)}`);
	const src = attr(t, 'srcset');
	if (src && attr(t, 'sizes') !== heroSizes(w, h)) errs.push(`${slug}: sizes "${attr(t, 'sizes')}" != "${heroSizes(w, h)}"`);
	const x = expected1200(slug);
	if (x && !(src ?? '').includes(`${x} 1200w`)) errs.push(`${slug}: the 1200 file exists (${x}) but is not in srcset`);
	return errs;
}

const pages = fs.existsSync(path.join(DIST, 'books'))
	? fs
			.readdirSync(path.join(DIST, 'books'))
			.filter((s) => fs.existsSync(path.join(DIST, 'books', s, 'index.html')))
			.filter((s) => /data-hero-cover|book-cover/.test(fs.readFileSync(path.join(DIST, 'books', s, 'index.html'), 'utf8')) || SIZED[s])
	: [];

test('the built site has book pages to check', () => {
	assert.ok(pages.length > 0, 'no dist/books/<slug>/index.html (run astro build first)');
});

test('every built book page draws its hero cover by the one rule', () => {
	const errs = pages.flatMap((s) => heroErrors(fs.readFileSync(path.join(DIST, 'books', s, 'index.html'), 'utf8'), s));
	assert.deepEqual(errs, [], `${errs.length} hero rule breaks:\n${errs.join('\n')}`);
});

test('the built CSS carries the common heights in px (never vh)', () => {
	const css = fs
		.readdirSync(path.join(DIST, '_astro'))
		.filter((f) => f.endsWith('.css'))
		.map((f) => fs.readFileSync(path.join(DIST, '_astro', f), 'utf8'))
		.join('\n');
	const html = fs.readFileSync(path.join(DIST, 'books', pages[0], 'index.html'), 'utf8');
	const all = `${css}\n${html}`;
	const rules = all.match(/\.book-cover[^{]*\{[^}]*\}/g) ?? [];
	assert.ok(rules.some((r) => new RegExp(`--hh:\\s*${HERO_H.mobile}px`).test(r)), `no .book-cover --hh:${HERO_H.mobile}px rule`);
	assert.ok(rules.some((r) => new RegExp(`--hh:\\s*${HERO_H.desktop}px`).test(r)), `no .book-cover --hh:${HERO_H.desktop}px rule`);
	assert.ok(!rules.some((r) => /\d(s|d|l)?vh\b/.test(r)), 'a vh unit in the hero cover rule');
});

test('INJECTED: a smaller cover (the old fixed 340px box) and a dropped 1200 file are rejected', () => {
	const slug = pages[0];
	const good = fs.readFileSync(path.join(DIST, 'books', slug, 'index.html'), 'utf8');
	assert.deepEqual(heroErrors(good, slug), []);
	const old = good.replace(/(<img\b[^>]*\bdata-hero-cover\b[^>]*>)/, (t) =>
		t.replace(/\sclass="[^"]*"/, ' class="h-auto w-full max-w-[340px]"').replace(/\ssizes="[^"]*"/, ' sizes="(min-width: 768px) 340px, 240px"'),
	);
	const e = heroErrors(old, slug);
	assert.ok(e.some((x) => x.includes('no book-cover class')), e.join('\n'));
	assert.ok(e.some((x) => x.includes('sizes')), e.join('\n'));
	// a title WITH a 1200 file whose srcset lost it
	const fake = 'https://example.invalid/x-3d-1200.webp';
	SIZED[slug] = { ...SIZED[slug], hero3d: { ...(SIZED[slug]?.hero3d ?? {}), w1200: fake } };
	assert.ok(heroErrors(good, slug).some((x) => x.includes('1200')), 'a missing 1200 file was not caught');
});
