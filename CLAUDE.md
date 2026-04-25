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
