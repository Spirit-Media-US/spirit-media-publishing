// BUILD-CHECK: tool-inventory.py "cover hero height measure" (none measures a web hero) + scripts/ read
// NEAREST: scripts/cover-hero.test.mjs (checks the built HTML's contract; cannot see what the browser draws)
// NOT-REUSED-BECAUSE: the rendered size depends on CSS + layout, so it needs a real browser against a deployed preview;
//   node --test in the build has neither
// APPROVED-BY: Kevin 2026-11-16 brief pmprint-full-page-inspection-20261116 FIXES ("every hero cover renders >= the
//   common height at 1440")
//
// node scripts/cover-hero-measure.mjs <base-url> [slug ...] [--json out.json] [--require-1200]
// Opens every /books/<slug>/ in dist/books (or the slugs given) on <base-url> at 1440x900 and 390x844 (headless
// Chromium) and measures img[data-hero-cover]. PASS at 1440: height >= HERO_H.desktop - 1, or (a landscape cover)
// width >= its column - 1. PASS at 390: no horizontal scroll and height >= min(HERO_H.mobile, column / aspect) - 1.
// Exit 1 on any failure. `--inject-small <slug>` shrinks that page's cover in the browser (the old 340px-wide box) to
// prove the check fails. `--require-1200` (covers v2, 2026-11-16) also fails a page whose hero srcset has no 1200w file.
import fs from 'node:fs';
import { chromium } from '/home/deploy/bin/node_modules/playwright/index.mjs';
import { HERO_H } from '../src/lib/cover-hero.mjs';

const args = process.argv.slice(2);
const opt = (k) => {
	const i = args.indexOf(k);
	if (i < 0) return null;
	const v = args[i + 1];
	args.splice(i, 2);
	return v;
};
const jsonOut = opt('--json');
const inject = opt('--inject-small');
const need1200 = args.includes('--require-1200');
if (need1200) args.splice(args.indexOf('--require-1200'), 1);
const base = (args.shift() ?? '').replace(/\/$/, '');
if (!base) {
	console.error('usage: cover-hero-measure.mjs <base-url> [slug ...] [--json out.json] [--inject-small <slug>]');
	process.exit(2);
}
const DIST = new URL('../dist/books/', import.meta.url).pathname;
const slugs = args.length
	? args
	: fs.readdirSync(DIST).filter((s) => {
			const f = `${DIST}${s}/index.html`;
			return fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('data-hero-cover');
		});

const browser = await chromium.launch();
const out = [];
async function measure(ctx, slug, vw) {
	const p = await ctx.newPage();
	try {
		const res = await p.goto(`${base}/books/${slug}/`, { waitUntil: 'load', timeout: 60000 });
		if (inject === slug)
			await p.addStyleTag({ content: '[data-hero-cover]{width:340px !important;max-width:340px !important;height:auto !important}' });
		const m = await p.evaluate(() => {
			const i = document.querySelector('img[data-hero-cover]');
			if (!i) return null;
			const r = i.getBoundingClientRect();
			const col = i.parentElement.getBoundingClientRect().width;
			const ar = Number(i.getAttribute('width')) / Number(i.getAttribute('height'));
			return { w: r.width, h: r.height, col, ar, src: i.currentSrc, srcset: i.getAttribute('srcset') ?? '', scrollW: document.documentElement.scrollWidth };
		});
		return { status: res?.status(), ...(m ?? { missing: true }) };
	} catch (e) {
		return { error: String(e).slice(0, 160) };
	} finally {
		await p.close();
	}
}
const D = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const M = await browser.newContext({ viewport: { width: 390, height: 844 } });
let i = 0;
const fails = [];
async function worker() {
	while (i < slugs.length) {
		const s = slugs[i++];
		const d = await measure(D, s, 1440);
		const m = await measure(M, s, 390);
		const why = [];
		if (d.missing || d.error || m.missing || m.error) why.push(`not measured (${d.error ?? m.error ?? 'no img[data-hero-cover]'})`);
		else {
			if (!(d.h >= HERO_H.desktop - 1 || d.w >= d.col - 1)) why.push(`1440 ${d.w.toFixed(0)}x${d.h.toFixed(0)} < ${HERO_H.desktop} tall (column ${d.col.toFixed(0)})`);
			if (m.h < Math.min(HERO_H.mobile, m.col / m.ar) - 1) why.push(`390 ${m.w.toFixed(0)}x${m.h.toFixed(0)} short`);
			if (m.scrollW > 390) why.push(`390 horizontal scroll ${m.scrollW}`);
			if (need1200 && !/ 1200w/.test(d.srcset)) why.push('srcset has no 1200w file');
		}
		out.push({ slug: s, d1440: d, m390: m, pass: why.length === 0, why });
		if (why.length) fails.push(`${s}: ${why.join('; ')}`);
	}
}
await Promise.all([worker(), worker(), worker(), worker()]);
await browser.close();
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
console.log(`cover-hero-measure ${base}: ${out.length - fails.length}/${out.length} pass (common height ${HERO_H.desktop}px at 1440)`);
for (const f of fails) console.log(`FAIL ${f}`);
process.exit(fails.length ? 1 : 0);
