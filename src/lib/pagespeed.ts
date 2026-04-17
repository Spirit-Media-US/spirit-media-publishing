import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Google PageSpeed Insights — build-time score fetching.
 * Cache file lives at .cache/pagespeed.json and is honored for 24h.
 * Runs once per build (per URL) so repeated builds don't hammer the API.
 */

export interface PageSpeedScores {
	mobile: number | null;
	desktop: number | null;
	fetchedAt: string;
}

const API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const CACHE_PATH = resolve(process.cwd(), '.cache/pagespeed.json');
const TTL_MS = 24 * 60 * 60 * 1000;

type Cache = Record<string, PageSpeedScores>;

function loadCache(): Cache {
	try {
		if (!existsSync(CACHE_PATH)) return {};
		return JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as Cache;
	} catch {
		return {};
	}
}

function saveCache(cache: Cache) {
	mkdirSync(dirname(CACHE_PATH), { recursive: true });
	writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function isFresh(entry: PageSpeedScores | undefined): boolean {
	if (!entry) return false;
	const age = Date.now() - new Date(entry.fetchedAt).getTime();
	return age < TTL_MS;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchStrategy(url: string, strategy: 'mobile' | 'desktop', apiKey: string, attempt = 1): Promise<number | null> {
	const params = new URLSearchParams({ url, strategy, category: 'performance', key: apiKey });
	try {
		const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(45000) });
		if (!res.ok) {
			if ((res.status === 429 || res.status >= 500) && attempt < 3) {
				console.warn(`[pagespeed] ${url} (${strategy}) HTTP ${res.status}, retry ${attempt}/2 after backoff`);
				await sleep(2500 * attempt);
				return fetchStrategy(url, strategy, apiKey, attempt + 1);
			}
			console.warn(`[pagespeed] ${url} (${strategy}) HTTP ${res.status} — giving up`);
			return null;
		}
		const data = (await res.json()) as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
		const raw = data.lighthouseResult?.categories?.performance?.score;
		const score = typeof raw === 'number' ? Math.round(raw * 100) : null;
		console.log(`[pagespeed] ${url} ${strategy} = ${score ?? 'null'}`);
		return score;
	} catch (err) {
		if (attempt < 3) {
			console.warn(`[pagespeed] ${url} (${strategy}) error: ${(err as Error).message}, retry ${attempt}/2`);
			await sleep(2500 * attempt);
			return fetchStrategy(url, strategy, apiKey, attempt + 1);
		}
		console.warn(`[pagespeed] ${url} (${strategy}) final error: ${(err as Error).message}`);
		return null;
	}
}

export async function fetchPageSpeed(url: string): Promise<PageSpeedScores> {
	const cache = loadCache();
	const cached = cache[url];
	if (isFresh(cached) && cached.mobile !== null && cached.desktop !== null) return cached;

	const apiKey = process.env.GOOGLE_PSI_API_KEY;
	if (!apiKey) {
		console.warn('[pagespeed] GOOGLE_PSI_API_KEY not set — returning null scores');
		return { mobile: null, desktop: null, fetchedAt: new Date().toISOString() };
	}

	// Serialize to avoid PSI rate limits — mobile first, then desktop, with small gap.
	const mobile = await fetchStrategy(url, 'mobile', apiKey);
	await sleep(1000);
	const desktop = await fetchStrategy(url, 'desktop', apiKey);

	const fresh: PageSpeedScores = { mobile, desktop, fetchedAt: new Date().toISOString() };
	cache[url] = fresh;
	saveCache(cache);
	return fresh;
}
