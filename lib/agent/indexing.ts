/**
 * lib/agent/indexing.ts
 *
 * URL submission to search engines via IndexNow protocol.
 *
 * Background:
 *   - Google deprecated sitemap pings in June 2023 (now ignored)
 *   - Bing deprecated sitemap pings in May 2023 (now ignored)
 *   - Google Indexing API only accepts JobPosting/BroadcastEvent (not blogs)
 *
 * Solution: IndexNow (https://www.indexnow.org)
 *   - Open protocol led by Microsoft Bing & Yandex
 *   - Adopted by: Bing, Yandex, Seznam, Naver
 *   - Push-based: tells search engines instantly when content changes
 *   - Free, no auth needed beyond a key file on your domain
 *
 * Usage:
 *   1. Generate a 32-char hex key (do this once)
 *   2. Host {key}.txt at your site root (handled by /api/indexnow-key route)
 *   3. POST URLs to https://api.indexnow.org/indexnow with the key
 *
 * Set INDEXNOW_KEY env var (any 8-128 hex chars). If unset, falls back
 * to a deterministic key derived from your CRON_SECRET.
 */

import type { IndexingRecord, IndexingData } from "@/lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getIndexNowKey(): string {
  const explicit = process.env.INDEXNOW_KEY;
  if (explicit && /^[a-f0-9]{8,128}$/i.test(explicit)) return explicit.toLowerCase();
  // Derive a 32-char hex key from CRON_SECRET (deterministic, stable across deploys)
  const secret = process.env.CRON_SECRET ?? "phelix-erp-default-key-do-not-use-in-prod";
  // Simple djb2-style hash → 32 hex chars (no external deps, ES5 compatible)
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < secret.length; i++) {
    const c = secret.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) >>> 0;
    h2 = ((h2 << 5) + h2 + c * 7) >>> 0;
  }
  const hex1 = h1.toString(16).padStart(8, "0");
  const hex2 = h2.toString(16).padStart(8, "0");
  return (hex1 + hex2 + hex1 + hex2).slice(0, 32);
}

export interface IndexSubmitResult {
  url:     string;
  success: boolean;
  error?:  string;
}

// ─── IndexNow submission ─────────────────────────────────────────────────────

/**
 * Submit URLs to IndexNow API.
 * One request can include up to 10,000 URLs.
 *
 * @param host  - your domain (e.g. "phelixerp.online")
 * @param urls  - full URLs to notify
 * @returns success/error per the batch (IndexNow returns one status for all)
 */
async function submitToIndexNow(host: string, urls: string[]): Promise<{ ok: boolean; status: number; error?: string }> {
  const key = getIndexNowKey();

  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method:  "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body:    JSON.stringify({
        host,
        key,
        keyLocation: `https://${host}/a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6.txt`,
        urlList:     urls,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    // IndexNow returns:
    //   200 OK            — accepted
    //   202 Accepted      — accepted, will be processed
    //   400 Bad Request   — malformed input
    //   403 Forbidden     — key file not found at keyLocation
    //   422 Unprocessable — URLs don't match host
    //   429 Too Many      — slow down
    if (res.status === 200 || res.status === 202) {
      return { ok: true, status: res.status };
    }
    return { ok: false, status: res.status, error: `IndexNow HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Submit a batch of URLs by notifying IndexNow.
 * Called after each new blog is published or updated.
 * Returns per-URL results and the updated IndexingData object.
 */
export async function batchSubmitUrls(
  urls:     string[],
  existing: IndexingData
): Promise<{ results: IndexSubmitResult[]; data: IndexingData }> {
  const base = (process.env.SITE_BASE_URL ?? "https://phelixerp.online").replace(/\/$/, "");
  const host = base.replace(/^https?:\/\//, "");
  const now  = new Date().toISOString();

  // IndexNow accepts batches of up to 10k. Single batch is fine for blog posts.
  const batchResult = urls.length > 0
    ? await submitToIndexNow(host, urls)
    : { ok: true, status: 200 };

  const results: IndexSubmitResult[] = urls.map((url) => ({
    url,
    success: batchResult.ok,
    ...(batchResult.error ? { error: batchResult.error } : {}),
  }));

  // Record each URL
  for (const url of urls) {
    const slug = url.replace(`${base}/blog/`, "");
    const record: IndexingRecord = {
      slug,
      url,
      submittedAt: now,
      type:        "URL_UPDATED",
      status:      batchResult.ok ? "submitted" : "failed",
      ...(batchResult.error ? { error: batchResult.error } : {}),
    };
    existing.records.push(record);
    if (batchResult.ok) existing.totalSubmitted++;
  }

  existing.lastSubmittedAt = now;

  // Keep only last 500 records to avoid bloat
  if (existing.records.length > 500) {
    existing.records = existing.records.slice(-500);
  }

  return { results, data: existing };
}

/**
 * Build a default empty IndexingData object.
 */
export function defaultIndexingData(): IndexingData {
  return {
    records:         [],
    lastSubmittedAt: null,
    totalSubmitted:  0,
  };
}

/**
 * Check if a URL was recently submitted (within cooldownHours).
 * Prevents re-submitting the same URL repeatedly.
 */
export function wasRecentlySubmitted(
  url:           string,
  data:          IndexingData,
  cooldownHours: number = 24
): boolean {
  const recent = data.records
    .filter((r) => r.url === url && r.status === "submitted")
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  if (recent.length === 0) return false;
  const hoursSince = (Date.now() - new Date(recent[0].submittedAt).getTime()) / (1000 * 60 * 60);
  return hoursSince < cooldownHours;
}
