/**
 * lib/agent/indexing.ts
 *
 * Sitemap notification for Google.
 *
 * The Google Indexing API only supports JobPosting and BroadcastEvent schema types
 * and is NOT suitable for blog pages. Replaced with a sitemap ping to Google and Bing,
 * which is the correct mechanism for notifying search engines of new/updated blog content.
 *
 * Google: https://www.google.com/ping?sitemap=<sitemapUrl>
 * Bing:   https://www.bing.com/ping?sitemap=<sitemapUrl>
 *
 * Rate limits: unlimited (sitemap pings are not rate limited).
 * No credentials required.
 */

import type { IndexingRecord, IndexingData } from "@/lib/types";

// ─── Sitemap ping ─────────────────────────────────────────────────────────────

export interface IndexSubmitResult {
  url:     string;
  success: boolean;
  error?:  string;
}

/**
 * Notify Google and Bing of a new/updated sitemap.
 * This is the correct mechanism for blog content (not the Indexing API,
 * which only supports JobPosting and BroadcastEvent schema types).
 */
async function pingSitemap(sitemapUrl: string): Promise<{ google: boolean; bing: boolean }> {
  const encoded = encodeURIComponent(sitemapUrl);
  const [googleRes, bingRes] = await Promise.allSettled([
    fetch(`https://www.google.com/ping?sitemap=${encoded}`, { signal: AbortSignal.timeout(10_000) }),
    fetch(`https://www.bing.com/ping?sitemap=${encoded}`,  { signal: AbortSignal.timeout(10_000) }),
  ]);
  return {
    google: googleRes.status === "fulfilled" && googleRes.value.ok,
    bing:   bingRes.status   === "fulfilled" && bingRes.value.ok,
  };
}

/**
 * Submit multiple blog URLs by pinging the sitemap.
 * Called after each new blog is published or updated.
 * Returns per-URL results and the updated IndexingData object.
 */
export async function batchSubmitUrls(
  urls:     string[],
  existing: IndexingData
): Promise<{ results: IndexSubmitResult[]; data: IndexingData }> {
  const base        = (process.env.SITE_BASE_URL ?? "https://phelixerp.vercel.app").replace(/\/$/, "");
  const sitemapUrl  = `${base}/sitemap.xml`;
  const now         = new Date().toISOString();

  // Ping the sitemap once regardless of how many URLs there are
  let pingSuccess = false;
  let pingError: string | undefined;
  try {
    const { google, bing } = await pingSitemap(sitemapUrl);
    pingSuccess = google || bing;
    if (!pingSuccess) pingError = "Both Google and Bing ping returned non-OK";
  } catch (err) {
    pingError = err instanceof Error ? err.message : String(err);
  }

  const results: IndexSubmitResult[] = urls.map((url) => ({
    url,
    success: pingSuccess,
    ...(pingError ? { error: pingError } : {}),
  }));

  // Record each URL
  for (const url of urls) {
    const slug = url.replace(`${base}/blog/`, "");
    const record: IndexingRecord = {
      slug,
      url,
      submittedAt: now,
      type:        "URL_UPDATED",
      status:      pingSuccess ? "submitted" : "failed",
      ...(pingError ? { error: pingError } : {}),
    };
    existing.records.push(record);
    if (pingSuccess) existing.totalSubmitted++;
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
