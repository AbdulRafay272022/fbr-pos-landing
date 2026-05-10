import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllBlogs } from "@/lib/blogStore";
import { getSiteConfig } from "@/lib/agent/siteConfig";

const BASE_URL  = "https://www.phelixerp.online";
const WA_NUMBER = "923118366981";

interface Props {
  params: Promise<{ slug: string }>;
}

// Author database — extend by adding entries
const AUTHORS: Record<string, {
  slug:        string;
  name:        string;
  title:       string;
  bio:         string;
  longBio:     string;
  expertise:   string[];
  yearsExperience: number;
  email?:      string;
  linkedin?:   string;
  imageUrl?:   string;
}> = {
  "phelix-erp-team": {
    slug:        "phelix-erp-team",
    name:        "Phelix ERP Team",
    title:       "FBR Compliance Specialists",
    bio:         "The Phelix ERP team has helped 25+ Pakistani businesses across Karachi, Lahore, and Islamabad achieve FBR POS compliance.",
    longBio:     "Our team specialises in FBR IRIS integration, QR invoicing, and automated sales-tax workflows for retail, restaurants, and pharmacies. Combined experience across compliance, software engineering, and Pakistani SME consulting.",
    expertise:   [
      "FBR IRIS API integration",
      "POS systems for retail",
      "QR invoice generation",
      "Sales tax automation",
      "Multi-branch ERP deployment",
      "FBR compliance for pharmacies",
      "Restaurant POS workflows",
    ],
    yearsExperience: 8,
    email:    "team@phelixerp.online",
    linkedin: "https://www.linkedin.com/company/phelix-erp",
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const author = AUTHORS[slug];
  if (!author) return { title: "Author Not Found" };

  return {
    title: `${author.name} — ${author.title}`,
    description: author.bio,
    alternates: { canonical: `${BASE_URL}/authors/${author.slug}` },
    openGraph: {
      title: `${author.name} — ${author.title}`,
      description: author.bio,
      url: `${BASE_URL}/authors/${author.slug}`,
      type: "profile",
    },
  };
}

export async function generateStaticParams() {
  return Object.keys(AUTHORS).map((slug) => ({ slug }));
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params;
  const author = AUTHORS[slug];
  if (!author) notFound();

  const config = getSiteConfig();
  const allBlogs = await getAllBlogs();
  const authorBlogs = allBlogs.filter(
    (b) => (b.authorName ?? "").toLowerCase().replace(/\s+/g, "-") === author.slug ||
           (b.authorName ?? "Phelix ERP Team") === author.name
  );

  // schema.org Person + author articles
  const personSchema = {
    "@context": "https://schema.org",
    "@type":    "Person",
    name:        author.name,
    jobTitle:    author.title,
    description: author.longBio,
    url:         `${BASE_URL}/authors/${author.slug}`,
    knowsAbout:  author.expertise,
    worksFor: {
      "@type": "Organization",
      name:    config.name,
      url:     BASE_URL,
    },
    ...(author.email    ? { email: author.email } : {}),
    ...(author.linkedin ? { sameAs: [author.linkedin] } : {}),
  };

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />

      {/* Nav */}
      <nav className="border-b border-gray-200 px-6 py-4 bg-white sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold" style={{ color: "#F97316" }}>
            {config.name}
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/blog" className="text-sm text-gray-600 hover:text-gray-900">Blog</Link>
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

      <article className="max-w-4xl mx-auto px-6 py-12">
        {/* Breadcrumb */}
        <nav className="text-xs text-gray-400 flex items-center gap-1.5 mb-6">
          <Link href="/" className="hover:text-gray-600">Home</Link>
          <span>›</span>
          <Link href="/about" className="hover:text-gray-600">About</Link>
          <span>›</span>
          <span className="text-gray-700 font-medium">{author.name}</span>
        </nav>

        {/* Author header */}
        <header className="flex items-start gap-6 mb-10 pb-10 border-b border-gray-100">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold shrink-0"
            style={{ background: "#F97316" }}
          >
            {author.name.charAt(0)}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{author.name}</h1>
            <p className="text-lg font-semibold mb-3" style={{ color: "#F97316" }}>
              {author.title}
            </p>
            <p className="text-gray-600 leading-relaxed">{author.longBio}</p>
            <div className="flex gap-3 mt-4">
              {author.linkedin && (
                <a
                  href={author.linkedin}
                  target="_blank" rel="noreferrer"
                  className="text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  LinkedIn
                </a>
              )}
              {author.email && (
                <a
                  href={`mailto:${author.email}`}
                  className="text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  Email
                </a>
              )}
            </div>
          </div>
        </header>

        {/* Expertise */}
        <section className="mb-10">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Areas of Expertise</h2>
          <div className="flex flex-wrap gap-2">
            {author.expertise.map((e) => (
              <span
                key={e}
                className="px-3 py-1.5 bg-orange-50 text-orange-700 text-sm font-medium rounded-full border border-orange-100"
              >
                {e}
              </span>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-4">
            {author.yearsExperience}+ years of combined experience.
          </p>
        </section>

        {/* Author's articles */}
        {authorBlogs.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Articles by {author.name} ({authorBlogs.length})
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {authorBlogs.slice(0, 12).map((blog) => (
                <Link
                  key={blog.slug}
                  href={`/blog/${blog.slug}`}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow no-underline"
                >
                  <p className="text-xs font-semibold mb-1.5" style={{ color: "#F97316" }}>
                    {new Date(blog.publishedAt).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })} · {blog.readTime} min
                  </p>
                  <h3 className="text-sm font-bold text-gray-900 line-clamp-2">
                    {blog.title}
                  </h3>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Trust block */}
        <section className="bg-gray-900 rounded-2xl p-8 text-white mt-12">
          <h2 className="text-2xl font-bold mb-2">Work with {author.name}</h2>
          <p className="text-gray-300 mb-6">
            Get expert help with {config.niche} — direct access, no middlemen.
          </p>
          <a
            href={`https://wa.me/${WA_NUMBER}`}
            target="_blank" rel="noreferrer"
            className="inline-block font-bold px-8 py-3 rounded-xl text-white"
            style={{ background: "#25D366" }}
          >
            WhatsApp Free Demo
          </a>
        </section>
      </article>
    </main>
  );
}
