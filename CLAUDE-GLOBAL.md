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
- **main** = always the production branch (triggers Netlify build)

Example: "SSH into Bethel, push to dev, Kevin approves merge to main."

## Full Stack

1. **Astro + Tailwind CSS** — pages and styling
2. **GitHub (Spirit-Media-US)** — code only, never media
3. **Netlify** — hosting, auto-deploys on push to main (1,000 build credits/month)
4. **Cloudflare** — domain, SSL, CDN, security
5. **Cloudflare R2** — all images, audio, video
6. **Sanity (sanity.io)** — CMS for client content editing and media management with auto-optimization
7. **GoHighLevel (GHL)** — CRM & forms for internal sites, tagged by ministry
8. **Claude (claude.ai)** — conversational updates and builds
9. **UptimeRobot** — uptime monitoring (every 5 min, all sites)

### Technical Details

- **Astro version:** Migrating to Astro 5 + Tailwind CSS v4
- **Tailwind v4 pattern:** `@tailwindcss/vite` plugin in astro.config.mjs, `@theme` block in CSS (no tailwind.config.mjs)
- **Build:** `npm run build` → runs `astro check && astro build` → publish directory: `dist`
- **Linting:** Biome (formatting + linting) + Lefthook v2 (pre-commit hooks)
- **Community platform:** Mighty Networks ("Spirit Media Network")

## Launching a New Site

### Phase 1 — Infrastructure
- Create public GitHub repo under Spirit-Media-US
- Add .gitignore blocking all media types
- Connect to Netlify (Spirit Media team, `npm run build`, publish dir: `dist`)
- Create R2 bucket, enable public URL
- Add domain to Cloudflare, activate proxy

### Phase 2 — Structure
- Initialize Astro + Tailwind locally
- Create all pages
- Build global nav and footer
- Rough in hero and page layouts

### Phase 3 — Design and Content
- Add all copy
- Upload media to R2, wire up URLs in code
- Add SEO meta per page (title + description)
- Refine design and UX

### Phase 4 — Pre-Launch QA
- Test all links and navigation
- Test forms → confirm submission reaches GoHighLevel
- Mobile + tablet responsive check
- Lighthouse performance test (target ~90+)
- Confirm sitemap.xml and robots.txt load
- Verify analytics firing
- Cross-browser test: Safari, Chrome, Firefox
- Check OG image / title / description
- Verify favicon loads
- No console errors

### Phase 5 — Launch
- Connect custom domain in Netlify
- Confirm SSL (www and apex) in Cloudflare
- Ensure Cloudflare proxy is orange (Proxied) on all DNS records pointing to Netlify
- Submit sitemap to Google Search Console
- Set up UptimeRobot monitoring
- Enable analytics (Fathom or Plausible)
- Set up Sanity → Netlify deploy webhook (Build Hooks in Netlify + Webhook in Sanity manage dashboard)
- Send client the Client Guide (portal.spiritmediapublishing.com/clients)
- Invite client as member in their Sanity Studio dashboard (the invite email includes their Studio link)

### Phase 6 — Client Delivery
Send client email with: live URL, Sanity Studio link, Client Guide link, and support contact.

## Media Rules

**Media never goes in GitHub.** All repos block media via .gitignore.

- **Images:** Managed through Sanity — clients upload directly in Sanity Studio. Auto-optimized and served via Sanity CDN. No SMP involvement needed.
- **Audio:** Stored in Cloudflare R2 — Kevin uploads manually.
- **Video:** Hosted on YouTube and embedded on site (adds SEO value). R2 as backup when YouTube isn't appropriate.
- **Never rename or delete a live R2 file** — it will break every page that references it. Sanity handles its own references safely.

### R2 Bucket & Custom Domain

One bucket organized by site, served from a clean subdomain: **assets.spiritmediapublishing.com**

```
spirit-media-assets/
├── spirit-media-publishing/  (videos, audio, pdfs)
├── fathers-heart-bible/      (audio, videos)
├── work-on-yourself/         (audio)
└── believers-library/        (videos)
```

Shared assets (logos used across sites) go in `spirit-media-publishing/`. Name files **lowercase with hyphens:** `genesis-chapter-1-audio.mp3`

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

### Embedding a GHL Form in Astro

```html
<!-- In your .astro file -->
<div class="ghl-form-wrapper">
  <!-- Paste GHL embed code here -->
</div>
```

Request embed codes from Kevin. He creates forms in GHL with proper tags and pipelines.

## Integrations & MCP Servers

Five MCP integrations are configured on the dev server:

| Integration | Type | Purpose |
|-------------|------|---------|
| **Sanity** | Remote MCP (mcp.sanity.io) | Content management, image assets |
| **Netlify** | npx @netlify/mcp | Hosting, deploys, build status |
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

All developers have **individual SSH accounts** but share **one universal Claude Code account** (authenticated via Kevin's Claude Team OAuth). No individual ANTHROPIC_API_KEY needed.

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
- **Tokens stored:** SANITY_API_TOKEN, NETLIFY_PERSONAL_ACCESS_TOKEN, CLOUDFLARE_API_TOKEN, GHL_API_TOKEN, GHL_AGENCY_TOKEN, ANTHROPIC_API_KEY
- **Env files:** Keep .env files in `/home/deploy/bin/`
- **Global CLAUDE.md:** `/home/deploy/CLAUDE.md` — system-wide dev rules
- **MCP config:** `/home/deploy/.claude/settings.json` (also symlinked/copied to user accounts)
- **Onboarding doc:** `/home/deploy/ONBOARDING.md`
- **Sites directory:** `/home/deploy/Sites/` (all repos cloned)

### VPS Port Allocation

Each site gets a dedicated port so multiple dev servers can run simultaneously:

| Site | Port |
|------|------|
| SMP | 4321 (default) |
| artsbyjustin | 4322 |
| FHB | 4323 |
| WOY | 4324 |
| The Kohler Group | 4325 |
| Portal | 4326 |

## Deployment Workflow

All work happens on **dev**. Only merge to **main** when ready to publish. Each push to main = one Netlify build credit (1,000/month).

1. **Switch to dev:** `git checkout dev`
2. **Preview locally:** `npm run dev` → localhost:4321 — never push without previewing first
3. **Build before merging:** `npm run build`
4. **Commit and push:** `git add . && git commit -m "message" && git push origin dev`
5. **Merge to main (Kevin approval only):** `git checkout main && git merge dev && git push origin main && git checkout dev`

## Deploy Troubleshooting

When a Netlify build fails, check: app.netlify.com → Deploys → failed deploy → Deploy log. **Scroll to the bottom first** — the final error message is usually the root cause.

| Error | Cause | Fix |
|-------|-------|-----|
| Cannot find module | Missing dependency | `npm install` and commit package-lock.json |
| Build exceeded memory | Too many large images/files in build | Move media to R2, not `public/` |
| AstroError | Syntax or component error | Run `npm run build` locally first — fix before pushing |
| 404 after deploy | Publish dir wrong or page not generated | Confirm publish dir is `dist` in Netlify settings |
| DNS_PROBE_FINISHED | Cloudflare DNS misconfigured | Verify CNAME points to Netlify and proxy is orange |

## If Something Goes Wrong

- **Site looks broken after your push** — Tell Kevin immediately with a description of what you changed.
- **Merge conflict** — Don't force push. Stop and message Kevin immediately.
- **Netlify build failed** — Check the Netlify dashboard and share the error log with Kevin.

## Uptime Monitoring

UptimeRobot checks every site every 5 minutes and sends email alerts if anything goes down. Every SMP site must be added to UptimeRobot after launch.

**If you receive a downtime alert:** Do not push a new build. First check if the issue resolves on its own within 2 minutes (Netlify occasionally has brief outages). If it persists, check the Netlify dashboard and notify Kevin.

## Best Practices

- Always preview before pushing: `npm run dev`
- Always build before merging to main: `npm run build`
- Never commit media files to Git
- Never rename or delete a live media file
- One push to main per session — batch all changes first
- Pricing off all public pages
- Internal site forms route to GHL, tagged by site
- Keep .env files in `/home/deploy/bin/`
- Use meaningful commit messages
- Kevin approves all merges to main
- Before pushing any fix, verify it doesn't break something else — check affected pages on mobile and desktop

## Pre-Commit Content Protection — MANDATORY FOR ALL SITES

Structured data, SEO content, and custom components have been lost multiple times when new sessions overwrote prior session work without checking. Before committing any `.astro` file:

1. **Read the current file first.** Never edit a file based on memory of what it contained — always read the live version on disk before making changes.
2. **Run `git diff HEAD` before every commit** and review every removed line (`-`). If a line containing any of the following was removed and you didn't explicitly intend to remove it — stop and restore it:
   - `application/ld+json` — JSON-LD structured data
   - `<iframe` — YouTube embeds or other iframes
   - `MailtoLink` — email CTA components
   - `title=` / `description=` — SEO meta fields
   - `Barbara Kohler` — brand name in SEO or content
3. **Never replace YouTube `<iframe>` embeds with `<video>` tags.** The `<video>` tag requires a local file; YouTube embeds are always iframes.
4. **Never overwrite SEO titles/descriptions** during unrelated work (layout fixes, image updates, etc.) — they are separate from visual changes and must be preserved exactly.
5. **Each session must treat prior session work as sacred.** The fact that you didn't write something in this session does not mean it can be removed. Check git log to understand what exists before overwriting.

## Git Rules

- All work goes to the **dev branch** — never push directly to main
- Only merge dev to main when Kevin says "push to main"
- One push to main = one Netlify build credit (1,000/month). Merge only when ready to go live

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
- **Per-site CLAUDE.md** files travel with the repo via git — `git pull` syncs context across all machines

## Team & Contact Routing

| Problem | Contact |
|---------|---------|
| Build failures, Git conflicts, server access | Kevin |
| Content updates, copy changes | Kevin |
| Design decisions, domain/DNS, Netlify, merge approvals | Kevin |
| GHL forms, CRM, marketing automation | Kevin |
| Client requests | Kevin |

### Team Roles

- **Kevin White** — Owner, final approval, content, Netlify/domains
- **Nathan** — Technical lead, Git conflicts, team onboarding, VPS admin
- **Shelly White (COO)** — Content updates
- **Justin Keishing** — Artist (Arts by Justin site)
- **Jim Matuga, Sheila Hoffman, Adam Gross** — Submit requests to Kevin

## Google Analytics

- **Account:** admin@spiritmedia.us
- **Google Tag Manager ID:** 526725965
- **GA4 Property ID:** G-W3R21TNHTX

## Credentials & Secrets

All sensitive credentials stored in **Bitwarden Vault**. Ask a team lead for access. **Never commit tokens or secrets to Git.**

## Developer Quick Start Checklist

1. Request Tailscale VPN access
2. Ask for Bitwarden vault invitation
3. Add SSH config to `~/.ssh/config`:
   ```
   Host bethel
     HostName 100.114.220.65
     User deploy
     IdentityFile ~/.ssh/id_ed25519
   ```
4. SSH into Bethel: `ssh bethel`
5. Access Code Server: dev.spiritmediapublishing.com
6. Set up GitHub SSH key (generate ed25519 key, add public key at github.com/settings/keys)
7. Clone repos from Spirit-Media-US org
8. Install dependencies: `npm install`
9. Read the Playbook for deployment workflow

## Portal & Resources

- **Internal portal:** portal.spiritmediapublishing.com (PIN: 060622)
- **Code Server:** dev.spiritmediapublishing.com (Tailscale VPN required)
- **Team Guide:** Google Doc (https://docs.google.com/document/d/1uA0MV3gWLk_x6T8jn2xeEgYtq8kLa5YRipnzQLVm4zE/edit)
- **UptimeRobot:** https://uptimerobot.com/dashboard
- **Astro docs:** https://docs.astro.build
- **Sanity docs:** https://www.sanity.io/docs
- **Tailwind docs:** https://tailwindcss.com/docs
- **Netlify docs:** https://docs.netlify.com
- **Cloudflare:** https://dash.cloudflare.com
- **GitHub:** https://github.com/Spirit-Media-US
