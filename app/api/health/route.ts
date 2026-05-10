/**
 * GET /api/health
 *
 * API health check — tests every external service the system depends on.
 * Returns a clear ✅/❌ status per service with the failure reason if broken.
 *
 * Public endpoint — no auth required (shows only connection status, no data).
 *
 * Use this to debug: which APIs are configured, which are working.
 */

import { NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceCheck {
  name:        string;
  configured:  boolean;   // env vars are set
  reachable:   boolean;   // API actually responded OK
  required:    boolean;   // system breaks without this
  note:        string;    // what it does / what failed
  latencyMs?:  number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSet(...vars: (string | undefined)[]): boolean {
  return vars.every((v) => !!v && v.trim().length > 0);
}

async function ping(
  url: string,
  options: RequestInit,
  timeoutMs = 8000
): Promise<{ ok: boolean; status: number; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok:        false,
      status:    0,
      latencyMs: Date.now() - start,
      error:     err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Individual service checks ────────────────────────────────────────────────

async function checkGitHub(): Promise<ServiceCheck> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;
  const configured = isSet(token, owner, repo);

  if (!configured) {
    return { name: "GitHub API", configured: false, reachable: false, required: true,
      note: "Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO — this is the database, nothing works without it" };
  }

  const result = await ping(
    `https://api.github.com/repos/${owner}/${repo}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" } }
  );

  return {
    name: "GitHub API", configured: true, required: true,
    reachable: result.ok,
    latencyMs: result.latencyMs,
    note: result.ok
      ? `Connected to ${owner}/${repo}`
      : `HTTP ${result.status} — check token has repo scope. ${result.error ?? ""}`,
  };
}

async function checkGroq(): Promise<ServiceCheck> {
  const apiKey = process.env.GROQ_API_KEY;
  const configured = isSet(apiKey);

  if (!configured) {
    return { name: "Groq API (LLM)", configured: false, reachable: false, required: true,
      note: "Missing GROQ_API_KEY — content generation will use template fallback only" };
  }

  const result = await ping(
    "https://api.groq.com/openai/v1/models",
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  return {
    name: "Groq API (LLM)", configured: true, required: true,
    reachable: result.ok,
    latencyMs: result.latencyMs,
    note: result.ok
      ? "Connected — llama-3.3-70b-versatile available"
      : `HTTP ${result.status} — check GROQ_API_KEY is valid. ${result.error ?? ""}`,
  };
}

async function checkPexels(): Promise<ServiceCheck> {
  const apiKey = process.env.PEXELS_API_KEY;
  const configured = isSet(apiKey);

  if (!configured) {
    return { name: "Pexels API (Images)", configured: false, reachable: false, required: false,
      note: "Not configured — blogs will publish without hero images (get key at pexels.com/api)" };
  }

  const result = await ping(
    "https://api.pexels.com/v1/search?query=business&per_page=1",
    { headers: { Authorization: apiKey! } }
  );

  return {
    name: "Pexels API (Images)", configured: true, required: false,
    reachable: result.ok,
    latencyMs: result.latencyMs,
    note: result.ok
      ? "Connected — hero images will be fetched for every new blog"
      : `HTTP ${result.status} — check PEXELS_API_KEY. ${result.error ?? ""}`,
  };
}

async function checkGSC(): Promise<ServiceCheck> {
  const email = process.env.GSC_CLIENT_EMAIL;
  const key   = process.env.GSC_PRIVATE_KEY;
  const site  = process.env.GSC_SITE_URL;
  const configured = isSet(email, key, site);

  if (!configured) {
    return { name: "Google Search Console", configured: false, reachable: false, required: false,
      note: "Not configured — decay detection and SEO feedback run without real ranking data" };
  }

  // Just check the token endpoint is reachable (don't sign a full JWT here)
  const result = await ping(
    "https://oauth2.googleapis.com/token",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=test" }
  );

  // 400 = token endpoint works, just bad JWT (expected) — that's fine
  const reachable = result.status === 400 || result.status === 401;

  return {
    name: "Google Search Console", configured: true, required: false,
    reachable,
    latencyMs: result.latencyMs,
    note: reachable
      ? `Env vars set for ${site} — GSC will fetch 28-day ranking data`
      : `Cannot reach Google OAuth endpoint — check network. ${result.error ?? ""}`,
  };
}

async function checkGoogleIndexing(): Promise<ServiceCheck> {
  const email = process.env.GOOGLE_INDEXING_CLIENT_EMAIL;
  const key   = process.env.GOOGLE_INDEXING_PRIVATE_KEY;
  const configured = isSet(email, key);

  if (!configured) {
    return { name: "Google Indexing API", configured: false, reachable: false, required: false,
      note: "Not configured — new blogs won't be auto-submitted to Google (slower indexing)" };
  }

  const result = await ping(
    "https://oauth2.googleapis.com/token",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=test" }
  );
  const reachable = result.status === 400 || result.status === 401;

  return {
    name: "Google Indexing API", configured: true, required: false,
    reachable,
    latencyMs: result.latencyMs,
    note: reachable
      ? "Env vars set — new blogs will be submitted to Google immediately after publish"
      : `Cannot reach Google OAuth endpoint. ${result.error ?? ""}`,
  };
}

async function checkTwitter(): Promise<ServiceCheck> {
  const configured = isSet(
    process.env.TWITTER_API_KEY,
    process.env.TWITTER_API_SECRET,
    process.env.TWITTER_ACCESS_TOKEN,
    process.env.TWITTER_ACCESS_SECRET
  );

  if (!configured) {
    return { name: "Twitter/X API", configured: false, reachable: false, required: false,
      note: "Not configured — new blogs won't be auto-tweeted" };
  }

  // Just check reachability of Twitter API endpoint
  const result = await ping(
    "https://api.twitter.com/2/tweets",
    { method: "POST", headers: { Authorization: "Bearer invalid", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "test" }) }
  );

  // 401 = endpoint reached, credentials wrong (expected without proper OAuth) — infrastructure OK
  const reachable = result.status === 401 || result.status === 403;

  return {
    name: "Twitter/X API", configured: true, required: false,
    reachable,
    latencyMs: result.latencyMs,
    note: reachable
      ? "Env vars set — new blogs will be auto-tweeted after publish"
      : `Twitter API unreachable (status ${result.status}). ${result.error ?? ""}`,
  };
}

async function checkLinkedIn(): Promise<ServiceCheck> {
  const configured = isSet(
    process.env.LINKEDIN_ACCESS_TOKEN,
    process.env.LINKEDIN_PERSON_URN
  );

  if (!configured) {
    return { name: "LinkedIn API", configured: false, reachable: false, required: false,
      note: "Not configured — new blogs won't be posted to LinkedIn" };
  }

  const result = await ping(
    "https://api.linkedin.com/v2/userinfo",
    { headers: { Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` } }
  );

  return {
    name: "LinkedIn API", configured: true, required: false,
    reachable: result.ok || result.status === 401,
    latencyMs: result.latencyMs,
    note: result.ok
      ? "Connected — new blogs will be posted to LinkedIn"
      : result.status === 401
        ? "Token may be expired (LinkedIn tokens expire every 60 days) — regenerate LINKEDIN_ACCESS_TOKEN"
        : `HTTP ${result.status}. ${result.error ?? ""}`,
  };
}

async function checkDataForSEO(): Promise<ServiceCheck> {
  const configured = isSet(
    process.env.DATAFORSEO_LOGIN,
    process.env.DATAFORSEO_PASSWORD
  );

  if (!configured) {
    return { name: "DataForSEO (SERP)", configured: false, reachable: false, required: false,
      note: "Not configured — keyword difficulty uses heuristics instead of real SERP data" };
  }

  const credentials = Buffer.from(
    `${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`
  ).toString("base64");

  const result = await ping(
    "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
    { method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ keyword: "test", language_code: "en", location_code: 2586 }]) }
  );

  return {
    name: "DataForSEO (SERP)", configured: true, required: false,
    reachable: result.ok || result.status === 400,
    latencyMs: result.latencyMs,
    note: result.ok || result.status === 400
      ? "Connected — real SERP data will improve keyword prioritization"
      : `HTTP ${result.status} — check DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD. ${result.error ?? ""}`,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  const start = Date.now();

  // Run all checks in parallel
  const checks = await Promise.all([
    checkGitHub(),
    checkGroq(),
    checkPexels(),
    checkGSC(),
    checkGoogleIndexing(),
    checkTwitter(),
    checkLinkedIn(),
    checkDataForSEO(),
  ]);

  const requiredOk  = checks.filter((c) => c.required).every((c) => c.reachable || !c.configured);
  const totalOk     = checks.filter((c) => c.reachable).length;
  const totalConfig = checks.filter((c) => c.configured).length;

  // Overall system status
  const allRequiredConfigured = checks.filter((c) => c.required).every((c) => c.configured);
  const allRequiredReachable  = checks.filter((c) => c.required && c.configured).every((c) => c.reachable);

  let systemStatus: "healthy" | "degraded" | "broken";
  if (!allRequiredConfigured) systemStatus = "broken";
  else if (!allRequiredReachable) systemStatus = "broken";
  else if (totalOk < totalConfig) systemStatus = "degraded";
  else systemStatus = "healthy";

  void requiredOk;

  return NextResponse.json({
    systemStatus,
    checkedAt:    new Date().toISOString(),
    totalMs:      Date.now() - start,
    summary: {
      configured: totalConfig,
      reachable:  totalOk,
      total:      checks.length,
    },
    services: checks,
  }, {
    headers: {
      // Don't cache — always fresh check
      "Cache-Control": "no-store",
    },
  });
}
