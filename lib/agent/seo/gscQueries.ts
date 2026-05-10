/**
 * lib/agent/seo/gscQueries.ts
 *
 * Pulls QUERY-LEVEL data from Google Search Console (existing seoFeedback.ts
 * pulls page-level only). This unlocks striking-distance detection and
 * cannibalization analysis.
 *
 * Supports TWO auth methods — whichever env vars are present:
 *   1. OAuth2 refresh token (recommended — works with personal Google accounts)
 *      GSC_CLIENT_ID + GSC_CLIENT_SECRET + GSC_REFRESH_TOKEN
 *   2. Service account JWT (requires Workspace domain delegation)
 *      GSC_CLIENT_EMAIL + GSC_PRIVATE_KEY
 */

export interface GscQueryRow {
  query:       string;
  page:        string;
  impressions: number;
  clicks:      number;
  ctr:         number;
  position:    number;
}

// ─── Auth Method 1: OAuth2 refresh token ─────────────────────────────────────
// Works with any personal Google account. Recommended for most setups.

async function getAccessTokenOAuth2(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OAuth2 token refresh failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  const j = (await res.json()) as { access_token: string };
  return j.access_token;
}

// ─── Auth Method 2: Service account JWT ──────────────────────────────────────
// Requires Google Workspace + domain-wide delegation for most GSC properties.

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function buildJwt(clientEmail: string, privateKeyPem: string): Promise<string> {
  const headerBytes  = new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const header       = b64url(headerBytes.buffer as ArrayBuffer);
  const now          = Math.floor(Date.now() / 1000);
  const payloadBytes = new TextEncoder().encode(JSON.stringify({
    iss:   clientEmail,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now, exp: now + 3600,
  }));
  const payload = b64url(payloadBytes.buffer as ArrayBuffer);
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey.buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const signingBytes = new TextEncoder().encode(`${header}.${payload}`);
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signingBytes.buffer as ArrayBuffer);
  return `${header}.${payload}.${b64url(sigBuf)}`;
}

async function getAccessTokenJwt(clientEmail: string, privateKeyPem: string): Promise<string> {
  const jwt = await buildJwt(clientEmail, privateKeyPem);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });
  if (!res.ok) throw new Error(`Google JWT token exchange failed: ${res.status}`);
  const j = (await res.json()) as { access_token: string };
  return j.access_token;
}

// ─── Auto-detect auth method ──────────────────────────────────────────────────

async function getAccessToken(opts: {
  clientEmail?: string;
  privateKey?:  string;
  clientId?:    string;
  clientSecret?:string;
  refreshToken?:string;
}): Promise<string> {
  // Prefer OAuth2 refresh token (works with personal accounts)
  if (opts.clientId && opts.clientSecret && opts.refreshToken) {
    return getAccessTokenOAuth2(opts.clientId, opts.clientSecret, opts.refreshToken);
  }
  // Fall back to service account JWT
  if (opts.clientEmail && opts.privateKey) {
    return getAccessTokenJwt(opts.clientEmail, opts.privateKey);
  }
  throw new Error("No GSC auth credentials configured. Set GSC_CLIENT_ID+GSC_CLIENT_SECRET+GSC_REFRESH_TOKEN (recommended) or GSC_CLIENT_EMAIL+GSC_PRIVATE_KEY.");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchGscQueries(opts: {
  // Auth option 1 — OAuth2 refresh token (recommended, works with personal Google accounts)
  clientId?:      string;
  clientSecret?:  string;
  refreshToken?:  string;
  // Auth option 2 — Service account JWT
  clientEmail?:   string;
  privateKey?:    string;
  // Common
  siteUrl:        string;
  /** How many days back to look (max 480, default 28) */
  days?:          number;
  /** Max rows to return per request (max 25000, default 5000) */
  rowLimit?:      number;
}): Promise<{ ok: true; rows: GscQueryRow[]; days: number } | { ok: false; error: string }> {
  try {
    const token = await getAccessToken(opts);
    const days  = opts.days ?? 28;
    const today = new Date();
    const start = new Date(today.getTime() - days * 86_400_000);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const apiUrl = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(opts.siteUrl)}/searchAnalytics/query`;

    const res = await fetch(apiUrl, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        startDate:  fmt(start),
        endDate:    fmt(today),
        dimensions: ["query", "page"],
        rowLimit:   opts.rowLimit ?? 5000,
        type:       "web",
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `GSC API ${res.status}: ${txt.slice(0, 200)}` };
    }

    const json = (await res.json()) as {
      rows?: Array<{
        keys: [string, string];
        impressions: number;
        clicks: number;
        ctr: number;
        position: number;
      }>;
    };

    const rows: GscQueryRow[] = (json.rows ?? []).map((r) => ({
      query:       r.keys[0],
      page:        r.keys[1],
      impressions: r.impressions,
      clicks:      r.clicks,
      ctr:         r.ctr,
      position:    r.position,
    }));

    return { ok: true, rows, days };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Compare two periods to detect rising and falling queries.
 */
export function compareQueryPeriods(
  current: GscQueryRow[],
  previous: GscQueryRow[],
): { rising: GscQueryRow[]; falling: GscQueryRow[] } {
  const prevMap = new Map<string, GscQueryRow>();
  for (const r of previous) prevMap.set(`${r.query}|${r.page}`, r);

  const rising:  GscQueryRow[] = [];
  const falling: GscQueryRow[] = [];

  for (const r of current) {
    const key = `${r.query}|${r.page}`;
    const prev = prevMap.get(key);
    if (!prev) continue;
    const positionDelta = prev.position - r.position; // positive = improved
    const impDelta      = r.impressions - prev.impressions;
    if (positionDelta > 3 || impDelta > 50) rising.push(r);
    else if (positionDelta < -5 || impDelta < -50) falling.push(r);
  }
  return { rising, falling };
}
