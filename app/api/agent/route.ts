/**
 * GET /api/agent
 *
 * Single unified Vercel Cron endpoint for the SEO Agent.
 *
 * Replaces the 3 separate cron jobs. The Agent Brain decides what to do
 * each run based on current state — no blind cron execution.
 *
 * Cron schedule: every 4 hours (see vercel.json)
 * The agent decides internally whether any action is needed.
 *
 * Manual trigger (for testing):
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-site.vercel.app/api/agent
 *
 * Force a specific action:
 *   GET /api/agent?action=scrape
 *   GET /api/agent?action=generate
 *   GET /api/agent?action=update
 */

import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/agentBrain";
import { getSiteConfig, getGitHubConfig } from "@/lib/agent/siteConfig";

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response("Unauthorized: CRON_SECRET not configured", { status: 503 });
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Validate config ───────────────────────────────────────────────────────
  const gh = getGitHubConfig();
  if (!gh) {
    return NextResponse.json(
      { success: false, reason: "Missing GitHub env vars (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)" },
      { status: 500 }
    );
  }

  const cronSecret2 = process.env.CRON_SECRET;
  if (!cronSecret2) {
    return NextResponse.json(
      { success: false, reason: "CRON_SECRET not set — required for sub-route calls" },
      { status: 500 }
    );
  }

  // ── Resolve deployment base URL ───────────────────────────────────────────
  // Vercel sets VERCEL_URL automatically. For local dev, fall back to SITE_BASE_URL.
  const baseUrl =
    process.env.SITE_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!baseUrl) {
    return NextResponse.json(
      { success: false, reason: "Set SITE_BASE_URL env var (Vercel sets VERCEL_URL automatically)" },
      { status: 500 }
    );
  }

  // ── Run the agent ─────────────────────────────────────────────────────────
  const config = getSiteConfig();

  try {
    const result = await runAgent(config, gh, baseUrl, cronSecret2);

    const statusCode = result.error && !result.decision.shouldScrape
      && !result.decision.shouldGenerate
      && !result.decision.shouldUpdate
      ? 200  // "no action needed" is a success
      : 200;

    return NextResponse.json(result, { status: statusCode });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: "agent_fatal", error: message }));
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
