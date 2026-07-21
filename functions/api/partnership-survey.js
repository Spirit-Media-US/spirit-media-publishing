// Cloudflare Pages Function — Partnership (doctrine/collaboration) survey → scored email
//
// Scores the private /partnership survey server-side (respondent never sees a score)
// and emails the team a fully-scored report: left column = their response, right
// column = points + why, verdict at the bottom. Also keeps a GHL contact record.
// Route: POST /api/partnership-survey
// Secrets: env.MAILGUN_API_KEY (Mailgun US), env.GHL_API_TOKEN. Optional env.NOTIFY_TO.

const GHL_LOCATION_ID = 'oPP9m0hKJpU6cFB7yD9w';
const MAILGUN_DOMAIN = 'notify.spiritmediapublishing.com';
const FROM = 'SMP Partnership Survey <partnership@notify.spiritmediapublishing.com>';
const DEFAULT_TO = 'kevin@spiritmediapublishing.com';

const FIELD_IDS = {
	band: 'apfNnkgYVBSVB4QfPmeQ',
	score: '0R5CWzs9WdOGrjgQUSQS',
	subscores: 'qJ4X2o34jy2O7w7xkT63',
	reviewFlag: 'whRIYDeiUSlJVqODOwo0',
	story: 'T9IN5digOUlorDHGFbSH',
	questions: 'E7SOkbs9xo4cRxX3Rvqb',
	raw: 'tyeLltRIeyBn4zlW5m0j',
};

// key → [points, response label, why]
const SC1 = {
	keep: [
		0,
		"Keep the date — once I've settled on something I follow through",
		'Holds own sense of direction over the team’s counsel',
	],
	defer: [2, 'Defer to the team — their expertise', 'Defers (collaborative, if a little passive)'],
	together: [3, 'Ask their reasoning, sit with it, decide together', 'Seeks a shared decision'],
	trust: [
		3,
		'Feel unsettled but pray and trust the agreed process',
		'Trusts the process you agreed to',
	],
};
const SC2 = {
	demand: [
		0,
		"Tell them it needs to change — it's my name on this",
		'Ownership used as a trump card',
	],
	peace: [
		1,
		'Let it go to keep the peace',
		'Conflict-avoidant (not dictatorial, but not honest either)',
	],
	both: [3, 'Raise it directly, hear them out, decide together', 'Direct + shared ownership'],
	trustcore: [
		3,
		'Trust their expertise unless it touches something core, then talk',
		'Trusts expertise, voices core concerns',
	],
};
const SC3 = {
	firmly: [
		0,
		"Address it firmly — mistakes like that can't happen",
		'Zero-tolerance for others’ mistakes',
	],
	fixself: [1, 'Quietly fix it myself so it is done right', 'Distrust/control — takes it over'],
	goodintent: [
		3,
		'Feel it, but assume good intent and talk it through kindly',
		'Assumes good intent',
	],
	grace: [
		3,
		'Extend grace — we all fall short — and ask how we prevent it',
		'Extends grace + looks to prevent',
	],
};
const PIC = {
	hired: [0, 'Hired hands who carry out my vision', 'Team as executors (transactional)'],
	partners: [3, 'Partners with a real voice in the decisions', 'Shared voice'],
	guides: [3, 'Guides who help shape the work', 'Values guidance'],
	family: [3, 'Family walking this out together', 'Covenant / family posture'],
};
const SEL_HEALTHY = ['pushback', 'holdloosely', 'assumebest', 'sharedecision'];
const SEL_RED = ['signoff', 'followlead', 'visionintact', 'hardtrust'];
const SEL_LABEL = {
	pushback: "Wants people who'll push back",
	signoff: 'Needs to sign off on every detail',
	holdloosely: 'Can hold plans loosely',
	followlead: 'Works best when others follow',
	assumebest: 'Assumes the best when things go wrong',
	visionintact: 'Original vision must stay intact',
	sharedecision: 'Rather share a decision than carry it alone',
	hardtrust: 'Hard to trust new people',
};
const SCALES = [
	[
		'When God gives me a clear vision, I don’t let people talk me out of it',
		'reverse',
		'Control — high agreement = rigidity',
	],
	[
		'Some of the best course-corrections came from people who disagreed with me',
		'direct',
		'Teachability — high agreement is healthy',
	],
	[
		'I can sense when someone isn’t spiritually in tune with what God is doing',
		'reverse',
		'Spiritual superiority — high agreement = judging others',
	],
	[
		'I’ve heard from God clearly enough that I rarely need to second-guess it',
		'reverse',
		'Epistemic pride — high agreement = unteachable certainty',
	],
	[
		'When something matters deeply, it’s hard to let others decide without me',
		'reverse',
		'Control — high agreement = won’t delegate',
	],
];

const json = (o, s = 200) =>
	new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const esc = (x) =>
	String(x == null ? '' : x)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

export async function onRequestPost({ request, env }) {
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

	const rows = []; // {label, response, pts (string), why}

	// Scales
	const s = Array.isArray(b.scales) ? b.scales.map((x) => clamp(Number(x) || 0, 1, 10)) : [];
	const health = [];
	SCALES.forEach(([label, dir, why], i) => {
		const raw = s[i] || 0;
		const h = dir === 'reverse' ? 10 - raw : raw;
		health.push(h);
		rows.push({ label, response: `${raw}/10`, pts: `${h}/10`, why: `${why} (${dir}-scored)` });
	});
	const scaleAvg = health.reduce((a, c) => a + c, 0) / (health.length || 1);

	// Scenarios + picture
	const scen = (map, key, label) => {
		const [pts, resp, why] = map[key] || [0, '—', 'No answer'];
		rows.push({ label, response: resp, pts: `${pts}/3`, why });
		return pts;
	};
	const p1 = scen(SC1, b.launch, 'Scenario — the launch date');
	const p2 = scen(SC2, b.decision, 'Scenario — a decision you don’t like');
	const p3 = scen(SC3, b.mistake, 'Scenario — a team mistake');
	const picPts = scen(PIC, b.picture, 'How they picture us');
	const scenarioBlock = p1 + p2 + p3;

	// Select-all
	const sel = Array.isArray(b.selectAll) ? b.selectAll : [];
	const healthyN = sel.filter((k) => SEL_HEALTHY.includes(k)).length;
	const redN = sel.filter((k) => SEL_RED.includes(k)).length;
	const selPts = clamp(healthyN - redN, 0, 4);
	rows.push({
		label: 'Working with a team (check all)',
		response: sel.map((k) => SEL_LABEL[k] || k).join('; ') || '—',
		pts: `${selPts}/4`,
		why:
			`Healthy ${healthyN} − red ${redN}` +
			(sel.filter((k) => SEL_RED.includes(k)).length
				? ` (red: ${sel
						.filter((k) => SEL_RED.includes(k))
						.map((k) => SEL_LABEL[k])
						.join(', ')})`
				: ''),
	});

	// Open (human-read)
	rows.push({
		label: 'Story — a time God didn’t unfold as expected',
		response: b.story || '—',
		pts: '—',
		why: 'Read for humility / real growth. Red flag: can’t produce one, or reframes so they were still right.',
	});
	rows.push({
		label: 'Their questions for us',
		response: b.questions || '—',
		pts: '—',
		why: 'Read for posture. Relationship/fit questions = healthy; control/guarantee/“who has final say” = watch; none = low stakes for them.',
	});

	const total = Math.round((scaleAvg + scenarioBlock + picPts + selPts) * 10) / 10;
	let band = total >= 20 ? 'GREEN' : total >= 13 ? 'YELLOW' : 'RED';
	let flag = '';
	if (scaleAvg >= 9.5 && scenarioBlock === 9 && picPts === 3 && selPts >= 4) {
		flag =
			'Too-uniform answers — possible social-desirability / polished performer. Verify in conversation.';
		if (band === 'GREEN') band = 'YELLOW';
	}
	const rec =
		band === 'GREEN'
			? 'Strong collaboration fit. Proceed toward agreement.'
			: band === 'YELLOW'
				? 'Mixed signals. Have a values conversation before any agreement.'
				: 'Significant collaboration risk. Proceed only with eyes wide open — likely decline.';
	const bandColor = band === 'GREEN' ? '#15803d' : band === 'YELLOW' ? '#b45309' : '#b91c1c';

	// --- Build HTML email (2 columns: Response | Score / Why) ---
	const tr = rows
		.map(
			(r) => `
		<tr>
			<td style="vertical-align:top;padding:10px 12px;border-bottom:1px solid #eee;width:58%;">
				<div style="font-weight:700;color:#292524;font-size:13px;">${esc(r.label)}</div>
				<div style="color:#44403c;font-size:14px;margin-top:3px;white-space:pre-wrap;">${esc(r.response)}</div>
			</td>
			<td style="vertical-align:top;padding:10px 12px;border-bottom:1px solid #eee;width:42%;">
				<div style="font-weight:700;color:#111;font-size:14px;">${esc(r.pts)}</div>
				<div style="color:#78716c;font-size:12px;margin-top:3px;">${esc(r.why)}</div>
			</td>
		</tr>`,
		)
		.join('');

	const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#292524;">
		<h2 style="margin:0 0 4px;">Partnership Survey — ${esc(name)}</h2>
		<div style="color:#78716c;font-size:13px;margin-bottom:14px;">${esc(email)}${b.phone ? ' · ' + esc(b.phone) : ''}</div>
		<table style="width:100%;border-collapse:collapse;border:1px solid #eee;">
			<tr style="background:#fafaf9;">
				<th style="text-align:left;padding:8px 12px;font-size:12px;color:#78716c;text-transform:uppercase;letter-spacing:.04em;">Response</th>
				<th style="text-align:left;padding:8px 12px;font-size:12px;color:#78716c;text-transform:uppercase;letter-spacing:.04em;">Score / why</th>
			</tr>
			${tr}
		</table>
		<div style="margin-top:18px;border:2px solid ${bandColor};border-radius:8px;padding:14px 16px;">
			<div style="font-size:13px;color:#78716c;text-transform:uppercase;letter-spacing:.05em;">Verdict</div>
			<div style="font-size:22px;font-weight:800;color:${bandColor};margin:4px 0;">${band} — ${total} / 26</div>
			<div style="font-size:14px;color:#292524;">${esc(rec)}</div>
			${flag ? `<div style="margin-top:8px;font-size:13px;color:#b45309;font-weight:600;">⚠ ${esc(flag)}</div>` : ''}
			<div style="margin-top:10px;font-size:12px;color:#78716c;">Scales(health) ${scaleAvg.toFixed(1)}/10 · Scenarios ${scenarioBlock}/9 · Picture ${picPts}/3 · Select-all ${selPts}/4</div>
		</div>
	</div>`;

	// --- Send via Mailgun ---
	let emailed = false;
	if (env.MAILGUN_API_KEY) {
		const to = env.NOTIFY_TO || DEFAULT_TO;
		const form = new URLSearchParams();
		form.set('from', FROM);
		form.set('to', to);
		form.set('subject', `Partnership Survey — ${name} — ${band} (${total}/26)`);
		form.set('html', html);
		try {
			const mg = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
				method: 'POST',
				headers: {
					Authorization: 'Basic ' + btoa('api:' + env.MAILGUN_API_KEY),
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: form.toString(),
			});
			emailed = mg.ok;
			if (!mg.ok) console.log('Mailgun failed', mg.status, await mg.text());
		} catch (e) {
			console.log('Mailgun error', e);
		}
	}

	// --- Keep a GHL record (secondary) ---
	if (env.GHL_API_TOKEN) {
		const [firstName, ...rest] = name.split(/\s+/);
		const cf = [
			{ id: FIELD_IDS.band, field_value: band },
			{ id: FIELD_IDS.score, field_value: String(total) },
			{
				id: FIELD_IDS.subscores,
				field_value: `Scales ${scaleAvg.toFixed(1)}/10 · Scenarios ${scenarioBlock}/9 · Picture ${picPts}/3 · Select-all ${selPts}/4${flag ? ' · FLAG: ' + flag : ''}`,
			},
			{ id: FIELD_IDS.reviewFlag, field_value: flag || 'none' },
			{ id: FIELD_IDS.story, field_value: (b.story || '').trim() },
			{ id: FIELD_IDS.questions, field_value: (b.questions || '').trim() },
			{
				id: FIELD_IDS.raw,
				field_value: rows.map((r) => `${r.label}: ${r.response} [${r.pts}]`).join('\n'),
			},
		];
		try {
			await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${env.GHL_API_TOKEN}`,
					Version: '2021-07-28',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					locationId: GHL_LOCATION_ID,
					firstName,
					lastName: rest.join(' '),
					name,
					email,
					phone: (b.phone || '').trim(),
					source: 'Partnership Survey (website)',
					tags: ['partnership-survey'],
					customFields: cf,
				}),
			});
		} catch (e) {
			console.log('GHL upsert error', e);
		}
	}

	if (!emailed && !env.GHL_API_TOKEN)
		return json({ ok: false, error: 'Could not deliver your responses. Please try again.' }, 502);
	return json({ ok: true });
}
