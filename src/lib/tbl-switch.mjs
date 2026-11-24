// BUILD-CHECK: searched "tbl redirect switchover" (bin/tool-inventory.py 2026-11-22) + grep of SMP src/ scripts/ for
//   "thebelieverslibrary" -> nothing maps SMP book pages to TBL.
// NEAREST: src/lib/xsite.ts (sister-site link labels; it does not map URLs) and the smp-worldwide-retire hook in
//   astro.config.mjs (appends one fixed 301 to dist/_redirects; this reuses that same append pattern).
// NOT-REUSED-BECAUSE: site source (a slug -> URL map read by the bookstore cards and the redirect hook), not a tool.
// APPROVED-BY: TBL brief tbl-run-c-store-20261122.md piece C6 (queue noah/15c7800c; Kevin 2026-11-22 "GO" on the
//   TBL plan) — switched only after Kevin approves the preview.
//
// TBL SWITCH-OVER (CONTRACT v2 decisions 59 + 61: TBL is the ONE store; SMP is a front door that links in).
// Data: src/data/tbl-switchover.json (`origin` = the ONE place the TBL domain lives; `slugs` = SMP books with a live
// TBL page; `enabled: false` = everything below is a no-op and the site behaves as before).
// Used by: astro.config.mjs (the 301s, appended to dist/_redirects; mapped pages left out of the sitemap) and
// src/components/BookstoreBody.astro (bookstore + homepage cards link to TBL). NOT touched: the SMP store functions
// (functions/store-checkout.ts, store-webhook.ts keep selling + fulfilling) and functions/ebook-download.ts (old
// emailed links keep working). Test: scripts/tbl-switch.test.mjs.

/** data = tbl-switchover.json -> { on, origin, host, has(slug), bookUrl(slug), href(h), isTbl(h), redirectLines() } */
export function tblSwitch(data) {
	const on = Boolean(data?.enabled);
	const origin = String(data?.origin ?? '').replace(/\/+$/, '');
	const host = origin ? new URL(origin).host : '';
	const slugs = new Set(on ? (data?.slugs ?? []) : []);
	const has = (slug) => slugs.has(slug);
	const bookUrl = (slug) => (has(slug) ? `${origin}/books/${slug}` : null);
	// an SMP book-page href ("/books/<slug>/", optional #fragment) -> its TBL page; anything else unchanged
	const href = (h) => {
		const m = /^\/books\/([a-z0-9-]+)\/?(?:#.*)?$/.exec(String(h ?? ''));
		return (m && bookUrl(m[1])) || h;
	};
	const isTbl = (h) => {
		const m = /^(?:https?:)?\/\/(?:www\.)?([^/:?#]+)/i.exec(String(h ?? ''));
		return Boolean(host && m && m[1].toLowerCase() === host);
	};
	// both spellings, as public/_redirects writes every other rule
	const redirectLines = () =>
		[...slugs].flatMap((s) => [`/books/${s}/ ${bookUrl(s)} 301`, `/books/${s} ${bookUrl(s)} 301`]);
	return { on, origin, host, has, bookUrl, href, isTbl, redirectLines };
}

// ── PARITY GATE (brief tbl-book-page-parity 2026-11-23; Kevin 11-23 "listings on TBL cover less than listings on SMP") ──
// The switch-over may only ENABLE when every mapped SMP book page is matched on TBL: every content section, image, FAQ,
// related book, format + price, order-box promise and schema field (projects/tbl-launch/store-audit/tools/slug_parity.py
// `parity`). Its parity.json is copied to src/data/tbl-parity.json. FAILS CLOSED: enabled + any doubt = the build throws.
export const PARITY_MAX_AGE_DAYS = 7;
const sha256 = async (s) => {
	const { createHash } = await import('node:crypto');
	return createHash('sha256').update(s).digest('hex');
};
/** Problems that forbid enabling (empty = may enable). data = tbl-switchover.json, report = tbl-parity.json or null. */
export async function parityProblems(data, report, now = new Date()) {
	if (!data?.enabled) return [];
	const p = [];
	if (!report) return ['no parity report (src/data/tbl-parity.json): run slug_parity.py parity against the TBL origin'];
	const origin = String(data.origin ?? '').replace(/\/+$/, '');
	if (report.tbl_origin !== origin) p.push(`report measured ${report.tbl_origin}, switch-over origin is ${origin}`);
	if (report.partial) p.push('report is a partial (--only) run');
	if (report.fetch_errors) p.push(`${report.fetch_errors} page(s) could not be fetched`);
	const age = (now - new Date(report.generated_at)) / 86400000;
	if (!(age >= 0 && age <= PARITY_MAX_AGE_DAYS)) p.push(`report generated ${report.generated_at} (older than ${PARITY_MAX_AGE_DAYS} days or invalid)`);
	const slugs = [...(data.slugs ?? [])];
	if (report.slugs_sha256 !== (await sha256([...slugs].sort().join('\n')))) p.push('report was run on a different slug list');
	for (const s of slugs) {
		const b = report.books?.[s];
		if (!b) p.push(`${s}: not in the report`);
		else if (b.pass !== true) p.push(`${s}: below parity (${Object.keys(b.missing ?? {}).join(', ') || 'unknown'})`);
	}
	return p;
}
/** Throws (the build stops) unless parity allows the switch-over to be enabled. */
export async function assertParity(data, report, now = new Date()) {
	const p = await parityProblems(data, report, now);
	if (p.length) throw new Error(`TBL switch-over REFUSED (parity gate), ${p.length} problem(s):\n  ${p.slice(0, 20).join('\n  ')}`);
}
