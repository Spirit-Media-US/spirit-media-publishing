// THE FATHER'S HEART BIBLE EBOOK, sold by the ONE store (SMP /store-checkout). MOVED from FHB functions/ebook-checkout.ts
// (map smp-store-one-home-v1 §4 move 5, Kevin 2026-11-20 ~18:51Z "2 this needs to be moved. You are inheriting OLD
// instead of making it new"). The Stripe form is FHB's, byte for byte (golden test in scripts/store-checkout.test.mjs):
// $9.99 (Kevin 2026-11-23 D95; was $7.49), e-book tax code, billing address for tax, tags fhb / bible_ebook. Sold in the FHB window only (Kevin 2026-11-16
// "2yes": FHB Bibles stay sold on FHB): the buyer returns to the FHB origin that called, whose /ebook-download forwards to
// SMP's, which delivers it from SMP's own private-R2 binding.
// BUILD-CHECK: searched bible ebook checkout (tool-inventory.py) + ls functions/ in FHB and SMP
// NEAREST: FHB functions/ebook-checkout.ts (this form, moved verbatim) + SMP storeEngine ebookCheckoutForm (books only)
// NOT-REUSED-BECAUSE: ebookCheckoutForm sells registry book eBooks (ebook_sku, author metadata, first-order 15%); the
//   Bible eBook is a fixed-price product ($9.99 since Kevin 2026-11-23 D95) with no SKU row; FHB's file is retired once this sells it.
// APPROVED-BY: Kevin 2026-11-20 ~18:51Z "2 this needs to be moved. You are inheriting OLD instead of making it new" (brief jobs/smp-store-one-home-brief.md)
import { storeTags } from '../store-engine/lib/storeEngine.ts';

export const BIBLE_EBOOK_PRICE = 999; // $9.99 in cents — every FHB eBook $9.99 everywhere (Kevin 2026-11-23 "d95 a yes"; was $7.49)
export const EBOOK_TAX_CODE = 'txcd_10202001'; // electronically supplied books

/** The Stripe Checkout form for one Bible eBook, returning the buyer to `origin` (the FHB window that sold it). */
export function bibleEbookForm(origin: string): Record<string, string | number> {
	const o =
		origin === 'https://fathersheartbible.pages.dev' ? 'https://fathersheartbible.com' : origin;
	return {
		mode: 'payment',
		success_url: `${o}/ebook-download?s={CHECKOUT_SESSION_ID}`,
		cancel_url: `${o}/print?ebook=canceled`,
		'automatic_tax[enabled]': 'true',
		billing_address_collection: 'required', // digital goods → address drives tax
		customer_creation: 'always',
		'metadata[kind]': 'ebook_direct',
		'line_items[0][quantity]': 1,
		'line_items[0][price_data][currency]': 'usd',
		'line_items[0][price_data][unit_amount]': BIBLE_EBOOK_PRICE,
		'line_items[0][price_data][tax_behavior]': 'exclusive',
		'line_items[0][price_data][product_data][name]': "Father's Heart Bible — eBook",
		'line_items[0][price_data][product_data][description]':
			'Instant download · DRM-free EPUB · An Intimate Translation',
		'line_items[0][price_data][product_data][tax_code]': EBOOK_TAX_CODE,
		// Option C tags (Kevin 2026-11-16): sold on FHB, FHB window, the Bible eBook.
		...storeTags('fhb', 'bible_ebook'),
	};
}
