// BUILD-CHECK: searched tool-inventory.py iframe embed postMessage frame height + grep src for postMessage/window.top (2026-11-20): none
// NEAREST: src/lib/riabOrder.ts (the RIAB pricing module; server-side, imports book-skus.json + engine pricing)
// NOT-REUSED-BECAUSE: this runs in the BROWSER inside the iframe; putting it in riabOrder.ts would ship the SKU registry
//   and engine pricing to every embed visitor. Two DOM-injected functions, no run loop, no pricing.
// APPROVED-BY: Kevin 2026-11-20 ~05:00Z "needs our SMP order form without the discount" (embed on raisedinabarn.org/buy,
//   brief claude-config/jobs/riab-buy-embed-no-discount-brief.md item 2, queue b2672b87)
//
// The RIAB order form inside an iframe on raisedinabarn.org/buy. Two jobs, kept DOM-injected so
// scripts/store-checkout.test.mjs proves them without a browser: (1) Stripe Checkout opens in the TOP window, never
// inside the frame; (2) the frame's height is posted to the parent as {riabHeight: n} so the host page sizes the iframe
// with no inner scrollbar.

type Win = {
	top: { location: { href: string } } | null;
	parent: unknown;
	ResizeObserver?: new (cb: () => void) => { observe: (el: unknown) => void };
};
/** the element wrapping the whole embed (its offsetHeight is the frame height; scrollHeight of <html> never shrinks) */
type Box = { offsetHeight: number };
type Msg = {
	textContent: string | null;
	ownerDocument: {
		createElement: (t: string) => Record<string, unknown> & { textContent: string | null };
	};
	append: (...n: unknown[]) => void;
};

/** Only a Stripe Checkout URL is ever sent to the top window. */
export const isStripeCheckoutUrl = (url: string): boolean => {
	try {
		const u = new URL(url);
		return u.protocol === 'https:' && u.hostname === 'checkout.stripe.com';
	} catch {
		return false;
	}
};

/** Navigate the TOP window to Stripe. If the browser refuses (no user activation left), show a link that opens there. */
export function goTop(win: Win, url: string, msg: Msg): 'top' | 'link' | 'refused' {
	if (!isStripeCheckoutUrl(url)) {
		msg.textContent = 'Checkout could not start. Please try again.';
		return 'refused';
	}
	try {
		if (!win.top) throw new Error('no top');
		win.top.location.href = url;
		return 'top';
	} catch {
		const a = msg.ownerDocument.createElement('a');
		a.href = url;
		a.target = '_top';
		a.rel = 'noopener';
		a.className = 'underline font-semibold';
		a.textContent = 'Open secure checkout';
		msg.textContent = '';
		msg.append(a);
		return 'link';
	}
}

/** Post {riabHeight} to the parent now and whenever the page's height changes. No-op when not framed. */
export function postHeight(win: Win, box: Box): number | null {
	if (!win.parent || win.parent === win) return null;
	const parent = win.parent as { postMessage: (m: unknown, origin: string) => void };
	let last = -1;
	const send = () => {
		const h = Math.ceil(box.offsetHeight);
		if (h === last) return;
		last = h;
		parent.postMessage({ riabHeight: h }, '*');
	};
	send();
	if (win.ResizeObserver) new win.ResizeObserver(send).observe(box);
	return last;
}
