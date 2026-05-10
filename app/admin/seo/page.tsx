/**
 * Admin SEO Dashboard
 *
 * Renders the latest seo-report.json — the result of /api/seo/full-audit.
 * Shows feature flags, rankings summary, opportunities, recommendations,
 * CWV, schema, content gaps, backlinks. All sections gracefully hide if
 * disabled.
 */

import Link from "next/link";
import type { SeoHealthReport } from "@/lib/agent/seo/orchestrator";
import { getSeoFeatures, describeSeoFeatures } from "@/lib/agent/seo/features";
import { getGitHubConfig } from "@/lib/agent/siteConfig";
import { readJsonFromGitHub } from "@/lib/githubApi";

export const dynamic = "force-dynamic";

async function loadReport(): Promise<SeoHealthReport | null> {
  const gh = getGitHubConfig();
  if (!gh) return null;
  return readJsonFromGitHub<SeoHealthReport>("data/seo-report.json", gh.token, gh.owner, gh.repo);
}

export default async function SeoDashboard() {
  const report      = await loadReport();
  const featureDesc = describeSeoFeatures();
  const features    = getSeoFeatures();

  return (
    <div className="min-h-screen bg-[#F8F9FC] p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-[#1A1D27]">SEO Health</h1>
            <p className="text-sm text-gray-500 mt-1">
              Senior-SEO orchestrator — rankings, opportunities, technical audit, gaps.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-900">← Admin</Link>
          </div>
        </div>

        {/* Status banner */}
        {!report && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6">
            <h2 className="font-bold text-[#1A1D27] mb-2">No audit yet</h2>
            <p className="text-sm text-gray-600 mb-3">
              Run <code className="bg-white px-2 py-1 rounded text-xs">GET /api/seo/full-audit</code> to generate your first report.
              Configure env vars to enable additional features.
            </p>
          </div>
        )}

        {report && (
          <p className="text-xs text-gray-400 mb-4">
            Last audit: {new Date(report.generatedAt).toLocaleString()}
          </p>
        )}

        {/* Feature flags */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-bold text-[#1A1D27] mb-4">SEO Features</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-green-600 font-semibold mb-2">
                Active ({featureDesc.active.length})
              </div>
              <ul className="space-y-1">
                {featureDesc.active.map((f) => (
                  <li key={f} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-green-600">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">
                Idle ({featureDesc.idle.length}) — set env vars to enable
              </div>
              <ul className="space-y-1">
                {featureDesc.idle.map((f) => (
                  <li key={f} className="text-sm text-gray-400 flex gap-2">
                    <span>○</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {report && (
          <>
            {/* Recommendations */}
            {report.recommendations.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h2 className="font-bold text-[#1A1D27] mb-4">Top Recommendations</h2>
                <div className="space-y-3">
                  {report.recommendations.map((r, i) => (
                    <div
                      key={i}
                      className={`rounded-lg p-4 border ${
                        r.priority === "high"   ? "bg-red-50 border-red-200" :
                        r.priority === "medium" ? "bg-orange-50 border-orange-200" :
                                                   "bg-blue-50 border-blue-200"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`text-xs uppercase font-bold tracking-wider px-2 py-1 rounded ${
                          r.priority === "high" ? "bg-red-600 text-white" :
                          r.priority === "medium" ? "bg-orange-600 text-white" :
                                                    "bg-blue-600 text-white"
                        }`}>{r.priority}</span>
                        <div className="flex-1">
                          <h3 className="font-semibold text-[#1A1D27] mb-1">{r.title}</h3>
                          <p className="text-sm text-gray-600 mb-2">{r.detail}</p>
                          <p className="text-xs text-gray-500">→ {r.action}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rankings summary */}
            {report.rankings && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h2 className="font-bold text-[#1A1D27] mb-4">Rankings (DataForSEO)</h2>
                {report.rankings.error ? (
                  <p className="text-sm text-red-600">{report.rankings.error}</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <Stat label="Tracked"     value={report.rankings.summary.totalKeywords} />
                    <Stat label="Top 3"       value={report.rankings.summary.topThree} highlight />
                    <Stat label="Top 10"      value={report.rankings.summary.topTen} />
                    <Stat label="Page 2"      value={report.rankings.summary.pageTwo} />
                    <Stat label="Avg position" value={report.rankings.summary.averagePosition ?? "—"} />
                    <Stat label="Wins (7d)"   value={report.rankings.summary.totalImproved} highlight={report.rankings.summary.totalImproved > 0} />
                    <Stat label="Drops (7d)"  value={report.rankings.summary.totalDeclined} highlight={false} />
                    <Stat label="New wins"    value={report.rankings.newWins} />
                    <Stat label="New drops"   value={report.rankings.newDrops} />
                    <Stat label="Cost"        value={`$${report.rankings.cost.toFixed(3)}`} />
                  </div>
                )}
                {report.rankings.summary.biggestWin && (
                  <p className="mt-4 text-xs text-green-700">
                    Biggest win: <strong>{report.rankings.summary.biggestWin.keyword}</strong> +{report.rankings.summary.biggestWin.delta} positions
                  </p>
                )}
                {report.rankings.summary.biggestDrop && (
                  <p className="mt-1 text-xs text-red-700">
                    Biggest drop: <strong>{report.rankings.summary.biggestDrop.keyword}</strong> {report.rankings.summary.biggestDrop.delta} positions
                  </p>
                )}
              </div>
            )}

            {/* Striking distance */}
            {report.opportunities && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h2 className="font-bold text-[#1A1D27] mb-4">Striking-Distance Opportunities</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <Stat label="Total"          value={report.opportunities.total} highlight />
                  <Stat label="Page 1 bottom"  value={report.opportunities.page1Bottom} />
                  <Stat label="Page 2"         value={report.opportunities.page2} />
                  <Stat label="Top pages"      value={report.opportunities.topPages.length} />
                </div>
                <table className="w-full text-sm mt-4">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                      <th className="py-2 pr-4">Page</th>
                      <th className="py-2 pr-4">Score</th>
                      <th className="py-2 pr-4">Potential clicks</th>
                      <th className="py-2">Top action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.opportunities.topPages.slice(0, 10).map((p, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 pr-4 truncate max-w-xs"><code className="text-xs">{p.page.replace(/^https?:\/\/[^/]+/, "")}</code></td>
                        <td className="py-2 pr-4 font-mono text-xs">{p.totalScore}</td>
                        <td className="py-2 pr-4 font-semibold text-green-700">+{p.totalPotential}</td>
                        <td className="py-2 text-xs text-gray-600">{p.topAction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Cannibalization */}
            {report.cannibalization && report.cannibalization.flagged > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h2 className="font-bold text-[#1A1D27] mb-4">
                  Cannibalization ({report.cannibalization.flagged} clusters)
                </h2>
                <div className="space-y-3">
                  {report.cannibalization.clusters.slice(0, 5).map((c, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-sm text-[#1A1D27]">&quot;{c.primaryKeyword}&quot;</h3>
                        <span className={`text-xs px-2 py-1 rounded ${
                          c.recommendation === "redirect"      ? "bg-red-100 text-red-700" :
                          c.recommendation === "merge"         ? "bg-orange-100 text-orange-700" :
                          c.recommendation === "differentiate" ? "bg-blue-100 text-blue-700" :
                                                                  "bg-gray-100 text-gray-700"
                        }`}>{c.recommendation}</span>
                      </div>
                      <p className="text-xs text-gray-500 mb-2">{c.reason}</p>
                      <ul className="text-xs space-y-1">
                        {c.pages.map((p, j) => (
                          <li key={j} className="flex justify-between text-gray-600">
                            <span className="truncate">{p.title}</span>
                            <span className="text-gray-400">{p.position ? `pos ${p.position.toFixed(1)}` : ""}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CWV */}
            {report.cwv && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h2 className="font-bold text-[#1A1D27] mb-4">Core Web Vitals</h2>
                {report.cwv.error ? (
                  <p className="text-sm text-red-600">{report.cwv.error}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <Stat label="Audited"       value={report.cwv.summary.totalAudited} />
                      <Stat label="Passing CWV"   value={report.cwv.summary.passingCwv} highlight />
                      <Stat label="Failing CWV"   value={report.cwv.summary.failingCwv} />
                      <Stat label="Avg perf"      value={report.cwv.summary.avgPerformance ?? "—"} />
                      <Stat label="Avg LCP (ms)"  value={report.cwv.summary.avgLcp ?? "—"} />
                      <Stat label="Avg INP (ms)"  value={report.cwv.summary.avgInp ?? "—"} />
                      <Stat label="Avg CLS"       value={report.cwv.summary.avgCls ?? "—"} />
                    </div>
                    {report.cwv.summary.worstOffenders.length > 0 && (
                      <div>
                        <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">
                          Worst Offenders
                        </h3>
                        <ul className="text-xs space-y-1">
                          {report.cwv.summary.worstOffenders.map((w, i) => (
                            <li key={i} className="flex justify-between text-gray-600">
                              <code className="truncate">{w.url.replace(/^https?:\/\/[^/]+/, "") || "/"}</code>
                              <span className="text-red-600">{w.failureReason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Schema */}
            {report.schema && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h2 className="font-bold text-[#1A1D27] mb-4">Schema Validation</h2>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label="Pages checked" value={report.schema.checked} />
                  <Stat label="Pages failing" value={report.schema.failed} />
                  <Stat label="Total errors"  value={report.schema.issues} />
                </div>
              </div>
            )}

            {/* Content gaps */}
            {report.contentGaps && report.contentGaps.gaps.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h2 className="font-bold text-[#1A1D27] mb-4">
                  Content Gaps ({report.contentGaps.gaps.length})
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-200">
                      <th className="py-2 pr-4">Suggested topic</th>
                      <th className="py-2 pr-4">Search vol</th>
                      <th className="py-2 pr-4">Score</th>
                      <th className="py-2">Competitors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.contentGaps.gaps.slice(0, 10).map((g, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 pr-4 font-semibold">{g.suggestedKeyword}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{g.searchVolume.toLocaleString()}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{g.score}</td>
                        <td className="py-2 text-xs text-gray-500">{g.competitorPages.length} sites</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Backlinks */}
            {report.backlinks && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <h2 className="font-bold text-[#1A1D27] mb-4">Backlinks</h2>
                {report.backlinks.error ? (
                  <p className="text-sm text-red-600">{report.backlinks.error}</p>
                ) : report.backlinks.summary.current ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Stat label="Domain rank"         value={report.backlinks.summary.current.domainRank} highlight />
                    <Stat label="Backlinks"           value={report.backlinks.summary.current.totalBacklinks.toLocaleString()} />
                    <Stat label="Referring domains"   value={report.backlinks.summary.current.referringDomains.toLocaleString()} />
                    <Stat label="Health score"        value={report.backlinks.summary.healthScore} />
                    <Stat label="Δ 30d backlinks"     value={(report.backlinks.summary.trend30d.backlinks > 0 ? "+" : "") + report.backlinks.summary.trend30d.backlinks} />
                    <Stat label="Δ 30d ref domains"   value={(report.backlinks.summary.trend30d.refDomains > 0 ? "+" : "") + report.backlinks.summary.trend30d.refDomains} />
                    <Stat label="Broken backlinks"    value={report.backlinks.summary.current.brokenBacklinks} />
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No backlink snapshot yet.</p>
                )}
                {report.backlinks.summary.flags.length > 0 && (
                  <ul className="mt-4 text-xs text-yellow-700 space-y-1">
                    {report.backlinks.summary.flags.map((f, i) => <li key={i}>⚠ {f}</li>)}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {/* Quick actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-bold text-[#1A1D27] mb-4">Run an audit now</h2>
          <div className="flex flex-wrap gap-2">
            <ApiBtn href="/api/seo/full-audit"            label="Full audit (writes report)" />
            <ApiBtn href="/api/seo/track-rankings"        label="Track rankings"        disabled={!features.rankTracking} />
            <ApiBtn href="/api/seo/striking-distance"     label="Find opportunities"    disabled={!features.gsc} />
            <ApiBtn href="/api/seo/check-cannibalization" label="Check cannibalization" />
            <ApiBtn href="/api/seo/audit-cwv"             label="Audit CWV" />
            <ApiBtn href="/api/seo/validate-schema"       label="Validate schema" />
            <ApiBtn href="/api/seo/find-gaps"             label="Find content gaps"     disabled={!features.contentGaps} />
            <ApiBtn href="/api/seo/check-backlinks"       label="Backlink snapshot"     disabled={!features.backlinks} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-1">{label}</div>
      <div className={`text-2xl font-extrabold ${highlight ? "text-[#F97316]" : "text-[#1A1D27]"}`}>{value}</div>
    </div>
  );
}

function ApiBtn({ href, label, disabled }: { href: string; label: string; disabled?: boolean }) {
  if (disabled) {
    return (
      <span className="px-4 py-2 rounded-lg text-xs font-semibold bg-gray-100 text-gray-400 cursor-not-allowed" title="Feature not configured">
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#1A1D27] text-white hover:opacity-90"
    >
      {label}
    </a>
  );
}
