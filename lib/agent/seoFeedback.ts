/**
 * lib/agent/seoFeedback.ts
 *
 * Google Search Console (GSC) integration.
 *
 * Fetches impressions, clicks, CTR, and average position for all pages on the
 * site over the past 28 days, maps each URL to a blog slug, and stores the
 * result in data/seo.json via a GitHub commit.
 *
 * Auth: Service-account JWT (no OAuth browser flow).
 *   Required env vars:
 *     GSC_CLIENT_EMAIL  — service account email
 *     GSC_PRIVATE_KEY   — RSA private key (PEM, newlines as \n)
 *     GSC_SITE_URL      — exact GSC property URL, e.g. "https://phelixerp.com/"
 *
 * The private key must be added to GSC as a verified owner, or you must use
 * "Domain property" and add a TXT DNS record for the service account.
 */

import type { PageMetric, QueryMetric, SeoData } from "@/lib/types";

// ─── JWT helpers (no external dependency) ────────────────────────────────────

/** Base64url-encode a Uint8Array */
function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Build and sign a Google service-account JWT */
async function buildJwt(clientEmail: string, privateKeyPem: string): Promise<string> {
  const headerBytes  = new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const header       = b64url(headerBytes.buffer as ArrayBuffer);
  const now          = Math.floor(Date.now() / 1000);
  const payloadBytes = new TextEncoder().encode(
    JSON.stringify({
      iss:   clientEmail,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud:   "https://oauth2.googleapis.com/token",
      iat:   now,
      exp:   now + 3600,
    })
  );
  const payload = b64url(payloadBytes.buffer as ArrayBuffer);

  // Strip PEM headers and decode base64 → binary
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

  const signingBytes = new TextEncoder().encode(`${header}.${payload}`);
  const sigBuf       = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signingBytes.buffer as ArrayBuffer
  );

  return `${header}.${payload}.${b64url(sigBuf)}`;
}

/** Exchange a signed JWT for a Google access token (service account flow) */
async function getAccessTokenJwt(clientEmail: string, privateKeyPem: string): Promise<string> {
  const jwt = await buildJwt(clientEmail, privateKeyPem);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GSC JWT token exchange failed ${res.status}: ${body}`);
  }

  const json = await res.json() as { access_token?: string };
  if (!json.access_token) throw new Error("No access_token in Google response");
  return json.access_token;
}

/** Exchange a refresh token for a Google access token (OAuth2 user flow) */
async function getAccessTokenOAuth2(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GSC OAuth2 refresh failed ${res.status}: ${body}`);
  }
  const json = await res.json() as { access_token?: string };
  if (!json.access_token) throw new Error("No access_token in Google response");
  return json.access_token;
}

/**
 * Auto-detect auth method based on what creds are present.
 * OAuth2 is preferred (works with personal Google accounts).
 */
async function getAccessToken(creds: {
  clientEmail?:  string;
  privateKey?:   string;
  clientId?:     string;
  clientSecret?: string;
  refreshToken?: string;
}): Promise<string> {
  if (creds.clientId && creds.clientSecret && creds.refreshToken) {
    return getAccessTokenOAuth2(creds.clientId, creds.clientSecret, creds.refreshToken);
  }
  if (creds.clientEmail && creds.privateKey) {
    return getAccessTokenJwt(creds.clientEmail, creds.privateKey);
  }
  throw new Error("No GSC auth credentials. Set GSC_CLIENT_ID+GSC_CLIENT_SECRET+GSC_REFRESH_TOKEN or GSC_CLIENT_EMAIL+GSC_PRIVATE_KEY.");
}

// ─── GSC Search Analytics ─────────────────────────────────────────────────────

interface GscRow {
  keys: string[];
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

interface GscResponse {
  rows?: GscRow[];
  responseAggregationType?: string;
  error?: { message: string };
}

/**
 * Core GSC Search Analytics query helper.
 * Fetches last 28 days of data with the given dimensions.
 */
async function fetchGscRows(
  siteUrl: string,
  accessToken: string,
  dimensions: string[],
  rowLimit = 500
): Promise<GscRow[]> {
  const endDate   = new Date();
  const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const fmt       = (d: Date) => d.toISOString().split("T")[0];

  const encodedSite = encodeURIComponent(siteUrl);
  const endpoint    = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;

  const res = await fetch(endpoint, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate:  fmt(startDate),
      endDate:    fmt(endDate),
      dimensions,
      rowLimit,
      startRow:   0,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC API error ${res.status}: ${text}`);
  }

  const json = await res.json() as GscResponse;
  if (json.error) throw new Error(`GSC API error: ${json.error.message}`);
  return json.rows ?? [];
}

/**
 * Fetch the last 28 days of page-level data from GSC Search Analytics.
 * Returns raw rows keyed by full URL.
 */
async function fetchGscData(
  siteUrl: string,
  accessToken: string
): Promise<GscRow[]> {
  return fetchGscRows(siteUrl, accessToken, ["page"], 500);
}

/**
 * Fetch the last 28 days of query-level data from GSC.
 * Returns all queries the site appeared for — we filter to positions 11–50
 * (striking distance: Google considers us relevant but we're not on page 1 yet).
 *
 * These are the HIGHEST-ROI keywords to target because:
 *   - Google already thinks the site is relevant for them
 *   - Nobody clicks (page 2+)
 *   - A targeted blog post can push to page 1
 */
async function fetchGscQueries(
  siteUrl: string,
  accessToken: string
): Promise<QueryMetric[]> {
  let rows: GscRow[];
  try {
    // Fetch top 1000 queries by impressions
    rows = await fetchGscRows(siteUrl, accessToken, ["query"], 1000);
  } catch {
    // Non-fatal — page data is still saved even if query fetch fails
    return [];
  }

  const fetchedAt = new Date().toISOString();

  return rows
    // Striking distance: positions 11–50 (page 2–5), at least 2 impressions
    .filter((r) => r.position >= 11 && r.position <= 50 && r.impressions >= 2)
    // Drop branded queries — they'll never be new keyword opportunities
    .filter((r) => {
      const q = r.keys[0].toLowerCase();
      return !q.includes("phelix") && !q.includes("fbr erp");
    })
    .map((r) => ({
      query:       r.keys[0],
      impressions: r.impressions,
      clicks:      r.clicks,
      ctr:         r.ctr,
      position:    r.position,
      fetchedAt,
    }))
    // Highest impressions first = biggest opportunity first
    .sort((a, b) => b.impressions - a.impressions);
}

// ─── URL → slug mapping ───────────────────────────────────────────────────────

/**
 * Given a full page URL and the site base URL, derive the blog slug.
 * e.g. "https://phelixerp.com/blog/fbr-pos-guide" → "fbr-pos-guide"
 * Non-blog pages return null.
 */
function urlToSlug(pageUrl: string, siteUrl: string): string | null {
  try {
    const url     = new URL(pageUrl);
    const base    = new URL(siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`);
    const path    = url.pathname.replace(base.pathname, "/");
    const match   = path.match(/^\/blog\/([^/]+)\/?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface FetchSeoDataResult {
  success: boolean;
  reason?: string;
  data?: SeoData;
}

/**
 * Fetch GSC data and return a structured SeoData object.
 * Does NOT commit to GitHub — caller handles persistence.
 *
 * Supports both OAuth2 (recommended) and Service Account JWT auth.
 */
export async function fetchSeoData(
  creds: {
    // OAuth2 (preferred)
    clientId?:     string;
    clientSecret?: string;
    refreshToken?: string;
    // Service account JWT (fallback)
    clientEmail?:  string;
    privateKey?:   string;
  },
  siteUrl: string
): Promise<FetchSeoDataResult> {
  let accessToken: string;
  try {
    accessToken = await getAccessToken(creds);
  } catch (err) {
    return {
      success: false,
      reason:  `Auth failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── Fetch page-level AND query-level data in parallel ─────────────────────
  let pageRows: GscRow[];
  let queries:  ReturnType<typeof fetchGscQueries> extends Promise<infer T> ? T : never;

  try {
    const [pageResult, queryResult] = await Promise.allSettled([
      fetchGscData(siteUrl, accessToken),
      fetchGscQueries(siteUrl, accessToken),
    ]);

    if (pageResult.status === "rejected") {
      return {
        success: false,
        reason:  `GSC fetch failed: ${pageResult.reason instanceof Error ? pageResult.reason.message : String(pageResult.reason)}`,
      };
    }

    pageRows = pageResult.value;
    queries  = queryResult.status === "fulfilled" ? queryResult.value : [];
  } catch (err) {
    return {
      success: false,
      reason:  `GSC fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (pageRows.length === 0) {
    return {
      success: false,
      reason:  "GSC returned 0 rows — site may have no impressions yet",
    };
  }

  const fetchedAt = new Date().toISOString();
  const pages: PageMetric[] = [];

  for (const row of pageRows) {
    const pageUrl = row.keys[0];
    const slug    = urlToSlug(pageUrl, siteUrl);
    if (!slug) continue; // skip homepage, sitemap, etc.

    pages.push({
      slug,
      url:         pageUrl,
      impressions: row.impressions,
      clicks:      row.clicks,
      ctr:         row.ctr,
      position:    row.position,
      fetchedAt,
    });
  }

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
  const totalClicks      = pages.reduce((s, p) => s + p.clicks, 0);
  const avgCTR           = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgPosition      =
    pages.length > 0
      ? pages.reduce((s, p) => s + p.position, 0) / pages.length
      : 0;

  const topPages = [...pages]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5)
    .map((p) => ({ slug: p.slug, impressions: p.impressions, ctr: p.ctr, position: p.position }));

  const topQueries = queries
    .slice(0, 20)
    .map((q) => ({ query: q.query, impressions: q.impressions, position: Math.round(q.position * 10) / 10 }));

  const seoData: SeoData = {
    pages,
    queries,           // full striking-distance query list (pos 11–50)
    lastFetchedAt: fetchedAt,
    summary:  { totalImpressions, totalClicks, avgCTR, avgPosition },
    topPages,
    topQueries,        // top 20 for quick inspection
  };

  return { success: true, data: seoData };
}

/**
 * Find blogs that are underperforming and need a content refresh:
 *   - Has GSC impressions (Google has crawled it) but:
 *     - CTR is below the site average  OR
 *     - Position is > 20 (page 2+)
 *
 * Returns slugs sorted by "most underperforming" first.
 */
export function findLowPerformers(
  seoData: SeoData,
  opts: { minImpressions?: number; ctrThreshold?: number; positionThreshold?: number } = {}
): PageMetric[] {
  const {
    minImpressions     = 50,
    ctrThreshold       = seoData.summary.avgCTR,
    positionThreshold  = 20,
  } = opts;

  return seoData.pages
    .filter(
      (p) =>
        p.impressions >= minImpressions &&
        (p.ctr < ctrThreshold || p.position > positionThreshold)
    )
    .sort((a, b) => {
      // Priority score: high impressions + low CTR + high position = worst
      const scoreA = a.impressions * (1 - a.ctr) * (a.position / 100);
      const scoreB = b.impressions * (1 - b.ctr) * (b.position / 100);
      return scoreB - scoreA;
    });
}

/**
 * Find blogs ranking in position 10–30 — these are "striking distance" pages
 * that could reach page 1 with a content boost.
 */
export function findStrikingDistance(seoData: SeoData): PageMetric[] {
  return seoData.pages
    .filter((p) => p.position >= 10 && p.position <= 30 && p.impressions >= 20)
    .sort((a, b) => a.position - b.position);
}
