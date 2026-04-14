# Spirit Media Publishing — Website Development

> **CLAUDE.md belongs in version control — NEVER add it to .gitignore. This file is the shared source of truth for all developers and all Claude Code sessions.**

You are helping Spirit Media Publishing build and maintain websites.

## Context Management Rules

- **Be surgical.** Read only the lines you need, not entire files. Use `offset` and `limit` on Read calls.
- **Don't re-read files** you've already seen in this session unless they've changed.
- **Don't spawn agents** for simple lookups — use Read, Grep, or Glob directly.
- **Keep responses concise.** Don't repeat back large code blocks the user already has.
- **One edit at a time.** Make targeted edits, don't rewrite whole files.

## Naming Conventions

- **bethel** = the server (Hetzner VPS at 100.114.220.65)
- **dev** = always the git branch (where all work happens)
- **main** = always the production branch (triggers Cloudflare Pages build)

Example: "SSH into Bethel, push to dev, Kevin approves merge to main."

## Full Stack

1. **Astro + Tailwind CSS** — pages and styling
2. **GitHub (Spirit-Media-US)** — code only, never media
3. **Cloudflare Pages** — hosting, auto-deploys on push to main (free production deploys)
4. **Cloudflare** — domain, SSL, CDN, security
5. **Cloudflare R2** — all images, audio, video
6. **Sanity (sanity.io)** — CMS for client content editing and media management with auto-optimization
7. **GoHighLevel (GHL)** — CRM & forms for internal sites, tagged by ministry
8. **Claude (claude.ai)** — conversational updates and builds
9. **UptimeRobot** — uptime monitoring (every 5 min, all sites)

### Technical Details

- **Astro version:** Migrating to Astro 5 + Tailwind CSS v4
- **Tailwind v4 pattern:** `@tailwindcss/vite` plugin in astro.config.mjs, `@theme` block in CSS (no tailwind.config.mjs)
- **Build:** `npm run build` runs `astro check && astro build` — publish directory: `dist`
- **Linting:** Biome (formatting + linting) + Lefthook v2 (pre-commit hooks)
- **Community platform:** Mighty Networks ("Spirit Media Network")

## Pipelines

SMP runs automated pipelines for client work. Each pipeline is fully self-contained — its complete spec lives in its own CLAUDE.md. This file is a routing index only.

**Backend:** Python stdlib HTTP server at `/home/deploy/bin/tools-api/` (port 4327, runs 24/7 on Bethel) — NO Flask, no frameworks
**Repo:** `github.com/Spirit-Media-US/tools-api` (private) — all pipeline code is version-controlled here
**Portal UI:** `portal.spiritmediapublishing.com/pipelines`
**How to add a pipeline:** See `/home/deploy/bin/tools-api/CLAUDE.md`

### Pipeline Index

| Pipeline | Location | What It Does |
|----------|----------|--------------|
| **Website Migration** | `/home/deploy/bin/tools-api/pipelines/migration/` | Full site build/migration — 8 phases (The Transformation System) |
| **Manuscript Review** | `/home/deploy/bin/tools-api/pipelines/manuscript/` | AI-powered book/content review → Google Doc |
| **SMP Blog** | `/home/deploy/bin/tools-api/pipelines/blog/` | Parse + publish blog posts to Sanity CMS |

When Kevin mentions a pipeline by name, navigate to its folder and read its CLAUDE.md — that is the complete spec.

### Per-Site CLAUDE.md — Required Template

Every repo must have a CLAUDE.md in its root. Use this as the starting template:

```
# [Site Name]

This site: [Site Name] | Repo: github.com/Spirit-Media-US/[repo] | Domain: [domain] | Sanity ID: [id]

## Dev Commands
- npm run dev — local preview
- npm run build — production build to dist/

## Stack
- Astro 5 + Tailwind CSS v4
- Sanity Studio at [site].sanity.studio

## Status — as of [DATE]
### Completed & Live on Main
### Still Pending

## Rules
- All work goes to the dev branch — never push directly to main
- Only merge dev to main when Kevin says "push to main"
```

## Media Rules

**Media never goes in GitHub.** All repos block media via .gitignore.

- **Images:** Managed through Sanity — clients upload directly in Sanity Studio. Auto-optimized and served via Sanity CDN. No SMP involvement needed.
- **Audio:** Stored in Cloudflare R2 — Kevin uploads manually.
- **Video:** Hosted on YouTube and embedded on site (adds SEO value). R2 as backup when YouTube is not appropriate.
- **Never rename or delete a live R2 file** — it will break every page that references it. Sanity handles its own references safely.

### R2 Bucket & Custom Domain

One bucket organized by site, served from: **assets.spiritmediapublishing.com**

```
spirit-media-assets/
├── spirit-media-publishing/  (videos, audio, pdfs)
├── fathers-heart-bible/      (audio, videos)
├── work-on-yourself/         (audio)
└── believers-library/        (videos)
```

Shared assets go in `spirit-media-publishing/`. Name files lowercase with hyphens: `genesis-chapter-1-audio.mp3`

### How to Add Media to R2

1. Client shares Google Drive folder with Kevin
2. Kevin downloads and organizes files
3. Upload to the correct site folder in R2 at dash.cloudflare.com
4. File is live immediately at `assets.spiritmediapublishing.com/[site]/[file]`
5. Kevin updates site code to point to the new R2 URL

For images, clients upload directly in Sanity Studio — no R2 or SMP involvement needed.

## Forms & GoHighLevel

For Spirit Media internal sites, contact forms route to GHL CRM, tagged by site. For client sites, forms use the client's own provider unless they opt into GHL.

### GHL Tagging Strategy (Internal Sites)

| Form / Entry Point | GHL Tag | Pipeline |
|---------------------|---------|----------|
| SMP general contact | source:smp | General Inquiry |
| Father's Heart Bible | source:fhb | FHB Waitlist |
| Work On Yourself coaching | source:woy | Coaching |
| Believer's Library waitlist | source:believers-library | App Launch |
| Kingdom Messenger signup | source:kingdom-messenger | Newsletter |
| Prayer request forms | source:prayer | Pastoral Care |

## Integrations & MCP Servers

| Integration | Type | Purpose |
|-------------|------|---------|
| **Sanity** | Remote MCP (mcp.sanity.io) | Content management, image assets |
| **Netlify** (legacy) | npx @netlify/mcp | Legacy — hosting migrated to Cloudflare Pages |
| **Cloudflare** | npx @cloudflare/mcp-server-cloudflare | DNS records, SSL, CDN, R2 |
| **GoHighLevel (GHL)** | Remote MCP (services.leadconnectorhq.com) | Forms, CRM contacts, marketing automation |
| **Google Docs** | npx @a-bonus/google-docs-mcp | Team documents, content drafts |

**Known issue:** Environment variable tokens ($SANITY_API_TOKEN, $NETLIFY_PAT, $CF_API_TOKEN) do NOT expand in MCP config. Only hardcoded tokens work. GHL and Google Docs tokens are hardcoded and work correctly.

## Dev Server — Bethel

- **Platform:** Hetzner CCX33 (8 vCPU, 32GB RAM, 240GB NVMe), Ubuntu 22.04, Ashburn VA
- **Access:** Tailscale VPN only (IP: 100.114.220.65)
- **SSH:** `ssh bethel` (configured in ~/.ssh/config)
- **Code Server:** dev.spiritmediapublishing.com (VS Code in browser, requires Tailscale VPN)
- **Claude Code:** Installed, authenticated via OAuth (Claude Team subscription — no API key needed)

### VPS User Accounts

| User | Role | Home Directory |
|------|------|----------------|
| kevin | Owner / final approval | /home/kevin |
| nathan | Technical lead / Git / onboarding | /home/nathan |
| justin | Artist (Arts by Justin) | /home/justin |
| jufrey | Developer | /home/jufrey |
| support | Support access | /home/support |
| deploy | Shared service account (secrets, config) | /home/deploy |

### VPS Secrets & Config

- **Secrets file:** `/home/deploy/.secrets` (chmod 600, sourced by .bashrc)
- **Tokens stored:** SANITY_API_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_PAGES_TOKEN, GHL_API_TOKEN, GHL_AGENCY_TOKEN, NETLIFY_PERSONAL_ACCESS_TOKEN (legacy/dormant) (Claude Code uses OAuth — no API key stored)
- **Env files:** Keep .env files in `/home/deploy/bin/`
- **Global CLAUDE.md:** `/home/deploy/CLAUDE.md` — system-wide dev rules
- **MCP config:** `/home/deploy/.claude/settings.json`
- **Onboarding doc:** `/home/deploy/ONBOARDING.md`
- **Sites directory:** `/home/deploy/Sites/` (all repos cloned)

### VPS Port Allocation

| Site | Port |
|------|------|
| SMP | 4321 |
| artsbyjustin | 4322 |
| FHB | 4323 |
| WOY | 4324 |
| The Kohler Group | 4325 |
| Portal | 4326 |
| Tools API (Bethel) | 4327 — reserved, do not assign to dev servers |
| clowning-from-the-heart | 4328 |
| scripture-alive | 4329 |
| 10-billion-travelers | 4330 |

## Mandatory Session Start — Every Claude Session

Before touching any file in a repo, always run:
```
git checkout dev && git pull origin dev
```
No exceptions. This prevents overwriting work from other sessions or the auto-save cron.

## Inspect Dev Preview

After pushing to dev, say **"inspect dev preview"** in your Claude session. Claude will:
1. Read the site's CLAUDE.md to get the site name and Cloudflare Pages project slug
2. Run both technical and visual inspection (Playwright) against `dev.<project>.pages.dev`
3. Report errors (broken images, wrong text, empty sections, layout issues) and warnings (missing SEO, placeholder text)
4. Fix issues immediately in the same session

This replaces local dev servers and Playwright screenshots. The developer pushes to dev, the Cloudflare Pages preview builds, then "inspect dev preview" catches issues before Kevin reviews.

## Deployment Workflow

All work happens on **dev**. Only merge to **main** when ready to publish. Pushes to main trigger a Cloudflare Pages production build (free, no credit limit).

1. **Switch to dev:** `git checkout dev`
2. **Build:** `npm run build`
3. **Commit and push:** `git add . && git commit -m "message" && git push origin dev`
4. **Inspect:** Say "inspect dev preview" — fix any issues found
5. **Merge to main:**
   - **Kevin requesting deploy:** Use direct API merge — no PR, no notification email:
     ```
     source /home/deploy/.secrets && gh api /repos/Spirit-Media-US/[repo]/merges -X POST -f base=main -f head=dev -f commit_message="Deploy: [description]" && git checkout dev && git merge origin/main && git push origin dev
     ```
   - **Team requesting deploy:** Run `/home/deploy/bin/request-deploy.sh "description of changes"` — opens PR and texts Kevin automatically. Stop here. Do not merge.
   - **Direct `git push origin main` is blocked** by Lefthook on all repos

## Deploy Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| Cannot find module | Missing dependency | `npm install` and commit package-lock.json |
| Build exceeded memory | Too many large images/files in build | Move media to R2, not `public/` |
| AstroError | Syntax or component error | Run `npm run build` locally first — fix before pushing |
| 404 after deploy | Publish dir wrong or page not generated | Confirm publish dir is `dist` in Cloudflare Pages settings |
| DNS_PROBE_FINISHED | Cloudflare DNS misconfigured | Verify CNAME points to `<project>.pages.dev` and proxy is orange |

## Uptime Monitoring

UptimeRobot checks every site every 5 minutes. Every SMP site must be added after launch.

**If you receive a downtime alert:** Do not push a new build. Wait 2 minutes first. If it persists, check Cloudflare Pages and notify Kevin.

## Best Practices

- Always preview before pushing: `npm run dev`
- Always build before merging to main: `npm run build`
- Never commit media files to Git
- Never rename or delete a live media file
- Batch changes before merging to main
- Pricing off all public pages
- Internal site forms route to GHL, tagged by site
- Keep .env files in `/home/deploy/bin/`
- Use meaningful commit messages
- Kevin approves all merges to main

## Pre-Commit Content Protection — MANDATORY FOR ALL SITES

Before committing any .astro file:

1. **Read the current file first.** Never edit based on memory — always read the live version.
2. **Run `git diff HEAD` before every commit** and review every removed line. If any of these were removed unintentionally, restore them:
   - `application/ld+json` — JSON-LD structured data
   - `<iframe` — YouTube embeds or other iframes
   - `MailtoLink` — email CTA components
   - `title=` / `description=` — SEO meta fields
   - `Barbara Kohler` — brand name in SEO or content
3. **Never replace YouTube `<iframe>` embeds with `<video>` tags.**
4. **Never overwrite SEO titles/descriptions** during unrelated work.
5. **Each session must treat prior session work as sacred.**

## Footer Copyright — MANDATORY FOR ALL SITES

Every SMP site footer MUST use this exact copyright format:

```
© {year} {SITE_NAME}. All rights reserved. • Powered by <a href="https://spiritmediapublishing.com">Spirit Media</a>
```

- No "Copyright by". No pipe (`|`) separators. No Privacy Policy link in the copyright bar.
- `{SITE_NAME}` = the client-facing site name (e.g., "Global Hope India", "The Kohler Group")
- `{year}` = dynamic via `new Date().getFullYear()`
- "Spirit Media" links to `https://spiritmediapublishing.com` (not spiritmedia.us)
- This is non-negotiable. Every new site, every migration, every redesign uses this exact format.

## Git Rules

- All work goes to the **dev branch** — never push directly to main
- Only merge dev to main when Kevin says "push to main"
- Pushes to main trigger Cloudflare Pages production builds (free). Merge only when ready to go live

## Content & Business Rules

- Pricing off all public pages (kept for sales conversations only)
- All contacts to GHL
- Media always to R2 or Sanity
- Content tone: pastoral over corporate — Kevin makes all design and content decisions directly
- Community-first funnel: visitors funneled through free Mighty Networks community before scheduling calls

## Active Web Properties

| Site | Directory | Repo | Domain | Astro Version |
|------|-----------|------|--------|---------------|
| Spirit Media Publishing (SMP) | `spirit-media-publishing/` | Spirit-Media-US/spirit-media-publishing | spiritmediapublishing.com | 4.x (upgrading) |
| Father's Heart Bible (FHB) | `FHB/` | Spirit-Media-US/FHB | fathersheartbible.com / fathersheartbible.org | 5.x |
| Work On Yourself (WOY) | `WOY/` | Spirit-Media-US/WOY | workonyourself.com | 4.x (upgrading) |
| The Kohler Group | `the-kohler-group/` | Spirit-Media-US/the-kohler-group | thekohlergroup.net | 4.x (upgrading) |
| Arts by Justin | `artsbyjustin/` | Spirit-Media-US/artsbyjustin | artsbyjustin.com | 5.x |
| Portal | `portal-bw/` | Spirit-Media-US/spirit-media-portal | portal.spiritmediapublishing.com | 4.x (upgrading) |

## Active Services

| Service | Directory | Repo | Purpose |
|---------|-----------|------|---------|
| Tools API | `bin/tools-api/` | Spirit-Media-US/tools-api (private) | Stdlib HTTP pipeline server — migration, manuscript, blog |

## Sanity Project IDs

| Site | Sanity ID |
|------|-----------|
| Spirit Media Publishing | `pmowd8uo` |
| Father's Heart Bible | `rusi1hyi` |
| Work On Yourself | `u8tg0g1c` |
| The Kohler Group | `2bom5gqg` |
| Arts By Justin | `oqoqh3p3` |

## Session Best Practices

- **Mac Claude Code:** Planning, strategy, reviewing screenshots, multi-site coordination
- **Bethel Claude Code** (VPS terminal): Building, editing files, running builds, git operations
- **Multiple parallel sessions:** Open multiple SSH tabs to bethel, run `claude` in each, one site per tab
- **Start each bethel session with:** `cd ~/Sites/<repo-name>` then `claude` — it reads CLAUDE.md automatically
- **End each session:** Ask Claude to "update CLAUDE.md status section with what we did"

## Team & Contact Routing

- Build failures, Git conflicts, server access → Kevin
- Content updates, copy changes → Kevin
- Design decisions, domain/DNS, Cloudflare Pages, merge approvals → Kevin
- GHL forms, CRM, marketing automation → Kevin
- Client requests → Kevin

### Team Roles

- **Kevin White** — Owner, final approval, content, Cloudflare Pages/domains
- **Shelly White (COO)** — Content updates
- **Justin Keishing** — Artist (Arts by Justin site)
- **Jim Matuga, Sheila Hoffman, Adam Gross** — Submit requests to Kevin

## Google Analytics

- **Account:** admin@spiritmedia.us
- **Google Tag Manager ID:** 526725965
- **GA4 Property ID:** G-W3R21TNHTX

## Credentials & Secrets

All sensitive credentials stored in **Bitwarden Vault**. Never commit tokens or secrets to Git.

## Developer Quick Start Checklist

1. Request Tailscale VPN access
2. Ask for Bitwarden vault invitation
3. Add SSH config to `~/.ssh/config` with Host bethel, HostName 100.114.220.65, User deploy
4. SSH into Bethel: `ssh bethel`
5. Access Code Server: dev.spiritmediapublishing.com
6. Set up GitHub SSH key
7. Clone repos from Spirit-Media-US org
8. Install dependencies: `npm install`

## Portal & Resources

- **Internal portal:** portal.spiritmediapublishing.com (PIN: 060622)
- **Code Server:** dev.spiritmediapublishing.com (Tailscale VPN required)
- **UptimeRobot:** https://uptimerobot.com/dashboard
- **GitHub:** https://github.com/Spirit-Media-US
