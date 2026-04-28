import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlogBySlug, getAllBlogs } from "@/lib/blogStore";
import { blogPostingSchema, breadcrumbSchema, faqSchema, LANDING_FAQS } from "@/lib/schema";
import { injectInternalLinks, getRelatedPosts } from "@/lib/internalLinks";

const BASE_URL = "https://phelixerp.vercel.app";
const WA_NUMBER = "923118366981";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const blog = await getBlogBySlug(slug);
  if (!blog) return { title: "Not Found" };
  return {
    title: blog.title,
    description: blog.metaDescription,
    keywords: blog.keywords,
    openGraph: {
      title: blog.title,
      description: blog.metaDescription,
      type: "article",
      publishedTime: blog.publishedAt,
      url: `${BASE_URL}/blog/${blog.slug}`,
      images: [
        {
          url: "/dashboard-screenshot.png",
          width: 1200,
          height: 630,
          alt: blog.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: blog.title,
      description: blog.metaDescription,
      images: ["/dashboard-screenshot.png"],
    },
    alternates: {
      canonical: `${BASE_URL}/blog/${blog.slug}`,
    },
  };
}

export async function generateStaticParams() {
  const blogs = await getAllBlogs();
  return blogs.map((b) => ({ slug: b.slug }));
}

export const revalidate = 3600;

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const [blog, allBlogs] = await Promise.all([
    getBlogBySlug(slug),
    getAllBlogs(),
  ]);
  if (!blog) notFound();

  const pageUrl = `${BASE_URL}/blog/${blog.slug}`;
  const enrichedContent = injectInternalLinks(blog.content, blog.slug);
  const relatedPosts = getRelatedPosts(blog.slug, allBlogs, 3);
  const shareText = `I just read: "${blog.title}" – Check out this FBR compliance guide for Pakistani businesses: ${pageUrl}`;
  const waShareHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const blogSchema  = blogPostingSchema(blog, pageUrl);
  const faqLd      = faqSchema(LANDING_FAQS);
  const breadcrumb  = breadcrumbSchema([
    { name: "Home", url: "/" },
    { name: "Blog", url: "/blog" },
    { name: blog.title, url: `/blog/${blog.slug}` },
  ]);

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      <nav className="border-b border-gray-200 px-6 py-4 bg-white sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold" style={{ color: "#F97316" }}>
            Phelix ERP
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/blog" className="text-sm text-gray-600 hover:text-gray-900">
              Blog
            </Link>
            <Link href="/fbr-checker" className="text-sm text-gray-600 hover:text-gray-900">
              FBR Checker
            </Link>
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

      <article className="max-w-4xl mx-auto px-6 py-12">
        {/* Breadcrumb */}
        <nav aria-label="breadcrumb" className="text-xs text-gray-400 flex items-center gap-1.5 mb-6">
          <Link href="/" className="hover:text-gray-600">Home</Link>
          <span>›</span>
          <Link href="/blog" className="hover:text-gray-600">Blog</Link>
          <span>›</span>
          <span className="text-gray-700 font-medium line-clamp-1">{blog.title}</span>
        </nav>

        <div className="mb-8">
          <p className="text-sm font-semibold mt-1 mb-3" style={{ color: "#F97316" }}>
            {new Date(blog.publishedAt).toLocaleDateString("en-PK", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            · {blog.readTime} min read
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight">
            {blog.title}
          </h1>
          <p className="text-lg text-gray-500 leading-relaxed">{blog.metaDescription}</p>
        </div>

        {/* Top urgency CTA */}
        <div
          className="rounded-xl p-6 mb-10 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: "#FFF7ED", border: "1px solid #FDBA74" }}
        >
          <div>
            <p className="font-bold text-gray-900">
              ⚠️ FBR compliance is mandatory in Pakistan
            </p>
            <p className="text-sm text-gray-600">
              Get Phelix ERP set up in 24 hours — free WhatsApp demo, no commitment.
            </p>
          </div>
          <a
            href={`https://wa.me/${WA_NUMBER}`}
            target="_blank"
            rel="noreferrer"
            className="text-white px-5 py-2 rounded-lg font-semibold text-sm whitespace-nowrap"
            style={{ background: "#25D366" }}
          >
            WhatsApp Free Demo
          </a>
        </div>

        {/* Blog content with injected internal links */}
        <div
          className="prose prose-gray max-w-none prose-headings:text-gray-900 prose-headings:font-bold prose-h2:text-2xl prose-h3:text-xl prose-p:text-gray-700 prose-p:leading-relaxed prose-li:text-gray-700 prose-a:text-orange-500"
          dangerouslySetInnerHTML={{ __html: enrichedContent }}
        />

        {/* Share bar */}
        <div className="mt-10 flex items-center justify-between flex-wrap gap-4 py-5 border-t border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">
            Found this useful? Share it with a fellow business owner:
          </p>
          <a
            href={waShareHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
            style={{ background: "#25D366" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            Share on WhatsApp
          </a>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 bg-gray-900 rounded-2xl p-8 text-center text-white">
          <h2 className="text-2xl font-bold mb-2">Get FBR Compliant Today</h2>
          <p className="mb-6 text-gray-300">
            Phelix ERP handles all FBR POS requirements. Setup in 24 hours. No
            technical skills needed.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a
              href={`https://wa.me/${WA_NUMBER}`}
              target="_blank"
              rel="noreferrer"
              className="font-bold px-8 py-3 rounded-xl transition-colors text-white"
              style={{ background: "#25D366" }}
            >
              WhatsApp Free Demo
            </a>
            <Link
              href="/fbr-checker"
              className="font-bold px-8 py-3 rounded-xl transition-colors text-white no-underline"
              style={{ background: "#F97316" }}
            >
              Check FBR Compliance Score
            </Link>
          </div>
        </div>

        {/* Related posts */}
        {relatedPosts.length > 0 && (
          <div className="mt-14">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              Related FBR Guides
            </h2>
            <div className="grid gap-5 md:grid-cols-3">
              {relatedPosts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow no-underline flex flex-col"
                >
                  <p className="text-xs font-semibold mb-2" style={{ color: "#F97316" }}>
                    {post.readTime} min read
                  </p>
                  <h3 className="text-sm font-bold text-gray-900 line-clamp-2 mb-2 flex-1">
                    {post.title}
                  </h3>
                  <span className="text-xs font-semibold" style={{ color: "#F97316" }}>
                    Read more →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>

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
