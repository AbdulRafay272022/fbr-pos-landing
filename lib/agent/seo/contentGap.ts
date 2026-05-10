/**
 * lib/agent/seo/contentGap.ts
 *
 * Competitor content-gap analysis.
 *
 * Pulls top-10 SERP for our seed keywords, identifies pages on
 * competitor domains that we DON'T have an equivalent for, and ranks
 * those gaps by opportunity score (search volume × difficulty inverse).
 *
 * This is how senior SEOs decide what to write next — not by keyword
 * brainstorming but by competitive triangulation.
 */

import { getLiveSerp, getKeywordVolumes } from "./dataforseo";

export interface CompetitorPage {
  url:           string;
  title:         string;
  domain:        string;
  position:      number;
  /** Keyword that surfaced this page */
  surfacedFor:   string;
}

export interface ContentGap {
  /** A theme/topic competitors cover that we don't */
  topic:           string;
  /** Sample competitor URLs covering this topic */
  competitorPages: CompetitorPage[];
  /** Combined search volume of related keywords */
  searchVolume:    number;
  /** Suggested target keyword to write a post for */
  suggestedKeyword: string;
  /** Opportunity score 0-100 */
  score:           number;
}

interface OurContentSummary {
  slug:    string;
  title:   string;
  /** Tokens from title + keywords for quick coverage check */
  tokens:  Set<string>;
}

const STOP = new Set(["the","a","an","and","or","of","to","in","on","at","for","with","by","is","are","how","what","why","when","best","top","2024","2025","2026"]);

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((t) => t.length >= 4 && !STOP.has(t)),
  );
}

function topicSignature(title: string): string[] {
  // Extract bigrams as topic candidates
  const tokens = title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
  const bigrams: string[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

// ─── Coverage check ──────────────────────────────────────────────────────────

function isCovered(
  competitorTitle: string,
  ourContent:      OurContentSummary[],
  threshold = 0.4,
): boolean {
  const compTokens = tokenize(competitorTitle);
  if (compTokens.size < 2) return true; // can't assess
  for (const c of ourContent) {
    let inter = 0;
    for (const t of compTokens) if (c.tokens.has(t)) inter++;
    const ratio = inter / compTokens.size;
    if (ratio >= threshold) return true;
  }
  return false;
}

// ─── Main analyzer ────────────────────────────────────────────────────────────

export interface GapOptions {
  /** Seed keywords to probe SERPs for */
  seedKeywords:   string[];
  /** Our domain to exclude */
  ourDomain:      string;
  /** Our existing content (slug + title + keywords) */
  ourContent:     Array<{ slug: string; title: string; keywords?: string[] }>;
  /** Max competitor pages to consider per keyword */
  perKeyword?:    number;
  locationCode?:  number;
  languageCode?:  string;
}

export async function findContentGaps(opts: GapOptions):
  Promise<{ ok: true; gaps: ContentGap[]; cost: number } | { ok: false; error: string }>
{
  const ourSummaries: OurContentSummary[] = opts.ourContent.map((c) => ({
    slug:   c.slug,
    title:  c.title,
    tokens: new Set([
      ...tokenize(c.title),
      ...((c.keywords ?? []).flatMap((k) => Array.from(tokenize(k)))),
    ]),
  }));

  const ourDomainNorm = opts.ourDomain.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  const competitorPages: CompetitorPage[] = [];
  let cost = 0;

  for (const seed of opts.seedKeywords) {
    const serp = await getLiveSerp({
      keyword:      seed,
      locationCode: opts.locationCode,
      languageCode: opts.languageCode,
      depth:        20,
    });
    if (!serp.ok) continue;
    cost += serp.cost;

    const topN = serp.data.items
      .filter((it) => it.type === "organic" && it.url && it.title)
      .filter((it) => !((it.domain ?? "").toLowerCase().includes(ourDomainNorm)))
      .slice(0, opts.perKeyword ?? 5);

    for (const it of topN) {
      competitorPages.push({
        url:         it.url ?? "",
        title:       it.title ?? "",
        domain:      it.domain ?? "",
        position:    it.rank_absolute,
        surfacedFor: seed,
      });
    }
  }

  // Group by topic signature (bigrams in title)
  const topicMap = new Map<string, CompetitorPage[]>();
  for (const p of competitorPages) {
    const sigs = topicSignature(p.title);
    for (const sig of sigs) {
      const list = topicMap.get(sig) ?? [];
      list.push(p);
      topicMap.set(sig, list);
    }
  }

  // Filter to topics covered by ≥2 competitors AND not in our content
  const candidateTopics: Array<{ topic: string; pages: CompetitorPage[] }> = [];
  for (const [topic, pages] of topicMap) {
    if (pages.length < 2) continue;
    const exemplar = pages[0].title;
    if (isCovered(exemplar, ourSummaries)) continue;
    candidateTopics.push({ topic, pages });
  }

  // Suggested keyword = the topic itself; volume lookup if budget allows
  const topTopics = candidateTopics
    .sort((a, b) => b.pages.length - a.pages.length)
    .slice(0, 25);

  const suggestedKws = topTopics.map((t) => t.topic);
  let volumes: Record<string, number> = {};
  if (suggestedKws.length > 0) {
    const vol = await getKeywordVolumes({
      keywords:     suggestedKws,
      locationCode: opts.locationCode,
      languageCode: opts.languageCode,
    });
    if (vol.ok) {
      cost += vol.cost;
      volumes = Object.fromEntries(
        vol.data.map((m) => [m.keyword.toLowerCase(), m.search_volume ?? 0]),
      );
    }
  }

  const gaps: ContentGap[] = topTopics.map((t) => {
    const v = volumes[t.topic.toLowerCase()] ?? 0;
    const score = Math.min(100, Math.round(
      Math.log10(v + 10) * 20 + t.pages.length * 5,
    ));
    return {
      topic:            t.topic,
      competitorPages:  t.pages.slice(0, 5),
      searchVolume:     v,
      suggestedKeyword: t.topic,
      score,
    };
  }).sort((a, b) => b.score - a.score);

  return { ok: true, gaps: gaps.slice(0, 20), cost };
}
