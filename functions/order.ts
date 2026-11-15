// /order — SMP store order confirmation (plan 3fb Phase 3). /store-checkout's success_url lands here.
//   GET /order?s=<checkout_session_id> -> the buyer's order, read LIVE from Stripe (nothing cached or mirrored)
// Same pattern as fathersheartbible.com/order: a buyer who paid must always land on an acknowledgement.
interface Env {
	STRIPE_STORE_SECRET_KEY?: string;
}
const SUPPORT = 'hello@spiritmediapublishing.com';
const esc = (s: unknown) =>
	String(s ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
	);
const money = (cents: number, cur = 'usd') =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(
		(cents || 0) / 100,
	);

export function page(title: string, body: string) {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} | Spirit Media Publishing</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafaf9;color:#1c1917}
main{max-width:640px;margin:0 auto;padding:40px 16px}h1{font-size:1.8rem;margin:0 0 8px}a{color:#b91c1c}
table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:8px 0;border-bottom:1px solid #e7e5e4}td.r{text-align:right}
.box{background:#fff;border:1px solid #d6d3d1;border-radius:8px;padding:16px;margin-top:16px}.muted{color:#57534e}</style></head>
<body><main><p><a href="/">Spirit Media Publishing</a></p>${body}</main></body></html>`;
}

export function orderHtml(s: any): string {
	const items = (s.line_items?.data ?? [])
		.map(
			(l: any) =>
				`<tr><td>${esc(l.description)} × ${esc(l.quantity)}</td><td class="r">${money(l.amount_total, s.currency)}</td></tr>`,
		)
		.join('');
	const ship = s.shipping_details ?? s.collected_information?.shipping_details;
	const addr = ship?.address
		? `<div class="box"><strong>Shipping to</strong><br>${esc(ship.name)}<br>${esc(ship.address.city)}, ${esc(ship.address.state ?? '')} ${esc(ship.address.country)}</div>`
		: '';
	const paid = s.payment_status === 'paid';
	return page(
		paid ? 'Thank you for your order' : 'Your order',
		`<h1>${paid ? 'Thank you for your order' : 'Your order is not complete'}</h1>
<p class="muted">${paid ? 'We have received your payment. A receipt is on its way to your email.' : 'This checkout was not paid. Nothing has been charged.'}</p>
<table>${items}<tr><td><strong>Total</strong></td><td class="r"><strong>${money(s.amount_total, s.currency)}</strong></td></tr></table>
${addr}<p class="muted">Order reference: ${esc(String(s.id).slice(-12))}. Questions? <a href="mailto:${SUPPORT}">${SUPPORT}</a></p>
<p><a href="/bookstore/">Browse all our books</a></p>`,
	);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
	const html = (b: string, status = 200) =>
		new Response(b, {
			status,
			headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
		});
	const sid = new URL(request.url).searchParams.get('s') ?? '';
	if (!/^cs_(live|test)_[A-Za-z0-9]{10,}$/.test(sid) || !env.STRIPE_STORE_SECRET_KEY) {
		return html(
			page(
				'Your order',
				`<h1>Your order</h1><p class="muted">We could not find that order. If you paid, your receipt email has the details, or write to <a href="mailto:${SUPPORT}">${SUPPORT}</a>.</p>`,
			),
			404,
		);
	}
	const r = await fetch(
		`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}?expand[]=line_items`,
		{ headers: { authorization: `Bearer ${env.STRIPE_STORE_SECRET_KEY}` } },
	);
	if (!r.ok) {
		return html(
			page(
				'Your order',
				`<h1>Your order</h1><p class="muted">We could not load that order right now. Your receipt email has the details, or write to <a href="mailto:${SUPPORT}">${SUPPORT}</a>.</p>`,
			),
			502,
		);
	}
	return html(orderHtml(await r.json()));
};
