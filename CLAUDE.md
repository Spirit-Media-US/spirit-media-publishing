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

## Status — as of 2026-05-28

### Completed & Live on Main
- Full site live at spiritmediapublishing.com
- Pages: Home, About, Blog, Bookstore, Portfolio, Publishing, Marketing, Media Center, Contact, Join, Privacy, Terms, Thank You
- Sub-site landing pages: Believers Library, Father's Heart Bible, Work On Yourself, Kingdom Messenger Collective, Express Books
- Sanity CMS: blog posts + site settings (nav, footer, contact info, OG image)
- Sanity Studio embedded at /studio with deploy webhook and CORS configured
- Blog index: pagination (6/page), keyword search, tag filter chips (8 SEO categories), RelatedPosts component
- Bookstore: 132 books, client-side search / author / sort / collection-chip filter
- Bookstore Collections: new `collections` array on book schema + `/bookstore/express-books/` marketing URL (dynamic [collection].astro). Express Books currently tags Hallelujah Even Here, Invisible Wounds, Father's Heart - Beloved Identity. Future collections auto-route as the schema list grows.
- Portfolio: website showcase, video production, podcast sections
- Custom sitemap with serialize() by page type
- Git hygiene: Lefthook hooks (block-main-push, large-file blocker, secret scanner), full .gitignore
- **Gold-Level Blog Standard — all 9 posts pass 17/17 hard milestones on prod** (shipped 2026-05-12; deploy `685458b`). Renderer supports `faqs`, `dateModified`, H2 jump-anchors, BlogPosting + FAQPage JSON-LD, BlogCTA component at post bottom.
- 100 Club Auto-Healing System: verified done 2026-05-13 (6 deliverables — CF cache warmer, zone-settings enforcer, median-of-5 nightly, R2 registry auto-refresh, cron self-test, wrong-LCP detector)

### In Flight
- **AEO/GEO Pipeline** — architecture locked 2026-05-12, project assigned to Jufrey, Phase 1 unblocked (Ahrefs subscribed, both Google Docs shared). FHB is Instance 1, SMP is Instance 2. Spec: `/home/deploy/claude-config/rules/smp-aeo-readiness-standard.md`. Jufrey brief: Google Doc `1VDuSwJtBliUypz-hcqgdHJMinQ6JVrQodVx2vQ1xGFc`. Portal: `project show aeo-geo-pipeline`.

### Still Pending
- Astro 5 + Tailwind v4 upgrade (currently Astro 4.x)
- R2 bucket setup for media assets
- Sanity CMS migration for bookstore and static page content
- SMP runs as Instance 2 of the AEO/GEO pipeline after FHB validates (Phase 6 — content rewrite from agency framing to publishing-core target queries)
- GA4 custom channel group for AI referrers (Phase 2 of AEO pipeline, Kevin admin access needed)

## Rules

- All work goes to the **dev** branch — never push directly to main
- Only merge dev to main when Kevin says "push to main"
- Never push without local preview first
