# Spirit Media Publishing — Project Status & Knowledge Base
> Last updated: 2026-03-08
> **Claude: Read this file before making any statements about project state or touching any code.**

---

## Stack
- **Framework:** Astro v5 + Tailwind CSS
- **CMS:** Sanity (projectId: `pmowd8uo`, dataset: `production`)
- **Hosting:** Netlify (free plan, public repos required)
- **DNS/Proxy:** Cloudflare (Cloudflare proxy ACTIVE on spiritmediapublishing.com — confirmed via cf-ray header)
- **Email/CRM:** GoHighLevel (GHL), sending domain `mail.spiritmediapublishing.com` via Mailgun
- **Media:** Sanity CDN for images. YouTube for all video. R2 planned for audio.
- **Repo:** `Spirit-Media-US/spirit-media-publishing` (GitHub org)
- **Studio:** https://spiritmediapublishing.sanity.studio

---

## Sanity Document Counts (as of 2026-03-08)
| Type | Count | Notes |
|---|---|---|
| testimonial | 3 | Live on homepage, fetched from Sanity |
| teamMember | 11 | Live on about page, fetched from Sanity |
| pressRelease | 5 | Live on media-center, fetched from Sanity |
| mediaVideo | 9 | YouTube IDs/titles only, no video files in Sanity |
| portfolioVideo | 4 | YouTube embed URLs |
| blogPost | 7 | Fully dynamic via [slug].astro |
| book | 121 | Fully dynamic on /bookstore |
| siteSettings | 1 | phone, email, socials, siteName, tagline, description |


---

## Pages — Sanity Integration Status
| Page | Fetches from Sanity | Still hardcoded |
|---|---|---|
| index.astro | testimonials | All other copy, section images (cdn.sanity.io direct URLs) |
| about.astro | teamMembers | All other copy, section images |
| media-center.astro | pressReleases, mediaVideos | All other copy |
| portfolio.astro | portfolioVideos | Branding images (served from /public) |
| bookstore.astro | books (121) | Layout/copy |
| blog.astro | blogPosts | Layout/copy |
| blog/[slug].astro | full post content | — |
| contact.astro | siteSettings (phone) | All other copy |
| publishing.astro | nothing | Fully hardcoded — intentional (sales page) |
| marketing.astro | nothing | Fully hardcoded — intentional (sales page) |
| express-books.astro | nothing | Fully hardcoded — intentional (sales page) |
| believers-library.astro | nothing | Fully hardcoded — intentional (sales page) |
| fathers-heart-bible.astro | nothing | Fully hardcoded — intentional (sales page) |
| kingdom-messenger-collective.astro | nothing | Fully hardcoded — intentional (sales page) |
| work-on-yourself.astro | nothing | Fully hardcoded — intentional (sales page) |

---

## Components — Sanity Integration Status
| Component | Fetches from Sanity | Notes |
|---|---|---|
| Footer.astro | phone, email, facebook, instagram, youtube, linkedin, twitter | All 7 siteSettings fields wired |
| Navbar.astro | nothing | Logo is stable Sanity CDN URL, hardcoded intentionally |
| Layout.astro | nothing | OG image default is Sanity CDN URL, hardcoded intentionally |

---

## public/ Directory — What's There & Why
- `favicon-final.svg` — correct, stays here
- `robots.txt` — correct, stays here
- `googlef4c0e3e8c84868b9.html` — Google verification, stays here
- `spirit-media-global.css` / `spirit-media-tokens.css` — shared CSS, stays here
- `branding-facebook-1..10.webp` — portfolio page branding images, still in public (not yet migrated to Sanity/R2)
- `branding-twitter-1..9.webp` — same
- `branding-websites-1..9.webp` — same (NOT currently referenced in any page — safe to remove)
- `branding-Audacious.webp`, `branding-Escaping.webp`, `branding-Shepherd.webp` — not referenced in any page
- `mkt-photo-*.jpg` — stock photos, not referenced in any page (safe to remove)
- `testimonials/` — check before removing

---

## Remaining Tasks
| Task | Priority | Notes |
|---|---|---|
| Sanity → Netlify webhook | HIGH | Editors publish in Studio but site doesn't rebuild. Manual step: Netlify build hook URL → Sanity API webhook. No code needed. |
| .env.example rewrite | MEDIUM | Currently documents old SFTP stack. Needs Sanity + R2 variables documented. |
| DMARC policy upgrade | MEDIUM | Currently `p=none` (monitoring only). Upgrade to `p=quarantine` after confirming no legitimate mail failures. DNS edit in Cloudflare only. |
| Remove orphaned public/ images | LOW | mkt-photo-*.jpg and several branding-*.webp not referenced anywhere. Safe to delete after confirming. |
| R2 audio hosting | LOW | .mp3 was in dist at last check. Upload script exists but untested. |
| Portfolio branding images → Sanity/R2 | LOW | branding-facebook-*.webp and branding-twitter-*.webp still served from /public via dynamic loops in portfolio.astro |

---

## Completed & Confirmed
- ✅ Cloudflare proxy active on spiritmediapublishing.com
- ✅ DMARC record exists (p=none, reporting to kevin@spiritmediapublishing.com)
- ✅ All 6 DNS/DKIM records for mail.spiritmediapublishing.com verified in GHL
- ✅ Footer social links fully wired from siteSettings (all 5 platforms)
- ✅ siteSettings schema has all fields: phone, email, facebook, instagram, youtube, linkedin, twitter
- ✅ mediaVideo documents in Sanity (9 YouTube videos)
- ✅ portfolioVideo documents in Sanity (4 embed URLs)
- ✅ Blog fully dynamic from Sanity
- ✅ Bookstore fully dynamic from Sanity (121 books)
- ✅ UptimeRobot monitoring active on all live sites
- ✅ Netlify free plan, all repos public under Spirit-Media-US org
- ✅ No hardcoded /public image references in any .astro page (all images use cdn.sanity.io)

---

## Key Rules (learned the hard way)
- Never store video/audio in Git or public/ — YouTube for video, R2 for audio
- Never run pixel manipulation on images without committing originals to Git first
- Cloudflare CNAME records for mail subdomains must be DNS-only (grey cloud), not proxied
- Netlify import always defaults to personal account — switch to Spirit-Media-US org manually
- Use `astro:page-load` not `pageshow` for post-navigation scripts (ClientRouter intercepts)
- IntersectionObserver threshold must be low (0.04) with fallback timeout — high thresholds break animations on Netlify
- One session = one push = one Netlify build credit
- Always `npm run dev` and preview locally before pushing
