import { createClient } from '@sanity/client';
import { createImageUrlBuilder } from '@sanity/image-url';

// Default useCdn=false (always fresh — protects against the ~60s stale-CDN
// race that can ship a build missing a just-published doc). Set
// SANITY_USE_CDN=true to opt into the CDN for faster builds when freshness
// isn't time-critical. deploy-live.sh sets SANITY_USE_CDN=false explicitly,
// so prod deploys are always safe regardless of this default.
// TEST (plan_limit_reached on api.sanity.io): CDN is default unless SANITY_USE_CDN=false.
const USE_CDN = process.env.SANITY_USE_CDN !== 'false';

export const sanityClient = createClient({
	projectId: 'pmowd8uo',
	dataset: 'production',
	useCdn: USE_CDN,
	apiVersion: '2024-01-01',
	perspective: 'published',
});

// Draft preview (same pattern as FHB's lib/sanity.ts). Used ONLY when the build sets
// PUBLIC_PREVIEW_DRAFTS=1 (git pushd on dev / a branch preview). Production builds never
// set it, so production renders published documents only. Without a token the drafts
// perspective returns nothing extra, so a missing token degrades to published content.
export const previewClient = createClient({
	projectId: 'pmowd8uo',
	dataset: 'production',
	useCdn: false,
	apiVersion: '2024-01-01',
	token: process.env.SANITY_TOKEN || process.env.SANITY_API_TOKEN || '',
	perspective: 'drafts',
});

const builder = createImageUrlBuilder(sanityClient);
export function urlFor(source: any) {
	return builder.image(source);
}
