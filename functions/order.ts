// /order — THE store's one order confirmation + lookup page (plan 3fb Phase 3; map smp-store-one-home-v1 §4 move 4,
// Kevin 2026-11-20 ~18:51Z "2 this needs to be moved"). Every order, from any shop window, lands here: /store-checkout's
// success_url, and fathersheartbible.com/order, which now redirects here with its query.
//   GET /order?s=<checkout_session_id> -> the buyer's order, read LIVE from Stripe (nothing cached or mirrored)
//   GET /order                         -> a form to paste an order reference into (moved from FHB /order)
// What FHB's page showed is carried over: the confirmation email, phone for the carrier, the full address, the shipped
// line (metadata tracking/carrier, set by fhb-order-ship.py), the full reference; plus a gift-to-charity line.
interface Env {
	STRIPE_STORE_SECRET_KEY?: string;
}

import { buildOptIn, optInSnippet } from '../src/lib/customerReviews.ts';
import { fmtAddr } from '../src/lib/orderText.ts';

const SUPPORT = 'hello@spiritmediapublishing.com';
// CONTACT US (Kevin 2026-11-16, standing rule): a button that opens mail to hello@, labelled only "Contact us"; the
// address itself is never printed on the page.
export const contactUs = (subject = '') =>
	`<a class="contact" href="mailto:${SUPPORT}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}">Contact us</a>`;
const esc = (s: unknown) =>
	String(s ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
	);
const money = (cents: number, cur = 'usd') =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(
		(cents || 0) / 100,
	);

export function page(title: string, body: string, tail = '') {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} | Spirit Media Publishing</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafaf9;color:#1c1917}
main{max-width:640px;margin:0 auto;padding:40px 16px}h1{font-size:1.8rem;margin:0 0 8px}a{color:#b91c1c}
table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:8px 0;border-bottom:1px solid #e7e5e4}td.r{text-align:right}
.contact{display:inline-block;background:#b91c1c;color:#fff;font-weight:600;padding:.5rem 1.2rem;border-radius:999px;text-decoration:none}
.box{background:#fff;border:1px solid #d6d3d1;border-radius:8px;padding:16px;margin-top:16px}.muted{color:#57534e}</style></head>
<body><main><p><a href="/">Spirit Media Publishing</a></p>${body}</main>${tail}</body></html>`;
}

export function orderHtml(s: any): string {
	const items = (s.line_items?.data ?? [])
		.map(
			(l: any) =>
				`<tr><td>${esc(l.description)} × ${esc(l.quantity)}</td><td class="r">${money(l.amount_total, s.currency)}</td></tr>`,
		)
		.join('');
	const ship = s.collected_information?.shipping_details ?? s.shipping_details;
	const m = (s.metadata ?? {}) as Record<string, string>;
	const phone = s.customer_details?.phone;
	const addr = ship?.address
		? `<div class="box"><strong>Shipping to</strong><br><span style="white-space:pre-line">${esc(ship.name ?? '')}\n${esc(fmtAddr(ship.address))}</span>${phone ? `<br><span class="muted">Phone for the delivery carrier: ${esc(phone)}</span>` : ''}</div>`
		: '';
	const paid = s.payment_status === 'paid';
	// Set by fhb-order-ship.py when the parcel goes out (was on FHB /order).
	const shipped = m.tracking
		? `<div class="box"><strong>Shipped</strong><br>${m.carrier ? `${esc(m.carrier)} · ` : ''}tracking <code>${esc(m.tracking)}</code></div>`
		: '';
	const gift =
		Number(m.donation_total_cents || m.donation_cents) > 0
			? `<p class="muted">Your gift to charity is included in this total. Spirit Media Charities emails you its receipt separately.</p>`
			: '';
	const email = s.customer_details?.email;
	return page(
		paid ? 'Thank you for your order' : 'Your order',
		`<h1>${paid ? 'Thank you for your order' : 'Your order is not complete'}</h1>
<p class="muted">${paid ? `We have received your payment. A confirmation is on its way to ${email ? esc(email) : 'your email'}.` : 'This checkout was not paid. Nothing has been charged.'}</p>
<table>${items}<tr><td><strong>Total</strong></td><td class="r"><strong>${money(s.amount_total, s.currency)}</strong></td></tr></table>
${gift}${addr}${shipped}<p class="muted">Order reference: <code style="word-break:break-all">${esc(String(s.id))}</code><br>Questions? ${contactUs(`Order ${String(s.id).slice(-12)}`)}</p>
<p><a href="/bookstore/">Browse all our books</a></p>`,
		// Google Customer Reviews opt-in: this page only, values from the verified session. buildOptIn returns null
		// (module omitted) for test-mode or unpaid sessions or any unverifiable value.
		(() => {
			const o = buildOptIn(s);
			return o ? optInSnippet(o) : '';
		})(),
	);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
	const html = (b: string, status = 200) =>
		new Response(b, {
			status,
			headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
		});
	const sid = (new URL(request.url).searchParams.get('s') ?? '').trim();
	// No reference: the lookup form (moved from FHB /order). Paste the reference from the confirmation email.
	if (!sid) {
		return html(
			page(
				'Look up your order',
				`<h1>Look up your order</h1><p class="muted">Paste the order reference from your confirmation email.</p>
<form method="GET" action="/order"><label for="s">Order reference</label><br><input id="s" name="s" placeholder="cs_live_…" autocomplete="off" required style="width:100%;box-sizing:border-box;padding:.6rem;margin:.5rem 0 1rem;font-size:1rem"><button type="submit" class="contact" style="border:0;cursor:pointer;font-size:1rem">Find my order</button></form>
<p class="muted">Can’t find it? ${contactUs()} and we’ll look it up for you.</p>`,
			),
		);
	}
	if (!/^cs_(live|test)_[A-Za-z0-9]{10,}$/.test(sid) || !env.STRIPE_STORE_SECRET_KEY) {
		return html(
			page(
				'Your order',
				`<h1>Your order</h1><p class="muted">We could not find that order. If you paid, your receipt email has the details. ${contactUs()}</p>`,
			),
			404,
		);
	}
	const r = await fetch(
		`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}?expand[]=line_items&expand[]=shipping_cost.shipping_rate`,
		{ headers: { authorization: `Bearer ${env.STRIPE_STORE_SECRET_KEY}` } },
	);
	if (!r.ok) {
		return html(
			page(
				'Your order',
				`<h1>Your order</h1><p class="muted">We could not load that order right now. Your receipt email has the details. ${contactUs()}</p>`,
			),
			502,
		);
	}
	return html(orderHtml(await r.json()));
};
