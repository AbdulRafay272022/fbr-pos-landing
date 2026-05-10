import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "About Phelix ERP — FBR POS System Pakistan",
  description:
    "Phelix ERP is a Pakistan-based FBR POS software company. 25+ businesses, 10,000+ invoices submitted, 6 months in production. Meet the team behind Pakistan's trusted FBR compliance system.",
  alternates: { canonical: "https://phelixerp.online/about" },
  openGraph: {
    title: "About Phelix ERP — FBR POS Pakistan",
    description: "Pakistan-built FBR POS system trusted by 25+ businesses across Karachi, Lahore, Islamabad and beyond.",
    url: "https://phelixerp.online/about",
  },
};

const WA = "923118366981";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* NAV */}
      <nav className="border-b border-gray-100 px-6 md:px-10 py-4 flex items-center justify-between">
        <Link href="/">
          <Image src="/phelix-logo.png" alt="Phelix ERP" width={140} height={42} className="h-10 w-auto" />
        </Link>
        <a
          href={`https://wa.me/${WA}`}
          className="bg-[#F97316] text-white text-sm font-semibold px-5 py-2.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
        >
          WhatsApp Demo
        </a>
      </nav>

      {/* HERO */}
      <section className="bg-[#1A1D27] px-6 md:px-10 py-20 text-center">
        <p className="text-xs tracking-widest uppercase text-[#F97316] font-semibold mb-4">About Us</p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-5">
          Pakistan&apos;s FBR POS Compliance Team
        </h1>
        <p className="text-white/70 text-sm max-w-xl mx-auto leading-relaxed">
          We built Phelix ERP because Pakistani businesses needed a POS system that
          actually works with FBR IRIS — not one that claims to and fails at the first
          invoice submission.
        </p>
      </section>

      {/* STATS */}
      <section className="bg-[#F8F9FC] border-b border-gray-100 px-6 md:px-10 py-12">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            ["25+", "Active clients"],
            ["10,000+", "FBR invoices submitted"],
            ["6 months", "In production"],
            ["99.9%", "System uptime"],
          ].map(([n, l]) => (
            <div key={l}>
              <div className="text-3xl font-extrabold text-[#F97316] mb-1">{n}</div>
              <div className="text-xs text-gray-500">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* WHO WE ARE */}
      <section className="px-6 md:px-10 py-16 max-w-4xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <h2 className="text-2xl font-extrabold text-[#1A1D27] mb-5">Who We Are</h2>
            <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
              <p>
                Phelix ERP is a Pakistan-based software company focused exclusively on
                FBR POS compliance. We are not a generic billing software company that
                added an FBR module. We built Phelix ERP from scratch around FBR&apos;s
                IRIS API, QR invoicing requirements, and Tier-1 retailer obligations.
              </p>
              <p>
                We have been working with Pakistani retailers, pharmacies, and restaurants
                since the FBR POS mandate rolled out. Every feature in Phelix ERP exists
                because a real client needed it to pass an FBR inspection or avoid a
                compliance penalty.
              </p>
              <p>
                Our clients operate in Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad,
                Multan, Peshawar, and beyond. We have processed invoices for textile
                traders, medical stores, restaurants, electronics shops, and general
                retailers — and we understand that each industry has its own FBR compliance
                nuances.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-extrabold text-[#1A1D27] mb-5">What We Do</h2>
            {[
              {
                title: "FBR IRIS Integration",
                desc: "Real-time invoice submission to FBR IRIS. Every sale goes to FBR in under 30 seconds.",
              },
              {
                title: "QR Invoice Generation",
                desc: "FBR-certified QR codes on every invoice. Customers can scan and verify on FBR portal.",
              },
              {
                title: "HS Code & UOM Validation",
                desc: "Auto-validate HS codes against FBR's published list. Wrong UOM flagged before submission.",
              },
              {
                title: "Multi-Branch Management",
                desc: "One dashboard for all branches. Each branch has its own POSID, central reporting.",
              },
              {
                title: "24-Hour Onboarding",
                desc: "We handle FBR IRIS registration, hardware setup, and staff training in one day.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-[#F8F9FC] rounded-xl p-4 border border-gray-100">
                <div className="font-semibold text-sm text-[#1A1D27] mb-1">{item.title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY WE BUILT IT */}
      <section className="bg-[#FFF7ED] border-t border-orange-100 px-6 md:px-10 py-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-extrabold text-[#1A1D27] mb-6 text-center">Why We Built Phelix ERP</h2>
          <div className="bg-white rounded-2xl border border-orange-200 p-8">
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              When FBR made POS integration mandatory for Tier-1 retailers, most existing
              POS software in Pakistan was not built for real-time IRIS submission. Businesses
              were using spreadsheets, generic billing software, or outdated POS systems that
              claimed FBR compliance but failed when inspectors arrived.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              We saw retailers in Karachi&apos;s Saddar and Lahore&apos;s Anarkali receive
              FBR penalties not because they were trying to avoid taxes — but because their
              software was not properly integrated. The problem was not willingness to comply.
              The problem was that the right tool did not exist.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Phelix ERP is that tool. Built in Pakistan. For Pakistani businesses. Fully
              integrated with FBR IRIS from day one.
            </p>
          </div>
        </div>
      </section>

      {/* CITIES WE SERVE */}
      <section className="px-6 md:px-10 py-16 max-w-4xl mx-auto">
        <h2 className="text-2xl font-extrabold text-[#1A1D27] mb-3 text-center">Cities We Serve</h2>
        <p className="text-sm text-gray-500 text-center mb-10">
          Active clients across Pakistan — onboarding new businesses every week.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          {[
            "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad",
            "Multan", "Peshawar", "Quetta", "Sialkot", "Gujranwala",
            "Hyderabad", "Bahawalpur", "Sargodha",
          ].map((city) => (
            <span
              key={city}
              className="bg-[#F8F9FC] border border-gray-200 text-sm text-gray-700 font-medium px-4 py-2 rounded-full"
            >
              {city}
            </span>
          ))}
        </div>
      </section>

      {/* CONTACT CTA */}
      <section className="bg-[#1A1D27] px-6 md:px-10 py-16 text-center">
        <h2 className="text-2xl font-extrabold text-white mb-4">Talk to Our Team</h2>
        <p className="text-white/60 text-sm mb-8 max-w-md mx-auto">
          Questions about FBR compliance, pricing, or getting set up?
          We respond on WhatsApp within minutes.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={`https://wa.me/${WA}`}
            className="inline-block bg-[#25D366] text-white px-8 py-3 rounded-lg text-sm font-semibold no-underline hover:opacity-90 transition-opacity"
          >
            WhatsApp: +92 311 836 6981
          </a>
          <Link
            href="/contact"
            className="inline-block bg-white/10 text-white border border-white/20 px-8 py-3 rounded-lg text-sm font-semibold no-underline hover:bg-white/15 transition-colors"
          >
            Contact Page
          </Link>
        </div>
        <div className="mt-6 text-xs text-white/40">
          <p>Phelix ERP · Pakistan · FBR Certified POS System</p>
          <p className="mt-1">
            Facebook:{" "}
            <a
              href="https://www.facebook.com/profile.php?id=61589076186268"
              className="text-white/60 hover:text-white no-underline"
              target="_blank"
              rel="noreferrer"
            >
              facebook.com/PhelixERP
            </a>
          </p>
        </div>
      </section>

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
        <p className="text-xs text-gray-400">© 2026 Phelix ERP · FBR Certified POS System · Pakistan</p>
      </footer>

    </div>
  );
}
