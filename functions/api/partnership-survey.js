// Cloudflare Pages Function — Partnership (doctrine/collaboration) survey → GHL
//
// Receives the private /partnership survey, SCORES it server-side (the respondent
// never sees any score), and upserts a GHL contact with band + subscores + the two
// human-read answers + a full raw dump, tagged "partnership-survey".
// Token lives only in env.GHL_API_TOKEN. Route: POST /api/partnership-survey

const GHL_LOCATION_ID = 'oPP9m0hKJpU6cFB7yD9w';

const FIELD_IDS = {
	band: 'apfNnkgYVBSVB4QfPmeQ',
	score: '0R5CWzs9WdOGrjgQUSQS',
	subscores: 'qJ4X2o34jy2O7w7xkT63',
	reviewFlag: 'whRIYDeiUSlJVqODOwo0',
	story: 'T9IN5digOUlorDHGFbSH',
	questions: 'E7SOkbs9xo4cRxX3Rvqb',
	raw: 'tyeLltRIeyBn4zlW5m0j',
};

// Option label maps (for the readable raw dump) + point weights (hidden scoring).
const SC1 = { keep: 0, defer: 2, together: 3, trust: 3 };
const SC1_LABEL = {
	keep: "Keep the date — once I've settled on something I follow through",
	defer: 'Defer to the team — their expertise',
	together: 'Ask their reasoning, sit with it, decide together',
	trust: 'Feel unsettled but pray and trust the agreed process',
};
const SC2 = { demand: 0, peace: 1, both: 3, trustcore: 3 };
const SC2_LABEL = {
	demand: "Tell them it needs to change — it's my name on this",
	peace: 'Let it go to keep the peace',
	both: 'Raise it directly, hear them out, decide together',
	trustcore: 'Trust their expertise unless it touches something core, then talk',
};
const SC3 = { firmly: 0, fixself: 1, goodintent: 3, grace: 3 };
const SC3_LABEL = {
	firmly: "Address it firmly — mistakes like that can't happen",
	fixself: 'Quietly fix it myself so it is done right',
	goodintent: 'Feel it, but assume good intent and talk it through kindly',
	grace: 'Extend grace — we all fall short — and ask how we prevent it',
};
const PIC = { hired: 0, partners: 3, guides: 3, family: 3 };
const PIC_LABEL = {
	hired: 'Hired hands who carry out my vision',
	partners: 'Partners with a real voice in the decisions',
	guides: 'Guides who help shape the work',
	family: 'Family walking this out together',
};
const SEL_HEALTHY = ['pushback', 'holdloosely', 'assumebest', 'sharedecision'];
const SEL_RED = ['signoff', 'followlead', 'visionintact', 'hardtrust'];
const SEL_LABEL = {
	pushback: "Want people who'll push back when they see something I don't",
	signoff: 'Need to sign off on every detail',
	holdloosely: 'Can hold my plans loosely when there is a good reason',
	followlead: 'Work best when others follow my lead',
	assumebest: 'Assume the best when something goes wrong',
	visionintact: 'Important that my original vision stays intact',
	sharedecision: 'Rather share a decision than carry it alone',
	hardtrust: "Hard to fully trust people I haven't worked with",
};
const SCALE_LABELS = [
	"When God gives me a clear vision, I don't let people talk me out of it",
	'Some of the best course-corrections came from people who disagreed with me',
	"I can sense when someone isn't spiritually in tune with what God is doing",
	"I've heard from God clearly enough that I rarely need to second-guess it",
	"When something matters deeply, it's hard to let others decide without me",
];

const json = (o, s = 200) =>
	new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export async function onRequestPost({ request, env }) {
	const token = env.GHL_API_TOKEN;
	if (!token) return json({ ok: false, error: 'Server not configured.' }, 500);

	let b;
	try {
		b = await request.json();
	} catch {
		return json({ ok: false, error: 'Invalid request.' }, 400);
	}
	if (b.website_hp) return json({ ok: true });

	const name = (b.name || '').trim();
	const email = (b.email || '').trim();
	if (!name || !email) return json({ ok: false, error: 'Please share your name and email.' }, 400);

	// --- Scales → health (0..10). Items 0,2,3,4 are reverse-coded. ---
	const s = Array.isArray(b.scales) ? b.scales.map((x) => clamp(Number(x) || 0, 1, 10)) : [];
	const h = [10 - s[0], s[1], 10 - s[2], 10 - s[3], 10 - s[4]].map((x) =>
		Number.isFinite(x) ? x : 0,
	);
	const scaleAvg = h.reduce((a, c) => a + c, 0) / (h.length || 1); // 0..10

	// --- Scenarios (0..9) ---
	const p1 = SC1[b.launch] ?? 0;
	const p2 = SC2[b.decision] ?? 0;
	const p3 = SC3[b.mistake] ?? 0;
	const scenarioBlock = p1 + p2 + p3;

	// --- Picture (0..3) ---
	const picPts = PIC[b.picture] ?? 0;

	// --- Select-all (0..4) ---
	const sel = Array.isArray(b.selectAll) ? b.selectAll : [];
	const healthyN = sel.filter((k) => SEL_HEALTHY.includes(k)).length;
	const redN = sel.filter((k) => SEL_RED.includes(k)).length;
	const selPts = clamp(healthyN - redN, 0, 4);

	const total = Math.round((scaleAvg + scenarioBlock + picPts + selPts) * 10) / 10; // ~0..26
	let band = total >= 20 ? 'GREEN' : total >= 13 ? 'YELLOW' : 'RED';

	// --- Performer / social-desirability flag ---
	let reviewFlag = 'none';
	const tooUniform = scaleAvg >= 9.5 && scenarioBlock === 9 && picPts === 3 && selPts >= 4;
	if (tooUniform) {
		reviewFlag = 'TOO-UNIFORM — verify in conversation (possible social-desirability)';
		if (band === 'GREEN') band = 'YELLOW';
	}

	const subscores =
		`Overall ${total}/26 → ${band}. ` +
		`Scales(health avg) ${scaleAvg.toFixed(1)}/10 [vision ${h[0]}, corrections ${h[1]}, discernment ${h[2]}, second-guess ${h[3]}, control ${h[4]}]. ` +
		`Scenarios ${scenarioBlock}/9 [launch ${p1}, decision ${p2}, mistake ${p3}]. ` +
		`Picture ${picPts}/3 (${PIC_LABEL[b.picture] || '—'}). ` +
		`Select-all ${selPts}/4 [healthy ${healthyN}, red ${redN}].`;

	const raw =
		`SCALES (1-10 raw): ${s.map((v, i) => `\n  • ${SCALE_LABELS[i]}: ${v}`).join('')}\n` +
		`LAUNCH: ${SC1_LABEL[b.launch] || '—'}\n` +
		`DECISION: ${SC2_LABEL[b.decision] || '—'}\n` +
		`MISTAKE: ${SC3_LABEL[b.mistake] || '—'}\n` +
		`PICTURE OF US: ${PIC_LABEL[b.picture] || '—'}\n` +
		`WORKING-WITH-A-TEAM (checked): ${sel.map((k) => SEL_LABEL[k] || k).join('; ') || '—'}`;

	const cf = [
		{ id: FIELD_IDS.band, field_value: band },
		{ id: FIELD_IDS.score, field_value: String(total) },
		{ id: FIELD_IDS.subscores, field_value: subscores },
		{ id: FIELD_IDS.reviewFlag, field_value: reviewFlag },
		{ id: FIELD_IDS.story, field_value: (b.story || '').trim() },
		{ id: FIELD_IDS.questions, field_value: (b.questions || '').trim() },
		{ id: FIELD_IDS.raw, field_value: raw },
	];

	const [firstName, ...rest] = name.split(/\s+/);
	const payload = {
		locationId: GHL_LOCATION_ID,
		firstName,
		lastName: rest.join(' '),
		name,
		email,
		phone: (b.phone || '').trim(),
		source: 'Partnership Survey (website)',
		tags: ['partnership-survey', `partnership-${band.toLowerCase()}`],
		customFields: cf,
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
			console.log('GHL upsert failed', res.status, await res.text());
			return json({ ok: false, error: 'We could not save your responses. Please try again.' }, 502);
		}
		return json({ ok: true });
	} catch (err) {
		console.log('GHL upsert error', err);
		return json({ ok: false, error: 'Something went wrong. Please try again.' }, 502);
	}
}
