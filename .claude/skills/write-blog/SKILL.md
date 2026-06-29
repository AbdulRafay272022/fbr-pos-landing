---
name: write-blog
description: Write ONE unique, high-quality SEO blog post for this site (Claude-authored, not Groq) and commit it live. Use when the user says "write a blog", "write today's blog", "/write-blog", or runs this on a schedule/Routine.
---

# write-blog — Claude-authored blog for phelixerp.online

You are the senior content writer for this site. Write **one** genuinely useful, **unique** 1,500–1,800 word article and commit it. Quality over volume — this replaces the Groq autopilot for posts that matter, and human/Claude-in-the-loop is what keeps the site safe from Google's scaled-content penalties.

## 1. Pick the topic
- If the user named a keyword/topic, use it.
- Else read `data/briefs/pending.json` (the pre-brief) and use its `keyword` + `seoBrief` if fresh.
- Else pick the highest-priority unused, non-rejected keyword from `data/keywords.json` (`!used && !rejected`), preferring one not already in `data/blogs/`.
- To **fix a duplicate**, you may reuse an existing slug from the duplicate list — you'll replace its content (keeps the URL).
- Compute the slug: lowercase, hyphens, `[a-z0-9-]` only.

## 2. Write the article (the bar)
Target 1,500–1,800 words of **specific, non-generic** content. Structure:
1. Intro — open with a 40–60 word definition that directly answers "what is [keyword]" (featured-snippet bait), then the stakes.
2. 5–7 H2 sections with real detail: causes, step-by-step fixes, a **named real-world example** (a specific business + city + PKR figures), common mistakes with consequences, and one non-obvious expert insight.
3. One **comparison table** (markdown pipe table) and one **numbered process** (5+ steps).
4. 5–8 FAQs — question as the H3, answer as the first paragraph (40+ words each).
5. Conclusion that summarises and links onward.

**Hard rules (these are the quality bugs we fixed — do not reintroduce):**
- NO "Top 3 / Top 5" in the title unless the article truly is a ranked list of that exact count.
- NO banned filler: "in today's world", **"in conclusion"**, "it is worth noting".
- NO keyword in an H2 verbatim/stuffed; phrase headings naturally.
- Meta description ≤ 155 chars and a **complete sentence** (never cut mid-word).
- Mention FBR IRIS ≥ twice, ≥ 1 specific PKR penalty figure, ≥ 1 technical IRIS API detail (token expiry, offline sync, rate limits).
- Insert 2–3 internal links to **real existing slugs** (check `data/index.json`), as `<a href="/blog/SLUG" ...>Title</a>` inside paragraphs.

## 3. Assemble the blog JSON
Write `data/blogs/<slug>.json` with exactly these fields (match an existing file):
`slug, title, metaDescription, keywords[], content (HTML string), faqs[{question,answer}], publishedAt (ISO now), readTime (ceil(words/200)), version (existing+1 or 1), authorName ("Phelix ERP Team"), lastUpdated (ISO now)`.

In `content` (HTML, not markdown), end with two `<script type="application/ld+json">` blocks: an `Article` schema and a `FAQPage` schema (copy the shape from `data/blogs/fbr-penalty-notice.json`). A lead-gen WhatsApp CTA block (`https://wa.me/923118366981`) near the end is fine for this (lead-gen) site.

## 4. Update the index + commit
- Update `data/index.json`: replace the entry with this slug, or prepend a new one. The entry = the blog object **without** `content`.
- `git add data/blogs/<slug>.json data/index.json`
- Rebase first (the repo is also the agent's DB): `git fetch origin && git rebase origin/main` (code touches blogs/index; agent touches other data → no conflicts).
- Commit: `blog: <title>` with the Co-Authored-By trailer, then `git push origin HEAD:main`. Vercel auto-deploys.

## 5. Report
Tell the user the slug, title, word count, which duplicate (if any) it replaced, and the live URL `https://phelixerp.online/blog/<slug>`.
