# SEO SaaS — Senior-SEO Engine

Your agent is no longer just a content publisher. It's a measurement-driven SEO orchestrator that does what a senior SEO consultant does — **but on autopilot**.

This doc covers what's been added, how it works, what it costs, and how to wire it up.

---

## The Senior-SEO Loop (now automated)

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. PULL  GSC query data (28-day window, query+page level)          │
│  2. TRACK keyword positions daily via DataForSEO                    │
│  3. SCAN  for striking-distance opportunities (positions 4-30)      │
│  4. SCAN  for content decay (rank/impressions dropped)              │
│  5. SCAN  for cannibalization (multiple pages → same query)         │
│  6. AUDIT Core Web Vitals on top URLs                               │
│  7. AUDIT structured-data validity                                  │
│  8. FIND  competitor content gaps                                   │
│  9. SNAP  backlink profile                                          │
│ 10. WRITE prioritised recommendations to dashboard                  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                  /admin/seo dashboard renders the report
```

Every step is **independently optional** — set the env vars for the features you want; the rest are skipped silently.

---

## What's New (file-by-file)

### Library modules

| File | Purpose |
|------|---------|
| `lib/agent/seo/features.ts` | Single source of truth for which features are enabled (env-gated) |
| `lib/agent/seo/dataforseo.ts` | DataForSEO API client — SERPs, keyword volumes, on-page, backlinks |
| `lib/agent/seo/rankTracker.ts` | Daily rank tracking with 90-day history per keyword |
| `lib/agent/seo/strikingDistance.ts` | Page-2 / page-1-bottom opportunity detector from GSC data |
| `lib/agent/seo/briefGenerator.ts` | SERP-driven content briefs (outline + PAA + entities + word floor) |
| `lib/agent/seo/cannibalization.ts` | Detects duplicate-target pages via title-sim + GSC overlap |
| `lib/agent/seo/contentGap.ts` | Finds keywords competitors rank for that you don't cover |
| `lib/agent/seo/lighthouse.ts` | PageSpeed Insights — LCP / INP / CLS / Performance per URL |
| `lib/agent/seo/schemaValidator.ts` | JSON-LD validator (Article, FAQ, Product, BreadcrumbList…) |
| `lib/agent/seo/backlinkMonitor.ts` | Weekly backlink snapshots + WoW deltas |
| `lib/agent/seo/gscQueries.ts` | Query-level GSC fetcher (existing seoFeedback was page-level only) |
| `lib/agent/seo/orchestrator.ts` | Master loop that runs all of the above and ranks recommendations |

### API routes (`app/api/seo/...`)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/seo/full-audit` | **The big one.** Runs the entire loop, persists everything, writes recommendations. Schedule weekly. |
| `GET /api/seo/track-rankings` | Daily rank check — `?` or via cron. |
| `GET /api/seo/striking-distance` | Returns ordered opportunities from GSC. Read-only, no persistence. |
| `GET /api/seo/check-cannibalization` | Detects duplicate-target pages. |
| `GET /api/seo/audit-cwv?strategy=mobile&limit=10` | Lighthouse audit batch. |
| `GET /api/seo/validate-schema?limit=20` | Schema validity check. |
| `GET /api/seo/find-gaps?seeds=kw1,kw2` | Competitor content-gap analysis. |
| `GET /api/seo/check-backlinks` | Capture a backlink snapshot. |
| `GET /api/seo/generate-brief?keyword=...` | Senior-SEO brief for any keyword (drop into your generator). |

### Dashboard

`app/admin/seo/page.tsx` — renders the latest `seo-report.json` with full breakdown:
- Active vs idle features
- Top recommendations (ranked by priority)
- Rankings summary + win/loss
- Striking-distance pages
- Cannibalization clusters
- CWV pass/fail
- Schema errors
- Content gap suggestions
- Backlink trends

---

## Setup (in priority order)

### 1. Google Search Console (free) — UNLOCKS RANKINGS

1. Go to <https://console.cloud.google.com/iam-admin/serviceaccounts>
2. Create a service account, download the JSON key.
3. Open <https://search.google.com/search-console>, add the service-account email as a User with "Restricted" access.
4. Set env vars:
   ```
   GSC_CLIENT_EMAIL=svc@xxxx.iam.gserviceaccount.com
   GSC_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
   GSC_SITE_URL=https://phelixerp.vercel.app/
   ```
   Note: in Vercel, replace newlines in the private key with `\n` (literal backslash-n).

**This single integration unlocks:** real rankings, striking distance, decay detection, cannibalization (GSC-confirmed), authentic feedback loop.

### 2. DataForSEO (~$5–15/month) — UNLOCKS SERP INTELLIGENCE

1. Sign up at <https://dataforseo.com>
2. Top up $20 — enough for ~1,500 SERPs (months of tracking).
3. Set env vars:
   ```
   DATAFORSEO_LOGIN=...
   DATAFORSEO_PASSWORD=...
   RANK_TRACK_LOCATION=2586         # Pakistan
   RANK_TRACK_LANGUAGE=en
   ```

**This single integration unlocks:** rank tracking (daily), SERP-based briefs, content gaps, backlink monitor.

### 3. PageSpeed Insights (free) — UNLOCKS CWV

Optional but recommended: a key raises quota from ~1/sec to 25,000/day.
1. Get a key from <https://developers.google.com/speed/docs/insights/v5/get-started>
2. Set `PAGESPEED_API_KEY=...`

### 4. Schedule the cron jobs

Add to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/seo/track-rankings",   "schedule": "0 6 * * *" },
    { "path": "/api/seo/full-audit",       "schedule": "0 4 * * 1" },
    { "path": "/api/seo/check-backlinks",  "schedule": "0 5 * * 1" }
  ]
}
```

---

## Tracked-keywords list (drives rank tracking)

Create `data/tracked-keywords.json` in your repo:

```json
{
  "keywords": [
    "fbr pos system",
    "fbr pos system pakistan",
    "fbr e-invoicing software",
    "pos system karachi",
    "pos system lahore",
    "fbr qr invoice",
    "fbr compliance checklist",
    "fbr penalty pos"
  ]
}
```

If absent, the orchestrator falls back to all keywords from `data/index.json`.

---

## How briefs flow into content generation

The existing `/api/generate-blog` route now auto-injects an SEO brief into the LLM prompt **if DataForSEO is configured**. No code change needed on your part.

The brief contains:
- Target word count (max of top-10)
- Required H2 outline (common across SERP winners)
- People Also Ask questions to cover
- Entities competitors mention (topical authority)
- Featured-snippet target paragraph format
- Internal-link suggestions

This single change is the difference between "AI filler" and "SERP-competitive content."

---

## Cost summary

| Per site, monthly | Without SEO add-ons | With Phase 1 (GSC+rank track 100 kw) | With Phase 2 (full audit, briefs, gaps) |
|---|---|---|---|
| Vercel + LLM        | $0–25 | $0–25 | $0–25 |
| GSC                 | —      | $0   | $0   |
| DataForSEO          | —      | ~$5  | ~$15 |
| PageSpeed           | —      | $0   | $0   |
| **Total**           | **$0–25** | **$5–30** | **$15–40** |

Sellable price points:
- $49/mo Starter (Phase 1)
- $199/mo Pro (Phase 2)
- $499/mo Agency (Phase 2 + multi-format syndication + backlinks)

---

## What's still ahead

Future SaaS work, **not blocking** for delivering rankings today:
1. Multi-tenant Postgres (each site = a tenant row, not its own Vercel project)
2. Stripe metered billing
3. Self-serve onboarding flow (signup → connect domain → connect GSC OAuth)
4. Client-facing dashboard (read-only view of `/admin/seo`)
5. White-label / custom domain per tenant
6. HARO/Connectively automation (digital PR)
7. Local SEO module (Google Business Profile, citations)
8. Content approval queue (diff view + rollback)

Every one of these is layered on top of the engine you now have — none of them require rewriting it.

---

## Verifying the install

```bash
# Each one should return JSON, even if features are off
curl https://phelixerp.vercel.app/api/seo/full-audit
curl https://phelixerp.vercel.app/api/seo/striking-distance
curl https://phelixerp.vercel.app/api/seo/track-rankings
curl https://phelixerp.vercel.app/api/seo/audit-cwv
curl https://phelixerp.vercel.app/api/seo/validate-schema
curl https://phelixerp.vercel.app/api/seo/check-cannibalization
curl "https://phelixerp.vercel.app/api/seo/generate-brief?keyword=fbr+pos+system"
curl https://phelixerp.vercel.app/api/seo/find-gaps
curl https://phelixerp.vercel.app/api/seo/check-backlinks
```

If a feature is disabled, the response is:
```json
{ "success": false, "skipped": true, "reason": "DataForSEO not configured" }
```

That's the SaaS-grade graceful degradation pattern — never crash, always tell the caller why.
