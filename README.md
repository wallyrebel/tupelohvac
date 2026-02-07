# TupeloHVAC.com

Production-ready static lead-gen website for HVAC service requests in Tupelo, Mississippi.

## 1) Tech choices

- **SSG: Astro**  
  Chosen for static-first performance, content collections, clean routing, and easy Cloudflare Pages compatibility.
- **Hosting: Cloudflare Pages + Pages Functions**  
  Static site output with one serverless endpoint: `/api/lead`.
- **Email delivery: Resend**  
  Reliable HTTP API from Cloudflare Functions.
- **Google Sheets logging: Apps Script webhook**  
  Simple append-row workflow without running a separate backend.
- **CMS: Sveltia CMS**  
  `/admin` UI editing Markdown content stored in this repo.

## 2) Repository structure

```txt
.
+-- src/content/
|   +-- blog/                    # Markdown blog posts
|   +-- sponsors/                # Ads + featured partners (CMS managed)
|   +-- settings/site.md         # Global site settings
|   +-- .topic-log.json          # Persistent topic history
|   +-- .topic-pool.json         # Topic/category seed pool
+-- functions/
|   +-- api/lead.ts              # Cloudflare Pages Function for lead intake
+-- public/
|   +-- admin/                   # Sveltia CMS
|   +-- brand/                   # Logo + brand tokens
|   +-- images/                  # Sponsor/blog images
|   +-- robots.txt
|   +-- site.webmanifest
+-- scripts/
|   +-- generate-blog-post.mjs   # Scheduled AI content pipeline
+-- src/
|   +-- components/
|   +-- content/config.ts
|   +-- layouts/
|   +-- pages/
|   +-- styles/global.css
+-- .github/workflows/blog-generator.yml
```

## 3) Local development

### Prerequisites

- Node.js 20+
- npm

### Run

```bash
npm install
npm run dev
```

Site runs on the local Astro dev server.

## 4) Cloudflare Pages deployment

1. Push this repo to GitHub.
2. In Cloudflare Pages, create a project from this repo.
3. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Ensure Pages Functions are enabled (the `functions/` folder is auto-detected).

## 5) Required environment variables (Cloudflare Pages)

Set these in **Cloudflare Pages > Settings > Variables and Secrets**:

- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_SITE_KEY` (public site key used by frontend widget)
- `RESEND_API_KEY`
- `LEAD_TO_EMAIL` (set to `myersgrouponline@gmail.com`)
- `LEAD_FROM_EMAIL` (verified sender in Resend)
- `GOOGLE_SHEETS_WEBHOOK_URL`
- `GOOGLE_SHEETS_WEBHOOK_SECRET` (optional but recommended)

## 6) Turnstile setup

1. In Cloudflare Turnstile, create a widget for your domain.
2. Add the site key as `TURNSTILE_SITE_KEY`.
3. Add the secret key as `TURNSTILE_SECRET_KEY`.
4. The form automatically sends `cf-turnstile-response` to `/api/lead`.

## 7) Email setup (Resend)

1. Create a Resend API key.
2. Verify a sender domain in Resend.
3. Set:
   - `RESEND_API_KEY`
   - `LEAD_FROM_EMAIL` (ex: `Leads <leads@yourdomain.com>`)
   - `LEAD_TO_EMAIL=myersgrouponline@gmail.com`

Lead emails include form data plus metadata (timestamp, page URL, UTM fields, IP, user agent).

## 8) Google Sheets logging setup (required)

Use an Apps Script webhook attached to your sheet:

1. Create a Google Sheet with headers:
   `timestamp,full_name,phone,email,zip,service_type,message,consent,page_url,utm_source,utm_medium,utm_campaign,utm_term,utm_content,ip,user_agent`
2. In Google Sheets: Extensions -> Apps Script.
3. Paste this script (replace `YOUR_SHARED_SECRET`):

```javascript
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1");
  const body = JSON.parse(e.postData.contents || "{}");
  const expected = "YOUR_SHARED_SECRET";
  if (body.token !== expected) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  sheet.appendRow([
    body.timestamp || "",
    body.full_name || "",
    body.phone || "",
    body.email || "",
    body.zip || "",
    body.service_type || "",
    body.message || "",
    body.consent || "",
    body.page_url || "",
    body.utm_source || "",
    body.utm_medium || "",
    body.utm_campaign || "",
    body.utm_term || "",
    body.utm_content || "",
    body.ip || "",
    body.user_agent || ""
  ]);

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

4. Deploy as Web App:
   - Execute as: Me
   - Access: Anyone with the link
5. Copy the Web App URL to `GOOGLE_SHEETS_WEBHOOK_URL`.
6. Set `GOOGLE_SHEETS_WEBHOOK_SECRET` to the same secret.

## 9) Sveltia CMS setup (`/admin`)

Files:

- `public/admin/index.html`
- `public/admin/config.yml`

Before launch:

1. Edit `public/admin/config.yml` and set:
   - `backend.repo` to your actual `owner/repo`.
2. Configure Sveltia/Decap GitHub auth for your repository.
3. Commit and deploy.
4. Visit `/admin`.

CMS collections:

- Blog posts (`src/content/blog`)
- Ads/Sponsors (`src/content/sponsors`)
- Site settings (`src/content/settings/site.md`)

## 10) Sponsor ads and local ad slots

Sponsor entries live in `src/content/sponsors/*.md`.

Supported placements:

- `header_banner`
- `homepage_sidebar`
- `blog_in_content`
- `footer_banner`
- `featured_partners` (homepage "Top Local HVAC Companies")

Rules already implemented:

- Only active date windows render.
- Sponsor links use `rel="sponsored"`.
- Homepage sponsor module is labeled **Sponsored** with disclaimer:  
  `Sponsored placements. Not an endorsement.`

## 11) SEO and schema implemented

- Sitemap generation via `@astrojs/sitemap`
- `robots.txt`
- Canonical URLs
- RSS feed: `/rss.xml`
- Open Graph + Twitter cards
- LocalBusiness schema site-wide
- BlogPosting schema on post pages
- FAQ schema on homepage and cornerstone guide
- Internal linking to service pages + `/tupelo-hvac-guide/` + `/#request-service`

## 12) Automated blog publishing (Mon/Wed/Fri)

Workflow file: `.github/workflows/blog-generator.yml`

- Runs Monday/Wednesday/Friday via cron.
- Uses `scripts/generate-blog-post.mjs`.
- Commits and pushes generated content to `main`.

GitHub repo secrets required:

- `OPENAI_API_KEY`
- `PEXELS_API_KEY`

Model strategy:

- Primary: `gpt-5-mini`
- Fallback: `gpt-4.1-nano`

### Quality gate rules in script

Must include:

1. Local hook (Tupelo/North Mississippi)
2. Actionable checklist/steps
3. FAQ section
4. CTA block with 3 CTA links
5. Internal links to service page + homepage contact section
6. Link to `/tupelo-hvac-guide/`

Must avoid:

- Business names
- Pricing claims
- Guarantees

Heuristic checks:

- Contains "Tupelo" or "Tupelo, MS"
- At least 2 subheadings
- Has numbered or bulleted list
- Word count 300-500

If checks fail, script regenerates once with stricter instruction.

### Topic diversity controls

- Topic registry: `src/content/.topic-log.json`
- Topic pool: `src/content/.topic-pool.json`
- No repeated category within last 10 posts
- Avoid close-topic repeats across last 30 posts
- Rotates `season_tag`

## 13) Brand kit

- Logo SVG: `public/brand/logo.svg`
- Favicon assets: `public/favicon.svg`, `public/apple-touch-icon.svg`, `public/site.webmanifest`
- Tokens file (single source): `public/brand/brand-tokens.css`
  - Colors
  - Typography
  - Spacing scale
  - Radius scale

## 14) Go-live checklist

1. Set Cloudflare Pages env vars/secrets.
2. Configure Turnstile domain and keys.
3. Verify Resend domain + sender.
4. Deploy Apps Script and set webhook URL/secret.
5. Update `public/admin/config.yml` repo owner/name.
6. Add GitHub Actions secrets for OpenAI + Pexels.
7. Run one manual workflow dispatch of blog generator.
8. Submit a test lead from homepage and confirm:
   - Email received at `myersgrouponline@gmail.com`
   - New row added to Google Sheets
9. Review Lighthouse and fix any final image/content adjustments.
