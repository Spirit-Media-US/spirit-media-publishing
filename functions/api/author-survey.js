// Cloudflare Pages Function — Author Motive Survey → GoHighLevel
//
// Receives the /contact "Getting to Know You" survey submission and upserts a
// GHL contact (SMP location) with the six survey answers mapped to custom
// fields, tagged "author-motive-survey". The GHL token lives ONLY in the CF
// Pages environment (env.GHL_API_TOKEN) — never in the browser.
//
// Deployed automatically by `wrangler pages deploy dist/` (run from the repo
// root) because a root-level functions/ directory is compiled into the Pages
// Worker alongside the static assets. Route: POST /api/author-survey

const GHL_LOCATION_ID = 'oPP9m0hKJpU6cFB7yD9w';
const MAILGUN_DOMAIN = 'notify.spiritmediapublishing.com';
const FROM = 'SMP Author Survey <survey@notify.spiritmediapublishing.com>';
const DEFAULT_TO = 'kevin@spiritmediapublishing.com';
const esc = (x) =>
	String(x == null ? '' : x)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

// Answer key → GHL custom field ID (created 2026-07-21 for the SMP location).
const FIELD_IDS = {
	lookingFor: 'iHEUIbJL6zjQRz6Kx8za', // Author Survey — What are you looking for in a publisher
	worthItScale: 'qRvX1BneydZiHLI5eU87', // Author Survey — Worth it if no dollars (1-10)
	worthItWhy: '2Z4BAjdMj3uw0YunA0yP', // Author Survey — Worth it, why
	investmentScale: 'fX0nBIy6GXnJvavAxtS0', // Author Survey — Investment readiness (1-10)
	investmentWhy: 'QjvP5mGaIZtXUS8Yinv7', // Author Survey — Investment readiness, why
	writingFor: 'F3ZbCt8EYOv0MuBUW7Ts', // Author Survey — Who are you writing for and why
	whyYes: 'GkXuUOsMZ6RFDf36Wfyz', // Author Survey — What would make you say yes
};

const json = (obj, status = 200) =>
	new Response(JSON.stringify(obj), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});

export async function onRequestPost({ request, env }) {
	const token = env.GHL_API_TOKEN;
	if (!token) return json({ ok: false, error: 'Server not configured.' }, 500);

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'Invalid request.' }, 400);
	}

	// Honeypot: bots fill hidden fields; humans leave them empty.
	if (body.website_hp) return json({ ok: true });

	const name = (body.name || '').trim();
	const email = (body.email || '').trim();
	const phone = (body.phone || '').trim();

	if (!name || !email) {
		return json({ ok: false, error: 'Please share your name and email.' }, 400);
	}

	const [firstName, ...rest] = name.split(/\s+/);
	const lastName = rest.join(' ');

	// Q1 arrives as an array of selected labels (+ optional "Other" text).
	const lookingFor = Array.isArray(body.lookingFor)
		? body.lookingFor.filter(Boolean).join('; ')
		: body.lookingFor || '';

	const customFields = [
		{ id: FIELD_IDS.lookingFor, field_value: lookingFor },
		{ id: FIELD_IDS.worthItScale, field_value: String(body.worthItScale ?? '') },
		{ id: FIELD_IDS.worthItWhy, field_value: (body.worthItWhy || '').trim() },
		{ id: FIELD_IDS.investmentScale, field_value: String(body.investmentScale ?? '') },
		{ id: FIELD_IDS.investmentWhy, field_value: (body.investmentWhy || '').trim() },
		{ id: FIELD_IDS.writingFor, field_value: (body.writingFor || '').trim() },
		{ id: FIELD_IDS.whyYes, field_value: (body.whyYes || '').trim() },
	].filter((f) => f.field_value !== '');

	const payload = {
		locationId: GHL_LOCATION_ID,
		firstName,
		lastName,
		name,
		email,
		phone,
		source: 'Author Motive Survey (website)',
		tags: ['author-motive-survey'],
		customFields,
	};

	try {
		const res = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				Version: '2021-07-28',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const detail = await res.text();
			console.log('GHL upsert failed', res.status, detail);
			return json({ ok: false, error: 'We could not save your responses. Please try again.' }, 502);
		}

		// Notify the team directly via Mailgun (reliable; independent of GHL workflow).
		if (env.MAILGUN_API_KEY) {
			// Full survey questions paired with the person's answers.
			const worthWhy = (body.worthItWhy || '').trim();
			const investWhy = (body.investmentWhy || '').trim();
			const rows = [
				['What are you looking for in a partner?', lookingFor || '—'],
				[
					'If your message reached the nations but never earned you a dollar, would it still be worth it? (1 = no · 10 = absolutely)',
					(body.worthItScale ? `${body.worthItScale} / 10` : '—') +
						(worthWhy ? `\n\nWhy: ${worthWhy}` : ''),
				],
				[
					'Taking your message to the nations takes real investment. Where are you today? (1 = someone else funds it · 10 = whatever it takes)',
					(body.investmentScale ? `${body.investmentScale} / 10` : '—') +
						(investWhy ? `\n\nWhy: ${investWhy}` : ''),
				],
				[
					'Who is the one person or people this message is for — and why?',
					(body.writingFor || '').trim() || '—',
				],
				[
					'What would make you say yes to us publishing and/or marketing your message?',
					(body.whyYes || '').trim() || '—',
				],
			];
			const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:660px;margin:0 auto;color:#292524;">
				<h2 style="margin:0 0 4px;">New Author Motive Survey — ${esc(name)}</h2>
				<div style="color:#78716c;font-size:13px;margin-bottom:14px;">${esc(email)}${phone ? ' · ' + esc(phone) : ''}</div>
				<table style="width:100%;border-collapse:collapse;border:1px solid #eee;">
					<tr style="background:#fafaf9;">
						<th style="text-align:left;padding:8px 12px;font-size:12px;color:#78716c;text-transform:uppercase;letter-spacing:.04em;">Question</th>
						<th style="text-align:left;padding:8px 12px;font-size:12px;color:#78716c;text-transform:uppercase;letter-spacing:.04em;">Response</th>
					</tr>
					${rows.map((r) => `<tr><td style="vertical-align:top;padding:10px 12px;border-bottom:1px solid #eee;font-weight:700;font-size:13px;width:50%;">${esc(r[0])}</td><td style="vertical-align:top;padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;white-space:pre-wrap;">${esc(r[1])}</td></tr>`).join('')}
				</table>
			</div>`;
			const form = new URLSearchParams();
			form.set('from', FROM);
			form.set('to', env.NOTIFY_TO || DEFAULT_TO);
			form.set('subject', `New Author Motive Survey — ${name}`);
			form.set('html', html);
			try {
				await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
					method: 'POST',
					headers: {
						Authorization: 'Basic ' + btoa('api:' + env.MAILGUN_API_KEY),
						'Content-Type': 'application/x-www-form-urlencoded',
					},
					body: form.toString(),
				});
			} catch (e) {
				console.log('Mailgun notify error', e);
			}
		}

		return json({ ok: true });
	} catch (err) {
		console.log('GHL upsert error', err);
		return json({ ok: false, error: 'Something went wrong. Please try again.' }, 502);
	}
}
