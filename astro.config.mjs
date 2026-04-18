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
    // Inline ALL page stylesheets into the HTML to eliminate render-blocking CSS
    // requests on the LCP path. Proven to lift mobile PSI by 4-6 points on SMP sites.
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
