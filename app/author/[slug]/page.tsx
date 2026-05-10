/**
 * /author/[slug] — Named author profile page
 *
 * Improves Google E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness).
 * The Article schema on every blog post links here as the @type:Person author URL.
 *
 * Example URL: /author/phelix-erp-team
 *
 * Static — no database calls needed. Author data comes from env vars via siteConfig.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getAllBlogs } from "@/lib/blogStore";

const BASE_URL   = process.env.NEXT_PUBLIC_SITE_URL ?? "https://phelixerp.online";
const WA_NUMBER  = "923118366981";
const AUTHOR_NAME  = process.env.SITE_AUTHOR_NAME  ?? "Phelix ERP Team";
const AUTHOR_TITLE = process.env.SITE_AUTHOR_TITLE ?? "FBR Compliance Specialists";
const AUTHOR_BIO   = process.env.SITE_AUTHOR_BIO   ??
  "The Phelix ERP team has helped 20+ Pakistani businesses across Karachi, Lahore, and Islamabad achieve FBR POS compliance. We specialise in IRIS integration, QR invoicing, and automated sales-tax workflows for retail, restaurants, and pharmacies.";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  const slug = (AUTHOR_NAME).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return [{ slug }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  void slug;
  const title       = `${AUTHOR_NAME} — FBR POS Compliance Experts | Phelix ERP`;
  const description = `${AUTHOR_NAME} — ${AUTHOR_TITLE}. ${AUTHOR_BIO.slice(0, 120)}...`;
  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/author/${slug}` },
    openGraph:  { title, description, type: "profile" },
  };
}

export const revalidate = 86400; // refresh once per day

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params;
  void slug;

  // Get all blogs attributed to this author
  const allBlogs = await getAllBlogs();
  const authorBlogs = allBlogs
    .filter((b) => !b.authorName || b.authorName === AUTHOR_NAME)
    .slice(0, 9); // show latest 9

  const authorSchema = {
    "@context": "https://schema.org",
    "@type":    "Person",
    name:       AUTHOR_NAME,
    jobTitle:   AUTHOR_TITLE,
    description: AUTHOR_BIO,
    url:        `${BASE_URL}/author/${slug}`,
    worksFor:   { "@type": "Organization", name: "Phelix ERP", url: BASE_URL },
    knowsAbout: [
      "FBR POS Compliance",
      "FBR IRIS Integration",
      "Pakistan Sales Tax",
      "QR Invoice Generation",
      "POS Systems Pakistan",
      "ERP Software",
    ],
  };

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(authorSchema) }}
      />

      {/* Nav */}
      <nav className="border-b border-gray-200 px-6 py-4 bg-white sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold" style={{ color: "#F97316" }}>
            Phelix ERP
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/blog" className="text-sm text-gray-600 hover:text-gray-900">Blog</Link>
            <a
              href={`https://wa.me/${WA_NUMBER}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-white px-4 py-2 rounded-lg"
              style={{ background: "#25D366" }}
            >
              WhatsApp Demo
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-14">
        {/* Author card */}
        <div className="flex items-start gap-6 mb-10">
          {/* Avatar */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold shrink-0"
            style={{ background: "#F97316" }}
          >
            {AUTHOR_NAME.charAt(0).toUpperCase()}
          </div>

          <div>
            <h1 className="text-3xl font-bold text-gray-900">{AUTHOR_NAME}</h1>
            <p className="text-base font-semibold mt-1" style={{ color: "#F97316" }}>
              {AUTHOR_TITLE}
            </p>
            <p className="text-gray-600 mt-3 leading-relaxed max-w-2xl">{AUTHOR_BIO}</p>

            {/* Expertise tags */}
            <div className="flex flex-wrap gap-2 mt-4">
              {[
                "FBR POS Compliance",
                "IRIS Integration",
                "QR Invoicing",
                "Sales Tax Pakistan",
                "ERP Software",
                "Retail & Restaurant POS",
              ].map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-semibold px-3 py-1 rounded-full"
                  style={{ background: "#FFF7ED", color: "#EA580C" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Credentials strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { label: "Businesses Helped",  value: "20+" },
            { label: "Cities Covered",     value: "13"  },
            { label: "FBR Integrations",   value: "100%" },
            { label: "Setup Time",         value: "24h" },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl p-4 text-center"
              style={{ background: "#FFF7ED", border: "1px solid #FDBA74" }}
            >
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-600 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Published articles */}
        {authorBlogs.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              FBR Compliance Guides by {AUTHOR_NAME}
            </h2>
            <div className="grid gap-5 md:grid-cols-3">
              {authorBlogs.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col no-underline"
                >
                  <p className="text-xs font-semibold mb-2" style={{ color: "#F97316" }}>
                    {post.readTime} min read ·{" "}
                    {new Date(post.publishedAt).toLocaleDateString("en-PK", {
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <h3 className="text-sm font-bold text-gray-900 line-clamp-2 mb-2 flex-1">
                    {post.title}
                  </h3>
                  <span className="text-xs font-semibold" style={{ color: "#F97316" }}>
                    Read guide →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-14 bg-gray-900 rounded-2xl p-8 text-center text-white">
          <h2 className="text-2xl font-bold mb-2">Talk to Our FBR Compliance Team</h2>
          <p className="mb-6 text-gray-300">
            Get your business FBR-compliant in 24 hours. Free WhatsApp consultation — no commitment.
          </p>
          <a
            href={`https://wa.me/${WA_NUMBER}`}
            target="_blank"
            rel="noreferrer"
            className="inline-block font-bold px-8 py-3 rounded-xl text-white"
            style={{ background: "#25D366" }}
          >
            WhatsApp Free Demo
          </a>
        </div>
      </div>

      <footer className="border-t border-gray-200 mt-16 py-8 text-center text-sm text-gray-500">
        <p>© {new Date().getFullYear()} Phelix ERP · FBR-Compliant POS System Pakistan</p>
        <div className="flex gap-6 justify-center mt-3">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <Link href="/blog" className="hover:text-gray-700">Blog</Link>
          <Link href="/fbr-checker" className="hover:text-gray-700">FBR Checker</Link>
        </div>
      </footer>
    </main>
  );
}
