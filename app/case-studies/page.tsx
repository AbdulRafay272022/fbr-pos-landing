import type { Metadata } from "next";
import Link from "next/link";
import { getSiteConfig } from "@/lib/agent/siteConfig";

const BASE_URL  = "https://phelixerp.online";
const WA_NUMBER = "923118366981";

export const metadata: Metadata = {
  title: "Customer Case Studies — Phelix ERP",
  description: "Real Pakistani businesses using Phelix ERP for FBR POS compliance — pharmacy, retail, restaurant. See results, savings, and timelines.",
  alternates: { canonical: `${BASE_URL}/case-studies` },
};

// Case study database — extend by adding entries
export const CASE_STUDIES = [
  {
    slug:      "lahore-pharmacy-fbr-compliance",
    business:  "Gulberg Pharmacy",
    industry:  "Pharmacy",
    city:      "Lahore",
    timeframe: "24 hours",
    challenge: "Manual sales tax filing took 2-3 days every month. FBR-compliant POS integration required.",
    solution:  "Deployed Phelix ERP with FBR IRIS integration, QR invoicing, and offline sync.",
    result:    "Monthly tax filing reduced from 2 days to 30 minutes. 8% revenue uplift from eliminated cash leakage.",
    metrics: [
      { label: "Setup time",      value: "24 hours" },
      { label: "Tax filing time", value: "-95%" },
      { label: "Revenue impact",  value: "+8%" },
    ],
    publishedAt: "2026-02-15",
  },
  {
    slug:      "karachi-retail-multi-branch",
    business:  "Saddar Retail Chain",
    industry:  "Multi-Branch Retail",
    city:      "Karachi",
    timeframe: "3 days",
    challenge: "5-branch retail chain needed unified POS with FBR compliance per location.",
    solution:  "Multi-branch Phelix deployment with centralized inventory and per-branch FBR integration.",
    result:    "All 5 branches FBR-compliant. Consolidated reporting saves 12 hours/week of accounting work.",
    metrics: [
      { label: "Branches integrated", value: "5" },
      { label: "Accounting time saved", value: "12 hrs/week" },
      { label: "FBR audit risk",     value: "Eliminated" },
    ],
    publishedAt: "2026-03-10",
  },
  {
    slug:      "islamabad-restaurant-pos",
    business:  "F-7 Bistro",
    industry:  "Restaurant",
    city:      "Islamabad",
    timeframe: "48 hours",
    challenge: "Restaurant required FBR compliance + table management + delivery integration.",
    solution:  "Phelix ERP with restaurant module: KDS, split bills, delivery integration, FBR QR per order.",
    result:    "Order errors down 40%. Tax compliance automated. Customer wait time reduced 25%.",
    metrics: [
      { label: "Order errors",     value: "-40%" },
      { label: "Wait time",        value: "-25%" },
      { label: "FBR submissions",  value: "100% automated" },
    ],
    publishedAt: "2026-04-02",
  },
];

export default function CaseStudiesPage() {
  const config = getSiteConfig();

  // ItemList schema for case studies
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: CASE_STUDIES.map((cs, idx) => ({
      "@type":   "ListItem",
      position:  idx + 1,
      url:       `${BASE_URL}/case-studies/${cs.slug}`,
      name:      `${cs.business} — ${cs.industry} (${cs.city})`,
    })),
  };

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />

      <nav className="border-b border-gray-200 px-6 py-4 bg-white sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold" style={{ color: "#F97316" }}>
            {config.name}
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/blog"  className="text-sm text-gray-600 hover:text-gray-900">Blog</Link>
            <Link href="/about" className="text-sm text-gray-600 hover:text-gray-900">About</Link>
            <a
              href={`https://wa.me/${WA_NUMBER}`}
              target="_blank" rel="noreferrer"
              className="text-sm font-semibold text-white px-4 py-2 rounded-lg"
              style={{ background: "#25D366" }}
            >
              WhatsApp Demo
            </a>
          </div>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto px-6 py-12">
        <nav className="text-xs text-gray-400 flex items-center gap-1.5 mb-6">
          <Link href="/" className="hover:text-gray-600">Home</Link>
          <span>›</span>
          <span className="text-gray-700 font-medium">Case Studies</span>
        </nav>

        <h1 className="text-4xl font-bold text-gray-900 mb-3">Customer Case Studies</h1>
        <p className="text-lg text-gray-500 mb-10 max-w-2xl">
          Real Pakistani businesses using {config.name}. Setup times, results, and what changed.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {CASE_STUDIES.map((cs) => (
            <Link
              key={cs.slug}
              href={`/case-studies/${cs.slug}`}
              className="bg-gradient-to-br from-orange-50 to-white border border-gray-200 rounded-2xl p-6 hover:shadow-lg transition-shadow no-underline"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded" style={{ background: "#FED7AA", color: "#9A3412" }}>
                  {cs.industry}
                </span>
                <span className="text-xs text-gray-500">{cs.city}</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">{cs.business}</h2>
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">{cs.challenge}</p>
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-orange-100">
                {cs.metrics.map((m) => (
                  <div key={m.label}>
                    <p className="text-lg font-bold" style={{ color: "#F97316" }}>{m.value}</p>
                    <p className="text-xs text-gray-500">{m.label}</p>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-16 bg-gray-900 rounded-2xl p-8 text-white text-center">
          <h2 className="text-2xl font-bold mb-2">Become Our Next Case Study</h2>
          <p className="text-gray-300 mb-6">
            Join 25+ Pakistani businesses using {config.name} for FBR compliance.
          </p>
          <a
            href={`https://wa.me/${WA_NUMBER}`}
            target="_blank" rel="noreferrer"
            className="inline-block font-bold px-8 py-3 rounded-xl text-white"
            style={{ background: "#25D366" }}
          >
            Start Free WhatsApp Demo
          </a>
        </div>
      </section>
    </main>
  );
}
