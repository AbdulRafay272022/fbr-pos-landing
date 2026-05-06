/**
 * lib/agent/autoLinker.ts
 *
 * Deterministic internal linking engine.
 *
 * Replaces the placeholder-based approach ([INTERNAL_LINK: topic]) with
 * a content-scanning system that injects links naturally.
 *
 * Strategy:
 *  1. Build a phrase → URL map from the blog index
 *  2. Scan the HTML paragraph content for matching phrases
 *  3. Wrap the FIRST occurrence of each matched phrase with an anchor tag
 *  4. Respect guards: max links, no self-link, no double-link, no link inside link
 *
 * Matching order (most specific first):
 *  - Full blog title (longest match wins)
 *  - Individual blog keywords
 *  - Partial title match (first 4+ words)
 *
 * Guards:
 *  - MAX_TOTAL_LINKS (5) — never inject more than this many links
 *  - MAX_LINKS_PER_BLOG (1) — one link per target blog
 *  - Never link to the current page's own slug
 *  - Never wrap text already inside an <a> tag
 *  - Never match inside <h1>, <h2>, <h3>, <h4> tags
 */

type BlogIndexEntry = {
  slug: string;
  title: string;
  keywords: string[];
};

interface LinkCandidate {
  phrase: string;
  url: string;
  slug: string;
  priority: number; // higher = try first (longer matches have higher priority)
}

const MAX_TOTAL_LINKS    = 5;
const MAX_LINKS_PER_BLOG = 1;
const LINK_STYLE         = `color:#F97316;font-weight:600;text-decoration:underline;`;

// ─── Anchor text variation ────────────────────────────────────────────────────
// Using varied anchor text prevents over-optimisation penalties and sounds natural.

const ANCHOR_VARIATION_PREFIXES = [
  "",            // original phrase (most common)
  "learn about ",
  "read more on ",
  "see our guide to ",
  "",            // pad to lower chance of prefix vs original
];

/**
 * Pick a varied anchor text for a link.
 * Deterministic (based on phrase hash) so the same phrase always gets the
 * same prefix — no randomness that would change content on every build.
 */
function varyAnchorText(phrase: string, slug: string): string {
  // Deterministic "hash": sum of char codes mod prefix array length
  const hash = (slug + phrase)
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const prefix = ANCHOR_VARIATION_PREFIXES[hash % ANCHOR_VARIATION_PREFIXES.length];
  return prefix ? `${prefix}${phrase.toLowerCase()}` : phrase;
}

// ─── Build candidate list ─────────────────────────────────────────────────────

function buildCandidates(
  index: BlogIndexEntry[],
  currentSlug: string
): LinkCandidate[] {
  const candidates: LinkCandidate[] = [];

  for (const blog of index) {
    if (blog.slug === currentSlug) continue;

    const url = `/blog/${blog.slug}`;

    // Full title (highest priority — longest, most specific)
    candidates.push({
      phrase:   blog.title,
      url,
      slug:     blog.slug,
      priority: blog.title.length,
    });

    // Partial title (first 4+ words)
    const titleWords = blog.title.split(/\s+/);
    if (titleWords.length >= 5) {
      const partial = titleWords.slice(0, 4).join(" ");
      candidates.push({ phrase: partial, url, slug: blog.slug, priority: partial.length - 1 });
    }

    // Keywords
    for (const kw of blog.keywords) {
      if (kw.length >= 10) {
        candidates.push({ phrase: kw, url, slug: blog.slug, priority: kw.length });
      }
    }
  }

  // Sort: longest/most-specific phrase first to avoid partial-overlap issues
  return candidates.sort((a, b) => b.priority - a.priority);
}

// ─── Safe regex escape ────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Strip [INTERNAL_LINK: ...] placeholders ─────────────────────────────────
// These may still appear if the AI added them; auto-linker handles linking now

function stripPlaceholders(html: string): string {
  return html.replace(/\[INTERNAL_LINK:\s*[^\]]+\]/g, "");
}

// ─── Check if position is inside an existing <a> or heading tag ──────────────

function isInsideLinkOrHeading(html: string, matchStart: number, matchEnd: number): boolean {
  // Look backwards from matchStart for an unclosed <a or <h tag
  const before = html.slice(0, matchStart);
  const lastOpenA    = before.lastIndexOf("<a ");
  const lastCloseA   = before.lastIndexOf("</a>");
  const lastOpenH    = Math.max(
    before.lastIndexOf("<h2"),
    before.lastIndexOf("<h3"),
    before.lastIndexOf("<h4"),
    before.lastIndexOf("<h1")
  );
  const lastCloseH   = Math.max(
    before.lastIndexOf("</h2>"),
    before.lastIndexOf("</h3>"),
    before.lastIndexOf("</h4>"),
    before.lastIndexOf("</h1>")
  );

  const insideLink    = lastOpenA > lastCloseA;
  const insideHeading = lastOpenH > lastCloseH;

  void matchEnd;
  return insideLink || insideHeading;
}

// ─── Main autoLinker ──────────────────────────────────────────────────────────

/**
 * Scan HTML content and inject internal links deterministically.
 *
 * @param html         - the full blog post HTML (after markdown conversion)
 * @param index        - all published blog posts (without content)
 * @param currentSlug  - the slug of the current blog (skip self-links)
 * @returns modified HTML with internal links injected
 */
export function autoLink(
  html: string,
  index: BlogIndexEntry[],
  currentSlug: string
): string {
  // 1. Remove any leftover placeholders
  let result = stripPlaceholders(html);

  if (index.length === 0) return result;

  // 2. Build sorted candidate list
  const candidates = buildCandidates(index, currentSlug);

  let totalLinksAdded = 0;
  const slugsLinked   = new Set<string>();

  // 3. Try each candidate in priority order
  for (const candidate of candidates) {
    if (totalLinksAdded >= MAX_TOTAL_LINKS) break;
    if (slugsLinked.has(candidate.slug)) continue; // MAX_LINKS_PER_BLOG

    // Case-insensitive, whole-word-boundary match
    const pattern = new RegExp(
      `(?<![a-z0-9>"])${escapeRegex(candidate.phrase)}(?![a-z0-9<"])`,
      "i"
    );

    const match = pattern.exec(result);
    if (!match) continue;

    const start = match.index;
    const end   = start + match[0].length;

    // Guard: don't nest inside existing links or headings
    if (isInsideLinkOrHeading(result, start, end)) continue;

    // 4. Inject the link (with contextual anchor variation)
    const anchorText = varyAnchorText(match[0], candidate.slug);
    const anchor     = `<a href="${candidate.url}" style="${LINK_STYLE}">${anchorText}</a>`;
    result = result.slice(0, start) + anchor + result.slice(end);

    totalLinksAdded++;
    slugsLinked.add(candidate.slug);
  }

  // 5. Always add a /fbr-checker link if not present and under link limit
  if (
    totalLinksAdded < MAX_TOTAL_LINKS &&
    !result.includes("/fbr-checker") &&
    result.includes("compliance")
  ) {
    const checkerAnchor = `<a href="/fbr-checker" style="${LINK_STYLE}">FBR Compliance Score</a>`;
    // Insert after first occurrence of "compliance" inside a <p> tag
    result = result.replace(
      /(<p[^>]*>.*?)(compliance)(.*?<\/p>)/i,
      (full, pre, word, post) => {
        if (full.includes("/fbr-checker")) return full;
        return `${pre}${word}${post} — ${checkerAnchor}`;
      }
    );
  }

  return result;
}

/**
 * Build the internal linking graph: for each blog, what other blogs does it link to?
 * Useful for SEO audits and identifying orphaned content.
 */
export function buildLinkingGraph(
  blogs: Array<{ slug: string; content: string }>
): Record<string, string[]> {
  const graph: Record<string, string[]> = {};

  for (const blog of blogs) {
    const linked: string[] = [];
    const matches = blog.content.matchAll(/href="\/blog\/([^"]+)"/g);
    for (const match of matches) {
      if (match[1] !== blog.slug && !linked.includes(match[1])) {
        linked.push(match[1]);
      }
    }
    graph[blog.slug] = linked;
  }

  return graph;
}

/**
 * Find orphaned blogs — published posts with no incoming internal links.
 */
export function findOrphanedBlogs(
  graph: Record<string, string[]>,
  allSlugs: string[]
): string[] {
  const hasIncomingLink = new Set<string>();
  for (const links of Object.values(graph)) {
    for (const slug of links) hasIncomingLink.add(slug);
  }
  return allSlugs.filter((s) => !hasIncomingLink.has(s));
}

// ─── Related posts block ──────────────────────────────────────────────────────

/**
 * Build a "Related Posts" HTML block for a blog post.
 *
 * Selects up to 3 related posts by:
 *  1. Keyword overlap (most keywords in common = highest relevance)
 *  2. Fallback: most recently published blogs
 *
 * The block is injected just before the CTA / final paragraph of the post,
 * or appended at the end if no suitable injection point is found.
 */
export function buildRelatedPostsBlock(
  currentBlog:  { slug: string; keywords: string[] },
  index:        BlogIndexEntry[],
  count = 3
): string {
  const others = index.filter((b) => b.slug !== currentBlog.slug);

  // Score by keyword overlap
  const scored = others.map((b) => {
    const bKws  = new Set(b.keywords.map((k) => k.toLowerCase()));
    const overlap = currentBlog.keywords.filter((k) =>
      bKws.has(k.toLowerCase())
    ).length;
    return { blog: b, overlap };
  });

  const related = scored
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, count)
    .map((s) => s.blog);

  if (related.length === 0) return "";

  const items = related
    .map(
      (b) =>
        `  <li style="margin:8px 0;">` +
        `<a href="/blog/${b.slug}" style="${LINK_STYLE}">${b.title}</a>` +
        `</li>`
    )
    .join("\n");

  return (
    `\n<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:20px 24px;margin:32px 0;">` +
    `<p style="font-weight:700;margin:0 0 12px;font-size:16px;">Related Articles</p>` +
    `<ul style="margin:0;padding-left:20px;">\n${items}\n</ul>` +
    `</div>\n`
  );
}

/**
 * Inject a related posts block into HTML.
 * Inserts before the last CTA div, or before </body>/<article>, or appends.
 * No-op if the HTML already has a "Related Articles" block.
 */
export function injectRelatedPosts(
  html:         string,
  currentBlog:  { slug: string; keywords: string[] },
  index:        BlogIndexEntry[],
  count = 3
): string {
  if (html.includes("Related Articles")) return html;

  const block = buildRelatedPostsBlock(currentBlog, index, count);
  if (!block) return html;

  // Try to inject before the last CTA block (identified by wa.me link)
  const ctaIdx = html.lastIndexOf('<div style="background:#FFF7ED');
  if (ctaIdx !== -1) {
    return html.slice(0, ctaIdx) + block + html.slice(ctaIdx);
  }

  // Fallback: before </body> or append
  if (html.includes("</body>")) {
    return html.replace("</body>", `${block}</body>`);
  }

  return html + block;
}

/**
 * Enforce zero orphan pages: for each orphan slug, add it to the related posts
 * section of the HIGHEST-TRAFFIC non-orphan page it's most related to.
 *
 * This is a repair function called during update/refresh runs.
 * Returns a map of slug → updated HTML for all modified pages.
 */
export function repairOrphanLinks(
  allBlogs:    Array<{ slug: string; content: string; keywords: string[] }>,
  graph:       Record<string, string[]>,
): Map<string, string> {
  const allSlugs  = allBlogs.map((b) => b.slug);
  const orphans   = findOrphanedBlogs(graph, allSlugs);
  const updates   = new Map<string, string>();

  if (orphans.length === 0) return updates;

  // Build index for related-posts lookup
  const idx: BlogIndexEntry[] = allBlogs.map((b) => ({
    slug:     b.slug,
    title:    b.slug.replace(/-/g, " "),
    keywords: b.keywords,
  }));

  for (const orphanSlug of orphans) {
    const orphan = allBlogs.find((b) => b.slug === orphanSlug);
    if (!orphan) continue;

    // Find the best non-orphan host page (highest keyword overlap)
    const candidates = allBlogs.filter((b) => b.slug !== orphanSlug);
    if (candidates.length === 0) continue;

    const scored = candidates.map((b) => {
      const bKws    = new Set(b.keywords.map((k) => k.toLowerCase()));
      const overlap = orphan.keywords.filter((k) => bKws.has(k.toLowerCase())).length;
      return { blog: b, overlap };
    });

    const host = scored.sort((a, b) => b.overlap - a.overlap)[0]?.blog;
    if (!host) continue;

    // Already links to orphan?
    if (host.content.includes(`/blog/${orphanSlug}`)) continue;

    // Add orphan to host's related posts section
    const orphanEntry: BlogIndexEntry = {
      slug:     orphanSlug,
      title:    orphanSlug.replace(/-/g, " "),
      keywords: orphan.keywords,
    };

    const hostIdx: BlogIndexEntry[] = [orphanEntry, ...idx.filter((i) => i.slug !== host.slug)];
    const updatedContent = injectRelatedPosts(
      host.content,
      { slug: host.slug, keywords: host.keywords },
      hostIdx,
      1
    );

    if (updatedContent !== host.content) {
      updates.set(host.slug, updatedContent);
    }
  }

  return updates;
}
