/**
 * lib/agent/titleOptimizer.ts
 *
 * Generate 5 title alternatives for a blog post and select the best one
 * using a heuristic CTR-scoring model.
 *
 * Scoring signals (0–100):
 *   - Power words presence       (+20)
 *   - Number / year present      (+15)
 *   - Hook pattern at start      (+15)
 *   - Keyword in first 3 words   (+15)
 *   - Optimal length 50–65 chars (+15)
 *   - Question format            (+10)
 *   - Urgency/recency signal     (+10)
 *
 * The winner is used to update the blog's title and index entry.
 * Variants are generated via Groq LLM (or deterministic fallback if LLM fails).
 */

import type { TitleVariant, TitleOptimizationResult } from "@/lib/types";

// ─── Signal lists ─────────────────────────────────────────────────────────────

const POWER_WORDS = [
  "ultimate", "complete", "essential", "proven", "best", "top", "simple",
  "fast", "easy", "guide", "checklist", "free", "new", "secret", "step-by-step",
  "how to", "what is", "why", "must-know", "most", "every", "never",
];

const HOOKS = [
  "how to",
  "why ",
  "what is",
  "the ultimate",
  "the complete",
  "top ",
  "best ",
  "a guide to",
  "everything you need",
];

const URGENCY_WORDS = [
  "2024", "2025", "2026", "now", "today", "latest", "updated", "new",
];

// ─── Heuristic CTR scorer ─────────────────────────────────────────────────────

export function scoreTitleVariant(title: string, targetKeyword: string): TitleVariant {
  const lower   = title.toLowerCase();
  const kwLower = targetKeyword.toLowerCase();
  let score     = 0;
  const signals: string[] = [];

  // Power word (+20)
  if (POWER_WORDS.some((w) => lower.includes(w))) {
    score += 20;
    signals.push("power_word");
  }

  // Number present (+15)
  if (/\d/.test(title)) {
    score += 15;
    signals.push("has_number");
  }

  // Hook at start (+15)
  if (HOOKS.some((h) => lower.startsWith(h))) {
    score += 15;
    signals.push("hook_at_start");
  }

  // Keyword in first 3 words (+15)
  const first3 = lower.split(" ").slice(0, 3).join(" ");
  if (kwLower.split(" ").some((kw) => first3.includes(kw))) {
    score += 15;
    signals.push("keyword_front_loaded");
  }

  // Optimal length 50–65 chars (+15), partial for 40–70
  const len = title.length;
  if (len >= 50 && len <= 65) {
    score += 15;
    signals.push("optimal_length");
  } else if (len >= 40 && len <= 70) {
    score += 8;
    signals.push("acceptable_length");
  }

  // Question format (+10)
  if (title.endsWith("?")) {
    score += 10;
    signals.push("question_format");
  }

  // Urgency/recency (+10)
  if (URGENCY_WORDS.some((w) => lower.includes(w))) {
    score += 10;
    signals.push("urgency_signal");
  }

  return { title, ctrScore: Math.min(score, 100), signals };
}

// ─── Deterministic fallback title generator ───────────────────────────────────

const TEMPLATES = [
  (kw: string) => `How to ${capitalise(kw)}: A Complete Guide`,
  (kw: string) => `The Ultimate Guide to ${capitalise(kw)} in ${new Date().getFullYear()}`,
  (kw: string) => `${capitalise(kw)}: Everything You Need to Know`,
  (kw: string) => `Top 5 Tips for ${capitalise(kw)}`,
  (kw: string) => `Why ${capitalise(kw)} Matters for Your Business`,
];

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function deterministicVariants(keyword: string): string[] {
  return TEMPLATES.map((t) => t(keyword));
}

// ─── Groq title generation ────────────────────────────────────────────────────

interface GroqTitleResponse {
  titles?: string[];
}

async function groqGenerateTitles(
  currentTitle: string,
  targetKeyword: string,
  niche: string,
  apiKey: string
): Promise<string[]> {
  const systemPrompt = `You are an expert SEO copywriter specialising in ${niche}.
Generate exactly 5 blog post title alternatives for the given keyword.
Return ONLY a JSON object with key "titles" containing an array of 5 strings.
Rules:
- Each title must include the target keyword naturally
- Use different formats: How-to, listicle, question, guide, comparison
- Optimal length: 50–65 characters
- Use power words, numbers, or hooks where appropriate
- Do NOT use clickbait or misleading claims`;

  const userPrompt = `Current title: "${currentTitle}"
Target keyword: "${targetKeyword}"
Generate 5 improved title alternatives.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:       "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens:  300,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) throw new Error(`Groq error ${res.status}`);

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw  = data?.choices?.[0]?.message?.content ?? "";
  const clean = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const parsed = JSON.parse(clean) as GroqTitleResponse;
  if (!Array.isArray(parsed.titles) || parsed.titles.length === 0) {
    throw new Error("Invalid Groq response: missing titles array");
  }

  return parsed.titles.slice(0, 5);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface OptimizeTitleOptions {
  blog: { slug: string; title: string; keywords: string[] };
  niche:  string;
  groqApiKey?: string;
}

/**
 * Generate 5 title variants (via Groq or deterministic fallback),
 * score each with heuristics, and return the winner.
 */
export async function optimizeTitle(
  opts: OptimizeTitleOptions
): Promise<TitleOptimizationResult> {
  const { blog, niche, groqApiKey } = opts;
  const keyword = blog.keywords[0] ?? blog.title.toLowerCase();

  // ── Generate candidates ────────────────────────────────────────────────────
  let rawTitles: string[];
  if (groqApiKey) {
    try {
      rawTitles = await groqGenerateTitles(blog.title, keyword, niche, groqApiKey);
    } catch {
      rawTitles = deterministicVariants(keyword);
    }
  } else {
    rawTitles = deterministicVariants(keyword);
  }

  // Always include the original so we can compare
  const allTitles = Array.from(new Set([...rawTitles, blog.title]));

  // ── Score each variant ─────────────────────────────────────────────────────
  const variants = allTitles.map((t) => scoreTitleVariant(t, keyword));
  variants.sort((a, b) => b.ctrScore - a.ctrScore);

  // Winner = highest score (exclude original if something better exists)
  const nonOriginal = variants.filter((v) => v.title !== blog.title);
  const winner      = nonOriginal.length > 0 && nonOriginal[0].ctrScore > scoreTitleVariant(blog.title, keyword).ctrScore
    ? nonOriginal[0]
    : variants[0];

  return {
    slug:          blog.slug,
    originalTitle: blog.title,
    variants:      variants.slice(0, 5),
    winner,
  };
}
