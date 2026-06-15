/**
 * lib/agent/entityGraph.ts
 *
 * Entity-driven semantic SEO — using Wikidata (free) + niche dictionary.
 *
 * Modern Google ranks entities, not just keywords. This module:
 *   1. Extracts named entities from a keyword/topic
 *   2. Pulls related entities from Wikidata
 *   3. Builds an entity coverage list for content briefs
 *   4. Tells Groq: "you must mention these entities naturally"
 *
 * Result: content has rich semantic relevance Google rewards.
 */

interface WikidataSearchResult {
  search?: Array<{
    id:          string;     // Q-id (e.g. Q57)
    label:       string;
    description?: string;
  }>;
}

interface WikidataEntityClaims {
  entities?: Record<string, {
    labels?:    Record<string, { value: string }>;
    claims?:    Record<string, Array<{
      mainsnak?: { datavalue?: { value?: { id?: string } | string } };
    }>>;
    descriptions?: Record<string, { value: string }>;
  }>;
}

// ─── 1. Wikidata search ──────────────────────────────────────────────────────

/**
 * Search Wikidata for an entity matching the search term.
 * Free API, no key required.
 */
async function searchWikidata(query: string, lang: string = "en"): Promise<{
  id: string;
  label: string;
  description: string;
} | null> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=${lang}&format=json&origin=*&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const data = await res.json() as WikidataSearchResult;
    const first = data.search?.[0];
    if (!first) return null;
    return {
      id: first.id,
      label: first.label,
      description: first.description ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Get related entities from a Wikidata entity (via P361, P31, P279 properties).
 */
async function getRelatedEntities(entityId: string, max: number = 8): Promise<string[]> {
  try {
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${entityId}.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return [];
    const data = await res.json() as WikidataEntityClaims;
    const entity = data.entities?.[entityId];
    if (!entity?.claims) return [];

    // Properties that describe related entities:
    //   P31  = instance of
    //   P279 = subclass of
    //   P361 = part of
    //   P527 = has part
    //   P155 = follows / P156 = followed by
    const relevantProps = ["P31", "P279", "P361", "P527"];
    const relatedIds: string[] = [];

    for (const prop of relevantProps) {
      const claims = entity.claims[prop] ?? [];
      for (const claim of claims) {
        const value = claim.mainsnak?.datavalue?.value;
        if (typeof value === "object" && value?.id) {
          relatedIds.push(value.id);
        }
        if (relatedIds.length >= max) break;
      }
      if (relatedIds.length >= max) break;
    }

    if (relatedIds.length === 0) return [];

    // Fetch labels for the related IDs (single batch request)
    const labelUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${relatedIds.slice(0, max).join("|")}&props=labels&languages=en&format=json&origin=*`;
    const labelRes = await fetch(labelUrl, { signal: AbortSignal.timeout(6_000) });
    if (!labelRes.ok) return [];
    const labelData = await labelRes.json() as WikidataEntityClaims;
    const labels: string[] = [];
    for (const id of relatedIds.slice(0, max)) {
      const lbl = labelData.entities?.[id]?.labels?.en?.value;
      if (lbl && lbl.length < 60) labels.push(lbl);
    }
    return labels;
  } catch {
    return [];
  }
}

// ─── 2. Niche-specific entity dictionary (curated) ──────────────────────────

/**
 * Pre-built entity dictionary for common niches.
 * If the niche matches, we skip Wikidata calls and use these.
 * Add more dictionaries as you onboard new niches.
 */
const NICHE_ENTITIES: Record<string, string[]> = {
  // FBR / Pakistan tax compliance
  "fbr": [
    "Federal Board of Revenue", "IRIS portal", "Sales Tax Act",
    "Sales Tax Registration Number", "STRN", "Tier-1 retailer",
    "QR invoice", "POS terminal", "SRO 1006(I)/2019",
    "Inland Revenue Service", "Sales Tax Return", "withholding tax",
    "Active Taxpayer List", "ATL", "NTN", "Income Tax Ordinance",
  ],
  "pos": [
    "Point of Sale", "POS terminal", "barcode scanner", "thermal printer",
    "inventory management", "card reader", "cash drawer", "receipt printer",
    "EMV", "PCI DSS", "merchant account", "transaction processing",
  ],
  "ecommerce": [
    "Shopify", "WooCommerce", "Magento", "payment gateway", "checkout",
    "cart abandonment", "conversion rate", "AOV", "fulfillment",
    "drop shipping", "SKU", "inventory turnover",
  ],
  "accounting": [
    "general ledger", "trial balance", "accounts payable", "accounts receivable",
    "double-entry bookkeeping", "GAAP", "IFRS", "VAT", "tax return",
    "depreciation", "balance sheet", "income statement", "cash flow",
  ],
  "uae": [
    "Federal Tax Authority", "FTA", "VAT", "VAT registration", "TRN",
    "Corporate Tax", "Free Zone", "Excise Tax", "tax invoice",
    "EmaraTax", "input tax", "output tax",
  ],
  "restaurant": [
    "POS for restaurant", "kitchen display system", "KDS", "table management",
    "menu engineering", "food cost", "inventory tracking", "online ordering",
    "delivery integration", "split bill", "tipping", "loyalty program",
  ],
  "pharmacy": [
    "drug license", "prescription management", "expiry tracking", "DRAP",
    "narcotics control", "barcode dispensing", "generic substitution",
    "stock alert", "controlled substances", "drug formulary",
  ],
};

function pickNicheDictionary(niche: string, seedKeywords: string[] = []): string[] {
  const haystack = (niche + " " + seedKeywords.join(" ")).toLowerCase();
  const entities = new Set<string>();
  for (const [key, list] of Object.entries(NICHE_ENTITIES)) {
    if (haystack.includes(key)) {
      list.forEach((e) => entities.add(e));
    }
  }
  return [...entities];
}

// ─── 3. Main entity discovery ────────────────────────────────────────────────

export interface EntityCoverage {
  primary:        string[];        // direct entity match
  related:        string[];        // related from Wikidata + dictionary
  nicheSpecific:  string[];        // from curated niche dictionary
}

/** Per-niche entity guardrails (supplied by the active NichePack). */
export interface EntityFilter {
  /** Terms guaranteed to be included (anchors the topic). */
  allow?: string[];
  /** Tokens that must NEVER be treated as entities — kills Wikidata
   *  disambiguation noise (e.g. "Issues" → the band "System of a Down"). */
  deny?: string[];
}

/** Drop any entity that matches a deny token (exact or substring, case-insensitive). */
function applyDeny(items: string[], deny: string[]): string[] {
  if (deny.length === 0) return items;
  const denyLc = deny.map((d) => d.toLowerCase());
  return items.filter((it) => {
    const lc = it.toLowerCase();
    return !denyLc.some((d) => lc === d || lc.includes(d));
  });
}

/**
 * Build entity coverage for a keyword.
 * Combines Wikidata graph + niche dictionary, filtered by the pack's guardrails.
 *
 * @param keyword       - target keyword (e.g. "fbr pos pharmacy")
 * @param niche         - site niche string (e.g. "fbr pos compliance pakistan")
 * @param seedKeywords  - site seed keywords (helps niche detection)
 * @param filter        - allow/deny lists from the active niche pack
 */
export async function buildEntityCoverage(
  keyword:      string,
  niche:        string  = "",
  seedKeywords: string[] = [],
  filter:       EntityFilter = {},
): Promise<EntityCoverage> {
  const tokens = keyword
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);

  // Wikidata search for the longest tokens (more distinctive)
  const candidateQueries = tokens
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);

  const primary: string[] = [];
  const related: string[] = [];

  for (const q of candidateQueries) {
    const entity = await searchWikidata(q);
    if (entity) {
      primary.push(entity.label);
      const more = await getRelatedEntities(entity.id, 5);
      related.push(...more);
      // Pacing: don't hammer Wikidata
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // Niche dictionary + pack allow-list anchors (guaranteed-relevant entities).
  const nicheSpecific = [...(filter.allow ?? []), ...pickNicheDictionary(niche, seedKeywords)];

  // Deduplicate, then strip anything on the deny-list. The deny filter is what
  // stops the entity graph from injecting off-topic Wikidata noise on broad
  // niches (sports, news, etc.) where keyword tokens are highly ambiguous.
  const deny = filter.deny ?? [];
  const dedupe = (arr: string[]) => [...new Set(arr.map((s) => s.trim()).filter(Boolean))];

  return {
    primary:       applyDeny(dedupe(primary), deny),
    related:       applyDeny(dedupe(related), deny).slice(0, 12),
    nicheSpecific: applyDeny(dedupe(nicheSpecific), deny).slice(0, 15),
  };
}

/**
 * Build a brief addendum that tells Groq which entities to cover.
 */
export function buildEntityBrief(coverage: EntityCoverage): string {
  const allEntities = [...coverage.primary, ...coverage.related, ...coverage.nicheSpecific];
  if (allEntities.length === 0) return "";

  const lines: string[] = [];
  lines.push("SEMANTIC ENTITY COVERAGE (mention these naturally for topical relevance):");

  if (coverage.primary.length > 0) {
    lines.push(`Primary entities: ${coverage.primary.join(", ")}`);
  }
  if (coverage.nicheSpecific.length > 0) {
    lines.push(`Niche-specific entities: ${coverage.nicheSpecific.slice(0, 10).join(", ")}`);
  }
  if (coverage.related.length > 0) {
    lines.push(`Related entities (use 4-6): ${coverage.related.slice(0, 8).join(", ")}`);
  }
  lines.push("→ Sprinkle these naturally throughout the article. Don't list them.");
  return lines.join("\n");
}
