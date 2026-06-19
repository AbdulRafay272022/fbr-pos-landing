/**
 * lib/niche/prompt.ts
 *
 * Composes the Groq system + user prompts from a NichePack.
 * This replaces the hardcoded FBR `SYSTEM_PROMPT` const in generate-blog.
 * No niche string is hardcoded here — everything comes from the pack.
 */

import type { NichePack } from "./types";

/** Build the system prompt entirely from the active pack. */
export function buildSystemPrompt(pack: NichePack): string {
  const { prompt, name, country } = pack;
  const minWords = pack.thresholds.minWordCount;
  // Ask Groq for ~40% above the gate. LLMs routinely undershoot their target
  // word count by 15–20%; with zero margin (target == gate) the output keeps
  // failing the floor and the template fires, producing near-duplicate posts.
  const targetWords = Math.round(minWords * 1.4);
  const cityHint = pack.cities.slice(0, 6).join(", ");
  const lsi = prompt.lsiTerms.join(", ");

  const rules = prompt.domainRules.map((r) => `- ${r}`).join("\n");
  const gates = prompt.mustInclude.map((m) => `- ${m}`).join("\n");
  const internalTopics = prompt.internalTopics.map((t) => `"${t}"`).join(", ");

  // For AdSense sites the goal is dwell time + depth, NOT pushing the reader
  // off-page. For lead-gen the conclusion drives a conversion.
  const conclusionRule =
    pack.monetization.mode === "adsense"
      ? `9. Conclusion — summarise the key points and pose a follow-up question that keeps the reader exploring related articles. Do NOT add external sales CTAs.`
      : `9. Conclusion + CTA — trust-building, mentions ${name} and the contact channel.`;

  return `You are ${prompt.persona}. You write for ${prompt.audience} in ${country}.

Your job is to generate HIGH-RANKING, PRACTICAL, NON-GENERIC content that ranks on Google and genuinely helps the reader.

STRICT RULES — NEVER BREAK THESE:
- NO generic AI phrases ("in today's world", "in conclusion", "it is worth noting", etc.)
- NO repetition across sections
- NO keyword stuffing — use the keyword naturally; NEVER repeat the raw keyword inside an H2 heading
- NO vague explanations — every claim must be specific and actionable
${rules}
${cityHint ? `- Where it adds value, ground examples in real places (${cityHint})` : ""}

MANDATORY CONTENT STRUCTURE (minimum ${targetWords} words — aim well above this):
1. Introduction — hook with a real problem or stake (150–200 words)
2. Core explanation — what the reader most needs to know first
3. Step-by-step or how-to section — numbered, 5–8 concrete steps
4. Real-world example — a specific, named scenario
5. Common mistakes — 5+ concrete mistakes with consequences
6. Deeper insight — the non-obvious detail an expert would add
7. Benefits / outcomes — 5+ specific, quantified where possible
8. FAQs — 5–8 high-intent questions with specific answers
${conclusionRule}

SEO RULES:
- Use the main keyword in the first 100 words and in 2–3 H2 headings, phrased as a natural question or statement (never the bare keyword)
- Keep paragraphs under 4 lines
- Use bullet/numbered lists for 3+ items
${lsi ? `- LSI keywords to use naturally: ${lsi}` : ""}

FEATURED SNIPPET OPTIMISATION (mandatory):
- Open with a concise 40–60 word definition paragraph that directly answers "what is [keyword]"
- After each H2 section, add a "Key Takeaway:" sentence under 25 words
- Include at least ONE comparison table in markdown pipe format
- Include at least ONE numbered step-by-step block (5+ steps)
- FAQ questions must be the exact H2/H3 heading text, answer as the first paragraph beneath

CONTENT QUALITY GATES:
- Minimum ${targetWords} words in content_markdown (articles below this will be rejected)
${gates}
- Must include one comparison table
- Must include one numbered process (5+ steps)

INTERNAL LINKING:
- Insert [INTERNAL_LINK: topic name] at least 3 times within paragraph text (not standalone)
- Topics to link: ${internalTopics}

OUTPUT FORMAT — RETURN JSON ONLY. NO text before or after. NO markdown code blocks:
{
  "title": "exact H1 title with keyword — keep under 70 chars, no keyword stuffing",
  "slug": "url-slug-here",
  "meta_description": "155 chars max, includes keyword and a clear value proposition",
  "content_markdown": "full blog content in markdown with [INTERNAL_LINK: topic] placeholders",
  "faq": [{ "question": "...", "answer": "..." }],
  "internal_links": ["topic1", "topic2", "topic3"],
  "keywords_used": ["keyword1", "keyword2", "keyword3"]
}`;
}

export interface UserInputArgs {
  keyword: string;
  slug: string;
  industry: string;
  internalTopics: string[];
  seoBrief?: string;
  publishedBlogs: Array<{ slug: string; title: string }>;
}

/** Build the user message from the pack + the selected topic. */
export function buildUserInput(pack: NichePack, args: UserInputArgs): string {
  const internalTopicSuggestions = args.internalTopics.slice(0, 3).join('", "');
  const cappedBrief = args.seoBrief ? args.seoBrief.slice(0, 1000) : undefined;
  const cityExample = pack.cities[0];

  const note: string[] = [
    `Write at least ${Math.round(pack.thresholds.minWordCount * 1.4)} words of detailed, specific content.`,
    `Use [INTERNAL_LINK: "${internalTopicSuggestions}"] naturally in paragraph text.`,
  ];
  if (cityExample) note.push(`Where relevant, ground an example in ${cityExample} or another real place.`);
  for (const m of pack.prompt.mustInclude) note.push(m);
  note.push("Return JSON ONLY — no markdown fences, no preamble.");

  return JSON.stringify(
    {
      seo_brief: cappedBrief,
      keyword: args.keyword,
      target_slug: args.slug,
      industry: args.industry,
      region: pack.country,
      site_name: pack.name,
      internal_topics: args.internalTopics,
      published_blogs: args.publishedBlogs.slice(0, 8),
      note: note.join(" "),
    },
    null,
    2
  );
}
