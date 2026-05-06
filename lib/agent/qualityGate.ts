/**
 * lib/agent/qualityGate.ts
 *
 * Validates generated blog content before it is committed to GitHub.
 * A blog that fails the quality gate is either regenerated (if Groq is
 * available) or rejected entirely (triggering template fallback).
 *
 * Scoring rubric (100 points total):
 *
 *   Word count         30 pts  (>= minWords = 30, >= 80% = 20, else 0)
 *   FAQs present       20 pts  (>= 5 FAQs = 20, >= 3 = 12, >= 1 = 6)
 *   Internal links     20 pts  (>= 3 links = 20, >= 2 = 14, >= 1 = 8)
 *   Keyword in content 15 pts  (main keyword appears in text)
 *   CTA present        15 pts  (WhatsApp link or CTA marker found)
 *
 * Pass threshold: 60 / 100
 */

import type { BlogFaq, QualityScore } from "@/lib/types";

const PASS_THRESHOLD = 60;

// ─── Word counting ────────────────────────────────────────────────────────────

export function countWords(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

// ─── Internal link counting ───────────────────────────────────────────────────

function countInternalLinks(html: string): number {
  const matches = html.match(/href=["']\/blog\//g) ?? [];
  const homeLinks = html.match(/href=["']\//g) ?? [];
  return matches.length + homeLinks.length;
}

// ─── CTA detection ────────────────────────────────────────────────────────────

function hasCta(html: string): boolean {
  return (
    html.includes("wa.me") ||
    html.includes("WhatsApp") ||
    html.includes("whatsapp") ||
    html.includes("Free Demo") ||
    html.includes("free demo") ||
    html.includes("Get Started")
  );
}

// ─── Keyword presence ─────────────────────────────────────────────────────────

function keywordPresentInContent(html: string, keyword: string): boolean {
  const textContent = html.replace(/<[^>]+>/g, " ").toLowerCase();
  // Check if at least 2 significant words from the keyword appear
  const significantWords = keyword
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["with", "from", "that", "this", "have"].includes(w));

  const matchCount = significantWords.filter((w) => textContent.includes(w)).length;
  return matchCount >= Math.ceil(significantWords.length * 0.6);
}

// ─── Main gate ────────────────────────────────────────────────────────────────

export function validateContent(
  htmlContent: string,
  faqs: BlogFaq[],
  targetKeyword: string,
  minWords: number
): QualityScore {
  const wc        = countWords(htmlContent);
  const faqCount  = faqs.length;
  const linkCount = countInternalLinks(htmlContent);
  const hasKw     = keywordPresentInContent(htmlContent, targetKeyword);
  const hasCTA    = hasCta(htmlContent);

  // ── Word count (30 pts) ──────────────────────────────────────────────────
  let wordPts = 0;
  if (wc >= minWords)             wordPts = 30;
  else if (wc >= minWords * 0.8)  wordPts = 20;
  else if (wc >= minWords * 0.6)  wordPts = 10;

  // ── FAQs (20 pts) ────────────────────────────────────────────────────────
  let faqPts = 0;
  if (faqCount >= 5)      faqPts = 20;
  else if (faqCount >= 3) faqPts = 12;
  else if (faqCount >= 1) faqPts = 6;

  // ── Internal links (20 pts) ──────────────────────────────────────────────
  let linkPts = 0;
  if (linkCount >= 3)      linkPts = 20;
  else if (linkCount >= 2) linkPts = 14;
  else if (linkCount >= 1) linkPts = 8;

  // ── Keyword in content (15 pts) ──────────────────────────────────────────
  const kwPts = hasKw ? 15 : 0;

  // ── CTA present (15 pts) ─────────────────────────────────────────────────
  const ctaPts = hasCTA ? 15 : 0;

  const total = wordPts + faqPts + linkPts + kwPts + ctaPts;
  const passed = total >= PASS_THRESHOLD;

  const failureReasons: string[] = [];
  if (wordPts === 0) failureReasons.push(`word count too low (${wc} < ${minWords})`);
  if (faqPts === 0)  failureReasons.push("no FAQs found");
  if (linkPts === 0) failureReasons.push("no internal links found");
  if (kwPts  === 0)  failureReasons.push(`keyword "${targetKeyword}" not found in content`);
  if (ctaPts === 0)  failureReasons.push("no CTA / WhatsApp link found");

  return {
    total,
    passed,
    breakdown: {
      wordCount:         wordPts,
      hasFaqs:           faqPts,
      hasInternalLinks:  linkPts,
      hasKeyword:        kwPts,
      hasCta:            ctaPts,
    },
    wordCount:        wc,
    faqCount,
    internalLinkCount: linkCount,
    failureReasons,
  };
}

/** Quick check: is the content long enough to bother validating? */
export function isMinimumViable(html: string, minWords: number): boolean {
  return countWords(html) >= Math.ceil(minWords * 0.5);
}
