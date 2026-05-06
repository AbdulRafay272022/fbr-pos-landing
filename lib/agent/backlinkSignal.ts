/**
 * lib/agent/backlinkSignal.ts
 *
 * External signal tracking and simulation layer.
 *
 * Purpose:
 *   1. Track social shares and mentions from the distribution engine
 *   2. Optionally trigger webhooks to notify external systems (Zapier, n8n, etc.)
 *   3. Provide a signal summary for the agentBrain's authority scoring
 *
 * "Backlink simulation" in this context means:
 *   - We track our OWN social posts as "external signals" (they are real signals)
 *   - We record mentions from webhook payloads
 *   - We DON'T fake backlinks — we track real ones we create via distribution
 *
 * Webhook: POST SIGNAL_WEBHOOK_URL with { slug, type, source, ts }
 *   Set SIGNAL_WEBHOOK_URL env var to your Zapier/Make/n8n endpoint.
 */

export interface ExternalSignal {
  id:       string;
  ts:       string;
  slug:     string;
  type:     "social_share" | "mention" | "backlink" | "press";
  platform: string;
  url?:     string;
  title?:   string;
}

export interface SignalData {
  signals:          ExternalSignal[];
  lastUpdatedAt:    string | null;
  /** Aggregated signal counts per slug */
  bySlug:           Record<string, number>;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export function defaultSignalData(): SignalData {
  return {
    signals:       [],
    lastUpdatedAt: null,
    bySlug:        {},
  };
}

// ─── Record signals ───────────────────────────────────────────────────────────

/**
 * Add a new external signal to the dataset.
 * Call this after a successful social post from distribution.ts.
 */
export function recordSignal(
  data:   SignalData,
  signal: Omit<ExternalSignal, "id" | "ts">
): SignalData {
  const id  = `sig-${Date.now().toString(36)}`;
  const ts  = new Date().toISOString();
  const full: ExternalSignal = { id, ts, ...signal };

  const signals = [...data.signals, full];
  const bySlug  = {
    ...data.bySlug,
    [full.slug]: (data.bySlug[full.slug] ?? 0) + 1,
  };

  // Trim to last 2000 signals
  const trimmed = signals.length > 2000 ? signals.slice(-2000) : signals;

  return {
    signals:       trimmed,
    lastUpdatedAt: ts,
    bySlug,
  };
}

/**
 * Record all successful social posts from a distribution run as signals.
 */
export function recordDistributionSignals(
  data:   SignalData,
  slug:   string,
  posts:  Array<{ platform: string; success: boolean; postUrl?: string }>
): SignalData {
  let updated = data;
  for (const post of posts) {
    if (!post.success) continue;
    updated = recordSignal(updated, {
      slug,
      type:     "social_share",
      platform: post.platform,
      url:      post.postUrl,
    });
  }
  return updated;
}

// ─── Webhook notification ─────────────────────────────────────────────────────

/**
 * Fire a webhook notification to an external system (Zapier, n8n, Make, etc.).
 * Non-blocking — failures are logged but do not throw.
 *
 * Set SIGNAL_WEBHOOK_URL in env to enable.
 */
export async function fireWebhook(payload: Record<string, unknown>): Promise<boolean> {
  const webhookUrl = process.env.SIGNAL_WEBHOOK_URL;
  if (!webhookUrl) return false;

  try {
    const res = await fetch(webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...payload, ts: new Date().toISOString() }),
      signal:  AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fire webhook after a blog is published (blog-published event).
 */
export async function notifyBlogPublished(
  slug:    string,
  title:   string,
  url:     string,
  siteUrl: string
): Promise<void> {
  await fireWebhook({
    event:   "blog_published",
    slug,
    title,
    url,
    siteUrl,
  });
}

// ─── Signal strength ──────────────────────────────────────────────────────────

/**
 * Get the signal count for a blog slug (used by authorityScore.ts).
 */
export function signalStrength(data: SignalData, slug: string): number {
  return data.bySlug[slug] ?? 0;
}

/**
 * Top N most-signalled pages (for dashboard).
 */
export function topSignalledPages(
  data:  SignalData,
  topN = 10
): Array<{ slug: string; signals: number }> {
  return Object.entries(data.bySlug)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([slug, signals]) => ({ slug, signals }));
}
