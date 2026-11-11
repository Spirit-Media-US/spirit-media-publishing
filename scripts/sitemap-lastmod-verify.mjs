// Post-build gate (2tp): the sitemap's <lastmod> values must be real per-page dates, never one
// shared build timestamp. Fails when >1 URL is listed and every lastmod is identical (or when
// any lastmod is not a valid date). Run: node scripts/sitemap-lastmod-verify.mjs [dir]
// Failure path: node scripts/sitemap-lastmod-verify.mjs --selftest
import fs from 'node:fs';
import path from 'node:path';

export function check(xml) {
	const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
	const mods = urls.map((u) => (u.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1]).filter(Boolean);
	const problems = [];
	if (urls.length < 2) problems.push(`only ${urls.length} URL(s) in sitemap`);
	for (const m of mods) if (Number.isNaN(Date.parse(m))) problems.push(`invalid lastmod ${m}`);
	if (mods.length > 1 && new Set(mods).size === 1) problems.push(`all ${mods.length} URLs share one lastmod (${mods[0]})`);
	return { urls: urls.length, withLastmod: mods.length, distinct: new Set(mods).size, problems };
}

if (process.argv[2] === '--selftest') {
	const mk = (ds) => `<urlset>${ds.map((d, i) => `<url><loc>https://x/${i}/</loc><lastmod>${d}</lastmod></url>`).join('')}</urlset>`;
	const bad = check(mk(['2026-11-11T12:00:00Z', '2026-11-11T12:00:00Z', '2026-11-11T12:00:00Z']));
	const good = check(mk(['2026-11-11', '2026-10-02', '2026-09-01']));
	if (!bad.problems.length || good.problems.length) {
		console.error('selftest FAILED', { bad, good });
		process.exit(1);
	}
	console.log('selftest ok: uniform lastmod rejected, varied accepted');
} else {
	const dir = path.resolve(process.argv[2] || 'dist');
	const idx = fs.readdirSync(dir).filter((f) => /^sitemap-\d+\.xml$/.test(f));
	if (!idx.length) {
		console.error('sitemap-verify: no sitemap-N.xml in', dir);
		process.exit(1);
	}
	const xml = idx.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
	const r = check(xml);
	console.log(`sitemap-verify: ${r.urls} URLs, ${r.withLastmod} with lastmod, ${r.distinct} distinct`);
	if (r.problems.length) {
		console.error('sitemap-verify FAILED:', r.problems.join('; '));
		process.exit(1);
	}
}
