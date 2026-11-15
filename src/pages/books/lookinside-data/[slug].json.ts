// Per-edition Look Inside manifests, fetched by LookInside.astro the first time a viewer opens
// (perf 2uw: 85 inlined copies were ~700KB of /print's HTML). Same item shape the component used
// to inline: { src, label, w, h, n }.
import data from '../../../data/books/lookinside.json';

const ASSETS = 'https://assets.spiritmediapublishing.com/spirit-media-publishing/lookinside';
type Page = { file: string; label: string; w: number; h: number };
// base: a book whose sample lives under another site's prefix (the FHB books, same files on both sites)
type Entry = { dir?: string; base?: string; pages: Page[] };

export function getStaticPaths() {
	return Object.keys(data)
		.filter((k) => !k.startsWith('_'))
		.map((slug) => ({ params: { slug } }));
}

export function GET({ params }: { params: { slug: string } }) {
	const entry = (data as Record<string, Entry>)[params.slug];
	const dir = entry?.dir ?? params.slug;
	const items = (entry?.pages ?? []).map((p, i) => ({
		src: `${entry?.base ?? ASSETS}/${dir}/${p.file}`,
		label: p.label,
		w: p.w,
		h: p.h,
		n: i + 1,
	}));
	return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
}
