import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

const { PUBLIC_SITE_URL } = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");

// ── Sitemap <lastmod> (2tp, 2026-11-11) ────────────────────────────────────────
// lastmod USED to be `new Date()` for every URL: each deploy told Google all 43 pages changed
// now, which teaches it to ignore the signal. Same honest-date approach as FHB: each URL gets
// max( the page's own JSON-LD "dateModified" in the built HTML,
//      the last git commit date of its static source src/pages/<path>(.astro|/index.astro) ).
// No date known (e.g. a dynamic route with no dateModified) = NO lastmod. Absent is honest;
// invented is not. @astrojs/sitemap runs serialize at astro:build:done, so dist/ is written.
const DIST = path.resolve("dist");
const builtHtml = (url) => {
  try {
    const p = new URL(url).pathname;
    const f = p.endsWith("/") ? path.join(DIST, p, "index.html") : path.join(DIST, `${p}.html`);
    return fs.readFileSync(f, "utf8");
  } catch {
    return "";
  }
};
const GIT_DATES = (() => {
  const m = new Map();
  try {
    const out = execFileSync("git", ["log", "--format=@%cI", "--name-only", "--", "src/pages"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    let date = "";
    for (const line of out.split("\n")) {
      if (line.startsWith("@")) date = line.slice(1, 11);
      else if (line && !m.has(line)) m.set(line, date);
    }
  } catch {
    /* no git: no git dates, never a guess */
  }
  return m;
})();
function lastmodFor(url) {
  const dates = [];
  const dm = builtHtml(url).match(/"dateModified":"(\d{4}-\d{2}-\d{2})/);
  if (dm) dates.push(dm[1]);
  try {
    const p = new URL(url).pathname.replace(/^\/|\/$/g, "");
    for (const f of p ? [`src/pages/${p}.astro`, `src/pages/${p}/index.astro`] : ["src/pages/index.astro"]) {
      if (GIT_DATES.has(f)) dates.push(GIT_DATES.get(f));
    }
  } catch {
    /* unparsable url: no lastmod */
  }
  return dates.length ? dates.sort().at(-1) : undefined;
}

// https://astro.build/config
export default defineConfig({
  site: PUBLIC_SITE_URL || "http://localhost:4321",
  output: "static",
  build: {
    // Phase 3 of 100 Club plan: small per-page sheets inlined automatically;
    // the full Tailwind bundle is emitted as external CSS and rewritten to
    // async (media="print" onload swap) by scripts/async-css.mjs postbuild.
    // Hand-rolled critical CSS in Layout.astro covers above-fold paint so the
    // async window doesn't cause FOUC. Validated pattern from
    // the-kohler-group (TW v4, same utility profile as SMP).
    inlineStylesheets: 'auto',
  },
  integrations: [
    sitemap({
      // Assign crawl priority by page type
      customPages: [],
      // Keep noindex'd pages (/partnership, /thank-you) out of the sitemap: a sitemap lists only pages we want indexed.
      filter: (page) => !page.includes('/partnership') && !page.includes('/thank-you'),
      serialize(item) {
        const lastmod = lastmodFor(item.url);
        if (lastmod) item = { ...item, lastmod };
        else delete item.lastmod;
        // Blog posts — highest priority, weekly refresh
        if (item.url.includes('/blog/') && item.url !== 'https://spiritmediapublishing.com/blog/') {
          return { ...item, changefreq: 'weekly', priority: 0.9 };
        }
        // Core service pages
        if (['/publishing/', '/marketing/', '/bookstore/', '/express-books/'].some(p => item.url.endsWith(p))) {
          return { ...item, changefreq: 'monthly', priority: 0.85 };
        }
        // Blog index, about, contact
        if (['/blog/', '/about/', '/contact/'].some(p => item.url.endsWith(p))) {
          return { ...item, changefreq: 'weekly', priority: 0.8 };
        }
        // Ministry arms
        if (['/fathers-heart-bible/'].some(p => item.url.endsWith(p))) {
          return { ...item, changefreq: 'monthly', priority: 0.75 };
        }
        // Homepage
        if (item.url === 'https://spiritmediapublishing.com/') {
          return { ...item, changefreq: 'weekly', priority: 1.0 };
        }
        // Utility pages (privacy, terms, thank-you) — exclude from priority crawl
        if (['/privacy/', '/terms/', '/thank-you/'].some(p => item.url.endsWith(p))) {
          return { ...item, changefreq: 'yearly', priority: 0.2 };
        }
        // Default
        return { ...item, changefreq: 'monthly', priority: 0.6 };
      },
    }),
  ],
  vite: {
		server: { allowedHosts: true },
    plugins: [tailwindcss()],
  },
});
