"use client";

/**
 * /admin — System monitoring dashboard
 *
 * Shows:
 *  - API health (every external service: ✅ working / ⚠️ not configured / ❌ broken)
 *  - Agent status (running/idle, last run times)
 *  - Recent activity log (last 20 agent events)
 *  - Content stats (blogs, keywords, costs)
 *  - Indexing + distribution status
 *
 * Refreshes every 30 seconds automatically.
 * No auth — add password protection in Vercel if needed.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceCheck {
  name:       string;
  configured: boolean;
  reachable:  boolean;
  required:   boolean;
  note:       string;
  latencyMs?: number;
}

interface HealthData {
  systemStatus: "healthy" | "degraded" | "broken";
  checkedAt:    string;
  totalMs:      number;
  summary:      { configured: number; reachable: number; total: number };
  services:     ServiceCheck[];
}

interface LogEntry {
  ts:         string;
  event:      string;
  level:      string;
  slug?:      string;
  success?:   boolean;
  durationMs?: number;
}

interface StatusData {
  generatedAt: string;
  agent:       { isRunning: boolean; lockedBy: string | null; lockAgeSeconds: number | null };
  stats:       { blogsGeneratedTotal: number; blogsUpdatedTotal: number; keywordsUsedTotal: number; lastGenerateAt: string | null; lastUpdateAt: string | null };
  keywords:    { total: number; unused: number; used: number };
  blogs:       { total: number };
  costs:       { monthlyTokensUsed: number; monthlyBudget: number; pctUsed: number; monthlyCalls: number; budgetExceeded: boolean };
  logs:        { recent: LogEntry[] };
  indexing:    { totalSubmitted: number; lastSubmittedAt: string | null; recentSubmissions: { slug: string; status: string; submittedAt: string }[] };
  distribution:{ totalDistributed: number; lastDistributedAt: string | null };
  seo:         { totalImpressions: number; totalClicks: number; avgCTR: number; avgPosition: number; lastFetchedAt: string } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0)  return `${d}d ago`;
  if (h > 0)  return `${h}h ago`;
  if (m > 0)  return `${m}m ago`;
  return "just now";
}

function fmtMs(ms?: number): string {
  if (!ms) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ background: ok ? "#DCFCE7" : "#FEE2E2", color: ok ? "#166534" : "#991B1B" }}
    >
      {ok ? "✅" : "❌"} {label}
    </span>
  );
}

function ServiceRow({ s }: { s: ServiceCheck }) {
  let icon = "⚪";
  let bg   = "#F9FAFB";
  let border = "#E5E7EB";

  if (!s.configured) { icon = "⚪"; bg = "#F9FAFB"; border = "#E5E7EB"; }
  else if (s.reachable) { icon = "✅"; bg = "#F0FDF4"; border = "#86EFAC"; }
  else { icon = "❌"; bg = "#FEF2F2"; border = "#FCA5A5"; }

  return (
    <div
      className="rounded-lg p-3 flex items-start justify-between gap-3"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-gray-900">{icon} {s.name}</span>
          {s.required && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: "#FEF3C7", color: "#92400E" }}>
              REQUIRED
            </span>
          )}
          {s.latencyMs && (
            <span className="text-xs text-gray-400">{fmtMs(s.latencyMs)}</span>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{s.note}</p>
      </div>
      <div className="shrink-0 text-xs font-semibold">
        {!s.configured ? (
          <span className="text-gray-400">NOT SET</span>
        ) : s.reachable ? (
          <span style={{ color: "#16A34A" }}>OK</span>
        ) : (
          <span style={{ color: "#DC2626" }}>FAIL</span>
        )}
      </div>
    </div>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const isError = entry.level === "error" || entry.success === false;
  const isWarn  = entry.level === "warn";

  return (
    <div
      className="flex items-start gap-2 text-xs py-1.5 border-b border-gray-100 last:border-0"
    >
      <span className="shrink-0 text-gray-400 font-mono tabular-nums">
        {new Date(entry.ts).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
      <span
        className="shrink-0 font-bold w-10 text-center"
        style={{ color: isError ? "#DC2626" : isWarn ? "#D97706" : "#16A34A" }}
      >
        {isError ? "ERR" : isWarn ? "WARN" : "OK"}
      </span>
      <span className="text-gray-700 font-mono">{entry.event}</span>
      {entry.slug && (
        <span className="text-gray-400 truncate max-w-32">{entry.slug}</span>
      )}
      {entry.durationMs && (
        <span className="ml-auto shrink-0 text-gray-400">{fmtMs(entry.durationMs)}</span>
      )}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [health,   setHealth]   = useState<HealthData | null>(null);
  const [status,   setStatus]   = useState<StatusData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [h, s] = await Promise.all([
        fetch("/api/health").then((r) => r.json()),
        fetch("/api/agent-status").then((r) => r.json()),
      ]);
      setHealth(h);
      setStatus(s);
      setLastRefresh(new Date());
    } catch {
      // silently ignore — will retry
    } finally {
      setLoading(false);
    }
  }, []);

  const runHealthCheck = async () => {
    setHealthLoading(true);
    try {
      const h = await fetch("/api/health").then((r) => r.json());
      setHealth(h);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const interval = setInterval(() => { void fetchAll(); }, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⚙️</div>
          <p className="text-gray-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const sysColor = health?.systemStatus === "healthy" ? "#22C55E"
    : health?.systemStatus === "degraded" ? "#F59E0B"
    : "#EF4444";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">⚙️ Phelix ERP — System Monitor</h1>
            <p className="text-gray-500 text-sm mt-1">
              Auto-refreshes every 30s · Last refresh: {lastRefresh ? lastRefresh.toLocaleTimeString() : "—"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="text-sm font-bold px-4 py-2 rounded-full"
              style={{ background: sysColor + "22", color: sysColor, border: `1px solid ${sysColor}44` }}
            >
              {health?.systemStatus?.toUpperCase() ?? "UNKNOWN"}
            </div>
            <button
              onClick={runHealthCheck}
              disabled={healthLoading}
              className="text-sm px-4 py-2 rounded-lg font-semibold transition-opacity"
              style={{ background: "#1D4ED8", color: "white", opacity: healthLoading ? 0.6 : 1 }}
            >
              {healthLoading ? "Checking..." : "Re-check APIs"}
            </button>
            <Link
              href="/"
              className="text-sm px-4 py-2 rounded-lg font-semibold"
              style={{ background: "#374151", color: "white" }}
            >
              ← Site
            </Link>
          </div>
        </div>

        {/* Top stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Blogs Published",   value: status?.blogs.total ?? 0,                  color: "#22C55E" },
            { label: "Keywords Unused",   value: status?.keywords.unused ?? 0,               color: "#F59E0B" },
            { label: "Tokens Used",       value: `${status?.costs.pctUsed ?? 0}%`,           color: status?.costs.pctUsed ?? 0 > 80 ? "#EF4444" : "#60A5FA" },
            { label: "Indexed by Google", value: status?.indexing.totalSubmitted ?? 0,       color: "#A78BFA" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-4 bg-gray-900 border border-gray-800">
              <p className="text-3xl font-bold" style={{ color }}>{value}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── API Health ─────────────────────────────────────────────────── */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-white">API Health</h2>
              <span className="text-xs text-gray-500">
                {health?.summary.reachable}/{health?.summary.configured} configured APIs reachable
                {health?.totalMs ? ` · ${fmtMs(health.totalMs)}` : ""}
              </span>
            </div>
            <div className="space-y-2">
              {health?.services.map((s) => (
                <ServiceRow key={s.name} s={s} />
              ))}
            </div>
          </div>

          {/* ── Agent Status + Activity Log ────────────────────────────────── */}
          <div className="space-y-4">

            {/* Agent status */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h2 className="font-bold text-white mb-4">Agent Status</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Status</p>
                  <StatusBadge ok={!status?.agent.isRunning} label={status?.agent.isRunning ? "Running" : "Idle"} />
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Last Blog</p>
                  <p className="text-sm font-semibold text-white">{timeAgo(status?.stats.lastGenerateAt ?? null)}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Blogs Generated</p>
                  <p className="text-sm font-semibold text-white">{status?.stats.blogsGeneratedTotal ?? 0} total</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Last Update</p>
                  <p className="text-sm font-semibold text-white">{timeAgo(status?.stats.lastUpdateAt ?? null)}</p>
                </div>
              </div>

              {/* Token budget bar */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Token Budget This Month</span>
                  <span>{status?.costs.pctUsed ?? 0}% used · {status?.costs.monthlyCalls ?? 0} calls</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, status?.costs.pctUsed ?? 0)}%`,
                      background: (status?.costs.pctUsed ?? 0) > 80 ? "#EF4444" : "#22C55E",
                    }}
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {(status?.costs.monthlyTokensUsed ?? 0).toLocaleString()} / {(status?.costs.monthlyBudget ?? 0).toLocaleString()} tokens
                </p>
              </div>
            </div>

            {/* Activity log */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-white">Recent Activity Log</h2>
                <span className="text-xs text-gray-500">last 20 events</span>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: "280px" }}>
                {(status?.logs.recent ?? []).length === 0 ? (
                  <p className="text-sm text-gray-600 text-center py-8">No log entries yet — agent hasn&apos;t run.</p>
                ) : (
                  status?.logs.recent.map((entry, i) => (
                    <LogRow key={i} entry={entry} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">

          {/* Indexing */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h2 className="font-bold text-white mb-3">Google Indexing</h2>
            <p className="text-2xl font-bold text-purple-400">{status?.indexing.totalSubmitted ?? 0}</p>
            <p className="text-xs text-gray-500 mb-3">URLs submitted to Google</p>
            <div className="space-y-1.5">
              {(status?.indexing.recentSubmissions ?? []).slice(0, 4).map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 truncate mr-2">{r.slug}</span>
                  <span className={r.status === "submitted" ? "text-green-400" : "text-red-400"}>
                    {r.status}
                  </span>
                </div>
              ))}
              {(status?.indexing.recentSubmissions ?? []).length === 0 && (
                <p className="text-xs text-gray-600">No submissions yet — set GOOGLE_INDEXING env vars</p>
              )}
            </div>
          </div>

          {/* GSC Performance */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h2 className="font-bold text-white mb-3">Search Performance (GSC)</h2>
            {status?.seo ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Impressions", value: status.seo.totalImpressions.toLocaleString() },
                    { label: "Clicks",      value: status.seo.totalClicks.toLocaleString() },
                    { label: "Avg CTR",     value: `${status.seo.avgCTR}%` },
                    { label: "Avg Position",value: status.seo.avgPosition },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-800 rounded p-2">
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="font-bold text-white text-sm">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-2">Updated {timeAgo(status.seo.lastFetchedAt)}</p>
              </>
            ) : (
              <div>
                <p className="text-xs text-gray-600 mb-2">GSC not connected yet.</p>
                <p className="text-xs text-gray-500">Set GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY, GSC_SITE_URL in Vercel to see ranking data here.</p>
              </div>
            )}
          </div>

          {/* Distribution */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h2 className="font-bold text-white mb-3">Social Distribution</h2>
            <p className="text-2xl font-bold text-blue-400">{status?.distribution.totalDistributed ?? 0}</p>
            <p className="text-xs text-gray-500 mb-3">Posts distributed</p>
            <p className="text-xs text-gray-600">
              {status?.distribution.totalDistributed === 0
                ? "Set TWITTER_* and LINKEDIN_* env vars to auto-post new blogs"
                : `Last posted ${timeAgo(status?.distribution.lastDistributedAt ?? null)}`}
            </p>

            {/* Quick links */}
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-2">Quick actions</p>
              <div className="flex flex-col gap-1.5">
                {[
                  { label: "View Sitemap",   href: "/sitemap.xml" },
                  { label: "View All Blogs", href: "/blog" },
                  { label: "Raw Status API", href: "/api/agent-status" },
                  { label: "Raw Health API", href: "/api/health" },
                ].map(({ label, href }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    → {label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-700 mt-8">
          Phelix ERP Autonomous SEO Engine · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
