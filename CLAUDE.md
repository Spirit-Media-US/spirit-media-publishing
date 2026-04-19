# Spirit Media Publishing (SMP) — Flagship Site

> **CLAUDE.md belongs in version control — NEVER add it to .gitignore. This file is the shared source of truth for all developers and all Claude Code sessions.**

This site: Spirit Media Publishing | Repo: github.com/Spirit-Media-US/spirit-media-publishing | Domain: spiritmediapublishing.com | Sanity ID: pmowd8uo | R2 bucket: n/a (planned)

## Dev Commands

- `npm run dev` — local preview at localhost:4321
- `npm run build` — production build to dist/

## Mandatory — Before Starting Work
Always start Claude sessions from inside this directory:
```
cd /srv/sites/spirit-media-publishing && claude
```
Running Claude from ~/ or ~/Sites/ bypasses this project's CLAUDE.md. A pre-edit hook enforces this, but following the workflow prevents warnings and ensures all project rules are loaded.

Then run: `git checkout dev && git pull origin dev`

## Key Features

- Blog with pagination (6/page), keyword search, tag filter chips (8 SEO categories), RelatedPosts.astro component
- Bookstore with 117 books, client-side search/filter/sort
- Sitemap with custom serialize() by page type

**Migration protocol:** /home/deploy/bin/tools-api/pipelines/migration/CLAUDE.md
**Sanity Studio:** Embedded at spiritmediapublishing.com/studio/ (static build)
**Infrastructure:** Deploy webhook wired, CORS origins configured, studio deployed

## Status — as of 2026-04-08

### Completed & Live on Main
- Full site live at spiritmediapublishing.com
- Pages: Home, About, Blog, Bookstore, Portfolio, Publishing, Marketing, Media Center, Contact, Join, Privacy, Terms, Thank You
- Sub-site landing pages: Believers Library, Father's Heart Bible, Work On Yourself, Kingdom Messenger Collective, Express Books
- Sanity CMS: blog posts + site settings (nav, footer, contact info, OG image)
- Sanity Studio embedded at /studio with deploy webhook and CORS configured
- Blog: pagination (6/page), keyword search, tag filter chips (8 SEO categories), RelatedPosts component
- Bookstore: 117 books, client-side search/filter/sort
- Portfolio: website showcase, video production, podcast sections
- Custom sitemap with serialize() by page type
- Git hygiene: Lefthook hooks (block-main-push, large-file blocker, secret scanner), full .gitignore

### Still Pending
- Astro 5 + Tailwind v4 upgrade (currently Astro 4.x)
- R2 bucket setup for media assets
- Sanity CMS migration for bookstore and static page content

## Rules

- All work goes to the **dev** branch — never push directly to main
- Only merge dev to main when Kevin says "push to main"
- Never push without local preview first

---

## Stitch MCP — AI Design Tool

Google Stitch 2.0 is an MCP server available in this project for AI-powered design work. It generates full page designs and auto-creates design systems (colors, typography, component rules). The MCP config is already symlinked into this repo (`.mcp.json`).

**When to use:** When Kevin asks for design work, new page layouts, or visual redesigns. Use Stitch first to get 80–90% of the design done visually, then implement in Astro/Tailwind.

**Available tools (prefixed `mcp__stitch__`):**
`create_project`, `generate_screen_from_text`, `create_design_system`, `apply_design_system`, `edit_screens`, `generate_variants`, `list_projects`, `list_screens`, `get_screen`, `get_project`, `list_design_systems`, `update_design_system`

**Workflow:**
1. Screenshot or paste URL into Stitch as style reference
2. Stitch generates full design + auto-creates design system
3. Export design.md / design system from Stitch
4. Hand off to Claude Code for Astro/Tailwind implementation

**Rules:**
- Use Gemini 3.1 Pro in Stitch (not 3.0 Flash)
- Stitch auto-generates a `design.md` — keep it in the project root for consistency
- This is the standard SMP workflow for all new site builds and major redesigns

---

## 100 Club commitments (locked — do not regress)

**100 Club bar (all pages, current and future — anything less is not acceptable):**
- **Homepage**: desktop 100/100/100/100, mobile 100/100/100 + Perf ≥ 95 (flagship, median-of-5)
- **Every other page**: mobile ≥ 90, desktop ≥ 95 (Google's "Good" zone, median-of-3)
- v4 execute plan brings the homepage into the 100 Club; inner pages are enforced by this site-wide tiered bar.

SMP is in the 100 Club (desktop 100/100/100/100, mobile 100/100/100/100 as of 2026-04-19). Every commitment below is a LOAD-BEARING structural decision. Do not "re-add" any of them without understanding the consequences.

### Hero image is R2-only, NOT Sanity
- **URL**: `https://assets.spiritmediapublishing.com/spirit-media-publishing/hero-{mobile,tablet,desktop}.webp`
- **Why**: same origin as fonts (one TLS), stable URL enables 103 Early Hints, hardcoded URL survives Sanity edits without rebuild
- **To change the hero**: upload three new WebPs (640w/800w/1200w, q=75/75/80) to the R2 path above. **Sanity has NO hero image field** — the `homepageHeroImage` schema field was removed 2026-04-19. Only `homepageHeroImageAlt` (alt text) remains editable via Sanity.

### CSS must stay wrapped in @layer base
- `Layout.astro`'s `<style is:inline>` wraps everything in `@layer base` except `@font-face` and `@keyframes`.
- **Why**: unlayered rules beat every `@layer` rule regardless of specificity. Tailwind v4 ships utilities in `@layer utilities`. If critical CSS is unlayered, `.grid-cols-1` overrides external `.lg:grid-cols-4` and grids collapse site-wide (broke prod 2026-04-19).

### ClientRouter is OFF
- No `<ClientRouter />`, no `import { ClientRouter }` in Layout.astro.
- **Why**: static marketing site doesn't need SPA nav. Saved 125ms forced reflow + 100ms script eval on mobile.
- All page JS uses `DOMContentLoaded` with readyState guard.

### GA loads on first user interaction
- Events: scroll, mousemove, touchstart, keydown, click. 8s fallback timeout.
- **Why**: Lighthouse never interacts, so GA doesn't load in audits. Real users get GA after they engage (post-LCP).

### `<a>` elements on dark backgrounds MUST have an explicit Tailwind color class
- Base `a { color: var(--color-red) }` rule in `global.css` applies otherwise → brand red on `bg-ink` = 3.28 contrast (fails WCAG).
- Any new `<a href="tel:">`, `<a href="mailto:">`, or link in a dark section needs `text-stone-400` / `text-stone-100` / similar.

### `[data-animate]` transitions are transform-only, no opacity
- `global.css`: `transition: transform 0.65s cubic-bezier(...)`. **Do NOT add `opacity` back to the transition.**
- **Why**: Lighthouse captures frames mid-transition; a 0.65s opacity fade made 40+ text elements read as ~50% contrast (false failures). Transform-only gives the same visual slide-in without the a11y artifact.

### Early Hints, CSP, X-Robots-Tag in public/_headers
- `X-Robots-Tag: index, follow` overrides CF Pages' default `noindex` on `*.pages.dev`
- CSP allows CF Insights (`static.cloudflareinsights.com` in `script-src`, `cloudflareinsights.com` in `connect-src`)
- `Link:` headers for 2 critical fonts on `/*` + hero image on `/` → CF Pages promotes to HTTP/2 103 Early Hints

### Images: width/height attrs match urlFor dimensions
- Every below-fold `<img>` has both attrs. Any urlFor resize change must update the attrs in the same commit.
- `sizes` attribute = actual display width in px, NOT `100vw` (the latter forces over-delivery at DPR 2).

### Build pipeline
- `inlineStylesheets: 'auto'` (NOT `'always'`)
- `scripts/async-css.mjs` postbuild rewrites external CSS to `media="print" onload` swap (invoked from `package.json` build script)
- No `@playform/inline` / Beasties — incompatible with TW v4 utility-heavy markup
