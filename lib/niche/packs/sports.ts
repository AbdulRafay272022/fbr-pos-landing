/**
 * lib/niche/packs/sports.ts
 *
 * Proof that the engine is niche-agnostic: a sports content site monetised
 * with AdSense, defined entirely as config. Activate with SITE_NICHE_PACK=sports.
 *
 * AdSense policy note: this pack targets sports NEWS / ANALYSIS / GUIDES /
 * "how to watch" / fitness — NOT betting or odds (which AdSense restricts).
 */

import type { NichePack, TemplateInput, TemplateOutput } from "../types";

function buildTemplate(input: TemplateInput): TemplateOutput {
  const kw = input.keyword;
  const html = `<h2>${kw}: what you need to know</h2>
<p>${kw} is one of the topics fans search for most around fixture weeks and major tournaments. This guide breaks down the essentials clearly — the context, the key names, the numbers that matter, and where to follow along — so you can get up to speed in a couple of minutes.</p>
<p>Whether you are a long-time follower or just getting into the sport, the sections below cover the practical details people most often look for.</p>

<h2>The background in plain terms</h2>
<p>Every story in sport has a context: a season, a rivalry, a form streak, or a rule that shapes how a match plays out. Understanding that background is what turns a scoreline into a story you can actually follow and enjoy.</p>

<h2>Key facts and figures</h2>
<ul>
<li><strong>Format</strong> — how the competition or fixture is structured</li>
<li><strong>Recent form</strong> — results over the last several outings</li>
<li><strong>Head-to-head</strong> — historical record between the sides or athletes</li>
<li><strong>Key players</strong> — who tends to decide these contests</li>
<li><strong>What's at stake</strong> — standings, qualification, or records on the line</li>
</ul>

<h2>How to follow along</h2>
<ol>
<li><strong>Check the schedule</strong> — confirm the date and your local kickoff/start time</li>
<li><strong>Find the broadcaster</strong> — identify the official rights holder in your region</li>
<li><strong>Pick a legal stream</strong> — use the broadcaster's own app or a licensed service</li>
<li><strong>Follow live updates</strong> — reputable live-text and stats feeds fill any gaps</li>
<li><strong>Review the highlights</strong> — official channels post clips shortly after</li>
</ol>

<h2>A closer look</h2>
<p>The detail fans miss is usually tactical or statistical: a matchup that quietly decides the game, a workload trend, or a small rule change with outsized impact. Paying attention to those details is what separates a casual take from real insight.</p>

<h2>Common mistakes fans make</h2>
<ul>
<li><strong>Judging on one result</strong> — form over several outings tells the real story</li>
<li><strong>Ignoring context</strong> — injuries, travel, and rest change everything</li>
<li><strong>Trusting unofficial streams</strong> — they are unreliable and often unsafe</li>
<li><strong>Overrating reputation</strong> — current form beats past glory</li>
<li><strong>Missing the schedule</strong> — time-zone errors are the #1 reason fans miss the start</li>
</ul>

<h2>Why it matters</h2>
<ul>
<li><strong>Better viewing</strong> — context makes every match more engaging</li>
<li><strong>Smarter conversations</strong> — you can hold your own with any fan</li>
<li><strong>No spoilers or scams</strong> — official sources keep you safe and current</li>
<li><strong>Deeper appreciation</strong> — the nuance is where the love of the game lives</li>
</ul>

<h2>Frequently Asked Questions</h2>
<h3>Where can I watch ${kw} legally?</h3>
<p>Use the official rights holder in your region — typically a broadcaster's own app or website, or a licensed streaming service. Avoid unofficial streams.</p>
<h3>How do I find the start time in my time zone?</h3>
<p>Check the official schedule, which lists times in a reference zone, then convert to your local time to avoid missing the start.</p>
<h3>Where do I get reliable live stats?</h3>
<p>Official league and team channels, plus established sports data providers, offer accurate live scores, lineups, and stats.</p>`;

  const faqs = [
    { question: `Where can I watch ${kw} legally?`, answer: "Use the official rights holder in your region — usually a broadcaster's app or a licensed streaming service. Avoid unofficial streams." },
    { question: "How do I find the start time in my time zone?", answer: "Check the official schedule and convert the reference time to your local time zone to avoid missing the start." },
    { question: "Where do I get reliable live stats?", answer: "Official league and team channels and established sports data providers offer accurate live scores, lineups, and stats." },
    { question: "How can I follow the build-up?", answer: "Follow official accounts and reputable sports outlets for previews, team news, and analysis ahead of the event." },
  ];

  return { html, faqs };
}

export const sportsPack: NichePack = {
  id: "sports",
  name: "The Sports Desk",
  niche: "Sports news, match guides, and how-to-watch coverage",
  country: "United States",
  language: "en",
  baseUrl: "https://example-sports.com",

  cities: [],
  industries: ["football", "soccer", "basketball", "cricket", "tennis", "Formula 1", "boxing", "MMA", "baseball", "golf", "athletics"],
  complianceTerms: [],
  seedKeywords: [
    "how to watch", "match preview", "starting lineup", "fixtures today", "live score",
    "player stats", "head to head", "season schedule", "highlights", "transfer news",
    "playoff bracket", "tournament format", "match prediction", "team form", "injury news",
  ],

  author: {
    name: "The Sports Desk",
    title: "Sports analysts & writers",
    bio: "The Sports Desk covers match previews, how-to-watch guides, player stats, and analysis across football, basketball, cricket, tennis, and more.",
  },

  prompt: {
    persona: "a veteran sports analyst and writer who explains matches, formats, and how-to-watch details clearly for fans",
    audience: "sports fans looking for previews, stats, and reliable ways to follow events",
    domainRules: [
      "MUST be factual and neutral — no betting tips, odds, or gambling promotion",
      "MUST cite the type of source fans should trust (official broadcasters, league sites, established stats providers)",
      "MUST distinguish recent form from historical reputation",
      "MUST include concrete, checkable details (formats, schedules, head-to-head context) rather than vague hype",
    ],
    mustInclude: [
      "Explain where to legally watch or follow the event.",
      "Include at least one section with concrete numbers or a comparison (form, head-to-head, or stats).",
    ],
    lsiTerms: ["fixtures", "lineup", "head-to-head", "live score", "highlights", "standings", "kickoff time"],
    // Allowlist keeps the entity graph anchored to sport, not Wikipedia noise.
    entityAllow: ["league", "tournament", "fixture", "season", "playoff", "championship", "match", "stadium", "coach", "athlete", "team"],
    // Denylist kills the "System of a Down"-style disambiguation garbage:
    // ambiguous tokens that Wikidata maps to bands, films, or places.
    entityDeny: ["United", "Rangers", "Jordan", "Bull", "Heat", "Jazz", "Kings", "Wizards", "Magic", "Giants", "Saints", "Lightning", "Thunder", "Issues", "System", "album", "band", "film", "song", "musical group"],
    internalTopics: ["how to watch", "match preview", "player stats", "season schedule"],
  },

  monetization: {
    mode: "adsense",
    clientId: "", // falls back to ADSENSE_CLIENT_ID env var
    slots: { inArticle: "0000000000", footer: "0000000001" },
    adDensityWords: 350,
  },

  thresholds: { minWordCount: 1100 },

  clusters: [
    {
      id: "how-to-watch",
      name: "How to Watch",
      pillarKeyword: "how to watch live sports",
      relatedKeywords: ["how to watch", "live stream", "tv channel", "broadcast rights", "watch online", "free stream", "where to watch"],
      targetBlogCount: 15,
      description: "How-to-watch and where-to-stream guides for matches and events.",
    },
    {
      id: "previews-predictions",
      name: "Match Previews",
      pillarKeyword: "match preview and analysis",
      relatedKeywords: ["match preview", "head to head", "team news", "starting lineup", "form guide", "key players", "tactical analysis"],
      targetBlogCount: 20,
      description: "Pre-match previews, form, and analysis (no betting/odds).",
    },
    {
      id: "explainers",
      name: "Rules & Formats",
      pillarKeyword: "sports rules and formats explained",
      relatedKeywords: ["rules explained", "format explained", "scoring", "playoff format", "qualification", "how it works", "for beginners"],
      targetBlogCount: 15,
      description: "Explainers on rules, scoring, and competition formats.",
    },
    {
      id: "schedules-stats",
      name: "Schedules & Stats",
      pillarKeyword: "fixtures schedule and stats",
      relatedKeywords: ["fixtures", "schedule", "results", "standings", "player stats", "records", "table"],
      targetBlogCount: 15,
      description: "Fixtures, schedules, standings, and player/team statistics.",
    },
  ],

  fallbackTopics: [
    { keyword: "How to Watch the Champions League Final", slug: "how-to-watch-champions-league-final", industry: "soccer", businessType: "how-to-watch", keywords: ["watch champions league final", "champions league final stream", "champions league tv"], internalTopics: ["how to watch", "match preview", "season schedule"] },
    { keyword: "NBA Playoff Format Explained", slug: "nba-playoff-format-explained", industry: "basketball", businessType: "explainer", keywords: ["nba playoff format", "nba play-in tournament", "nba bracket explained"], internalTopics: ["season schedule", "player stats", "match preview"] },
    { keyword: "Cricket World Cup Schedule and How to Follow", slug: "cricket-world-cup-schedule-guide", industry: "cricket", businessType: "guide", keywords: ["cricket world cup schedule", "world cup fixtures", "how to watch cricket world cup"], internalTopics: ["how to watch", "season schedule", "match preview"] },
    { keyword: "Formula 1 Race Weekend Format for Beginners", slug: "f1-race-weekend-format-beginners", industry: "Formula 1", businessType: "explainer", keywords: ["f1 race weekend format", "f1 sprint explained", "f1 for beginners"], internalTopics: ["how to watch", "match preview", "season schedule"] },
    { keyword: "Tennis Grand Slam Rules and Scoring Explained", slug: "tennis-grand-slam-rules-scoring", industry: "tennis", businessType: "explainer", keywords: ["tennis scoring explained", "grand slam rules", "how tennis sets work"], internalTopics: ["match preview", "player stats", "how to watch"] },
  ],

  buildTemplate,
};
