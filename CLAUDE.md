# Spirit Media Publishing (SMP) — Flagship Site

> **CLAUDE.md belongs in version control — NEVER add it to .gitignore. This file is the shared source of truth for all developers and all Claude Code sessions.**

This site: Spirit Media Publishing | Repo: github.com/Spirit-Media-US/spirit-media-publishing | Domain: spiritmediapublishing.com | Sanity ID: pmowd8uo | R2 bucket: n/a (planned)

## Dev Commands

- `npm run dev` — local preview at localhost:4321
- `npm run build` — production build to dist/

## Key Features

- Blog with pagination (6/page), keyword search, tag filter chips (8 SEO categories), RelatedPosts.astro component
- Bookstore with 117 books, client-side search/filter/sort
- Sitemap with custom serialize() by page type

## Status — as of 2026-03-24

### Completed & Live on Main
- Full site live at spiritmediapublishing.com
- Pages: Home, About, Blog, Bookstore, Portfolio, Publishing, Marketing, Media Center, Contact, Join, Privacy, Terms, Thank You
- Sub-site landing pages: Believers Library, Father's Heart Bible, Work On Yourself, Kingdom Messenger Collective, Express Books
- Sanity CMS: blog posts + site settings (nav, footer, contact info, OG image)
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
