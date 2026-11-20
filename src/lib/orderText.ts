// ORDER TEXT — how a store order reads to a person: SKU titles, the breakdown, the Ingram lines, the address.
// MOVED from FHB functions/print-webhook.ts (+ the identical copy in FHB functions/order.ts) into the SMP site, which now
// owns every after-payment step (map smp-store-one-home-v1 §4). Imported by functions/store-webhook.ts and
// functions/order.ts so the email and the thank-you page always name an item the same way.
// BUILD-CHECK: searched ebook link signer, store webhook, order page (tool-inventory.py) + ls functions/ src/lib in FHB and SMP
// NEAREST: FHB functions/print-webhook.ts + functions/order.ts (skuTitle/fmtOrder/ingramLines/fmtAddr, verbatim here)
// NOT-REUSED-BECAUSE: this IS that code, MOVED into SMP (a Pages project cannot import another's files); FHB's copies
//   are retired in move 5.
// APPROVED-BY: Kevin 2026-11-20 ~18:51Z "2 this needs to be moved. You are inheriting OLD instead of making it new" (brief jobs/smp-store-one-home-brief.md)
import { BOOK_SKUS } from '../store-engine/lib/order-pricing.ts';

// Localized: US keeps "City, ST 12345"; elsewhere print only the parts the country has (many
// have no state, some no postal code) in the order Stripe collected them, never a stray ", ".
export function fmtAddr(a: Record<string, string> | null | undefined): string {
	if (!a) return '(no address)';
	const place =
		a.country === 'US'
			? `${a.city ?? ''}, ${a.state ?? ''} ${a.postal_code ?? ''}`.trim()
			: [a.postal_code, a.city, a.state].filter(Boolean).join(' ');
	return [a.line1, a.line2, place, a.country].filter(Boolean).join('\n');
}

// metadata.breakdown is the raw SKU tally dvc-checkout writes ("dads:1",
// "general-largeprint-plum-hb:2"). Fine in the internal notification, wrong in a
// customer's confirmation — turn it into something a buyer recognises.
const TITLES: Record<string, string> = {
	chosen: 'Chosen Bible',
	couples: 'Couple’s Bible',
	dads: 'Dad’s Bible',
	'first-responders': 'First Responder’s Bible',
	mens: 'Men’s Bible',
	moms: 'Mom’s Bible',
	pastors: 'Pastor’s Bible',
	peace: 'Peace Bible',
	presidents: 'President’s Bible',
	recovery: 'Recovery Bible',
	seekers: 'Seeker’s Bible',
	seventeen: 'Seventeen Bible',
	soldiers: 'Soldier’s Bible',
	teen: 'Teen Bible',
	'worship-leaders': 'Worship Leader’s Bible',
	athletes: 'Athlete’s Bible',
	graduates: 'Graduate’s Bible',
	grandparents: 'Grandparent’s Bible',
	intercessors: 'Intercessor’s Bible',
	nurses: 'Nurse’s Bible',
	teachers: 'Teacher’s Bible',
	womens: 'Women’s Bible',
	journaling: 'She Hears Her Father’s Voice — Journaling Bible',
};

// Language editions (Kevin 2026-10-03), SKUs lang-<code>-hb/pb — mirrors src/data/language-editions.ts.
const LANG_TITLES: Record<string, string> = {
	ar: 'الكتاب المقدس العربي (Arabic) — Father’s Heart Bible',
	bn: 'বাংলা বাইবেল (Bengali) — Father’s Heart Bible',
	yue: '廣東話聖經 (Cantonese) — Father’s Heart Bible',
	fil: 'Bibliyang Filipino (Filipino) — Father’s Heart Bible',
	fr: 'Bible Française (French) — Father’s Heart Bible',
	de: 'Deutsche Bibel (German) — Father’s Heart Bible',
	hi: 'हिन्दी बाइबिल (Hindi) — Father’s Heart Bible',
	id: 'Alkitab Indonesia (Indonesian) — Father’s Heart Bible',
	it: 'Bibbia Italiana (Italian) — Father’s Heart Bible',
	ja: '日本語聖書 (Japanese) — Father’s Heart Bible',
	ko: '한국어 성경 (Korean) — Father’s Heart Bible',
	mr: 'मराठी बायबल (Marathi) — Father’s Heart Bible',
	pcm: 'Naija Bible (Nigerian Pidgin) — Father’s Heart Bible',
	fa: 'کتاب مقدس فارسی (Persian (Farsi)) — Father’s Heart Bible',
	pt: 'Bíblia Portuguesa (Portuguese) — Father’s Heart Bible',
	pa: 'ਪੰਜਾਬੀ ਬਾਈਬਲ (Punjabi) — Father’s Heart Bible',
	ru: 'Русская Библия (Russian) — Father’s Heart Bible',
	es: 'Biblia Española (Spanish) — Father’s Heart Bible',
	sw: 'Biblia ya Kiswahili (Swahili) — Father’s Heart Bible',
	ta: 'தமிழ் பைபிள் (Tamil) — Father’s Heart Bible',
	nmf: 'Tangkhul Bible (Tangkhul) — Father’s Heart Bible',
	te: 'తెలుగు బైబిల్ (Telugu) — Father’s Heart Bible',
	'zh-hant': '中文聖經 (Traditional Chinese) — Father’s Heart Bible',
	tr: 'Türkçe Kutsal Kitap (Turkish) — Father’s Heart Bible',
	ur: 'اردو بائبل (Urdu) — Father’s Heart Bible',
	vi: 'Kinh Thánh Tiếng Việt (Vietnamese) — Father’s Heart Bible',
	ceb: 'Cebuano nga Bibliya (Cebuano) — Father’s Heart Bible',
	pl: 'Polska Biblia (Polish) — Father’s Heart Bible',
	'zh-hans': '中文圣经 (Simplified Chinese) — Father’s Heart Bible',
	uk: 'Українська Біблія (Ukrainian) — Father’s Heart Bible',
	yo: 'Bíbélì Yorùbá (Yoruba) — Father’s Heart Bible',
};

export function skuTitle(sku: string): string {
	if (BOOK_SKUS[sku]) return BOOK_SKUS[sku].title;
	if (TITLES[sku]) return `${TITLES[sku]} — Divine Voice Color`;
	// Every SKU carries its binding (<slug>-hb / -pb, since 2026-09-17); the map is keyed by
	// edition, so read the binding off the end rather than printing the raw SKU.
	const b = /^(.+)-(hb|pb)$/.exec(sku);
	const bind = b ? (b[2] === 'hb' ? 'Hardback' : 'Paperback') : '';
	const lang = b && /^lang-(.+)$/.exec(b[1]);
	if (lang && LANG_TITLES[lang[1]]) return `${LANG_TITLES[lang[1]]}, ${bind}`;
	if (b && TITLES[b[1]]) return `${TITLES[b[1]]} — Divine Voice Color, ${bind}`;
	const m = /^general-(regular|largeprint)-(charcoal|plum|white)-(pb|hb)$/.exec(sku);
	if (!m) return sku;
	const [, size, colour, binding] = m;
	const c = colour.charAt(0).toUpperCase() + colour.slice(1);
	return `Father’s Heart Bible — ${size === 'largeprint' ? 'Large Print' : 'Regular Print'}, ${c}, ${binding === 'hb' ? 'Hardback' : 'Paperback'}`;
}

// What the Ingram order needs for any non-Bible book in the cart: the ISBN-13 to type in, the
// quantity, and the spec to check it against. Empty when the order has none.
export function ingramLines(breakdown: string | undefined): string {
	const out: string[] = [];
	for (const part of (breakdown ?? '').split(/[,\s]+/).filter(Boolean)) {
		const i = part.lastIndexOf(':');
		const book = i < 0 ? undefined : BOOK_SKUS[part.slice(0, i)];
		if (book) out.push(`  ISBN ${book.isbn} × ${part.slice(i + 1)}  (${book.title}; ${book.spec})`);
	}
	return out.length ? `Ingram order lines (non-Bible books):\n${out.join('\n')}\n` : '';
}

export function fmtOrder(breakdown: string | undefined): string {
	if (!breakdown) return 'Father’s Heart Bible';
	return breakdown
		.split(/[,\s]+/)
		.filter(Boolean)
		.map((part) => {
			const i = part.lastIndexOf(':');
			if (i < 0) return `  ${skuTitle(part)}`;
			const qty = part.slice(i + 1);
			return `  ${qty} × ${skuTitle(part.slice(0, i))}`;
		})
		.join('\n');
}
