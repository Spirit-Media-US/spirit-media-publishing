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

// Answer key → GHL custom field ID (created 2026-07-21 for the SMP location).
const FIELD_IDS = {
	lookingFor: 'iHEUIbJL6zjQRz6Kx8za', // Author Survey — What are you looking for in a publisher
	worthItScale: 'qRvX1BneydZiHLI5eU87', // Author Survey — Worth it if no dollars (1-10)
	worthItWhy: '2Z4BAjdMj3uw0YunA0yP', // Author Survey — Worth it, why
	investmentScale: 'fX0nBIy6GXnJvavAxtS0', // Author Survey — Investment readiness (1-10)
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

		return json({ ok: true });
	} catch (err) {
		console.log('GHL upsert error', err);
		return json({ ok: false, error: 'Something went wrong. Please try again.' }, 502);
	}
}
