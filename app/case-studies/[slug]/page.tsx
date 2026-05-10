import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CASE_STUDIES } from "../page";
import { getSiteConfig } from "@/lib/agent/siteConfig";

const BASE_URL  = "https://phelixerp.online";
const WA_NUMBER = "923118366981";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cs = CASE_STUDIES.find((c) => c.slug === slug);
  if (!cs) return { title: "Not Found" };

  return {
    title: `${cs.business} — ${cs.industry} Case Study (${cs.city})`,
    description: `${cs.challenge.slice(0, 110)} See how Phelix ERP solved it in ${cs.timeframe}.`,
    alternates: { canonical: `${BASE_URL}/case-studies/${cs.slug}` },
    openGraph: {
      title: `${cs.business} — Phelix ERP Case Study`,
      description: cs.result,
      type:  "article",
      url:   `${BASE_URL}/case-studies/${cs.slug}`,
    },
  };
}

export async function generateStaticParams() {
  return CASE_STUDIES.map((cs) => ({ slug: cs.slug }));
}

export default async function CaseStudyPage({ params }: Props) {
  const { slug } = await params;
  const cs = CASE_STUDIES.find((c) => c.slug === slug);
  if (!cs) notFound();

  const config = getSiteConfig();

  // schema.org Article + Review hybrid
  const articleSchema = {
    "@context": "https://schema.org",
    "@type":    "Article",
    headline:    `${cs.business} — ${cs.industry} Case Study`,
    description: cs.result,
    datePublished: cs.publishedAt,
    author: {
      "@type": "Organization",
      name:    config.name,
      url:     BASE_URL,
    },
    publisher: {
      "@type": "Organization",
      name:    config.name,
      url:     BASE_URL,
      logo: {
        "@type": "ImageObject",
        url:     `${BASE_URL}/phelix-logo.png`,
      },
    },
    mainEntityOfPage: `${BASE_URL}/case-studies/${cs.slug}`,
    about: {
      "@type": "Service",
      name:    config.niche,
      areaServed: { "@type": "Country", name: config.country },
    },
  };

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />

      <nav className="border-b border-gray-200 px-6 py-4 bg-white sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold" style={{ color: "#F97316" }}>
            {config.name}
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/blog"          className="text-sm text-gray-600 hover:text-gray-900">Blog</Link>
            <Link href="/case-studies"  className="text-sm text-gray-600 hover:text-gray-900">Case Studies</Link>
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

      <article className="max-w-4xl mx-auto px-6 py-12">
        <nav className="text-xs text-gray-400 flex items-center gap-1.5 mb-6">
          <Link href="/" className="hover:text-gray-600">Home</Link>
          <span>›</span>
          <Link href="/case-studies" className="hover:text-gray-600">Case Studies</Link>
          <span>›</span>
          <span className="text-gray-700 font-medium line-clamp-1">{cs.business}</span>
        </nav>

        <header className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded" style={{ background: "#FED7AA", color: "#9A3412" }}>
              {cs.industry}
            </span>
            <span className="text-xs text-gray-500">{cs.city}, {config.country}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500">Setup: {cs.timeframe}</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4 leading-tight">
            {cs.business}
          </h1>
          <p className="text-lg text-gray-500">{cs.result}</p>
        </header>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-4 mb-12 p-6 rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100">
          {cs.metrics.map((m) => (
            <div key={m.label} className="text-center">
              <p className="text-3xl font-bold mb-1" style={{ color: "#F97316" }}>{m.value}</p>
              <p className="text-sm text-gray-600">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Challenge */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">The Challenge</h2>
          <p className="text-gray-700 leading-relaxed text-lg">{cs.challenge}</p>
        </section>

        {/* Solution */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">The Solution</h2>
          <p className="text-gray-700 leading-relaxed text-lg">{cs.solution}</p>
        </section>

        {/* Result */}
        <section className="mb-10 bg-gray-50 rounded-2xl p-6 border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">The Result</h2>
          <p className="text-gray-700 leading-relaxed text-lg">{cs.result}</p>
        </section>

        {/* CTA */}
        <div className="mt-12 bg-gray-900 rounded-2xl p-8 text-white text-center">
          <h2 className="text-2xl font-bold mb-2">Want Similar Results?</h2>
          <p className="text-gray-300 mb-6">
            {config.name} can have your {cs.industry.toLowerCase()} FBR-compliant in {cs.timeframe}.
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

        {/* Other case studies */}
        <section className="mt-16">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Other Customer Stories</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {CASE_STUDIES.filter((c) => c.slug !== cs.slug).slice(0, 2).map((other) => (
              <Link
                key={other.slug}
                href={`/case-studies/${other.slug}`}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md no-underline"
              >
                <p className="text-xs font-semibold mb-2" style={{ color: "#F97316" }}>
                  {other.industry} · {other.city}
                </p>
                <h3 className="text-base font-bold text-gray-900 mb-1">{other.business}</h3>
                <p className="text-sm text-gray-600 line-clamp-2">{other.result}</p>
              </Link>
            ))}
          </div>
        </section>
      </article>
    </main>
  );
}
