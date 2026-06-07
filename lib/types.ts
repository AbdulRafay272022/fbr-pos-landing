// ─── Blog types ───────────────────────────────────────────────────────────────

export interface BlogFaq {
  question: string;
  answer: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  metaDescription: string;
  keywords: string[];
  content: string;
  publishedAt: string;
  readTime: number;
  faqs?: BlogFaq[];
  /** ISO timestamp of last AI-improvement pass */
  lastUpdated?: string;
  /** Increments on each update pass */
  version?: number;
  /** Cluster this blog belongs to (for internal linking graph) */
  cluster?: string;
  /** Hero image fetched from Pexels at generation time */
  heroImage?: {
    url: string;          // full-size image URL
    thumb: string;        // small thumbnail URL (400px wide)
    alt: string;          // photographer's description used as alt text
    photographer: string; // attribution name
    photographerUrl: string;
    pexelsUrl: string;    // link back to Pexels page (required by Pexels license)
  };
  /** Named author for E-E-A-T */
  authorName?: string;
}

// ─── Keyword types ────────────────────────────────────────────────────────────

export type KeywordIntent = "informational" | "commercial" | "transactional";
export type KeywordDifficulty = "low" | "medium" | "high";

export interface Keyword {
  keyword: string;
  intent: KeywordIntent;
  difficulty: KeywordDifficulty;
  /** 1–100 priority score */
  priority: number;
  cluster: string;
  used: boolean;
  /** slug of the blog post that consumed this keyword, or null */
  usedIn: string | null;
  generatedAt: string;
  /** Whether this keyword was validated against real search data */
  validated?: boolean;
  /** Boost applied after validation (e.g. 1.0 = no boost, 1.5 = validated match) */
  validationBoost?: number;
  /** Marked by pre-brief when SERP shows impossible difficulty (fbr.gov.pk dominates etc.) */
  rejected?: boolean;
  /** Human-readable rejection reason for debugging */
  rejectedReason?: string;
}

export interface KeywordsData {
  keywords: Keyword[];
  lastScraped: string | null;
  totalGenerated: number;
}

// ─── Site configuration ───────────────────────────────────────────────────────

export interface SiteConfig {
  /** Human-readable site name, e.g. "Phelix ERP" */
  name: string;
  /** Niche description, e.g. "FBR POS Compliance Pakistan" */
  niche: string;
  /** Target country/region, e.g. "Pakistan" */
  country: string;
  /** Production base URL */
  baseUrl: string;

  /** Core topics to generate keyword clusters from */
  seedKeywords: string[];
  /** Target industries for content (used in keyword expansion) */
  industries: string[];
  /** Target cities for local SEO content */
  cities: string[];
  /** Niche-specific compliance/regulation terms */
  complianceTerms: string[];

  /** WhatsApp number for CTA links */
  ctaWhatsApp?: string;
  /** Primary CTA copy */
  ctaText: string;
  /** Secondary CTA / company tagline */
  ctaSubtext?: string;

  /** E-E-A-T: named author displayed on blog posts */
  authorName?: string;
  /** Author's professional title, e.g. "FBR Compliance Specialist" */
  authorTitle?: string;
  /** Short author bio shown on the author profile page */
  authorBio?: string;

  // ── Content quality thresholds ──────────────────────────────────────────
  minWordCount: number;
  maxBlogsPerDay: number;
  maxUpdatesPerDay: number;

  // ── Agent decision thresholds ───────────────────────────────────────────
  /** Run keyword scrape if pool has fewer than this many unused keywords */
  minUnusedKeywordsThreshold: number;
  /** Days between keyword scrapes */
  scrapeIntervalDays: number;
  /** Hours between blog generations */
  generateIntervalHours: number;
  /** Hours between update runs */
  updateIntervalHours: number;
  /** Only update blogs older than this many days */
  updateAfterDays: number;
  /** Skip blogs updated within this many days */
  skipIfUpdatedWithinDays: number;
}

// ─── Agent state (stored in data/meta.json) ───────────────────────────────────

export interface AgentLock {
  isRunning: boolean;
  lockedAt: string | null;
  /** Identifier for the process that acquired the lock */
  lockedBy: string | null;
}

export interface AgentStats {
  lastScrapeAt: string | null;
  lastGenerateAt: string | null;
  lastUpdateAt: string | null;
  blogsGeneratedTotal: number;
  blogsUpdatedTotal: number;
  keywordsUsedTotal: number;
}

export interface MetaJson {
  lastTopicIndex: number;
  agent: AgentLock;
  stats: AgentStats;
}

// ─── Quality scoring ──────────────────────────────────────────────────────────

export interface QualityScore {
  total: number;           // 0–100
  passed: boolean;         // total >= PASS_THRESHOLD (60)
  breakdown: {
    wordCount: number;     // 0–30
    hasFaqs: number;       // 0–20
    hasInternalLinks: number; // 0–20
    hasKeyword: number;    // 0–15
    hasCta: number;        // 0–15
  };
  wordCount: number;
  faqCount: number;
  internalLinkCount: number;
  failureReasons: string[];
}

export interface BlogQualityScore {
  slug: string;
  score: number;           // 0–100 (lower = worse quality = higher update priority)
  breakdown: {
    wordCount: number;
    faqCount: number;
    internalLinks: number;
    ageDays: number;
    version: number;
  };
}

// ─── Logging ──────────────────────────────────────────────────────────────────

export type LogEvent =
  | "agent_start"
  | "agent_decision"
  | "agent_complete"
  | "agent_locked"
  | "keyword_scraped"
  | "keyword_rejected_duplicate"
  | "keyword_rejected_similarity"
  | "blog_generated"
  | "blog_quality_rejected"
  | "blog_committed"
  | "blog_updated"
  | "blog_update_skipped"
  | "quality_gate_failed"
  | "duplicate_detected"
  | "groq_failed"
  | "github_commit_failed"
  | "github_retry"
  // Phase 3
  | "seo_fetch_started"
  | "seo_fetch_complete"
  | "seo_fetch_failed"
  | "title_optimized"
  | "title_optimize_failed"
  | "content_refreshed"
  | "content_refresh_skipped"
  | "content_refresh_failed"
  | "schema_injected"
  | "cost_guard_blocked"
  | "cost_recorded"
  // Phase 4
  | "blog_indexed"
  | "index_submit_failed"
  | "blog_distributed"
  | "distribute_failed"
  | "serp_analyzed"
  | "cta_injected"
  | "conversion_tracked"
  // Phase 5
  | "landing_generated"
  | "landing_generate_failed"
  | "programmatic_generated"
  | "programmatic_generate_failed"
  | "conversion_optimized"
  | "conversion_optimize_skipped"
  | "decay_detected"
  | "decay_refresh_triggered"
  | "engagement_tracked"
  | "link_strategy_built";

export interface LogEntry {
  id: string;
  ts: string;
  site: string;
  event: LogEvent;
  level: "info" | "warn" | "error";
  keyword?: string;
  slug?: string;
  words?: number;
  source?: "groq" | "template";
  success: boolean;
  durationMs?: number;
  details?: Record<string, unknown>;
}

export interface LogsData {
  entries: LogEntry[];
  /** Last time the log was trimmed */
  lastTrimmedAt: string | null;
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

export interface SimilarityResult {
  isSimilar: boolean;
  /** 0.0–1.0 Jaccard similarity score */
  score: number;
  /** The most similar existing keyword/slug */
  matchedWith: string;
}

// ─── SEO performance data (Google Search Console) ────────────────────────────

export interface PageMetric {
  /** Blog slug, e.g. "fbr-pos-compliance-guide" */
  slug: string;
  /** Full page URL */
  url: string;
  impressions: number;
  clicks: number;
  /** 0.0–1.0 */
  ctr: number;
  /** Average position in SERP */
  position: number;
  /** ISO timestamp of when this data was fetched */
  fetchedAt: string;
}

/** A search query that Google shows the site for (from GSC query-level data) */
export interface QueryMetric {
  /** The raw search query, e.g. "fbr pos software lahore" */
  query: string;
  impressions: number;
  clicks: number;
  /** 0.0–1.0 */
  ctr: number;
  /** Average position in SERP */
  position: number;
  /** ISO timestamp of when this data was fetched */
  fetchedAt: string;
}

export interface SeoData {
  /** All page metrics from latest GSC fetch */
  pages: PageMetric[];
  /**
   * Search queries Google shows the site for (dimensions: ["query"]).
   * Filtered to positions 11–50 — "striking distance" keywords Google considers
   * us relevant for but we're not yet on page 1. These are the highest-ROI
   * keywords to target with new content.
   */
  queries?: QueryMetric[];
  /** ISO timestamp of last successful fetch */
  lastFetchedAt: string | null;
  /** Summary stats */
  summary: {
    totalImpressions: number;
    totalClicks: number;
    avgCTR: number;
    avgPosition: number;
  };
  /** Top 5 pages by impressions */
  topPages: Array<{ slug: string; impressions: number; ctr: number; position: number }>;
  /** Top striking-distance queries (pos 11–50, sorted by impressions desc) */
  topQueries?: Array<{ query: string; impressions: number; position: number }>;
}

// ─── Cost / token tracking ────────────────────────────────────────────────────

export interface CostEntry {
  ts: string;
  action: "generate" | "update" | "refresh" | "title_optimize" | "generate_landing" | "generate_programmatic" | "optimize_conversion";
  slug?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostData {
  entries: CostEntry[];
  /** Rolling monthly totals, keyed "YYYY-MM" */
  monthly: Record<string, { tokens: number; calls: number }>;
  /** Hard cap — agent stops generating when monthly tokens exceed this */
  monthlyTokenBudget: number;
  /** Last time the log was trimmed (entries > 1000 removed) */
  lastTrimmedAt: string | null;
}

// ─── Authority scoring ────────────────────────────────────────────────────────

export interface AuthorityScoreResult {
  slug: string;
  /** 0–100 authority score */
  score: number;
  breakdown: {
    /** Points from inbound internal links (0–40) */
    inboundLinks: number;
    /** Points from content depth / word count (0–25) */
    contentDepth: number;
    /** Points from recency of last update (0–20) */
    recency: number;
    /** Points from update iteration count (0–15) */
    updateCount: number;
  };
}

// ─── Title optimization ───────────────────────────────────────────────────────

export interface TitleVariant {
  title: string;
  /** Heuristic CTR score 0–100 */
  ctrScore: number;
  /** Signals that boosted the score */
  signals: string[];
}

export interface TitleOptimizationResult {
  slug: string;
  originalTitle: string;
  variants: TitleVariant[];
  /** The highest-scoring variant */
  winner: TitleVariant;
}

// ─── Schema.org markup ────────────────────────────────────────────────────────

export interface ArticleSchema {
  "@context": string;
  "@type": "Article";
  headline: string;
  description: string;
  author:
    | { "@type": "Organization"; name: string }
    | { "@type": "Person"; name: string; url: string };
  publisher: { "@type": "Organization"; name: string };
  datePublished: string;
  dateModified: string;
  url: string;
  keywords: string;
  /** Hero image URL (optional) */
  image?: string;
}

export interface FaqPageSchema {
  "@context": string;
  "@type": "FAQPage";
  mainEntity: Array<{
    "@type": "Question";
    name: string;
    acceptedAnswer: { "@type": "Answer"; text: string };
  }>;
}

// ─── Extended agent stats (Phase 3 additions) ─────────────────────────────────

export interface AgentStatsV2 extends AgentStats {
  totalImpressions: number;
  avgCTR: number;
  topPages: Array<{ slug: string; impressions: number; ctr: number }>;
  lastSeoFetchAt: string | null;
  lastTitleOptimizeAt: string | null;
  lastRefreshAt: string | null;
  titlesOptimizedTotal: number;
  refreshesTotal: number;
  /** Monthly token spend (current month) */
  tokensBudgetUsed: number;
}

// ─── Phase 4: Indexing ────────────────────────────────────────────────────────

export interface IndexingRecord {
  slug: string;
  url:  string;
  submittedAt: string;
  /** "URL_UPDATED" or "URL_DELETED" per Google Indexing API */
  type:    "URL_UPDATED" | "URL_DELETED";
  status:  "submitted" | "failed";
  error?:  string;
}

export interface IndexingData {
  records:         IndexingRecord[];
  lastSubmittedAt: string | null;
  totalSubmitted:  number;
}

// ─── Phase 4: Distribution ────────────────────────────────────────────────────

export type SocialPlatform = "twitter" | "linkedin";

export interface DistributionPost {
  platform:  SocialPlatform;
  postId?:   string;
  postUrl?:  string;
  postedAt:  string;
  success:   boolean;
  error?:    string;
}

export interface DistributionRecord {
  slug:          string;
  title:         string;
  blogUrl:       string;
  hook:          string;
  posts:         DistributionPost[];
  distributedAt: string;
}

export interface DistributionData {
  records:             DistributionRecord[];
  lastDistributedAt:   string | null;
  totalDistributed:    number;
}

// ─── Phase 4: Conversions ─────────────────────────────────────────────────────

export type ConversionType =
  | "cta_click"
  | "whatsapp_click"
  | "form_submit"
  | "phone_click"
  | "email_click";

export interface ConversionEvent {
  id:         string;
  ts:         string;
  type:       ConversionType;
  slug?:      string;
  ctaLabel?:  string;
  /** Referring URL or UTM source */
  source?:    string;
}

export interface ConversionSummary {
  totalClicks:        number;
  totalFormSubmits:   number;
  totalWhatsAppClicks: number;
  /** Top 10 slugs by conversion count */
  bySlug: Record<string, number>;
}

export interface ConversionData {
  events:       ConversionEvent[];
  summary:      ConversionSummary;
  lastTrimmedAt: string | null;
}

// ─── Phase 4: SERP Intelligence ───────────────────────────────────────────────

export interface SerpResult {
  position:    number;
  url:         string;
  title:       string;
  description: string;
  wordCount?:  number;
  headings?:   string[];
}

export interface SerpAnalysis {
  keyword:        string;
  results:        SerpResult[];
  analyzedAt:     string;
  avgWordCount:   number;
  /** Most common H2 topics across top results */
  commonHeadings: string[];
  /** Topics in top results NOT in our content */
  contentGaps:    string[];
}

export interface SerpCache {
  analyses:       Record<string, SerpAnalysis>; // keyed by keyword
  lastAnalyzedAt: string | null;
}

// ─── Phase 5: Landing pages ───────────────────────────────────────────────────

export type LandingPageType = "service" | "tool" | "location" | "industry";

export interface LandingPage {
  slug:            string;
  title:           string;
  metaDescription: string;
  keywords:        string[];
  cluster:         string;
  pageType:        LandingPageType;
  /** Full rendered HTML */
  content:         string;
  faqs:            BlogFaq[];
  publishedAt:     string;
  lastUpdated?:    string;
  version?:        number;
  /** City this page targets (for location pages) */
  targetCity?:     string;
  /** Industry this page targets */
  targetIndustry?: string;
  /** Service this page targets */
  targetService?:  string;
}

export interface LandingPageIndex {
  slug:        string;
  title:       string;
  cluster:     string;
  pageType:    LandingPageType;
  publishedAt: string;
  lastUpdated?: string;
}

export interface LandingPagesData {
  pages:            LandingPageIndex[];
  totalPublished:   number;
  lastGeneratedAt:  string | null;
}

// ─── Phase 5: Topic clusters ──────────────────────────────────────────────────

export interface TopicCluster {
  /** Unique stable ID, e.g. "fbr-compliance" */
  id:               string;
  /** Human-readable name */
  name:             string;
  /** The single highest-value keyword representing this cluster */
  pillarKeyword:    string;
  /** Supporting keywords that belong to this cluster */
  relatedKeywords:  string[];
  /** Desired number of blog posts in the cluster (10–20) */
  targetBlogCount:  number;
  /** Short description of the cluster's intent */
  description:      string;
  /** Slug of the designated pillar page for this cluster */
  pillarSlug?:      string;
}

export interface ClusterStatus {
  clusterId:      string;
  publishedCount: number;
  targetCount:    number;
  completionPct:  number;  // 0–100
  isComplete:     boolean;
  /** Slugs of blogs assigned to this cluster */
  slugs:          string[];
}

export interface TopicMap {
  clusters:       TopicCluster[];
  /** keyed by cluster id */
  clusterStatus:  Record<string, ClusterStatus>;
  lastAnalyzedAt: string | null;
}

// ─── Phase 5: Content decay detection ────────────────────────────────────────

export interface DecaySignal {
  slug:               string;
  url:                string;
  /** Impressions in the most recent 14-day window */
  impressionsNow:     number;
  /** Impressions in the prior 14-day window */
  impressionsPrev:    number;
  /** % drop (negative means growth) */
  impressionsDrop:    number;
  positionNow:        number;
  positionPrev:       number;
  /** Positions dropped (positive = worse ranking) */
  positionDrop:       number;
  detectedAt:         string;
  refreshTriggered:   boolean;
}

export interface DecayData {
  signals:         DecaySignal[];
  lastDetectedAt:  string | null;
}

// ─── Phase 5: Engagement tracking ────────────────────────────────────────────

export type EngagementEventType = "scroll_depth" | "time_on_page" | "bounce" | "exit";

export interface EngagementEvent {
  id:      string;
  ts:      string;
  type:    EngagementEventType;
  slug:    string;
  /** scroll_depth: 0–100 (%), time_on_page: seconds, bounce/exit: 0|1 */
  value:   number;
  source?: string;
}

export interface EngagementSlugSummary {
  avgScrollDepth: number;
  avgTimeOnPage:  number;
  bounceRate:     number;
  totalSessions:  number;
}

export interface EngagementData {
  events:        EngagementEvent[];
  /** Keyed by slug */
  summary:       Record<string, EngagementSlugSummary>;
  lastTrimmedAt: string | null;
}

// ─── Phase 5: Programmatic pages ─────────────────────────────────────────────

export interface ProgrammaticPage {
  slug:            string;
  title:           string;
  metaDescription: string;
  keywords:        string[];
  city:            string;
  service:         string;
  industry:        string;
  content:         string;
  publishedAt:     string;
  lastUpdated?:    string;
  version?:        number;
}

export interface ProgrammaticPageIndex {
  slug:        string;
  city:        string;
  service:     string;
  industry:    string;
  publishedAt: string;
}

export interface ProgrammaticPagesData {
  pages:           ProgrammaticPageIndex[];
  totalPublished:  number;
  lastGeneratedAt: string | null;
}

// ─── Phase 5: Link strategy ───────────────────────────────────────────────────

export interface LinkWeight {
  slug:           string;
  isPillar:       boolean;
  cluster:        string;
  authorityScore: number;
  inboundCount:   number;
  outboundCount:  number;
  /** Composite priority score — higher = more link equity to pass */
  priority:       number;
}

export interface LinkStrategyMap {
  /** cluster id → pillar slug */
  pillarPages:  Record<string, string>;
  weights:      LinkWeight[];
  lastBuiltAt:  string | null;
}
