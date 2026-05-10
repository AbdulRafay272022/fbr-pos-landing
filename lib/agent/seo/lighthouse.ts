/**
 * lib/agent/seo/lighthouse.ts
 *
 * Core Web Vitals monitoring via Google PageSpeed Insights API.
 *
 * Audits LCP, INP, CLS, FCP, TTFB, Performance Score, SEO Score, Accessibility.
 * Page-by-page snapshots stored over time so the dashboard can show CWV
 * regressions per URL.
 *
 * Auth: PAGESPEED_API_KEY (optional — works without a key but rate-limited).
 *       Free quota: 25,000 queries/day with key, ~1/sec without.
 */

const PSI_BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export interface CwvAudit {
  url:             string;
  /** ISO timestamp */
  fetchedAt:       string;
  strategy:        "mobile" | "desktop";
  /** 0-100 */
  performance:     number | null;
  accessibility:   number | null;
  bestPractices:   number | null;
  seo:             number | null;
  /** Largest Contentful Paint (ms) — target <2500 */
  lcp:             number | null;
  /** Interaction to Next Paint (ms) — target <200 */
  inp:             number | null;
  /** Cumulative Layout Shift (unitless) — target <0.1 */
  cls:             number | null;
  /** First Contentful Paint (ms) */
  fcp:             number | null;
  /** Time to First Byte (ms) */
  ttfb:            number | null;
  /** Whether the page passes Core Web Vitals thresholds */
  cwvPasses:       boolean | null;
  /** Top opportunities (key + savings ms) */
  opportunities:   Array<{ id: string; title: string; savingsMs: number }>;
  /** Errors encountered */
  errors:          string[];
}

interface LighthouseResult {
  categories: Record<string, { score: number | null }>;
  audits:     Record<string, {
    title?:           string;
    score?:           number | null;
    numericValue?:    number;
    details?:         { overallSavingsMs?: number };
  }>;
}

interface PsiResponse {
  lighthouseResult?: LighthouseResult;
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number; category?: string }>;
    overall_category?: string;
  };
  error?: { code: number; message: string };
}

export async function auditUrl(opts: {
  url:        string;
  strategy?:  "mobile" | "desktop";
  apiKey?:    string;
}): Promise<CwvAudit> {
  const errors: string[] = [];
  const apiKey   = opts.apiKey ?? process.env.PAGESPEED_API_KEY ?? "";
  const strategy = opts.strategy ?? "mobile";

  const params = new URLSearchParams({
    url:      opts.url,
    strategy,
  });
  ["performance", "accessibility", "best-practices", "seo"].forEach((c) => params.append("category", c));
  if (apiKey) params.set("key", apiKey);

  let psi: PsiResponse | null = null;
  try {
    const res = await fetch(`${PSI_BASE}?${params.toString()}`, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      errors.push(`PSI HTTP ${res.status}`);
    } else {
      psi = (await res.json()) as PsiResponse;
      if (psi.error) errors.push(`PSI error ${psi.error.code}: ${psi.error.message}`);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const lh = psi?.lighthouseResult;
  const audits = lh?.audits ?? {};
  const cats   = lh?.categories ?? {};
  const fieldM = psi?.loadingExperience?.metrics ?? {};

  const numericOrNull = (key: string): number | null => {
    const v = audits[key]?.numericValue;
    return typeof v === "number" ? Math.round(v) : null;
  };
  const fieldNumeric = (key: string): number | null => {
    const v = fieldM[key]?.percentile;
    return typeof v === "number" ? v : null;
  };
  const score = (key: string): number | null => {
    const s = cats[key]?.score;
    return typeof s === "number" ? Math.round(s * 100) : null;
  };

  const lcp = fieldNumeric("LARGEST_CONTENTFUL_PAINT_MS") ?? numericOrNull("largest-contentful-paint");
  const inp = fieldNumeric("INTERACTION_TO_NEXT_PAINT")   ?? numericOrNull("interaction-to-next-paint");
  const cls = (() => {
    const f = fieldM["CUMULATIVE_LAYOUT_SHIFT_SCORE"]?.percentile;
    if (typeof f === "number") return f / 100; // PSI returns CLS×100
    const lab = audits["cumulative-layout-shift"]?.numericValue;
    return typeof lab === "number" ? +lab.toFixed(3) : null;
  })();
  const fcp  = fieldNumeric("FIRST_CONTENTFUL_PAINT_MS") ?? numericOrNull("first-contentful-paint");
  const ttfb = fieldNumeric("EXPERIMENTAL_TIME_TO_FIRST_BYTE") ?? numericOrNull("server-response-time");

  const cwvPasses = (() => {
    if (lcp === null || inp === null || cls === null) return null;
    return lcp <= 2500 && inp <= 200 && cls <= 0.1;
  })();

  // Top opportunities
  const opportunities: CwvAudit["opportunities"] = [];
  for (const [id, audit] of Object.entries(audits)) {
    const savings = audit.details?.overallSavingsMs;
    if (typeof savings === "number" && savings > 100) {
      opportunities.push({ id, title: audit.title ?? id, savingsMs: Math.round(savings) });
    }
  }
  opportunities.sort((a, b) => b.savingsMs - a.savingsMs);

  return {
    url:           opts.url,
    fetchedAt:     new Date().toISOString(),
    strategy,
    performance:   score("performance"),
    accessibility: score("accessibility"),
    bestPractices: score("best-practices"),
    seo:           score("seo"),
    lcp, inp, cls, fcp, ttfb,
    cwvPasses,
    opportunities: opportunities.slice(0, 5),
    errors,
  };
}

export interface CwvData {
  /** keyed by URL */
  audits:           Record<string, CwvAudit[]>;     // history per URL (newest last)
  lastFullAuditAt:  string | null;
}

export const EMPTY_CWV: CwvData = { audits: {}, lastFullAuditAt: null };

export interface AuditBatchOptions {
  urls:      string[];
  strategy?: "mobile" | "desktop";
  /** Throttle between requests (ms) */
  throttleMs?: number;
}

export async function auditBatch(
  opts: AuditBatchOptions,
  current: CwvData,
): Promise<{ audited: number; failed: number; data: CwvData }> {
  let audited = 0, failed = 0;
  const throttleMs = opts.throttleMs ?? 1100; // ~1/sec without key

  for (const url of opts.urls) {
    const audit = await auditUrl({ url, strategy: opts.strategy });
    const list = current.audits[url] ?? [];
    list.push(audit);
    // Keep last 30 audits per URL
    current.audits[url] = list.slice(-30);
    if (audit.errors.length > 0) failed++;
    else audited++;
    if (throttleMs > 0 && url !== opts.urls[opts.urls.length - 1]) {
      await new Promise((r) => setTimeout(r, throttleMs));
    }
  }
  current.lastFullAuditAt = new Date().toISOString();
  return { audited, failed, data: current };
}

export interface CwvSummary {
  totalAudited:    number;
  passingCwv:      number;
  failingCwv:      number;
  avgPerformance:  number | null;
  avgLcp:          number | null;
  avgInp:          number | null;
  avgCls:          number | null;
  worstOffenders:  Array<{ url: string; performance: number; failureReason: string }>;
}

export function summarizeCwv(data: CwvData): CwvSummary {
  const latest: CwvAudit[] = [];
  for (const list of Object.values(data.audits)) {
    if (list.length > 0) latest.push(list[list.length - 1]);
  }
  const passing = latest.filter((a) => a.cwvPasses === true).length;
  const failing = latest.filter((a) => a.cwvPasses === false).length;
  const avg = (key: keyof CwvAudit) => {
    const vals = latest.map((a) => a[key]).filter((v): v is number => typeof v === "number");
    return vals.length === 0 ? null : Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  };

  const worst = latest
    .filter((a) => a.cwvPasses === false || (a.performance !== null && a.performance < 50))
    .map((a) => ({
      url:           a.url,
      performance:   a.performance ?? 0,
      failureReason: [
        a.lcp && a.lcp > 2500 ? `LCP ${a.lcp}ms` : null,
        a.inp && a.inp > 200  ? `INP ${a.inp}ms` : null,
        a.cls && a.cls > 0.1  ? `CLS ${a.cls.toFixed(2)}` : null,
      ].filter(Boolean).join(", ") || "Low Performance score",
    }))
    .sort((a, b) => a.performance - b.performance)
    .slice(0, 5);

  return {
    totalAudited:   latest.length,
    passingCwv:     passing,
    failingCwv:     failing,
    avgPerformance: avg("performance"),
    avgLcp:         avg("lcp"),
    avgInp:         avg("inp"),
    avgCls:         (() => {
      const vals = latest.map((a) => a.cls).filter((v): v is number => typeof v === "number");
      if (vals.length === 0) return null;
      return +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(3);
    })(),
    worstOffenders: worst,
  };
}
