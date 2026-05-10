import type { Metadata } from "next";
import Link from "next/link";
import { getAllBlogs } from "@/lib/blogStore";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "FBR POS Blog — Pakistan POS & e-Invoicing Guides",
  description:
    "Expert guides on FBR POS compliance, e-invoicing setup, and POS software for Pakistan businesses. Updated daily with new articles.",
  keywords: [
    "FBR POS blog Pakistan",
    "FBR e-invoicing guide",
    "POS compliance Pakistan",
    "FBR POS news Pakistan",
    "how to use FBR POS system",
  ],
  openGraph: {
    title: "FBR POS Blog — Pakistan POS & e-Invoicing Guides",
    description:
      "Expert guides on FBR POS compliance, e-invoicing, and POS software for Pakistani businesses.",
    type: "website",
    url: "https://www.phelixerp.online/blog",
    images: [{ url: "/dashboard-screenshot.png", width: 1200, height: 630, alt: "Phelix ERP Blog" }],
  },
  alternates: { canonical: "https://www.phelixerp.online/blog" },
};

export const revalidate = 3600;

export default async function BlogPage() {
  const blogs = await getAllBlogs();

  const breadcrumb = breadcrumbSchema([
    { name: "Home", url: "/" },
    { name: "Blog", url: "/blog" },
  ]);

  return (
    <main className="min-h-screen bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold" style={{ color: "#F97316" }}>
            Phelix ERP
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/fbr-checker" className="text-sm text-gray-600 hover:text-gray-900 font-medium">
              FBR Checker
            </Link>
            <a
              href="https://wa.me/923118366981"
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

      {/* Breadcrumb visible */}
      <div className="max-w-6xl mx-auto px-6 pt-6 pb-0">
        <nav aria-label="breadcrumb" className="text-xs text-gray-400 flex items-center gap-1.5">
          <Link href="/" className="hover:text-gray-600">Home</Link>
          <span>›</span>
          <span className="text-gray-700 font-medium">Blog</span>
        </nav>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-10">
          <p className="text-sm font-semibold mb-2" style={{ color: "#F97316" }}>
            FBR POS Resources
          </p>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            FBR POS &amp; e-Invoicing Blog
          </h1>
          <p className="text-gray-500 max-w-2xl">
            Expert guides on FBR compliance, POS systems, and business automation
            for Pakistani businesses. New articles added daily.
          </p>
        </div>

        {/* FBR checker CTA banner */}
        <div
          className="rounded-xl p-5 mb-10 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: "#FFF7ED", border: "1px solid #FDBA74" }}
        >
          <div>
            <p className="font-bold text-gray-900">🔍 Free FBR Compliance Checker</p>
            <p className="text-sm text-gray-600">
              Not sure if your business is FBR compliant? Get your score in 60 seconds.
            </p>
          </div>
          <Link
            href="/fbr-checker"
            className="text-white px-5 py-2 rounded-lg font-semibold text-sm whitespace-nowrap no-underline"
            style={{ background: "#F97316" }}
          >
            Check Compliance →
          </Link>
        </div>

        {blogs.length === 0 ? (
          <p className="text-gray-500">No posts yet. Check back soon.</p>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {blogs.map((blog) => (
              <Link
                key={blog.slug}
                href={`/blog/${blog.slug}`}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow flex flex-col no-underline"
              >
                <p className="text-xs font-semibold mb-2" style={{ color: "#F97316" }}>
                  {new Date(blog.publishedAt).toLocaleDateString("en-PK", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}{" "}
                  . {blog.readTime} min read
                </p>
                <h2 className="text-lg font-bold text-gray-900 mb-3 line-clamp-2 flex-1">
                  {blog.title}
                </h2>
                <p className="text-gray-500 text-sm line-clamp-3 mb-4">
                  {blog.metaDescription}
                </p>
                <span className="text-sm font-semibold" style={{ color: "#F97316" }}>
                  Read more →
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Bottom CTA */}
        <div
          className="mt-16 rounded-2xl p-8 text-center text-white"
          style={{ background: "#F97316" }}
        >
          <h2 className="text-2xl font-bold mb-2">
            Ready to become FBR compliant?
          </h2>
          <p className="mb-6 opacity-90">
            Get Phelix ERP set up in 24 hours. Free demo on WhatsApp — we respond
            in minutes.
          </p>
          <a
            href="https://wa.me/923118366981"
            target="_blank"
            rel="noreferrer"
            className="inline-block bg-white font-bold px-8 py-3 rounded-xl hover:bg-gray-50 transition-colors no-underline"
            style={{ color: "#F97316" }}
          >
            Get Free Demo on WhatsApp
          </a>
        </div>
      </div>

      <footer className="border-t border-gray-200 mt-8 py-8 text-center text-sm text-gray-500">
        <p>© {new Date().getFullYear()} Phelix ERP . FBR-Compliant POS System Pakistan</p>
        <div className="flex gap-6 justify-center mt-3">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <Link href="/blog" className="hover:text-gray-700">Blog</Link>
          <Link href="/fbr-checker" className="hover:text-gray-700">FBR Checker</Link>
        </div>
      </footer>
    </main>
  );
}

