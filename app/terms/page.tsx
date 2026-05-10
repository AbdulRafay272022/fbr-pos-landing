import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Terms of Service — Phelix ERP",
  description: "Terms of Service for Phelix ERP FBR POS system. Usage terms, service scope, payment, and liability for Pakistan-based clients.",
  alternates: { canonical: "https://phelixerp.vercel.app/terms" },
};

const LAST_UPDATED = "May 2026";

export default function TermsPage() {
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
        <h1 className="text-3xl font-extrabold text-[#1A1D27] mb-3">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed space-y-8">

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">1. Agreement to Terms</h2>
            <p>
              By accessing or using Phelix ERP software, website, or any related services
              (&quot;Services&quot;), you agree to be bound by these Terms of Service. If you
              do not agree to these terms, do not use our Services.
            </p>
            <p className="mt-3">
              These Terms constitute a legally binding agreement between you (&quot;Client&quot;,
              &quot;you&quot;) and Phelix ERP (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;),
              a software company registered in Pakistan.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">2. Description of Services</h2>
            <p>Phelix ERP provides:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>FBR-compliant POS (Point of Sale) software for Pakistani businesses</li>
              <li>Real-time e-invoice submission to FBR IRIS (Pakistan Revenue Authority portal)</li>
              <li>QR code invoice generation as required under Pakistan&apos;s Sales Tax Act</li>
              <li>Inventory management, sales reporting, and multi-branch management tools</li>
              <li>Setup, onboarding, and ongoing technical support</li>
            </ul>
            <p className="mt-3">
              Our Services are designed for businesses operating as Tier-1 retailers or
              any business required by FBR to integrate a certified POS system.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">3. Client Responsibilities</h2>
            <p>As a client, you are responsible for:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Providing accurate business information including your STRN and FBR IRIS credentials for integration</li>
              <li>Ensuring your business is registered with FBR as required by Pakistani tax law</li>
              <li>Accurately entering product details, prices, HS codes, and UOM (Unit of Measure) into the system</li>
              <li>Reviewing invoices before or promptly after submission to FBR IRIS</li>
              <li>Keeping your login credentials secure and notifying us immediately of any unauthorised access</li>
              <li>Maintaining a stable internet connection for real-time FBR invoice submission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">4. FBR Compliance</h2>
            <p>
              Phelix ERP is a certified POS integration solution. We submit invoices to
              FBR IRIS on your behalf using the technical specifications provided by FBR.
              However:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>
                <strong>We are not a tax advisor.</strong> We do not provide legal or tax
                advice. Any questions about your tax obligations under Pakistani law should
                be directed to a qualified tax professional or FBR directly.
              </li>
              <li>
                <strong>FBR system downtime.</strong> We are not responsible for rejected
                or delayed invoice submissions caused by FBR IRIS downtime, FBR API errors,
                or changes to FBR&apos;s technical requirements.
              </li>
              <li>
                <strong>Data accuracy.</strong> We submit exactly the invoice data you
                enter into our system. Errors in product details, prices, or tax rates
                entered by you are your responsibility.
              </li>
              <li>
                <strong>FBR penalties.</strong> Any FBR fines, penalties, or compliance
                failures arising from incorrect data entered by you, or from FBR system
                issues outside our control, are not our liability.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">5. Payment Terms</h2>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Pricing is agreed between Phelix ERP and the client before onboarding</li>
              <li>Payments are due as per the agreed schedule (monthly, quarterly, or annual)</li>
              <li>We reserve the right to suspend Services if payment is overdue by more than 15 days</li>
              <li>All fees are in Pakistani Rupees (PKR) unless otherwise agreed in writing</li>
              <li>Prices may be updated with 30 days written notice to existing clients</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">6. Intellectual Property</h2>
            <p>
              All software, code, UI designs, algorithms, and content comprising the
              Phelix ERP system are the exclusive intellectual property of Phelix ERP.
              Your subscription grants you a non-exclusive, non-transferable licence to
              use our Services for your own business operations.
            </p>
            <p className="mt-3">
              You may not reverse engineer, copy, resell, sublicense, or distribute any
              part of our software or Services without prior written consent from Phelix ERP.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">7. Data and Privacy</h2>
            <p>
              Your use of Phelix ERP is also governed by our{" "}
              <Link href="/privacy" className="text-[#F97316] no-underline hover:underline">
                Privacy Policy
              </Link>
              , which is incorporated into these Terms by reference.
            </p>
            <p className="mt-3">
              Invoice data submitted to FBR IRIS is shared with the Federal Board of
              Revenue as required by Pakistani law. We retain your invoice records for a
              minimum of 5 years as required by the Sales Tax Act.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">8. Service Availability</h2>
            <p>
              We target 99.9% uptime for our Services. Planned maintenance windows will
              be communicated via WhatsApp with at least 24 hours&apos; notice where possible.
              We are not liable for:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Service interruptions caused by your internet connection or hardware</li>
              <li>FBR IRIS portal downtime or FBR API outages</li>
              <li>Force majeure events (natural disasters, government actions, power outages)</li>
              <li>Third-party service failures (Vercel hosting, WhatsApp, etc.)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">9. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by Pakistani law, Phelix ERP&apos;s total
              liability to you for any claim arising from these Terms or your use of our
              Services shall not exceed the fees paid by you in the three (3) months
              preceding the claim.
            </p>
            <p className="mt-3">
              We are not liable for indirect, incidental, special, or consequential damages,
              including loss of profits, loss of data, or business interruption.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">10. Termination</h2>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Either party may terminate the agreement with 30 days written notice via WhatsApp or email</li>
              <li>We may terminate immediately if you violate these Terms, misuse our system, or engage in fraudulent activity</li>
              <li>Upon termination, your access to Phelix ERP will be deactivated</li>
              <li>We will provide you with an export of your invoice data upon request within 30 days of termination</li>
              <li>Fees already paid are non-refundable unless otherwise agreed in writing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">11. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. When we do, we will update the
              &quot;Last updated&quot; date at the top of this page and notify active clients
              via WhatsApp. Continued use of our Services after changes constitutes
              acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">12. Governing Law</h2>
            <p>
              These Terms are governed by the laws of Pakistan. Any disputes arising from
              these Terms or your use of our Services shall be subject to the jurisdiction
              of the courts of Pakistan.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1D27] mb-3">13. Contact Us</h2>
            <p>For any questions about these Terms:</p>
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
