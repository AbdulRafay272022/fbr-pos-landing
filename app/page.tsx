"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { softwareApplicationSchema, faqSchema, LANDING_FAQS } from "@/lib/schema";
import { trackWAClick } from "@/lib/analytics";

const clients = [
  { initials: "NK", name: "Noman Traders", city: "Karachi", color: "#FFF7ED", text: "#C2410C" },
  { initials: "HS", name: "Hassan Store", city: "Lahore", color: "#F0FDF4", text: "#15803D" },
  { initials: "ZR", name: "Zain Retailers", city: "Islamabad", color: "#EFF6FF", text: "#1D4ED8" },
  { initials: "AS", name: "Al-Shifa Pharmacy", city: "Faisalabad", color: "#FDF4FF", text: "#7E22CE" },
  { initials: "QG", name: "Qadir General", city: "Multan", color: "#FFF7ED", text: "#C2410C" },
  { initials: "MB", name: "Metro Bakery", city: "Karachi", color: "#F0FDF4", text: "#15803D" },
  { initials: "SF", name: "Saeed Foods", city: "Peshawar", color: "#EFF6FF", text: "#1D4ED8" },
  { initials: "RP", name: "Raza Pharma", city: "Rawalpindi", color: "#FDF4FF", text: "#7E22CE" },
  { initials: "TM", name: "Tariq Mobile", city: "Karachi", color: "#FFF7ED", text: "#C2410C" },
  { initials: "AG", name: "Ahmed Garments", city: "Lahore", color: "#F0FDF4", text: "#15803D" },
  { initials: "BF", name: "Bilal Fabrics", city: "Faisalabad", color: "#EFF6FF", text: "#1D4ED8" },
  { initials: "SK", name: "Star Kitchen", city: "Islamabad", color: "#FDF4FF", text: "#7E22CE" },
  { initials: "JE", name: "Junaid Electronics", city: "Hyderabad", color: "#FFF7ED", text: "#C2410C" },
  { initials: "NB", name: "New Bazaar", city: "Quetta", color: "#F0FDF4", text: "#15803D" },
  { initials: "RS", name: "Royal Sweets", city: "Sialkot", color: "#EFF6FF", text: "#1D4ED8" },
  { initials: "KH", name: "Khan Hardware", city: "Gujranwala", color: "#FDF4FF", text: "#7E22CE" },
  { initials: "PM", name: "Pearl Mart", city: "Karachi", color: "#FFF7ED", text: "#C2410C" },
  { initials: "CG", name: "City Grocers", city: "Lahore", color: "#F0FDF4", text: "#15803D" },
  { initials: "TS", name: "Textile Square", city: "Multan", color: "#EFF6FF", text: "#1D4ED8" },
  { initials: "MF", name: "Modern Foods", city: "Karachi", color: "#FDF4FF", text: "#7E22CE" },
];

const features = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="1.8" strokeLinecap="round">
        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </svg>
    ),
    bg: "#FFF7ED",
    title: "FBR e-Invoicing",
    desc: "Automatic QR code invoices submitted to FBR IRIS in real time. Fully compliant with SRB and FBR requirements.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
    bg: "#F0FDF4",
    title: "Fast POS Billing",
    desc: "Create complete invoices in seconds from any device, phone, tablet, or desktop. No training needed.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      </svg>
    ),
    bg: "#EFF6FF",
    title: "Stock Management",
    desc: "Live inventory tracking, low-stock alerts, and automatic deduction on every sale.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="1.8" strokeLinecap="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    bg: "#FFF7ED",
    title: "Multi-branch Support",
    desc: "Manage all your shop branches from one account. Each branch gets its own POS and reports.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="1.8" strokeLinecap="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    bg: "#F0FDF4",
    title: "Sales Reports",
    desc: "Daily, weekly, and monthly sales summaries. Export to PDF or Excel with one click.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    bg: "#F5F3FF",
    title: "Cloud & Secure",
    desc: "All data backed up automatically. Access your business from anywhere, any time, on any device.",
  },
];

const steps = [
  { n: "1", title: "WhatsApp us", desc: "Send your business name and NTN, takes 2 minutes." },
  { n: "2", title: "FBR registration", desc: "We register your POS with FBR IRIS on your behalf." },
  { n: "3", title: "Setup & training", desc: "We set up your system and train your staff remotely." },
  { n: "4", title: "Start billing", desc: "Go live same day. FBR invoices submit automatically." },
];

const plans = [
  {
    name: "Starter",
    price: "PKR 1,500",
    period: "per month",
    desc: "Best for small shops and single-branch retailers.",
    features: ["1 POS terminal", "FBR e-invoicing", "Basic inventory", "WhatsApp support"],
    featured: false,
  },
  {
    name: "Business",
    price: "PKR 4,000",
    period: "per month",
    desc: "Ideal for multi-user shops and growing businesses.",
    features: ["3 POS terminals", "FBR e-invoicing", "Full inventory + reports", "Priority support", "Staff accounts"],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    desc: "For chains, restaurants, and large retail networks.",
    features: ["Unlimited terminals", "Multi-branch", "Custom integrations", "Dedicated account manager"],
    featured: false,
  },
];

const WA_NUMBER = "923118366981";

const WhatsAppIcon = ({ size = 16, color = "white" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

const CheckIcon = () => (
  <svg width="10" height="10" viewBox="0 0 12 12">
    <polyline points="2,6 5,9 10,3" stroke="#059669" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </svg>
);

export default function LandingPage() {
  const [phone, setPhone] = useState("");
  const cleanNumber = phone.replace(/\D/g, "").replace(/^0/, "");
  const waHref =
    cleanNumber.length > 5
      ? `https://wa.me/92${cleanNumber}`
      : `https://wa.me/${WA_NUMBER}`;

  return (
    <>
      {/* JSON-LD: SoftwareApplication */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationSchema()),
        }}
      />
      {/* JSON-LD: FAQ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqSchema(LANDING_FAQS)),
        }}
      />

      <div className="min-h-screen bg-[#F8F9FC] text-[#1A1D27] font-sans">

        {/* NAVBAR */}
        <nav className="flex items-center justify-between px-6 md:px-10 py-4 bg-white border-b border-gray-100 sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <Image
              src="/phelix-logo.png"
              alt="Phelix ERP Logo – FBR POS System Pakistan"
              width={360}
              height={120}
              className="h-24 w-auto object-contain"
              style={{ marginTop: "-8px", marginBottom: "-8px" }}
            />
          </div>
          <ul className="hidden md:flex gap-7 list-none items-center">
            {["Features", "Clients", "Pricing"].map((l) => (
              <li key={l}>
                <a
                  href={`#${l.toLowerCase()}`}
                  className="text-sm text-gray-500 hover:text-[#1A1D27] transition-colors no-underline"
                >
                  {l}
                </a>
              </li>
            ))}
            <li>
              <Link
                href="/blog"
                className="text-sm text-gray-500 hover:text-[#1A1D27] transition-colors no-underline"
              >
                Blog
              </Link>
            </li>
            <li>
              <Link
                href="/fbr-checker"
                className="text-sm font-semibold text-[#F97316] hover:text-orange-600 transition-colors no-underline"
              >
                FBR Checker
              </Link>
            </li>
          </ul>
          <a
            href={`https://wa.me/${WA_NUMBER}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackWAClick("navbar")}
            className="flex items-center gap-2 bg-[#25D366] text-white px-4 py-2 rounded-lg text-sm font-semibold no-underline hover:opacity-90 transition-opacity"
          >
            <WhatsAppIcon size={15} />
            WhatsApp Us
          </a>
        </nav>

        {/* HERO */}
        <section className="bg-white border-b border-gray-100 text-center px-6 py-20 md:py-28">
          <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-full px-4 py-1.5 text-xs font-semibold text-orange-700 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F97316] inline-block" />
            FBR Certified e-Invoicing System — Setup in 24 Hours
          </div>
          <div className="mt-2 text-xs text-red-500 font-semibold mb-4">
            ⚠ FBR compliance is now mandatory — avoid penalties by going live today
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight text-[#1A1D27] mb-5">
            Pakistan&apos;s Smartest<br />
            <span className="text-[#F97316]">FBR POS</span> for Retail
          </h1>

          <p className="text-base md:text-lg text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
            No more manual invoices or FBR stress. Generate QR invoices, sync with
            FBR automatically, and run your entire shop from one simple system.
          </p>

          <div className="flex flex-col md:flex-row gap-3 justify-center mb-4">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter your WhatsApp number"
              type="tel"
              className="px-4 py-3 border-2 border-gray-200 rounded-lg text-sm w-72 focus:outline-none focus:border-[#F97316] transition-colors"
            />
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackWAClick("hero")}
              className="flex items-center justify-center gap-2 bg-[#25D366] text-white px-6 py-3 rounded-lg text-sm font-semibold no-underline hover:opacity-90 transition-opacity"
            >
              <WhatsAppIcon size={16} />
              Get Free Demo
            </a>
          </div>
          <p className="text-xs text-gray-400 mb-6">
            Trusted by shops across Karachi, Lahore &amp; Islamabad
          </p>

          <div className="flex flex-wrap gap-5 justify-center text-sm text-gray-500 mb-8">
            {["Setup in 24 hours", "No technical skills needed", "Cloud based, access anywhere", "FBR registered & compliant"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <CheckIcon />
                </span>
                {t}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/fbr-checker"
              className="inline-flex items-center gap-2 border-2 border-[#F97316] text-[#F97316] px-5 py-2.5 rounded-lg text-sm font-semibold no-underline hover:bg-orange-50 transition-colors"
            >
              Check FBR Compliance →
            </Link>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 border-2 border-gray-200 text-gray-600 px-5 py-2.5 rounded-lg text-sm font-semibold no-underline hover:bg-gray-50 transition-colors"
            >
              Read FBR Guides
            </Link>
          </div>
        </section>

        {/* URGENCY BANNER */}
        <section className="bg-red-50 border-y border-red-100 px-6 py-10 text-center">
          <h2 className="text-xl font-bold text-red-600 mb-2">
            Still using manual billing?
          </h2>
          <p className="text-sm text-gray-600 max-w-xl mx-auto">
            Every manual invoice risks FBR penalties, mistakes, and lost records.
            Switch to automated FBR compliance in 24 hours.
          </p>
        </section>

        {/* STATS BAR */}
        <div className="bg-[#1A1D27] grid grid-cols-2 md:grid-cols-4 gap-0">
          {[
            ["20+", "Active clients"],
            ["2,000+", "FBR invoices submitted"],
            ["24hr", "Setup & onboarding"],
            ["99.9%", "System uptime"],
          ].map(([n, l]) => (
            <div key={l} className="text-center py-8 border-r border-white/10 last:border-r-0">
              <div className="text-2xl md:text-3xl font-extrabold text-[#F97316] mb-1">{n}</div>
              <div className="text-xs text-white/50">{l}</div>
            </div>
          ))}
        </div>

        {/* DASHBOARD SCREENSHOT */}
        <section className="bg-[#F8F9FC] px-6 md:px-10 py-16 text-center">
          <p className="text-xs tracking-widest uppercase text-[#F97316] font-semibold mb-3">See the system</p>
          <h2 className="text-2xl md:text-3xl font-extrabold text-[#1A1D27] tracking-tight mb-3">
            Your business at a glance
          </h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-10">
            A clean, simple dashboard — inventory, invoices, reports, all in one place.
          </p>
          <div className="max-w-4xl mx-auto rounded-2xl overflow-hidden border border-gray-200 shadow-lg">
            <div className="bg-[#1A1D27] px-4 py-3 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-400" />
              <span className="w-3 h-3 rounded-full bg-yellow-400" />
              <span className="w-3 h-3 rounded-full bg-green-400" />
              <span className="ml-3 flex-1 bg-white/10 rounded px-3 py-1 text-xs text-white/40">
                app.phelixerp.com/dashboard
              </span>
            </div>
            <Image
              src="/dashboard-screenshot.png"
              alt="Phelix ERP dashboard – FBR POS system showing invoices and inventory"
              width={1200}
              height={700}
              className="w-full object-cover"
              priority
            />
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="bg-white border-t border-gray-100 px-6 md:px-10 py-16">
          <p className="text-xs tracking-widest uppercase text-[#F97316] font-semibold text-center mb-3">Why Phelix ERP</p>
          <h2 className="text-2xl md:text-3xl font-extrabold text-center tracking-tight mb-3">Everything your shop needs</h2>
          <p className="text-sm text-gray-500 text-center max-w-md mx-auto mb-12">
            One system for billing, FBR e-invoicing, inventory, and reporting — no manual work.
          </p>
          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-[#F8F9FC] border border-gray-100 rounded-2xl p-6 hover:border-orange-200 hover:shadow-sm transition-all"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: f.bg }}
                >
                  {f.icon}
                </div>
                <h3 className="font-bold text-base text-[#1A1D27] mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CLIENTS */}
        <section id="clients" className="bg-[#F8F9FC] border-t border-gray-100 px-6 md:px-10 py-16">
          <p className="text-xs tracking-widest uppercase text-[#F97316] font-semibold text-center mb-3">Trusted by businesses</p>
          <h2 className="text-2xl md:text-3xl font-extrabold text-center tracking-tight mb-3">
            20+ active clients across Pakistan
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-md mx-auto mb-12">
            Shops, restaurants, and traders using Phelix ERP every day to submit FBR invoices.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-5xl mx-auto">
            {clients.map((c) => (
              <div key={c.name} className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: c.color, color: c.text }}
                >
                  {c.initials}
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#1A1D27] leading-tight">{c.name}</div>
                  <div className="text-xs text-gray-400">{c.city}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="bg-white border-t border-gray-100 px-6 md:px-10 py-16">
          <p className="text-xs tracking-widest uppercase text-[#F97316] font-semibold text-center mb-3">Getting started</p>
          <h2 className="text-2xl md:text-3xl font-extrabold text-center tracking-tight mb-3">Live in 4 simple steps</h2>
          <p className="text-sm text-gray-500 text-center max-w-md mx-auto mb-12">
            We handle everything. You just start billing.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {steps.map((s) => (
              <div key={s.n} className="text-center">
                <div className="w-10 h-10 rounded-full bg-orange-50 border-2 border-orange-200 flex items-center justify-center text-base font-extrabold text-[#F97316] mx-auto mb-4">
                  {s.n}
                </div>
                <h3 className="font-bold text-sm text-[#1A1D27] mb-2">{s.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="bg-[#F8F9FC] border-t border-gray-100 px-6 md:px-10 py-16">
          <p className="text-xs tracking-widest uppercase text-[#F97316] font-semibold text-center mb-3">Pricing</p>
          <h2 className="text-2xl md:text-3xl font-extrabold text-center tracking-tight mb-3">Simple, honest pricing</h2>
          <p className="text-sm text-gray-500 text-center max-w-md mx-auto mb-12">
            One-time setup + monthly subscription. No hidden charges.
          </p>
          <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl p-7 border-2 ${
                  p.featured
                    ? "bg-white border-[#F97316] shadow-md"
                    : "bg-white border-gray-100"
                }`}
              >
                {p.featured && (
                  <span className="inline-block bg-orange-50 text-orange-700 border border-orange-200 text-xs font-semibold px-3 py-1 rounded-full mb-3">
                    Most popular
                  </span>
                )}
                <h3 className="font-extrabold text-lg text-[#1A1D27] mb-1">{p.name}</h3>
                <div className="text-3xl font-extrabold text-[#F97316] my-2">{p.price}</div>
                <div className="text-xs text-gray-400 mb-3">{p.period}</div>
                <p className="text-sm text-gray-500 mb-5 leading-relaxed">{p.desc}</p>
                <ul className="space-y-2 mb-6">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-[#374151] border-b border-gray-50 pb-2 last:border-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={`https://wa.me/${WA_NUMBER}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => trackWAClick(`pricing_${p.name.toLowerCase()}`)}
                  className={`block text-center py-2.5 rounded-lg text-sm font-semibold no-underline transition-opacity hover:opacity-90 ${
                    p.featured
                      ? "bg-[#F97316] text-white"
                      : "border border-gray-200 text-[#1A1D27] hover:bg-gray-50"
                  }`}
                >
                  Get started
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* FREE TOOLS / RESOURCES */}
        <section className="bg-white border-t border-gray-100 px-6 md:px-10 py-16">
          <p className="text-xs tracking-widest uppercase text-[#F97316] font-semibold text-center mb-3">Free Resources</p>
          <h2 className="text-2xl md:text-3xl font-extrabold text-center tracking-tight mb-3">
            FBR Compliance Tools & Guides
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-md mx-auto mb-12">
            Free tools and expert guides to help Pakistani businesses stay FBR compliant.
          </p>
          <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            <Link
              href="/fbr-checker"
              className="bg-[#FFF7ED] border-2 border-orange-200 rounded-2xl p-6 no-underline hover:shadow-md transition-shadow group"
            >
              <div className="text-3xl mb-3">🔍</div>
              <h3 className="font-bold text-lg text-[#1A1D27] mb-2 group-hover:text-[#F97316] transition-colors">
                FBR Compliance Checker
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Get your compliance score in 60 seconds. Know your risk level and
                exactly what to fix before FBR inspects you.
              </p>
              <span className="text-sm font-semibold text-[#F97316]">
                Check my compliance →
              </span>
            </Link>

            <Link
              href="/blog"
              className="bg-[#F0FDF4] border-2 border-green-200 rounded-2xl p-6 no-underline hover:shadow-md transition-shadow group"
            >
              <div className="text-3xl mb-3">📖</div>
              <h3 className="font-bold text-lg text-[#1A1D27] mb-2 group-hover:text-[#15803D] transition-colors">
                FBR POS Guides & Blog
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Step-by-step guides on FBR registration, QR invoices, and POS
                compliance for Pakistani businesses. Updated daily.
              </p>
              <span className="text-sm font-semibold text-[#15803D]">
                Read the guides →
              </span>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[#1A1D27] px-6 md:px-10 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-4">
            Start FBR billing today —<br />Your competitors already are
          </h2>
          <p className="text-red-400 text-xs mt-2 font-semibold">
            Don&apos;t risk penalties — go FBR compliant today
          </p>
          <p className="text-sm text-white/60 mb-8 leading-relaxed mt-3">
            Setup in 24 hours · Easy to use · No technical skills needed · FBR certified
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={`https://wa.me/${WA_NUMBER}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackWAClick("cta_section")}
              className="flex items-center justify-center gap-2 bg-[#25D366] text-white px-7 py-3.5 rounded-lg text-sm font-semibold no-underline hover:opacity-90 transition-opacity"
            >
              <WhatsAppIcon size={18} />
              Book free demo on WhatsApp
            </a>
            <a
              href={`tel:+${WA_NUMBER}`}
              className="flex items-center justify-center px-7 py-3.5 rounded-lg text-sm font-semibold bg-white/10 text-white border border-white/20 no-underline hover:bg-white/15 transition-colors"
            >
              Call us instead
            </a>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-white border-t border-gray-100 px-6 md:px-10 py-16">
          <p className="text-xs tracking-widest uppercase text-[#F97316] font-semibold text-center mb-3">FAQ</p>
          <h2 className="text-2xl font-bold text-center mb-3">Frequently Asked Questions</h2>
          <p className="text-sm text-gray-500 text-center max-w-md mx-auto mb-12">
            Common questions about FBR POS compliance and Phelix ERP.
          </p>
          <div className="max-w-3xl mx-auto space-y-0 divide-y divide-gray-100">
            {LANDING_FAQS.map((faq) => (
              <div key={faq.q} className="py-5">
                <h3 className="font-semibold text-[#1A1D27] mb-2 text-sm md:text-base">
                  {faq.q}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <p className="text-sm text-gray-500 mb-4">Still have questions?</p>
            <a
              href={`https://wa.me/${WA_NUMBER}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackWAClick("faq_section")}
              className="inline-flex items-center gap-2 bg-[#25D366] text-white px-6 py-3 rounded-lg text-sm font-semibold no-underline hover:opacity-90 transition-opacity"
            >
              <WhatsAppIcon size={15} />
              Ask us on WhatsApp
            </a>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="bg-white border-t border-gray-100 px-6 md:px-10 py-8">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <Image
                src="/phelix-logo.png"
                alt="Phelix ERP – FBR POS Pakistan"
                width={280}
                height={90}
                className="h-20 w-auto object-contain"
              />
            </div>
            <nav className="flex flex-wrap gap-5 justify-center">
              {[
                { label: "Features", href: "#features" },
                { label: "Pricing", href: "#pricing" },
                { label: "Blog", href: "/blog" },
                { label: "FBR Checker", href: "/fbr-checker" },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  className="text-xs text-gray-400 hover:text-gray-700 no-underline"
                >
                  {label}
                </a>
              ))}
            </nav>
            <p className="text-xs text-gray-400 text-center">
              © 2026 Phelix ERP · FBR Certified POS System · Pakistan
            </p>
          </div>
        </footer>

        {/* FLOATING WHATSAPP */}
        <a
          href={`https://wa.me/${WA_NUMBER}`}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackWAClick("floating_button")}
          className="fixed bottom-6 right-6 bg-[#25D366] text-white px-4 py-3 rounded-full shadow-lg flex items-center gap-2 text-sm font-semibold no-underline hover:opacity-90 transition-opacity z-50"
          aria-label="Chat with Phelix ERP on WhatsApp"
        >
          <WhatsAppIcon size={18} />
          Chat with us
        </a>
      </div>
    </>
  );
}
