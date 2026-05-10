/**
 * lib/agent/seo/dataforseo.ts
 *
 * DataForSEO API client — single credential powers:
 *  - Live SERP results (rank tracking, SERP analysis)
 *  - Keyword data (search volume, difficulty, related)
 *  - People Also Ask
 *  - Backlinks
 *
 * Cost-aware: every method returns the credit cost so callers can budget.
 *
 * Auth: HTTP Basic with login + password (NOT OAuth).
 *   DATAFORSEO_LOGIN
 *   DATAFORSEO_PASSWORD
 */

const DFS_BASE = "https://api.dataforseo.com/v3";

interface DfsCreds { login: string; password: string }

function getCreds(): DfsCreds | null {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return { login, password };
}

function authHeader(c: DfsCreds): string {
  return "Basic " + Buffer.from(`${c.login}:${c.password}`).toString("base64");
}

async function dfs<T = unknown>(
  path: string,
  body: unknown[],
): Promise<{ ok: true; data: T; cost: number } | { ok: false; error: string }> {
  const creds = getCreds();
  if (!creds) return { ok: false, error: "DataForSEO credentials not configured" };

  try {
    const res = await fetch(`${DFS_BASE}${path}`, {
      method:  "POST",
      headers: {
        "Authorization": authHeader(creds),
        "Content-Type":  "application/json",
      },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      return { ok: false, error: `DataForSEO HTTP ${res.status}` };
    }

    const json = (await res.json()) as {
      status_code: number;
      status_message: string;
      cost: number;
      tasks?: Array<{
        status_code: number;
        status_message: string;
        result?: T;
      }>;
    };

    if (json.status_code !== 20000) {
      return { ok: false, error: `DataForSEO ${json.status_code}: ${json.status_message}` };
    }

    const task = json.tasks?.[0];
    if (!task || task.status_code !== 20000 || !task.result) {
      return { ok: false, error: `DataForSEO task failed: ${task?.status_message ?? "no result"}` };
    }

    return { ok: true, data: task.result, cost: json.cost ?? 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Live SERP (rank tracking + SERP analysis) ───────────────────────────────

export interface SerpItem {
  type:        string;        // "organic" | "featured_snippet" | "people_also_ask" | etc.
  rank_group:  number;
  rank_absolute: number;
  position:    string;         // "left" | "right"
  url?:        string;
  title?:      string;
  description?:string;
  domain?:     string;
}

export interface LiveSerpResult {
  keyword:        string;
  language_code:  string;
  location_code:  number;
  items_count:    number;
  items:          SerpItem[];
}

/**
 * Fetch live Google SERP for a keyword. Returns top 100 results.
 *
 * Pricing: ~$0.0006 per call (Live SERP Advanced).
 * Use this for both rank tracking and SERP analysis.
 *
 * @param locationCode - Pakistan = 2586, US = 2840, UK = 2826. See docs.
 */
export async function getLiveSerp(opts: {
  keyword:        string;
  locationCode?:  number;
  languageCode?:  string;
  device?:        "desktop" | "mobile";
  depth?:         number;     // 1–700, default 100
}): Promise<{ ok: true; data: LiveSerpResult; cost: number } | { ok: false; error: string }> {
  const result = await dfs<LiveSerpResult[]>("/serp/google/organic/live/advanced", [
    {
      keyword:       opts.keyword,
      location_code: opts.locationCode ?? 2586,   // Pakistan default
      language_code: opts.languageCode ?? "en",
      device:        opts.device       ?? "desktop",
      depth:         opts.depth        ?? 100,
    },
  ]);
  if (!result.ok) return result;
  const first = (result.data as unknown as Array<{ keyword: string; items: SerpItem[]; items_count: number; language_code: string; location_code: number }>)[0];
  if (!first) return { ok: false, error: "Empty SERP result" };
  return {
    ok: true,
    cost: result.cost,
    data: {
      keyword:       first.keyword,
      language_code: first.language_code,
      location_code: first.location_code,
      items_count:   first.items_count,
      items:         first.items ?? [],
    },
  };
}

// ─── Keyword data (search volume, difficulty) ────────────────────────────────

export interface KeywordMetric {
  keyword:           string;
  search_volume:     number | null;
  cpc:               number | null;
  competition:       number | null;          // 0–1
  competition_level: "LOW" | "MEDIUM" | "HIGH" | null;
  monthly_searches?: Array<{ year: number; month: number; search_volume: number }>;
}

export async function getKeywordVolumes(opts: {
  keywords:      string[];
  locationCode?: number;
  languageCode?: string;
}): Promise<{ ok: true; data: KeywordMetric[]; cost: number } | { ok: false; error: string }> {
  const result = await dfs<KeywordMetric[]>("/keywords_data/google_ads/search_volume/live", [
    {
      keywords:      opts.keywords.slice(0, 1000),
      location_code: opts.locationCode ?? 2586,
      language_code: opts.languageCode ?? "en",
    },
  ]);
  if (!result.ok) return result;
  return { ok: true, data: result.data, cost: result.cost };
}

// ─── Backlinks ────────────────────────────────────────────────────────────────

export interface BacklinkSummary {
  target:                 string;
  rank:                   number;            // domain rank 0–1000
  backlinks:              number;
  referring_domains:      number;
  referring_main_domains: number;
  broken_backlinks:       number;
  broken_pages:           number;
}

export async function getBacklinkSummary(opts: {
  target: string;
}): Promise<{ ok: true; data: BacklinkSummary; cost: number } | { ok: false; error: string }> {
  const result = await dfs<BacklinkSummary[]>("/backlinks/summary/live", [
    { target: opts.target, internal_list_limit: 10, include_subdomains: true },
  ]);
  if (!result.ok) return result;
  const first = (result.data as unknown as BacklinkSummary[])[0];
  if (!first) return { ok: false, error: "Empty backlinks result" };
  return { ok: true, data: first, cost: result.cost };
}

// ─── On-page (fetch a competitor URL and extract structure) ──────────────────

export interface OnPageInstantResult {
  url:               string;
  status_code:       number;
  page_title:        string;
  meta_description?: string;
  word_count:        number;
  readability_score?:number;
  h1?:               string[];
  h2?:               string[];
  h3?:               string[];
}

export async function getOnPageInstant(opts: {
  url: string;
}): Promise<{ ok: true; data: OnPageInstantResult; cost: number } | { ok: false; error: string }> {
  const result = await dfs<{ items: Array<{
    url: string; status_code: number;
    meta?: {
      title?: string;
      description?: string;
      content?: { plain_text_word_count?: number; readability_score?: number };
      htags?: { h1?: string[]; h2?: string[]; h3?: string[] };
    };
  }> }>("/on_page/instant_pages", [
    { url: opts.url, enable_javascript: false, custom_user_agent: "Mozilla/5.0 (compatible; PhelixBot/1.0)" },
  ]);
  if (!result.ok) return result;
  const item = result.data?.items?.[0];
  if (!item) return { ok: false, error: "No items returned" };
  return {
    ok: true,
    cost: result.cost,
    data: {
      url:               item.url,
      status_code:       item.status_code,
      page_title:        item.meta?.title ?? "",
      meta_description:  item.meta?.description ?? "",
      word_count:        item.meta?.content?.plain_text_word_count ?? 0,
      readability_score: item.meta?.content?.readability_score,
      h1:                item.meta?.htags?.h1 ?? [],
      h2:                item.meta?.htags?.h2 ?? [],
      h3:                item.meta?.htags?.h3 ?? [],
    },
  };
}
