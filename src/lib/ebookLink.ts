// THE SIGNED EBOOK DOWNLOAD LINK — SMP's copy, MOVED from FHB src/lib/ebookLink.ts (map smp-store-one-home-v1 §4 move 3).
// BUILD-CHECK: searched ebook link signer, store webhook, order page (tool-inventory.py) + ls functions/ src/lib in FHB and SMP
// NEAREST: FHB src/lib/ebookLink.ts + functions/print-webhook.ts + functions/order.ts + functions/ebook-download.ts
// NOT-REUSED-BECAUSE: this IS that code, MOVED (ported, same logic + tests) out of the FHB site into the SMP site, which
//   cannot import across Pages projects; the FHB originals are retired in move 5 once these are live and proven.
// APPROVED-BY: Kevin 2026-11-20 ~18:51Z "2 this needs to be moved. You are inheriting OLD instead of making it new" (brief jobs/smp-store-one-home-brief.md)
//
// Used by the signer (functions/store-webhook.ts, the buyer's email; functions/ebook-download.ts, the success redirect)
// and the verifier (functions/ebook-download.ts).
//
//   v2 (SMP, current):  <origin>/ebook-download?s=<session>&e=<sku>&t=<sig>&v=2
//     sig = base64url(HMAC-SHA256(K2, "<session>.<sku>")),  K2 = HMAC-SHA256(EBOOK_LINK_SECRET, PURPOSE_V2)
//     EBOOK_LINK_SECRET = SMP's OWN signing secret (a Pages secret on the SMP project; FHB never holds it).
//   v1 (FHB, legacy):   <origin>/ebook-download?s=<session>&e=<sku>&t=<sig>          (no v)
//     signed by FHB with a key derived from FHB's webhook secret, which SMP does not hold. A v1 link is NOT trusted by
//     its signature here: it is handled exactly like Stripe's success redirect (?s=<session>): the session is re-read
//     from Stripe and must be paid + ebook_direct + have sold exactly <sku>, then the buyer is sent to a fresh v2 link.
//     That is the same proof the success redirect has always accepted, so every link already emailed keeps working.
//
// A valid signature is necessary, never sufficient: the verifier ALSO re-reads the session from Stripe and serves only
// when it is paid, is an ebook_direct sale, and sold exactly this SKU (sessionGrantsEbook).
export const PURPOSE_V1 = 'smp-ebook-download-link-v1';
export const PURPOSE_V2 = 'smp-ebook-download-link-v2';
const enc = new TextEncoder();
const b64url = (b: ArrayBuffer) =>
	btoa(String.fromCharCode(...new Uint8Array(b)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
async function hmac(key: Uint8Array | string, msg: string): Promise<ArrayBuffer> {
	const k = await crypto.subtle.importKey(
		'raw',
		typeof key === 'string' ? enc.encode(key) : key,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	return crypto.subtle.sign('HMAC', k, enc.encode(msg));
}
export const SID_RE = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;
export const SKU_RE = /^[a-z0-9-]{3,120}$/;
export const SIG_RE = /^[A-Za-z0-9_-]{43}$/;
/** The signature for (session, sku), or null when there is no secret or the inputs are malformed. */
export async function signEbookLink(
	secret: string | undefined,
	sid: string,
	sku: string,
	purpose = PURPOSE_V2,
): Promise<string | null> {
	if (!secret || !SID_RE.test(sid) || !SKU_RE.test(sku)) return null;
	const k = new Uint8Array(await hmac(secret, purpose));
	return b64url(await hmac(k, `${sid}.${sku}`));
}
/** Constant-time check of a link's signature. Any malformed part = false (no Stripe call is ever made for it). */
export async function verifyEbookLink(
	secret: string | undefined,
	sid: string,
	sku: string,
	sig: string,
	purpose = PURPOSE_V2,
): Promise<boolean> {
	if (!SIG_RE.test(sig)) return false;
	const want = await signEbookLink(secret, sid, sku, purpose);
	if (!want) return false;
	let d = 0;
	for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ sig.charCodeAt(i);
	return d === 0;
}
/** The shop window's own origin (Option C: SMP sales are delivered on SMP; FHB's /ebook-download forwards to SMP). */
export const windowOrigin = (window: string | undefined) =>
	window === 'smp' ? 'https://spiritmediapublishing.com' : 'https://fathersheartbible.com';
/** The v2 signed link, or null when unsignable (no secret bound / malformed session). */
export async function ebookLinkUrl(
	secret: string | undefined,
	origin: string,
	sid: string,
	sku: string,
): Promise<string | null> {
	const t = await signEbookLink(secret, sid, sku);
	return t
		? `${origin}/ebook-download?s=${encodeURIComponent(sid)}&e=${encodeURIComponent(sku)}&t=${t}&v=2`
		: null;
}
/** Does this Stripe Checkout Session (as Stripe returns it) entitle its holder to `sku`? */
export function sessionGrantsEbook(
	s: { id?: string; payment_status?: string; metadata?: Record<string, string> | null } | null,
	sid: string,
	sku: string,
): boolean {
	return (
		!!s &&
		s.id === sid &&
		s.payment_status === 'paid' &&
		s.metadata?.kind === 'ebook_direct' &&
		s.metadata?.ebook_sku === sku
	);
}
