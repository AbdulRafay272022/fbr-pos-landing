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

import type { PageMetric, SeoData } from "@/lib/types";

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

/** Exchange a signed JWT for a Google access token */
async function getAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
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
    throw new Error(`GSC token exchange failed ${res.status}: ${body}`);
  }

  const json = await res.json() as { access_token?: string };
  if (!json.access_token) throw new Error("No access_token in Google response");
  return json.access_token;
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
 * Fetch the last 28 days of page-level data from GSC Search Analytics.
 * Returns raw rows keyed by full URL.
 */
async function fetchGscData(
  siteUrl: string,
  accessToken: string
): Promise<GscRow[]> {
  const endDate   = new Date();
  const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const encodedSite = encodeURIComponent(siteUrl);
  const endpoint    = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;

  const body = {
    startDate:   fmt(startDate),
    endDate:     fmt(endDate),
    dimensions:  ["page"],
    rowLimit:    500,
    startRow:    0,
  };

  const res = await fetch(endpoint, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC API error ${res.status}: ${text}`);
  }

  const json = await res.json() as GscResponse;
  if (json.error) throw new Error(`GSC API error: ${json.error.message}`);
  return json.rows ?? [];
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
 */
export async function fetchSeoData(
  clientEmail: string,
  privateKeyPem: string,
  siteUrl: string
): Promise<FetchSeoDataResult> {
  let accessToken: string;
  try {
    accessToken = await getAccessToken(clientEmail, privateKeyPem);
  } catch (err) {
    return {
      success: false,
      reason:  `Auth failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let rows: GscRow[];
  try {
    rows = await fetchGscData(siteUrl, accessToken);
  } catch (err) {
    return {
      success: false,
      reason:  `GSC fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (rows.length === 0) {
    return {
      success: false,
      reason:  "GSC returned 0 rows — site may have no impressions yet",
    };
  }

  const fetchedAt = new Date().toISOString();
  const pages: PageMetric[] = [];

  for (const row of rows) {
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

  const seoData: SeoData = {
    pages,
    lastFetchedAt: fetchedAt,
    summary:  { totalImpressions, totalClicks, avgCTR, avgPosition },
    topPages,
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
