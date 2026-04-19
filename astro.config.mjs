import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

const { PUBLIC_SITE_URL } = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");

// https://astro.build/config
export default defineConfig({
  site: PUBLIC_SITE_URL || "http://localhost:4321",
  output: "static",
  build: {
    // 'always' inlines the Tailwind bundle into every HTML response. For SMP's
    // 50KB bundle (TW v4 + custom design tokens) this measured better than
    // 'auto' on desktop PSI (98-99 vs 80) because eliminating the render-
    // blocking external CSS fetch outweighs the HTML-bloat cost. Validated
    // on dev preview 2026-04-19. Font preloads + 103 Early Hints in
    // public/_headers cover the LCP warmup separately.
    // NOTE: Beasties/Critters are NOT compatible with TW v4 utility-heavy
    // markup — JSDOM scan doesn't see responsive variants or @theme utilities,
    // pruning causes CLS when the async bundle re-applies them.
    inlineStylesheets: 'always',
  },
  integrations: [
    sitemap({
      // Assign crawl priority by page type
      customPages: [],
      serialize(item) {
        // Blog posts — highest priority, weekly refresh
        if (item.url.includes('/blog/') && item.url !== 'https://spiritmediapublishing.com/blog/') {
          return { ...item, changefreq: 'weekly', priority: 0.9, lastmod: new Date().toISOString() };
        }
        // AI Websites — high-priority launch page
        if (item.url.endsWith('/ai-websites/') || item.url.endsWith('/ai-websites')) {
          return { ...item, changefreq: 'weekly', priority: 0.95, lastmod: new Date().toISOString() };
        }
        // Core service pages
        if (['/publishing/', '/marketing/', '/bookstore/', '/express-books/'].some(p => item.url.endsWith(p))) {
          return { ...item, changefreq: 'monthly', priority: 0.85, lastmod: new Date().toISOString() };
        }
        // Blog index, about, contact
        if (['/blog/', '/about/', '/contact/'].some(p => item.url.endsWith(p))) {
          return { ...item, changefreq: 'weekly', priority: 0.8, lastmod: new Date().toISOString() };
        }
        // Ministry arms
        if (['/believers-library/', '/fathers-heart-bible/', '/work-on-yourself/', '/kingdom-messenger-collective/'].some(p => item.url.endsWith(p))) {
          return { ...item, changefreq: 'monthly', priority: 0.75, lastmod: new Date().toISOString() };
        }
        // Homepage
        if (item.url === 'https://spiritmediapublishing.com/') {
          return { ...item, changefreq: 'weekly', priority: 1.0, lastmod: new Date().toISOString() };
        }
        // Utility pages (privacy, terms, thank-you) — exclude from priority crawl
        if (['/privacy/', '/terms/', '/thank-you/'].some(p => item.url.endsWith(p))) {
          return { ...item, changefreq: 'yearly', priority: 0.2 };
        }
        // Default
        return { ...item, changefreq: 'monthly', priority: 0.6, lastmod: new Date().toISOString() };
      },
    }),
  ],
  vite: {
		server: { allowedHosts: true },
    plugins: [tailwindcss()],
  },
});
