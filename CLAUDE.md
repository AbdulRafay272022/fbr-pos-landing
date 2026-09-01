# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Audit Status (2026-08-25)

Health audit findings — fix these before anything else:

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | 🔴 CRITICAL | `llama-3.3-70b-versatile` decommissioned 2026-08-16. All three generators hardcode it and are broken. | `generate-blog/route.ts`, `landingGenerator.ts`, `programmaticGenerator.ts` |
| 2 | 🔴 CRITICAL | `keywordDiscovery.ts` uses `llama3-8b-8192` (separate dead Groq model). | `lib/agent/keywordDiscovery.ts` |
| 3 | 🔴 CRITICAL | Agent has produced zero content since 2026-07-17 (39 days). Last `data/logs.json` entry is also July 17. Cron may have stopped firing on Vercel; verify in Vercel dashboard. | Vercel cron logs |
| 4 | 🟠 HIGH | Keyword pool nearly exhausted: only 3 unused keywords remain. Last scrape: 2026-06-20. Run `/api/scrape-keywords` manually after fixing the model. | `data/keywords.json` |
| 5 | ✅ RESOLVED (2026-09-02) | `DISABLE_AUTO_BLOG` env switch implemented in `agentBrain.ts` — when truthy, `/api/agent` skips blog/landing/programmatic generation, blog updates, and title optimization. Claude Desktop (`/write-blog`) is now the sole content writer; research actions (GSC fetch, decay detection, conversion opt) and cron routes outside `/api/agent` (pre-brief, full-audit) are unaffected. Keyword discovery and content refresh are separately hard-off via `KEYWORD_DISCOVERY_ENABLED` / `CONTENT_REFRESH_ENABLED` consts in the same file. | `lib/agent/agentBrain.ts` |
| 6 | 🟡 MEDIUM | `meta.json` counter `blogsGeneratedTotal` shows 18 but 64 blog files exist. | `lib/agent/agentBrain.ts` stat tracking |
| 7 | 🟢 LOW | Two near-duplicate slug pairs (Jaccard ≥ 0.75): `fbr-pos-system-lahore-retailers-2026` ↔ `pos-system-lahore-fbr-integration-for-lahore-retailers-2026`; `generate-fbr-qr-invoices-pakistan` ↔ `how-to-generate-fbr-qr-invoices-in-pakistan-step-by-step-guide`. | `data/blogs/`, `data/index.json` |
| 8 | 🟢 LOW | `.claude/skills/write-blog/SKILL.md` still says `git rebase origin/main` — stale, should be reset-reapply loop. | `.claude/skills/write-blog/SKILL.md` |

**Code health**: `npx tsc --noEmit` exits 0. ESLint exits 0 (19 warnings, 0 errors). Next.js 16.2.4 / React 19.2.4. No committed secrets.

**Content inventory**: 64 blog files, 64 index entries — perfectly in sync, no orphans.

## Commands

```bash
npm run dev        # Start local dev server (http://localhost:3000)
npm run build      # Production build — runs tsc + Next.js compiler
npm run lint       # ESLint (eslint.config.mjs, Next.js ruleset)
npx tsc --noEmit   # Type-check without emitting — run after every change
```

There are no automated tests. `npx tsc --noEmit` is the primary correctness gate — always run it before considering a change complete.

**Manually trigger agent endpoints during development:**
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/agent
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/generate-blog
curl http://localhost:3000/api/agent-status
```

## Architecture

This is an **autonomous SEO content engine** built on Next.js App Router. It self-generates, publishes, optimizes, and monetizes FBR-compliance blog content for the Pakistani POS/ERP market — with no human intervention after deployment.

### The GitHub-as-Database Pattern

There is no database. All mutable state lives in `/data/*.json` files committed to the GitHub repository. Every agent write uses `atomicCommit()` in `lib/githubApi.ts`, which performs a 6-step Git Trees API transaction (read ref → read tree → create blobs → create tree → create commit → advance ref). This is conflict-safe and handles 422 non-fast-forward errors with retry.

- **Reads**: `readJsonFromGitHub()` — GitHub Contents API, base64-decoded JSON
- **Writes**: `atomicCommit()` — always multi-file, always atomic
- **`lib/blogStore.ts` is the exception**: reads `data/index.json` and `data/blogs/*.json` from the **local filesystem** via `fs`. This is used only by Next.js SSG/ISR page rendering at build/revalidate time, not by API routes.

### Agent Execution Model

`GET /api/agent` is the single cron entry point (once daily at 2am UTC via Vercel Cron — `vercel.json` schedule `0 2 * * *`; the "every 4 hours" description in older docs is wrong). It calls `runAgent()` in `lib/agent/agentBrain.ts`, which:

1. Reads `data/meta.json` from GitHub
2. Checks the job lock (`isLocked()` — 8-minute TTL)
3. Evaluates 10 boolean decisions, each with an independent time-interval threshold
4. Acquires lock (writes `meta.json` to GitHub)
5. Executes enabled actions **sequentially** — each action is an HTTP call to another route (`/api/generate-blog`, `/api/update-blogs`, etc.) with a 55-second timeout
6. Releases lock (writes `meta.json` + `data/logs.json` in one commit)

Actions run in separate serverless contexts to avoid orchestrator timeout. The agent calls itself via internal HTTP — this is intentional.

**Phase 5 timestamps** are stored as an extension of `AgentStats` via a type escape. New timestamp fields (`lastLandingGenerateAt`, `lastConversionOptAt`, `lastDecayDetectAt`, `lastProgGenerateAt`) live in the extended stats object and are accessed as:
```typescript
const statsExt = meta.stats as unknown as Record<string, unknown>;
const lastLandingGen = (statsExt.lastLandingGenerateAt as string | undefined) ?? null;
```

### Content Generation Pipeline

When `generate-blog` runs, content passes through this exact ordered pipeline before commit:

```
Groq LLM output
  → autoLink()           (lib/agent/autoLinker.ts)
  → injectRelatedPosts() (lib/agent/autoLinker.ts)
  → injectSchema()       (lib/agent/schemaGenerator.ts)
  → injectCTA()          (lib/agent/ctaInjector.ts)
  → optimizeContent()    (lib/agent/performance.ts)
  → atomicCommit()
  → fire-and-forget: Google Indexing API + /api/distribute
```

Order is load-bearing: schema reads content metadata; CTA injection targets `</h2>` positions; optimizer minifies last.

### Key Module Roles

| Module | Role |
|---|---|
| `lib/agent/siteConfig.ts` | Single source of truth for all site values. `getSiteConfig()` and `getGitHubConfig()` are called at the top of every API route. All site-specific strings (name, niche, cities, CTA phone) come from env vars with hardcoded fallbacks. |
| `lib/agent/jobLock.ts` | Distributed lock via `meta.json`. `acquireLock()` / `releaseLock()` wrap all agent work. Lock TTL is 8 minutes. |
| `lib/agent/costGuard.ts` | Token budget enforcement. `isUnderBudget(costs)` must be called before every Groq call. `recordUsage()` takes `Omit<CostEntry, "ts">` — it adds `ts` internally. Default budget: 5M tokens/month. |
| `lib/agent/qualityGate.ts` | 100-point content scorer. Pass threshold: 60. Breakdown: wordCount(30) + FAQs(20) + internalLinks(20) + keyword(15) + CTA(15). |
| `lib/agent/duplicateDetector.ts` | Jaccard similarity (0.55 threshold) + bigram overlap (0.60 threshold) against all existing slugs. Keyword rejected if either exceeds its threshold. |
| `lib/agent/topicMap.ts` | 6 hard-coded topic clusters in `TOPIC_CLUSTERS`. `assignKeywordToCluster()` uses token overlap scoring. Cluster IDs: `fbr-compliance`, `pos-systems`, `tax-penalties`, `restaurant-industry`, `retail-industry`, `erp-accounting`. |
| `lib/agent/linkStrategy.ts` | Authority scoring (0–100) per blog. Pillar page per cluster = highest authority score in that cluster, gets +20 priority boost in link candidates. |
| `lib/agent/seoFeedback.ts` | GSC JWT auth via Web Crypto (`crypto.subtle`). Fetches 28-day Search Analytics data. |
| `lib/agent/seo/dataforseo.ts` | DataForSEO API client — SERP results, keyword volume/difficulty, PAA, backlinks. Auth: HTTP Basic (`DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`). |
| `lib/agent/seo/rankTracker.ts` | Rank tracking via DataForSEO. |
| `lib/agent/seo/backlinkMonitor.ts` | Backlink signal monitoring. |
| `lib/agent/seo/lighthouse.ts` | Lighthouse / technical audit runner. |
| `lib/agent/seo/orchestrator.ts` | Coordinates the full SEO audit pipeline (weekly cron via `vercel.json`). |
| `lib/agent/seo/briefGenerator.ts` | Pre-brief generation before blog writing. |
| `lib/agent/seo/cannibalization.ts` | Keyword cannibalization detection. |
| `lib/agent/seo/strikingDistance.ts` | Finds pages ranking 8–20 that need a push. |
| `lib/niche/registry.ts` | Multi-niche pack registry. `SITE_NICHE_PACK` env var selects the active pack (default: `fbr-pos`). |
| `lib/niche/packs/fbr-pos.ts` | Active pack for this deployment (FBR compliance / POS niche). |
| `lib/niche/packs/sports.ts` | Proof-of-concept sports pack (AdSense-monetised; generic template — not production-ready). |
| `lib/keywordEngine.ts` | Keyword generation, scoring, and PAA template expansion. Pure functions — no I/O. |
| `lib/githubApi.ts` | All GitHub I/O. `withRetry()` wraps everything. 401/403/404 are **not** retried. |
| `lib/types.ts` | All shared TypeScript interfaces. The single source of truth for data shapes. Add new types here first. |

### API Routes Reference

All agent sub-routes authenticate via `Authorization: Bearer CRON_SECRET`. They are safe to call manually for testing.

| Route | Triggered by | Writes to GitHub |
|---|---|---|
| `/api/agent` | Vercel Cron (daily 2am) | Orchestrator — delegates to sub-routes |
| `/api/generate-blog` | Agent | `data/blogs/{slug}.json`, `data/index.json`, `data/keywords.json`, `data/costs.json` |
| `/api/update-blogs` | Agent | `data/blogs/*.json` |
| `/api/refresh-content` | Agent + decay detector | `data/blogs/*.json` |
| `/api/fetch-seo` | Agent | `data/seo.json` |
| `/api/optimize-titles` | Agent | `data/blogs/*.json` |
| `/api/generate-landing` | Agent | `data/landing-pages/{slug}.json`, `data/landing-index.json` |
| `/api/generate-programmatic` | Agent | `data/programmatic/{slug}.json`, `data/programmatic-index.json` |
| `/api/optimize-conversions` | Agent | `data/blogs/*.json` (CTA rewritten) |
| `/api/detect-decay` | Agent | `data/decay.json`, `data/decay-baseline.json` |
| `/api/track-conversion` | Client `sendBeacon` | `data/conversions.json` |
| `/api/track-engagement` | Client `sendBeacon` | `data/engagement.json` |
| `/api/agent-status` | Dashboard (public) | Read-only |
| `/api/pre-brief` | Vercel Cron (daily 1am) | Pre-generates keyword brief before the agent run |
| `/api/scrape-keywords` | Manual / agent | `data/keywords.json` — replenishes keyword pool |
| `/api/seo/full-audit` | Vercel Cron (weekly Monday 4am) | Full SEO audit via DataForSEO + Lighthouse |
| `/api/seo/check-backlinks` | SEO orchestrator | Backlink signals |
| `/api/seo/check-cannibalization` | SEO orchestrator | Cannibalization report |
| `/api/seo/find-gaps` | SEO orchestrator | Content gap analysis |
| `/api/seo/generate-brief` | SEO orchestrator | Brief for next blog |
| `/api/seo/striking-distance` | SEO orchestrator | Pages ranking 8–20 |
| `/api/seo/track-rankings` | SEO orchestrator | SERP position tracking |

### Front-End Rendering

Blog pages at `app/blog/[slug]/page.tsx` use ISR (`export const revalidate = 3600`). `generateStaticParams()` and `getBlogBySlug()` both use `lib/blogStore.ts` which reads from the **local filesystem** — not the GitHub API. This works on Vercel because the repo files are checked out at build/revalidate time. Do not replace `blogStore.ts` filesystem reads with GitHub API calls on the rendering path.

The sitemap at `app/sitemap.ts` reads three GitHub files in parallel via `Promise.allSettled()` (not `Promise.all()`) so that missing landing/programmatic index files don't break blog sitemap entries.

### Data File Map

```
data/meta.json                — agent lock + all run timestamps + counters
data/keywords.json            — keyword pool (used/unused, priority, cluster)
data/index.json               — blog index without content (SSG + sitemap source)
data/blogs/{slug}.json        — full blog posts (HTML content + metadata)
data/seo.json                 — 28-day GSC metrics per page
data/costs.json               — Groq token usage by month
data/logs.json                — structured agent event log (trimmed to ~500 entries)
data/indexing.json            — Google Indexing API submission history
data/distribution.json        — Twitter/LinkedIn post history
data/conversions.json         — CTA click events + per-slug summary
data/signals.json             — backlink authority signals
data/engagement.json          — scroll depth / time-on-page / bounce per slug
data/decay.json               — content decay signals (impression/position drops)
data/decay-baseline.json      — previous GSC snapshot used for decay comparison
data/landing-index.json       — index of generated landing pages
data/landing-pages/{slug}.json — full landing page HTML
data/programmatic-index.json  — index of programmatic pages
data/programmatic/{slug}.json — city × service × industry pages
```

### Required Environment Variables

```
GITHUB_TOKEN        — Personal access token (repo write scope)
GITHUB_OWNER        — Repository owner
GITHUB_REPO         — Repository name
GITHUB_BRANCH       — Branch to commit to (default: main)
CRON_SECRET         — Auth token for all /api/* agent routes
GROQ_API_KEY        — Groq API key (⚠ llama-3.3-70b-versatile decommissioned 2026-08-16 — migrate to a live model before use)
SITE_BASE_URL       — Production URL, e.g. https://phelixerp.vercel.app
```

Optional (system degrades gracefully if absent):
```
GSC_CLIENT_EMAIL / GSC_PRIVATE_KEY / GSC_SITE_URL     — Google Search Console
GOOGLE_INDEXING_CLIENT_EMAIL / GOOGLE_INDEXING_PRIVATE_KEY
TWITTER_API_KEY / TWITTER_API_SECRET / TWITTER_ACCESS_TOKEN / TWITTER_ACCESS_SECRET
LINKEDIN_ACCESS_TOKEN / LINKEDIN_PERSON_URN
DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD
MONTHLY_TOKEN_BUDGET   — Override 5M token monthly cap
DISABLE_AUTO_BLOG      — Set "true"/"1" to pause ALL agent content generation/rewrites
                          (blog gen, blog update, landing gen, programmatic gen, title
                          optimizer). Use when Claude Desktop (/write-blog) is the sole
                          writer. Research actions (GSC fetch, decay detection, conversion
                          opt) and cron routes outside /api/agent keep running.
```

### Multi-Niche Architecture

The engine is niche-agnostic. A `NichePack` (defined in `lib/niche/types.ts`) bundles all site-specific content logic: keyword seeds, prompt templates, CTA copy, monetization strategy, and topic clusters. Two packs exist:

- `fbr-pos` — active pack for this deployment (FBR / POS / ERP market, Pakistan)
- `sports` — proof-of-concept only; uses a generic template and is not production-ready

Activate a different niche by setting `SITE_NICHE_PACK=<id>` in Vercel env vars. The registry falls back to `fbr-pos` if the value is missing or unknown.

**Multi-site**: the system supports multiple niches within one deployment but does NOT support running multiple sites from one project. A second site requires a second Vercel project (same repo, different env vars). There is no shared site registry or domain-routing layer.

### Critical Patterns

**Web Crypto requires `ArrayBuffer`, not `Uint8Array`** (affects `seoFeedback.ts` and any JWT/HMAC code):
```typescript
// CORRECT
const bytes = new Uint8Array(binaryData);
await crypto.subtle.importKey("pkcs8", bytes.buffer as ArrayBuffer, ...);

// WRONG — TypeScript error + runtime failure
await crypto.subtle.importKey("pkcs8", bytes, ...);
```

**`recordUsage()` adds `ts` internally — never include it in the call:**
```typescript
// CORRECT
recordUsage(costs, { action: "generate_landing", model: GROQ_MODEL, promptTokens, completionTokens, totalTokens });

// WRONG — TS error: Object literal may only specify known properties, 'ts' does not exist
recordUsage(costs, { ts: new Date().toISOString(), action: "generate_landing", ... });
```

**Fire-and-forget after blog commit — never `await` these:**
```typescript
fetch(`${baseUrl}/api/index-url`, { headers: { Authorization: `Bearer ${secret}` } }).catch(() => {});
fetch(`${baseUrl}/api/distribute`, { headers: { Authorization: `Bearer ${secret}` } }).catch(() => {});
```

**All new agent actions follow this pattern in `agentBrain.ts`:**
```typescript
// 1. Add threshold constant at top
const MY_ACTION_INTERVAL_HOURS = 48;

// 2. Add boolean + reason to AgentDecision interface
shouldMyAction: boolean;
reasons: { myAction: string; }

// 3. Read timestamp from statsExt in makeDecision()
const lastMyAction = (statsExt.lastMyActionAt as string | undefined) ?? null;

// 4. Evaluate condition
if (hoursSince(lastMyAction) >= MY_ACTION_INTERVAL_HOURS) {
  decision.shouldMyAction = true;
  decision.reasons.myAction = "...";
}

// 5. Add to anyAction check

// 6. Add execution block in try{} after existing actions
if (decision.shouldMyAction) {
  const r = await callAction("/api/my-action", baseUrl, secret);
  result.actions.myAction = r;
  if (r.success) statsUpdate.lastMyActionAt = new Date().toISOString();
}
```
