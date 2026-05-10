import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Privacy Policy — Phelix ERP",
  description: "Privacy Policy for Phelix ERP FBR POS system. How we collect, use, and protect your data in compliance with Pakistan's data protection standards.",
  alternates: { canonical: "https://phelixerp.online/privacy" },
};

const LAST_UPDATED = "May 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* NAV */}
      <nav className="border-b border-gray-100 px-6 md:px-10 py-4 flex items-center justify-between">
        <Link href="/">
          <Image src="/phelix-logo.png" alt="Phelix ERP" width={140} height={42} className="h-10 w-auto" />
        </Link>
        <Link href="/contact" className="text-sm text-gray-500 hover:text-gray-900 no-underline">
          Contact
        </Link>
      </nav>

      {/* CONTENT */}
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-extrabold text-[#1A1D27] mb-3">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed space-y-8">

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">1. Who We Are</h2>
            <p>
              Phelix ERP (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is a Pakistan-based software company
              providing FBR-compliant POS and e-invoicing software. Our website is
              <strong> phelixerp.online</strong>. This Privacy Policy explains how we
              collect and use information when you use our website or contact us.
            </p>
            <p className="mt-3">
              For questions about this policy, contact us at:{" "}
              <a href="https://wa.me/923118366981" className="text-[#F97316] no-underline hover:underline">
                WhatsApp +92 311 836 6981
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">2. Information We Collect</h2>
            <h3 className="font-semibold text-[#1A1D27] mb-2">Information you provide directly</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your name, business name, city, and phone number when you contact us via WhatsApp or our contact form</li>
              <li>Your FBR STRN number and business details when you onboard as a client</li>
              <li>Any information you share with us during demos or support sessions</li>
            </ul>
            <h3 className="font-semibold text-[#1A1D27] mb-2 mt-4">Information collected automatically</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Pages visited on our website and time spent on each page</li>
              <li>Approximate location (city-level only, via IP address)</li>
              <li>Device type and browser type for analytics purposes</li>
              <li>Referring website (how you found us)</li>
            </ul>
            <p className="mt-3">
              We use Vercel Analytics for website analytics. Vercel Analytics does not use
              cookies and does not track visitors across sites.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To respond to your enquiries and provide demos</li>
              <li>To set up and support your Phelix ERP account and FBR IRIS integration</li>
              <li>To send you important updates about FBR compliance requirements or system changes</li>
              <li>To improve our website and services based on usage patterns</li>
              <li>To comply with our legal obligations under Pakistani law</li>
            </ul>
            <p className="mt-3">
              We do not sell your personal information to third parties. We do not use your
              data for advertising.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">4. FBR Invoice Data</h2>
            <p>
              When you use Phelix ERP, your invoice data is submitted to FBR IRIS as
              required by Pakistan&apos;s Sales Tax Act. This data — including product details,
              prices, and tax amounts — is shared with FBR as part of mandatory compliance.
              We process this data only as directed by you (our client) and in accordance
              with FBR&apos;s technical requirements.
            </p>
            <p className="mt-3">
              Invoice data is stored on our servers and on FBR IRIS. We retain invoice
              records for a minimum of 5 years as required by Pakistani tax law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">5. Data Security</h2>
            <p>
              We use industry-standard security measures to protect your data:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>All data transmitted between your system and our servers uses HTTPS encryption</li>
              <li>FBR API credentials are stored in encrypted form</li>
              <li>Access to client data is restricted to authorised Phelix ERP personnel only</li>
              <li>We do not store your FBR IRIS login password — we use token-based API authentication</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">6. Third-Party Services</h2>
            <p>We use the following third-party services:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Vercel</strong> — website hosting (privacy policy: vercel.com/legal/privacy-policy)</li>
              <li><strong>FBR IRIS</strong> — mandatory government e-invoicing portal</li>
              <li><strong>WhatsApp Business</strong> — customer communication</li>
              <li><strong>Facebook</strong> — business page and social presence</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">7. Cookies</h2>
            <p>
              Our website uses minimal cookies. We use session cookies required for the
              website to function. We do not use advertising cookies or tracking cookies
              from third-party ad networks.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">8. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Request a copy of the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data (subject to our legal retention obligations)</li>
              <li>Withdraw consent for marketing communications at any time</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us on{" "}
              <a href="https://wa.me/923118366981" className="text-[#F97316] no-underline hover:underline">
                WhatsApp +92 311 836 6981
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we will
              update the &quot;Last updated&quot; date at the top of this page. Continued use of our
              website after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">10. Contact Us</h2>
            <p>For any privacy-related questions or requests:</p>
            <div className="mt-3 bg-[#F8F9FC] rounded-xl p-5 space-y-2 text-sm">
              <div><strong>Phelix ERP</strong></div>
              <div>Pakistan</div>
              <div>
                WhatsApp:{" "}
                <a href="https://wa.me/923118366981" className="text-[#F97316] no-underline">
                  +92 311 836 6981
                </a>
              </div>
              <div>
                Facebook:{" "}
                <a
                  href="https://www.facebook.com/profile.php?id=61589076186268"
                  className="text-[#F97316] no-underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Phelix ERP on Facebook
                </a>
              </div>
            </div>
          </section>

        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-gray-100 px-6 py-6 text-center">
        <div className="flex flex-wrap gap-4 justify-center text-xs text-gray-400 mb-3">
          <Link href="/" className="hover:text-gray-700 no-underline">Home</Link>
          <Link href="/about" className="hover:text-gray-700 no-underline">About</Link>
          <Link href="/contact" className="hover:text-gray-700 no-underline">Contact</Link>
          <Link href="/privacy" className="hover:text-gray-700 no-underline">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-gray-700 no-underline">Terms</Link>
          <Link href="/blog" className="hover:text-gray-700 no-underline">Blog</Link>
        </div>
        <p className="text-xs text-gray-400">© 2026 Phelix ERP · Pakistan</p>
      </footer>

    </div>
  );
}
