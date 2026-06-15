/**
 * GET /api/seo/striking-distance
 *
 * Pulls fresh GSC query-level data and returns striking-distance
 * opportunities (positions 4-30 with meaningful impressions).
 *
 * Read-only — does not write to GitHub.
 *
 * Env required:
 *   GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY, GSC_SITE_URL
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchGscQueries } from "@/lib/agent/seo/gscQueries";
import { findOpportunities, groupByPage } from "@/lib/agent/seo/strikingDistance";
import { getSeoFeatures } from "@/lib/agent/seo/features";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response("Unauthorized: CRON_SECRET not configured", { status: 503 });
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth && auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const features = getSeoFeatures();
  if (!features.gsc) {
    return NextResponse.json({
      success: false, skipped: true,
      reason:  "GSC env vars not set",
    });
  }

  const days     = parseInt(req.nextUrl.searchParams.get("days") ?? "28", 10);
  const rowLimit = parseInt(req.nextUrl.searchParams.get("rowLimit") ?? "5000", 10);

  const gsc = await fetchGscQueries({
    clientEmail: process.env.GSC_CLIENT_EMAIL!,
    privateKey:  process.env.GSC_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    siteUrl:     process.env.GSC_SITE_URL!,
    days,
    rowLimit,
  });

  if (!gsc.ok) {
    return NextResponse.json({ success: false, error: gsc.error }, { status: 502 });
  }

  const opportunities = findOpportunities(gsc.rows);
  const byPage        = groupByPage(opportunities);

  return NextResponse.json({
    success: true,
    days,
    totalRows:    gsc.rows.length,
    opportunities: opportunities.slice(0, 100),
    byPage:        byPage.slice(0, 30),
    summary: {
      total:        opportunities.length,
      page2:        opportunities.filter((o) => o.bucket === "page-2").length,
      page1Bottom:  opportunities.filter((o) => o.bucket === "page-1-bottom").length,
      longTail:     opportunities.filter((o) => o.bucket === "long-tail-page-2").length,
      page3Plus:    opportunities.filter((o) => o.bucket === "page-3-plus").length,
      totalPotentialClicks: opportunities.reduce((s, o) => s + o.potentialClicks, 0),
    },
  });
}
