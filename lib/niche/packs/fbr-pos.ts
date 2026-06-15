/**
 * lib/niche/packs/fbr-pos.ts
 *
 * The original Phelix ERP site, expressed as a NichePack.
 * SITE_NICHE_PACK defaults to "fbr-pos", so this preserves current behaviour
 * exactly — same prompt rules, same fallback topics, same template, same
 * lead-gen WhatsApp CTA. Nothing about the live FBR site changes.
 */

import type { NichePack, TemplateInput, TemplateOutput } from "../types";

const WA = "923118366981";

function buildTemplate(input: TemplateInput): TemplateOutput {
  const keyword = input.primaryKeyword ?? input.keyword;
  const html = `<h2>Understanding ${input.keyword}</h2>
<p>Pakistan's Federal Board of Revenue (FBR) has fundamentally changed how businesses must operate. With the mandatory POS integration requirement actively enforced across Karachi, Lahore, Islamabad, Rawalpindi, and Faisalabad, business owners who delay compliance face serious financial and legal consequences. This guide explains everything about ${input.keyword.toLowerCase()}, helping you stay compliant, avoid penalties, and run your business more efficiently.</p>
<p>Whether you are a first-time entrepreneur or an established retailer, understanding your obligations under the FBR POS system is no longer optional. FBR inspections intensified significantly in 2025 and 2026, with non-compliant businesses facing fines, STRN suspension, and forced closures.</p>

<h2>What FBR Law Requires</h2>
<p>The FBR POS integration mandate was introduced under SRO 1006(I)/2019 and has been progressively expanded. Every sale must be submitted to FBR IRIS in real time, a QR-coded invoice must be generated for the customer, and sales tax must be calculated and submitted without manual intervention.</p>
<p>Businesses that operate outside this system are in violation of the Sales Tax Act. FBR has made clear that enforcement will continue to expand — if your business holds an STRN, assume POS integration is already required or will be soon.</p>

<h2>Who Must Comply</h2>
<ul>
<li><strong>Tier-1 Retailers</strong> – Businesses with annual turnover above the FBR threshold</li>
<li><strong>Chain Stores and Franchises</strong> – Any business operating from multiple locations</li>
<li><strong>Pharmacies and Medical Stores</strong> – Especially in Karachi, Lahore, Islamabad</li>
<li><strong>Restaurants and Food Businesses</strong> – Dine-in restaurants and fast food outlets registered for sales tax</li>
<li><strong>Wholesale Distributors</strong> – Distributors with an STRN supplying goods to retailers</li>
</ul>

<h2>Step-by-Step: Getting Compliant</h2>
<ol>
<li><strong>Verify your STRN</strong> — Log in to iris.fbr.gov.pk and confirm your Sales Tax Registration Number is active</li>
<li><strong>Choose FBR-compatible software</strong> — Not every POS supports IRIS integration; verify API compatibility before committing</li>
<li><strong>Register on IRIS POS portal</strong> — Enter your STRN, address, and number of terminals to receive API credentials</li>
<li><strong>Configure your integration</strong> — Map tax rates and set up real-time sync configuration</li>
<li><strong>Run test transactions</strong> — Verify at least five invoices appear in your IRIS dashboard before going live</li>
<li><strong>Configure offline sync</strong> — Set up a local queue so transactions during outages are stamped correctly and sync automatically</li>
<li><strong>Train staff</strong> — Basic training takes 20–30 minutes; FBR compliance runs automatically in the background</li>
<li><strong>Monitor monthly</strong> — Review your IRIS dashboard at least once per month to catch rejected invoices early</li>
</ol>

<h2>Real-World Example: A Lahore Pharmacy</h2>
<p>A pharmacy in Gulberg, Lahore integrated with FBR IRIS in under 24 hours. Before integration, they manually prepared monthly sales tax returns — a 2–3 day process. After integration, their monthly return is pre-filled from POS data and takes under 30 minutes to review and submit.</p>
<p>Beyond compliance, they discovered that 8% of monthly revenue was previously unrecorded due to staff-handled cash sales — the QR invoicing requirement eliminated this entirely.</p>

<h2>Common Mistakes Businesses Make</h2>
<ul>
<li><strong>Using non-approved POS software</strong> — Generic apps are almost never IRIS-integrated. Verify API connectivity before purchase.</li>
<li><strong>Ignoring offline sync</strong> — Transactions during outages must auto-sync to FBR when connectivity returns.</li>
<li><strong>Wrong tax rate configuration</strong> — Applying standard rates to exempt items triggers audits.</li>
<li><strong>Token expiry handling</strong> — FBR IRIS session tokens expire every 60 minutes; systems that don't auto-refresh cause silent failures.</li>
<li><strong>Skipping test transactions</strong> — Going live without verifying IRIS receipt means early sales may never reach FBR.</li>
<li><strong>Incorrect timestamp on offline sync</strong> — Batching queued invoices with the reconnection timestamp creates audit discrepancies.</li>
</ul>

<h2>Technical Implementation Insights</h2>
<p>At the API level, FBR IRIS uses token-based authentication that expires every 60 minutes. A common failure point is caching the initial token indefinitely — causing silent submission failures after the first hour. Proper implementation refreshes the token proactively 5 minutes before expiry.</p>
<p>During outages, invoices queued locally must be submitted in chronological order with correct original timestamps. Systems that batch-submit with the reconnection timestamp create discrepancies FBR's monitoring flags within 48 hours.</p>

<h2>Benefits of Full FBR Compliance for ${keyword} Businesses</h2>
<ul>
<li><strong>Automated bookkeeping</strong> – Every transaction is digitally recorded; no manual entries</li>
<li><strong>Simplified tax filing</strong> – Monthly returns are pre-filled from POS data, cutting accountant time 70%+</li>
<li><strong>Real-time inventory tracking</strong> – Stock reduces automatically on every sale</li>
<li><strong>Fraud elimination</strong> – QR invoicing makes unrecorded cash sales impossible</li>
<li><strong>Audit readiness</strong> – Complete digital records resolve audits quickly</li>
</ul>

<h2>FBR Penalties for Non-Compliance</h2>
<ul>
<li>First offense: PKR 10,000–25,000 fine + written warning</li>
<li>Repeated violations: PKR 100,000–1,000,000</li>
<li>Deliberate evasion: STRN suspension, business seal, criminal referral</li>
</ul>

<h2>Frequently Asked Questions</h2>
<h3>Do I need special hardware for FBR POS integration?</h3>
<p>No. A compliant POS runs on any Android phone, iPhone, tablet, or laptop. A thermal printer is optional — QR codes can be sent via WhatsApp or SMS.</p>
<h3>What happens if my internet goes down during billing?</h3>
<p>Transactions are stored locally during outages and automatically sync to FBR IRIS with correct original timestamps when connectivity returns.</p>
<h3>How long does the full setup take?</h3>
<p>A typical FBR IRIS setup — registration, API integration, tax rate configuration, and staff training — completes within 24 hours.</p>`;

  const faqs = [
    {
      question: `Do I need special hardware for ${input.keyword}?`,
      answer: "No. A compliant POS runs on any Android phone, iPhone, tablet, or laptop. No specialised POS terminals required.",
    },
    {
      question: "What happens if my internet goes down during billing?",
      answer: "Transactions are stored locally during outages and automatically sync to FBR IRIS with correct timestamps when connectivity returns.",
    },
    {
      question: "How long does FBR POS setup take?",
      answer: "A typical setup — IRIS registration, API integration, and staff training — completes within 24 hours.",
    },
    {
      question: "What are the FBR penalties for non-compliance?",
      answer: "Fines start at PKR 10,000 for a first offense and can reach PKR 1,000,000 for repeated violations, plus STRN suspension and forced closure.",
    },
    {
      question: "Is the integration officially FBR approved?",
      answer: "Compliant systems integrate directly with the FBR IRIS API using official endpoints. Every invoice carries a valid FBR QR code confirming submission.",
    },
  ];

  return { html, faqs };
}

export const fbrPosPack: NichePack = {
  id: "fbr-pos",
  name: "Phelix ERP",
  niche: "FBR POS Compliance Pakistan",
  country: "Pakistan",
  language: "en",
  baseUrl: "https://phelixerp.online",

  cities: ["karachi", "lahore", "islamabad", "rawalpindi", "faisalabad", "multan", "peshawar", "quetta", "sialkot", "gujranwala", "hyderabad", "bahawalpur", "sargodha"],
  industries: ["retail", "restaurant", "pharmacy", "clinic", "clothing store", "electronics shop", "grocery store", "hardware store", "bakery", "boutique", "supermarket", "hotel", "cafe", "textile", "shoe store", "jewelry shop", "cosmetics store", "medical store", "mobile phone shop", "auto parts shop", "wholesale distributor"],
  complianceTerms: ["FBR IRIS", "STRN", "SRO", "Tier-1 Retailer", "Sales Tax Act", "QR Invoice", "POS Terminal", "FBR IRIS Portal", "Sales Tax Return", "FBR API"],
  seedKeywords: ["fbr pos system", "fbr compliance", "fbr pos integration", "fbr invoice", "fbr registration", "fbr penalty", "fbr qr invoice", "fbr iris portal", "fbr sales tax", "fbr tier 1 retailer", "fbr e-invoicing", "pos system", "erp software", "strn registration", "fbr api integration", "fbr token expiry fix", "fbr offline sync pos", "fbr compliance checklist", "fbr sales tax return", "multi branch pos"],

  author: {
    name: "Phelix ERP Team",
    title: "FBR Compliance Specialists",
    bio: "The Phelix ERP team has helped 25+ Pakistani businesses across Karachi, Lahore, and Islamabad achieve FBR POS compliance. We specialise in IRIS integration, QR invoicing, and automated sales-tax workflows for retail, restaurants, and pharmacies.",
  },

  prompt: {
    persona: "an expert SEO strategist, content writer, and compliance specialist for Pakistan business tax, FBR POS systems, and ERP integrations",
    audience: "Pakistani business owners who must integrate with FBR's POS system",
    domainRules: [
      "MUST include real-world examples from Pakistani businesses (pharmacy, retail, restaurant, textile)",
      "MUST mention at least 2 Pakistani cities",
      "MUST include technical insights (API behaviour, token expiry, sync issues, FBR IRIS quirks)",
      "MUST include practical implementation steps with real tools",
      "MUST reference specific FBR rules and SROs",
    ],
    mustInclude: [
      "Mention FBR IRIS at least twice.",
      "Include at least one specific penalty amount in PKR.",
      "Include at least one technical API detail about FBR IRIS.",
    ],
    lsiTerms: ["IRIS", "STRN", "QR invoice", "SRO", "Tier-1", "POS terminal", "Sales Tax Act"],
    entityAllow: ["Federal Board of Revenue", "IRIS portal", "Sales Tax Act", "STRN", "Tier-1 retailer", "QR invoice", "POS terminal", "SRO 1006(I)/2019", "Inland Revenue Service", "Sales Tax Return"],
    entityDeny: [],
    internalTopics: ["FBR POS integration", "FBR compliance checklist", "FBR e-invoicing", "FBR IRIS portal"],
  },

  monetization: {
    mode: "leadgen",
    whatsapp: WA,
    ctaText: "Start Free WhatsApp Demo",
    ctaSubtext: "Our team handles the complete FBR IRIS setup. Free demo on WhatsApp — we respond in minutes.",
    toolHref: "/fbr-checker",
    toolText: "Check compliance score →",
  },

  thresholds: { minWordCount: 1200 },

  fallbackTopics: [
    { keyword: "FBR POS System for Pharmacies in Pakistan", slug: "fbr-pos-system-pharmacies-pakistan-2026", industry: "Pharmacy / Medical Retail", businessType: "pharmacy", keywords: ["pharmacy POS Pakistan", "FBR POS pharmacy Pakistan", "medical store POS FBR"], internalTopics: ["FBR POS integration", "FBR invoice validation API", "FBR compliance checklist"] },
    { keyword: "How to Generate FBR QR Invoices in Pakistan", slug: "generate-fbr-qr-invoices-pakistan", industry: "General Retail", businessType: "general", keywords: ["FBR QR invoice Pakistan", "QR invoice generator Pakistan", "FBR invoice QR code"], internalTopics: ["FBR POS integration", "FBR IRIS portal", "FBR e-invoicing"] },
    { keyword: "FBR POS System for Restaurants in Pakistan", slug: "fbr-pos-system-restaurants-pakistan-2026", industry: "Food & Beverage", businessType: "restaurant", keywords: ["restaurant POS Pakistan", "FBR POS restaurant", "food business FBR compliance Pakistan"], internalTopics: ["FBR POS integration", "FBR compliance checklist", "FBR e-invoicing"] },
    { keyword: "FBR Compliant POS System for Karachi Businesses", slug: "fbr-pos-system-karachi-businesses", industry: "Retail / General (Karachi)", businessType: "general", keywords: ["POS system Karachi", "FBR POS Karachi", "Karachi retail POS software"], internalTopics: ["FBR POS integration", "FBR IRIS portal", "FBR compliance checklist"] },
    { keyword: "FBR Compliant POS System for Lahore Retailers", slug: "fbr-pos-system-lahore-retailers-2026", industry: "Retail / General (Lahore)", businessType: "general", keywords: ["POS system Lahore", "FBR POS Lahore", "Lahore retail POS software"], internalTopics: ["FBR POS integration", "FBR IRIS portal", "FBR compliance checklist"] },
    { keyword: "How FBR POS Integration Simplifies Monthly Sales Tax Returns in Pakistan", slug: "fbr-pos-integration-monthly-sales-tax-returns-pakistan", industry: "General Business", businessType: "general", keywords: ["FBR sales tax return Pakistan", "monthly tax filing Pakistan", "FBR POS tax filing"], internalTopics: ["FBR POS integration", "FBR IRIS portal", "FBR e-invoicing"] },
    { keyword: "Retail Inventory Management with FBR POS System in Pakistan", slug: "retail-inventory-management-fbr-pos-pakistan", industry: "Retail", businessType: "retail", keywords: ["retail inventory management Pakistan", "inventory tracking Pakistan", "POS inventory system Pakistan"], internalTopics: ["FBR POS integration", "multi-branch POS", "FBR compliance checklist"] },
    { keyword: "FBR Compliance Checklist for Pakistani Businesses 2026", slug: "fbr-compliance-checklist-pakistan-businesses-2026", industry: "General Business", businessType: "general", keywords: ["FBR compliance checklist Pakistan", "FBR requirements 2026", "FBR compliance Pakistan business"], internalTopics: ["FBR POS integration", "FBR IRIS portal", "FBR e-invoicing"] },
    { keyword: "Multi-Branch POS System Pakistan with FBR Compliance", slug: "multi-branch-pos-system-pakistan-fbr-compliance", industry: "Retail Chains", businessType: "retail", keywords: ["multi branch POS Pakistan", "chain store POS Pakistan", "FBR POS multiple branches"], internalTopics: ["FBR POS integration", "retail inventory management", "FBR compliance checklist"] },
    { keyword: "Cloud-Based FBR POS System Benefits for Pakistani Businesses", slug: "cloud-fbr-pos-system-benefits-pakistan", industry: "General Business", businessType: "general", keywords: ["cloud POS Pakistan", "cloud based POS FBR Pakistan", "online POS system Pakistan"], internalTopics: ["FBR POS integration", "FBR IRIS portal", "multi-branch POS"] },
    { keyword: "FBR POS Compliance for Wholesale Distributors in Pakistan", slug: "fbr-pos-compliance-wholesale-distributors-pakistan", industry: "Wholesale / Distribution", businessType: "wholesale", keywords: ["wholesale POS Pakistan", "FBR distributor compliance", "wholesale FBR invoicing Pakistan"], internalTopics: ["FBR POS integration", "FBR e-invoicing", "FBR IRIS portal"] },
    { keyword: "FBR IRIS Portal Pakistan Complete Guide to POS Registration", slug: "fbr-iris-portal-pakistan-pos-registration-guide", industry: "General Business", businessType: "general", keywords: ["FBR IRIS portal Pakistan", "IRIS POS registration", "FBR IRIS integration guide"], internalTopics: ["FBR POS integration", "FBR e-invoicing", "FBR compliance checklist"] },
  ],

  buildTemplate,
};
