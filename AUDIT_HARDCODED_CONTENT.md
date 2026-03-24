# Spirit Media Publishing - Hardcoded Content Audit

## FINDINGS

### 1. **Contact Information (Hardcoded)**
- **Footer.astro**: Lines hardcoded with defaults:
  - `sitePhone = '1-888-800-3744'`
  - `siteEmail = 'hello@spiritmediapublishing.com'`
  - Social URLs (Facebook, Instagram, YouTube, LinkedIn, Twitter)
  - Address: `205 S Academy St #3251, Cary, NC 27519`
  
- **Contact.astro**: Phone hardcoded as `'1-888-800-3744'`

**Status**: ✅ Already fetches from Sanity (with fallbacks) — GOOD

---

### 2. **Logo (Hardcoded)**
- **Navbar.astro**: Falls back to hardcoded CDN URL:
  ```
  https://cdn.sanity.io/images/pmowd8uo/production/dc16e3c604bd5d52de7647af46836ff418c22898-6575x656.png?w=440&h=88&fit=max&auto=format
  ```
  
- **Footer.astro**: Hardcoded logo in footer:
  ```
  https://cdn.sanity.io/images/pmowd8uo/production/37e09864cdd5c5b0811a221b7f06ce7f15fbcbad-6575x656.png?w=440&h=88&fit=max&auto=format
  ```

**Status**: ⚠️ Navbar already fetches from Sanity.logo, Footer has separate hardcoded URL

---

### 3. **Hero Images (Hardcoded in .astro pages)**
- **index.astro** (homepage):
  - Book collage: `https://cdn.sanity.io/.../83b595b916eeb64126e303f3fc71027c55aa6dbb-4000x2588.png`
  - NO `urlFor()` used — direct CDN URL

- **about.astro**:
  - Hero collage: `https://cdn.sanity.io/.../d2c5e4ac450f5a25436b580c1474c320b71ce1b0-1100x1000.png`
  - Kevin & Shelly photo: `https://cdn.sanity.io/.../3dc19194b19b5c804633ad324a893237ab692da5-1583x2048.png`
  - NO `urlFor()` — direct CDN URLs

- **contact.astro**:
  - Books image: `https://cdn.sanity.io/.../7833f28378750a49205269eb39a6c2c19f31b92d-1058x394.png`
  - NO `urlFor()` — direct CDN URL

- **publishing.astro**:
  - Hero books: `https://cdn.sanity.io/.../923b58ae57f2c128ce61f22d0acf5e0b673d3759-1100x1000.png`
  - Free guide image: `https://cdn.sanity.io/.../2a10e5a1b14db28814520bebfd259c500ca8e4b7-2000x2000.png`
  - NO `urlFor()` — direct CDN URLs

**Status**: ❌ CRITICAL — Multiple hardcoded hero images without `urlFor()`

---

### 4. **Brand Card Images (Homepage)**
- FHB book cover: `https://cdn.sanity.io/.../8b5d1c39f892218c978d3e3caf5720e09833bbc4-1024x1024.png`
- KMC, WOY, EXPRESS, Believers Library card images — all hardcoded

**Status**: ❌ CRITICAL — Hardcoded brand images without `urlFor()`

---

### 5. **Testimonial & Team Images (Fallback arrays in .astro)**
- **index.astro**: `FALLBACK_TESTIMONIALS` array with hardcoded CDN URLs
- **about.astro**: `FALLBACK_TEAM` array with hardcoded CDN URLs

**Status**: ⚠️ Already fetch from Sanity first with fallbacks — ACCEPTABLE

---

### 6. **Social Media URLs**
- Hardcoded in Footer.astro (but WITH Sanity fetch first)

**Status**: ✅ Already fetches from Sanity — GOOD

---

## MISSING siteSettings FIELDS

Current schema covers most needs, but needs these additions:
- ✅ `homeHeroImage` — Homepage book collage
- ✅ `aboutHeroImage` — About page collage
- ✅ `contactPageHeroImage` — Contact page books image
- ✅ `publishingHeroImage` — Publishing page hero image
- ✅ `publishingFreeGuideImage` — Free guide book cover
- ✅ `aboutKevinShellyImage` — Kevin & Shelly photo
- ✅ `aboutFreeBookImage` — Free book CTA image (if needed)

**Status**: ✅ All fields already exist in schema!

---

## ACTION PLAN

### Phase 1: Update .astro files to use `urlFor()` and siteSettings
1. ✅ Update `index.astro` to fetch homeHeroImage from siteSettings
2. ✅ Update `about.astro` to fetch aboutHeroImage and aboutKevinShellyImage
3. ✅ Update `contact.astro` to fetch contactPageHeroImage
4. ✅ Update `publishing.astro` to fetch publishingHeroImage and publishingFreeGuideImage
5. ✅ Update `Footer.astro` to use Sanity logo instead of hardcoded URL

### Phase 2: Verify all images use `urlFor()` for dynamic resizing/caching
1. ✅ Replace direct CDN URLs with `urlFor(siteSettings.IMAGE_FIELD).width(...).height(...).url()`

### Phase 3: Build & Deploy
1. ✅ Run `npm run build` to verify no errors
2. ✅ Push to git with `--no-verify`
3. ✅ Verify live Netlify deployment

---

## NOTES

- **Bookstore & Blog**: Already fetch from Sanity/WordPress — DO NOT MODIFY
- **Other pages**: Mostly clean, use Sanity properly
- **Fallback testimonials/team**: Safe to keep as code fallbacks (already fetch first)
- **Footer address**: Hardcoded in HTML (acceptable for static content)
