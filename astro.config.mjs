import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";
import { assertParity, tblSwitch } from "./src/lib/tbl-switch.mjs";

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

// ── SMP worldwide retires itself (Kevin 2026-11-16: "SMP worldwide (showing those available for shipping until we get
// all \"SMP only\" showing)"). BookstoreBody.astro sets globalThis.__smpWorldwideRetired when every SMP-only card is
// orderable here; this build then ships /bookstore/smp-worldwide/ as a 301 to /bookstore/smp/ (its page dropped, so
// the redirect is what answers) and leaves it out of the sitemap. Until then: nothing.
const worldwideRetired = () => globalThis.__smpWorldwideRetired === true;
const smpWorldwideRetire = {
  name: "smp-worldwide-retire",
  hooks: {
    "astro:build:done": ({ dir }) => {
      if (!worldwideRetired()) return;
      const out = new URL(dir).pathname;
      fs.appendFileSync(
        path.join(out, "_redirects"),
        "\n# SMP worldwide == SMP only (build-time check, BookstoreBody.astro): retired\n/bookstore/smp-worldwide/ /bookstore/smp/ 301\n/bookstore/smp-worldwide /bookstore/smp/ 301\n",
      );
      fs.rmSync(path.join(out, "bookstore", "smp-worldwide"), { recursive: true, force: true });
      console.log("[bookstore] SMP worldwide equals SMP only: retired to a 301 -> /bookstore/smp/");
    },
  },
};

// ── TBL SWITCH-OVER (C6; CONTRACT v2 decisions 59 + 61) ──────────────────────────
// Every SMP /books/<slug>/ with a live TBL page 301s to it (src/data/tbl-switchover.json: the slug list and the ONE
// TBL origin; src/lib/tbl-switch.mjs). Written at the TOP of dist/_redirects (see the hook), so
// public/_redirects stays hand-written. The pages still build (their store order box is what /buy/ and the SMP
// store tests read) but leave the sitemap: a sitemap lists only URLs that answer 200. A book with no TBL page keeps
// its SMP page. enabled:false = nothing appended.
const TBL_DATA = JSON.parse(fs.readFileSync(path.resolve("src/data/tbl-switchover.json"), "utf8"));
// PARITY GATE: enabled only while every mapped book is at parity on TBL (src/lib/tbl-switch.mjs assertParity).
const TBL_PARITY_FILE = path.resolve("src/data/tbl-parity.json");
// Named exceptions (slug + check + exact items + reason + ruling) — src/lib/tbl-switch.mjs unexcused().
const TBL_PARITY_EXC = path.resolve("src/data/tbl-parity-exceptions.json");
const readIf = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);
await assertParity(TBL_DATA, readIf(TBL_PARITY_FILE), new Date(), readIf(TBL_PARITY_EXC));
const TBL = tblSwitch(TBL_DATA);
const tblRedirects = {
  name: "tbl-switchover-redirects",
  hooks: {
    "astro:build:done": ({ dir }) => {
      if (!TBL.on) return;
      const lines = TBL.redirectLines();
      // PREPENDED, not appended: Cloudflare Pages counts every rule after the first dynamic one (/books/:slug/buy/)
      // against the 100 dynamic-rule cap and silently drops the rest (2026-11-22 preview: 46 of 146 answered).
      const file = path.join(new URL(dir).pathname, "_redirects");
      fs.writeFileSync(
        file,
        `# TBL switch-over (src/data/tbl-switchover.json): SMP book pages -> ${TBL.origin}/books/<key>\n${lines.join("\n")}\n\n${fs.readFileSync(file, "utf8")}`,
      );
      console.log(`[tbl] ${lines.length / 2} SMP book pages 301 -> ${TBL.origin}`);
    },
  },
};

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
    smpWorldwideRetire,
    tblRedirects,
    sitemap({
      // Assign crawl priority by page type
      customPages: [],
      // Keep noindex'd pages (/partnership, /thank-you) out of the sitemap: a sitemap lists only pages we want indexed.
      // /books/<slug>/buy/ = noindex,follow checkout pages (plan 3fb contract 3fe): never in a sitemap.
      filter: (page) => !(worldwideRetired() && page.includes('/bookstore/smp-worldwide/')) && !page.includes('/partnership') && !page.includes('/thank-you') && !page.includes('/checkout/') && !/\/books\/[^/]+\/buy\/$/.test(page) && !TBL.has((/\/books\/([^/]+)\/$/.exec(page) || [])[1]),
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
