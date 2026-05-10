import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Contact Phelix ERP — FBR POS Support Pakistan",
  description:
    "Contact Phelix ERP for FBR POS system setup, demo, pricing, or support. WhatsApp: +92 311 836 6981. Serving businesses across Karachi, Lahore, Islamabad and all Pakistan.",
  alternates: { canonical: "https://phelixerp.vercel.app/contact" },
  openGraph: {
    title: "Contact Phelix ERP — FBR POS Support Pakistan",
    description: "Reach our FBR compliance team via WhatsApp, phone, or Facebook. We respond within minutes.",
    url: "https://phelixerp.vercel.app/contact",
  },
};

const WA = "923118366981";

export default function ContactPage() {
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
      <section className="bg-[#1A1D27] px-6 md:px-10 py-16 text-center">
        <p className="text-xs tracking-widest uppercase text-[#F97316] font-semibold mb-4">Get In Touch</p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-4">
          Contact Phelix ERP
        </h1>
        <p className="text-white/70 text-sm max-w-md mx-auto">
          Questions about FBR compliance, pricing, or getting set up?
          Our team responds in minutes on WhatsApp.
        </p>
      </section>

      {/* CONTACT CARDS */}
      <section className="px-6 md:px-10 py-16">
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-5">

          {/* WhatsApp */}
          <div className="bg-[#F0FDF4] border border-green-200 rounded-2xl p-7 text-center">
            <div className="w-14 h-14 bg-[#25D366] rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <h2 className="font-bold text-lg text-[#1A1D27] mb-2">WhatsApp</h2>
            <p className="text-sm text-gray-500 mb-5 leading-relaxed">
              Fastest response. Send us a message and get a reply within minutes.
              Free demo available instantly.
            </p>
            <a
              href={`https://wa.me/${WA}?text=Hi%2C%20I%20want%20to%20know%20more%20about%20Phelix%20ERP%20FBR%20POS%20system`}
              target="_blank"
              rel="noreferrer"
              className="inline-block bg-[#25D366] text-white px-6 py-2.5 rounded-lg text-sm font-semibold no-underline hover:opacity-90 transition-opacity"
            >
              +92 311 836 6981
            </a>
          </div>

          {/* Phone */}
          <div className="bg-[#EFF6FF] border border-blue-200 rounded-2xl p-7 text-center">
            <div className="w-14 h-14 bg-[#3B82F6] rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <h2 className="font-bold text-lg text-[#1A1D27] mb-2">Phone Call</h2>
            <p className="text-sm text-gray-500 mb-5 leading-relaxed">
              Prefer a direct call? Our team is available during Pakistan business hours
              — 9am to 7pm PKT, Monday to Saturday.
            </p>
            <a
              href="tel:+923118366981"
              className="inline-block bg-[#3B82F6] text-white px-6 py-2.5 rounded-lg text-sm font-semibold no-underline hover:opacity-90 transition-opacity"
            >
              Call +92 311 836 6981
            </a>
          </div>

          {/* Facebook */}
          <div className="bg-[#EFF6FF] border border-indigo-200 rounded-2xl p-7 text-center">
            <div className="w-14 h-14 bg-[#1877F2] rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            <h2 className="font-bold text-lg text-[#1A1D27] mb-2">Facebook</h2>
            <p className="text-sm text-gray-500 mb-5 leading-relaxed">
              Follow our page for FBR compliance updates, tips, and announcements.
              Message us directly on Facebook.
            </p>
            <a
              href="https://www.facebook.com/profile.php?id=61589076186268"
              target="_blank"
              rel="noreferrer"
              className="inline-block bg-[#1877F2] text-white px-6 py-2.5 rounded-lg text-sm font-semibold no-underline hover:opacity-90 transition-opacity"
            >
              Phelix ERP on Facebook
            </a>
          </div>

        </div>
      </section>

      {/* BUSINESS INFO */}
      <section className="bg-[#F8F9FC] border-t border-gray-100 px-6 md:px-10 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-extrabold text-[#1A1D27] mb-8 text-center">Business Information</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Company</div>
                <div className="text-sm font-semibold text-[#1A1D27]">Phelix ERP</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Product</div>
                <div className="text-sm text-gray-600">FBR-Compliant POS System & e-Invoicing Software</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Country</div>
                <div className="text-sm text-gray-600">Pakistan</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">FBR Certification</div>
                <div className="text-sm text-gray-600">FBR Digital Invoicing System — Certified POS Provider</div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Service Areas</div>
                <div className="text-sm text-gray-600">Karachi · Lahore · Islamabad · Rawalpindi · Faisalabad · Multan · Peshawar · All Pakistan</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Support Hours</div>
                <div className="text-sm text-gray-600">Monday – Saturday, 9am – 7pm PKT</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">WhatsApp</div>
                <div className="text-sm text-gray-600">+92 311 836 6981</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Response Time</div>
                <div className="text-sm text-gray-600">Usually within 15 minutes on WhatsApp</div>
              </div>
            </div>
          </div>
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
