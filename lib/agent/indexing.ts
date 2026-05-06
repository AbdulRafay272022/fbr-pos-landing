/**
 * lib/agent/indexing.ts
 *
 * Google Indexing API integration.
 *
 * Submits page URLs to Google for immediate crawl using the
 * Indexing API (service account JWT auth — same pattern as GSC).
 *
 * Required env vars:
 *   GOOGLE_INDEXING_CLIENT_EMAIL  — service account email
 *   GOOGLE_INDEXING_PRIVATE_KEY   — RSA private key (PEM, \n-escaped)
 *
 * Note: The service account MUST be added as a "verified owner" in
 *       Google Search Console for the property, otherwise submissions
 *       return 403. See: https://developers.google.com/search/apis/indexing-api/v3/quickstart
 *
 * Rate limits: 200 URLs/day on free tier.
 * Graceful degradation: if env vars missing, logs a warning and returns.
 */

import type { IndexingRecord, IndexingData } from "@/lib/types";

// ─── JWT (same helper pattern as seoFeedback.ts) ─────────────────────────────

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function buildIndexingJwt(clientEmail: string, privateKeyPem: string): Promise<string> {
  const headerBytes  = new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const header       = b64url(headerBytes.buffer as ArrayBuffer);
  const now          = Math.floor(Date.now() / 1000);
  const payloadBytes = new TextEncoder().encode(
    JSON.stringify({
      iss:   clientEmail,
      scope: "https://www.googleapis.com/auth/indexing",
      aud:   "https://oauth2.googleapis.com/token",
      iat:   now,
      exp:   now + 3600,
    })
  );
  const payload = b64url(payloadBytes.buffer as ArrayBuffer);

  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey.buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBytes = new TextEncoder().encode(`${header}.${payload}`);
  const sigBuf   = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    sigBytes.buffer as ArrayBuffer
  );

  return `${header}.${payload}.${b64url(sigBuf)}`;
}

async function getIndexingAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const jwt = await buildIndexingJwt(clientEmail, privateKeyPem);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Indexing API token error ${res.status}: ${text}`);
  }

  const json = await res.json() as { access_token?: string };
  if (!json.access_token) throw new Error("No access_token in response");
  return json.access_token;
}

// ─── Core submit function ─────────────────────────────────────────────────────

export interface IndexSubmitResult {
  url:     string;
  success: boolean;
  error?:  string;
}

/**
 * Submit a single URL to the Google Indexing API.
 * type "URL_UPDATED" = new/updated content; "URL_DELETED" = removed content.
 */
export async function submitToGoogleIndexing(
  url:          string,
  accessToken:  string,
  type: "URL_UPDATED" | "URL_DELETED" = "URL_UPDATED"
): Promise<IndexSubmitResult> {
  try {
    const res = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, type }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return { url, success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    return { url, success: true };
  } catch (err) {
    return {
      url,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Submit multiple URLs in sequence (Google rate limits to ~200/day).
 * Returns per-URL results and the updated IndexingData object.
 *
 * Gracefully returns empty results if env vars are not configured.
 */
export async function batchSubmitUrls(
  urls:     string[],
  existing: IndexingData
): Promise<{ results: IndexSubmitResult[]; data: IndexingData }> {
  const clientEmail = process.env.GOOGLE_INDEXING_CLIENT_EMAIL;
  const privateKey  = process.env.GOOGLE_INDEXING_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    // Not configured — skip silently
    return {
      results: urls.map((url) => ({ url, success: false, error: "Indexing API not configured" })),
      data:    existing,
    };
  }

  let accessToken: string;
  try {
    accessToken = await getIndexingAccessToken(clientEmail, privateKey);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      results: urls.map((url) => ({ url, success: false, error })),
      data:    existing,
    };
  }

  const results: IndexSubmitResult[] = [];
  const now     = new Date().toISOString();
  const base    = (process.env.SITE_BASE_URL ?? "").replace(/\/$/, "");

  for (const url of urls) {
    const result = await submitToGoogleIndexing(url, accessToken);
    results.push(result);

    const slug = url.replace(`${base}/blog/`, "");
    const record: IndexingRecord = {
      slug,
      url,
      submittedAt: now,
      type:        "URL_UPDATED",
      status:      result.success ? "submitted" : "failed",
      ...(result.error ? { error: result.error } : {}),
    };

    existing.records.push(record);
    if (result.success) existing.totalSubmitted++;
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
