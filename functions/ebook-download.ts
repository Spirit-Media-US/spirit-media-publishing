// /ebook-download on spiritmediapublishing.com — the SMP shop window's door to the store's ONE eBook download endpoint
// (Kevin 2026-11-16 "We point to our own ebook sales"; Option C: one store, two shop windows).
// BUILD-CHECK: searched ebook download proxy (tool-inventory.py) + ls functions/ in both repos
// NEAREST: FHB functions/ebook-download.ts (the store's ONE download endpoint; this file only forwards to it)
// NOT-REUSED-BECAUSE: that endpoint is reused, not copied: it needs the FHB_EBOOK R2 binding and the webhook secret,
//   which exist only on the FHB Pages project. A Pages Function is the only way an SMP-window buyer's link can stay on
//   spiritmediapublishing.com; this file holds no logic, secret or bucket of its own.
// APPROVED-BY: deploy PM brief pmprint-smp-direct-ebooks-20261116 (Kevin 2026-11-16 P1 "We point to our own ebook sales": the SMP-window download email)
//
// Verification and delivery live in ONE place, FHB functions/ebook-download.ts: it checks the signed link
// (FHB src/lib/ebookLink.ts), re-reads the Stripe session (paid + ebook_direct + this SKU) and streams the EPUB from the
// private R2 bucket. This only forwards the link's parameters there and hands the answer back unchanged (its redirect
// is a relative /ebook-download?… so the buyer stays on SMP). A preview forwards to FHB's dev preview, production to FHB.
const FHB_PROD = 'https://fathersheartbible.com';
const FHB_PREVIEW = 'https://dev.fathersheartbible.pages.dev';

/** Which FHB answers this request: a pages.dev preview of SMP talks to FHB's dev preview, never to production. */
export const upstreamFor = (url: URL) =>
	url.hostname.endsWith('.pages.dev') || url.hostname === 'localhost' ? FHB_PREVIEW : FHB_PROD;

export const onRequestGet: PagesFunction = async ({ request }) => {
	const url = new URL(request.url);
	// only the link's own parameters travel (s, e, t, dl): nothing else is forwarded
	const q = new URLSearchParams();
	for (const k of ['s', 'e', 't', 'dl']) {
		const v = url.searchParams.get(k);
		if (v !== null) q.set(k, v);
	}
	const up = await fetch(`${upstreamFor(url)}/ebook-download?${q}`, {
		redirect: 'manual',
		headers: { 'x-store-window': 'smp' },
	});
	const headers = new Headers();
	for (const k of ['content-type', 'content-disposition', 'cache-control', 'location']) {
		const v = up.headers.get(k);
		if (v) headers.set(k, v);
	}
	if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
	headers.set('x-robots-tag', 'noindex');
	return new Response(up.body, { status: up.status, headers });
};
