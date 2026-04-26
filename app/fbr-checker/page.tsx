"use client";

import { useState } from "react";
import Link from "next/link";
import { trackWAClick, trackFBRCheckerSubmit } from "@/lib/analytics";

const WA_NUMBER = "923118366981";

const BUSINESS_TYPES = [
  "Retail Store / General Shop",
  "Pharmacy / Medical Store",
  "Restaurant / Food Business",
  "Wholesale Distributor",
  "Clothing / Garments Shop",
  "Electronics / Mobile Shop",
  "Bakery / Sweet Shop",
  "Hardware Store",
  "Other",
];

interface CheckResult {
  score: number;
  risk: "Low" | "Medium" | "High";
  issues: string[];
  positives: string[];
}

function calculateCompliance(
  businessType: string,
  hasPos: string,
  hasStrn: string,
  hasFbrIntegration: string,
  hasQrInvoice: string,
  hasInventory: string
): CheckResult {
  const issues: string[] = [];
  const positives: string[] = [];
  let score = 100;

  if (hasStrn === "no") {
    issues.push("No Sales Tax Registration Number (STRN) â€” required for all registered businesses");
    score -= 30;
  } else if (hasStrn === "yes") {
    positives.push("STRN registered with FBR âœ“");
  }

  if (hasPos === "no") {
    issues.push("No POS system â€” manual billing is not FBR-compliant for registered businesses");
    score -= 20;
  } else if (hasPos === "yes") {
    positives.push("POS system in use âœ“");
  }

  if (hasFbrIntegration === "no") {
    issues.push("POS not connected to FBR IRIS â€” required for real-time invoice submission");
    score -= 25;
  } else if (hasFbrIntegration === "yes") {
    positives.push("FBR IRIS real-time integration active âœ“");
  }

  if (hasQrInvoice === "no") {
    issues.push("Not issuing QR-coded invoices â€” required by FBR for all Tier-1 businesses");
    score -= 20;
  } else if (hasQrInvoice === "yes") {
    positives.push("QR-coded invoices being issued âœ“");
  }

  if (hasInventory === "no") {
    issues.push("No inventory management â€” FBR audits check stock records vs. sales records");
    score -= 5;
  } else if (hasInventory === "yes") {
    positives.push("Inventory tracking in place âœ“");
  }

  const pharmacyRestaurant =
    businessType === "Pharmacy / Medical Store" ||
    businessType === "Restaurant / Food Business";
  if (pharmacyRestaurant && hasFbrIntegration !== "yes") {
    issues.push(
      `${businessType} businesses are priority targets in FBR's 2025-2026 enforcement drive`
    );
    score = Math.max(score - 5, 0);
  }

  score = Math.max(0, Math.min(100, score));
  const risk: "Low" | "Medium" | "High" =
    score >= 75 ? "Low" : score >= 45 ? "Medium" : "High";

  return { score, risk, issues, positives };
}

export default function FBRCheckerPage() {
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [ntn, setNtn] = useState("");
  const [hasPos, setHasPos] = useState("");
  const [hasStrn, setHasStrn] = useState("");
  const [hasFbrIntegration, setHasFbrIntegration] = useState("");
  const [hasQrInvoice, setHasQrInvoice] = useState("");
  const [hasInventory, setHasInventory] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit =
    businessName.trim() &&
    businessType &&
    hasPos &&
    hasStrn &&
    hasFbrIntegration &&
    hasQrInvoice &&
    hasInventory;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = calculateCompliance(
      businessType,
      hasPos,
      hasStrn,
      hasFbrIntegration,
      hasQrInvoice,
      hasInventory
    );
    setResult(res);
    setSubmitted(true);
    trackFBRCheckerSubmit(res.score, res.risk);
    setTimeout(() => {
      document.getElementById("result-section")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  function handleReset() {
    setResult(null);
    setSubmitted(false);
    setBusinessName("");
    setBusinessType("");
    setNtn("");
    setHasPos("");
    setHasStrn("");
    setHasFbrIntegration("");
    setHasQrInvoice("");
    setHasInventory("");
  }

  const riskColors = {
    Low: { bg: "#F0FDF4", text: "#15803D", border: "#86EFAC", label: "Low Risk â€“ Good Compliance" },
    Medium: { bg: "#FFFBEB", text: "#B45309", border: "#FCD34D", label: "Medium Risk â€“ Action Needed" },
    High: { bg: "#FEF2F2", text: "#DC2626", border: "#FCA5A5", label: "High Risk â€“ Immediate Action Required" },
  };

  const waMessage = result
    ? `Hello! I used the Phelix ERP FBR Compliance Checker for ${businessName}. Score: ${result.score}/100 (${result.risk} Risk). Issues found: ${result.issues.length}. Can you help me fix this and set up FBR POS?`
    : "";
  const waHref = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waMessage)}`;

  const shareText = result
    ? `I checked FBR compliance for ${businessName} on Phelix ERP and scored ${result.score}/100 (${result.risk} Risk). Check your business compliance free: https://phelixerp.vercel.app/fbr-checker`
    : "";
  const waShareHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold" style={{ color: "#F97316" }}>
            Phelix ERP
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/blog" className="text-sm text-gray-600 hover:text-gray-900">
              Blog
            </Link>
            <a
              href={`https://wa.me/${WA_NUMBER}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackWAClick("checker_nav")}
              className="text-sm font-semibold text-white px-4 py-2 rounded-lg"
              style={{ background: "#25D366" }}
            >
              WhatsApp Demo
            </a>
          </div>
        </div>
      </nav>

      {/* SEO CONTENT ABOVE TOOL */}
      <div
        className="border-b border-orange-100 px-6 py-12 text-center"
        style={{ background: "linear-gradient(135deg, #FFF7ED 0%, #FFF 100%)" }}
      >
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <nav aria-label="breadcrumb" className="text-xs text-gray-400 flex items-center gap-1.5 justify-center mb-6">
            <Link href="/" className="hover:text-gray-600">Home</Link>
            <span>â€º</span>
            <span className="text-gray-700 font-medium">FBR Compliance Checker</span>
          </nav>

          <div
            className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4"
            style={{ background: "#FFF7ED", color: "#EA580C", border: "1px solid #FDBA74" }}
          >
            Free Tool Â· No Registration Required
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            FBR Compliance Checker for<br />
            <span style={{ color: "#F97316" }}>Pakistani Businesses</span>
          </h1>

          <p className="text-gray-600 max-w-2xl mx-auto mb-6 text-base leading-relaxed">
            Find out if your business is FBR-compliant in 60 seconds. Get a
            personalised compliance score (0â€“100), your risk level, and the exact
            steps to fix every issue â€” before FBR inspects you.
          </p>

          {/* Key stats */}
          <div className="flex flex-wrap gap-6 justify-center mb-8 text-sm">
            {[
              { icon: "ðŸ”", text: "60-second check" },
              { icon: "ðŸ“Š", text: "Compliance score out of 100" },
              { icon: "âš ï¸", text: "Risk level: Low / Medium / High" },
              { icon: "âœ…", text: "Personalised fix plan" },
              { icon: "ðŸ’¬", text: "Pre-filled WhatsApp message" },
            ].map(({ icon, text }) => (
              <span key={text} className="flex items-center gap-1.5 text-gray-600">
                <span>{icon}</span>
                {text}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* WHY THIS MATTERS â€” SEO content block */}
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-white rounded-2xl border border-gray-200 p-7 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Why FBR Compliance Matters for Your Business
          </h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            {[
              {
                icon: "ðŸ’¸",
                title: "Fines up to PKR 1,000,000",
                desc: "FBR penalties for non-compliance start at PKR 10,000 and reach PKR 1M for repeat violations.",
              },
              {
                icon: "ðŸ”’",
                title: "STRN Suspension",
                desc: "FBR can suspend your Sales Tax Registration Number, making it illegal to do business.",
              },
              {
                icon: "ðŸ”Ž",
                title: "Raid Risk",
                desc: "Non-compliant businesses are flagged for surprise inspections and full tax audits.",
              },
              {
                icon: "ðŸ“‹",
                title: "Mandatory for Tier-1",
                desc: "Retailers, pharmacies, restaurants, and distributors are legally required to integrate POS with FBR IRIS.",
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex gap-3">
                <span className="text-2xl flex-shrink-0">{icon}</span>
                <div>
                  <p className="font-semibold text-gray-900">{title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Urgency banner */}
        <div
          className="rounded-xl p-4 mb-8 flex items-center gap-3"
          style={{ background: "#FEF2F2", border: "1px solid #FCA5A5" }}
        >
          <span className="text-xl flex-shrink-0">âš ï¸</span>
          <p className="text-sm font-semibold text-red-700">
            FBR is actively conducting inspections in 2026. Non-compliant businesses
            face fines up to PKR 1,000,000 and STRN suspension. Check now â€” it&apos;s free.
          </p>
        </div>

        {/* TOOL */}
        {!submitted ? (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Check Your FBR Compliance
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Answer 5 quick questions to get your compliance score.
            </p>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Business Name <span style={{ color: "#F97316" }}>*</span>
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Noman Traders"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Business Type <span style={{ color: "#F97316" }}>*</span>
                </label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                  required
                >
                  <option value="">Select business type</option>
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  NTN <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={ntn}
                  onChange={(e) => setNtn(e.target.value)}
                  placeholder="e.g. 1234567-8"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                />
              </div>

              <hr className="border-gray-100" />

              {[
                {
                  label: "Are you registered for Sales Tax (STRN) with FBR?",
                  value: hasStrn,
                  setter: setHasStrn,
                  id: "strn",
                },
                {
                  label: "Do you have a POS system installed?",
                  value: hasPos,
                  setter: setHasPos,
                  id: "pos",
                },
                {
                  label: "Is your POS connected to FBR IRIS in real time?",
                  value: hasFbrIntegration,
                  setter: setHasFbrIntegration,
                  id: "fbr",
                },
                {
                  label: "Do you issue QR-coded invoices to customers?",
                  value: hasQrInvoice,
                  setter: setHasQrInvoice,
                  id: "qr",
                },
                {
                  label: "Do you have an inventory / stock management system?",
                  value: hasInventory,
                  setter: setHasInventory,
                  id: "inv",
                },
              ].map(({ label, value, setter, id }) => (
                <div key={id}>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {label} <span style={{ color: "#F97316" }}>*</span>
                  </label>
                  <div className="flex gap-3">
                    {["yes", "no", "unsure"].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setter(opt)}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors"
                        style={
                          value === opt
                            ? opt === "yes"
                              ? { background: "#F0FDF4", color: "#15803D", borderColor: "#86EFAC" }
                              : opt === "no"
                              ? { background: "#FEF2F2", color: "#DC2626", borderColor: "#FCA5A5" }
                              : { background: "#FFF7ED", color: "#C2410C", borderColor: "#FDBA74" }
                            : { background: "white", color: "#6B7280", borderColor: "#E5E7EB" }
                        }
                      >
                        {opt === "yes" ? "Yes" : opt === "no" ? "No" : "Not Sure"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full mt-8 py-3.5 rounded-xl font-bold text-white text-base transition-opacity"
              style={{
                background: canSubmit ? "#F97316" : "#D1D5DB",
                cursor: canSubmit ? "pointer" : "not-allowed",
              }}
            >
              Check My FBR Compliance Score â†’
            </button>
          </form>
        ) : (
          result && (
            <div id="result-section" className="space-y-6">
              {/* Score card */}
              <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm text-center">
                <p className="text-sm font-semibold text-gray-500 mb-2">
                  FBR Compliance Score for{" "}
                  <strong className="text-gray-900">{businessName}</strong>
                </p>
                <div className="inline-flex items-center justify-center mb-4">
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle cx="70" cy="70" r="60" fill="none" stroke="#F3F4F6" strokeWidth="12" />
                    <circle
                      cx="70"
                      cy="70"
                      r="60"
                      fill="none"
                      stroke={
                        result.risk === "Low"
                          ? "#22C55E"
                          : result.risk === "Medium"
                          ? "#F59E0B"
                          : "#EF4444"
                      }
                      strokeWidth="12"
                      strokeDasharray={`${(result.score / 100) * 376.99} 376.99`}
                      strokeLinecap="round"
                      transform="rotate(-90 70 70)"
                    />
                    <text x="70" y="65" textAnchor="middle" fontSize="30" fontWeight="700" fill="#111827">
                      {result.score}
                    </text>
                    <text x="70" y="83" textAnchor="middle" fontSize="12" fill="#6B7280">
                      / 100
                    </text>
                  </svg>
                </div>
                <div
                  className="inline-block px-4 py-1.5 rounded-full text-sm font-bold mb-3"
                  style={{
                    background: riskColors[result.risk].bg,
                    color: riskColors[result.risk].text,
                    border: `1px solid ${riskColors[result.risk].border}`,
                  }}
                >
                  {riskColors[result.risk].label}
                </div>
                <p className="text-gray-600 text-sm max-w-sm mx-auto">
                  {result.risk === "High"
                    ? "Your business is at serious risk of FBR penalties and raids. Immediate action required."
                    : result.risk === "Medium"
                    ? "Your business has compliance gaps that need to be addressed promptly to avoid FBR action."
                    : "Your business is mostly compliant. A few improvements will make you fully protected."}
                </p>

                {/* Share result button */}
                <div className="mt-5 pt-5 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-3">
                    Share your result â€” help other businesses check their compliance:
                  </p>
                  <a
                    href={waShareHref}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackWAClick("checker_share")}
                    className="inline-flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
                    style={{ background: "#25D366" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </svg>
                    Share on WhatsApp
                  </a>
                </div>
              </div>

              {/* Issues */}
              {result.issues.length > 0 && (
                <div className="bg-white rounded-2xl border border-red-100 p-6">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="text-red-500 text-lg">âœ—</span>
                    Compliance Issues Found ({result.issues.length})
                  </h3>
                  <ul className="space-y-3">
                    {result.issues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="text-red-400 mt-0.5 flex-shrink-0 font-bold">â—</span>
                        <span className="text-sm text-gray-700">{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Positives */}
              {result.positives.length > 0 && (
                <div className="bg-white rounded-2xl border border-green-100 p-6">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="text-green-500 text-lg">âœ“</span>
                    What You Have in Place
                  </h3>
                  <ul className="space-y-3">
                    {result.positives.map((p, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="text-green-500 mt-0.5 flex-shrink-0 font-bold">â—</span>
                        <span className="text-sm text-gray-700">{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Main CTA */}
              <div
                className="rounded-2xl p-8 text-center text-white"
                style={{ background: "#1A1D27" }}
              >
                <h2 className="text-2xl font-bold mb-2">
                  {result.issues.length > 0
                    ? `Fix ${result.issues.length} compliance issue${result.issues.length > 1 ? "s" : ""} with Phelix ERP`
                    : "Keep your compliance strong with Phelix ERP"}
                </h2>
                <p className="text-gray-300 mb-2">
                  Our team will resolve every issue listed above. FBR IRIS integration,
                  QR invoices, STRN registration â€” all handled in 24 hours.
                </p>
                <p className="text-gray-500 text-xs mb-6">
                  Your compliance score and issues are pre-filled in the WhatsApp message.
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => trackWAClick("checker_result_cta")}
                    className="inline-block font-bold px-8 py-3.5 rounded-xl text-white text-base"
                    style={{ background: "#25D366" }}
                  >
                    Fix My Compliance on WhatsApp
                  </a>
                  <Link
                    href="/blog"
                    className="inline-block font-bold px-6 py-3.5 rounded-xl text-white text-base border border-white/20 hover:bg-white/10 no-underline"
                  >
                    Read FBR Guides
                  </Link>
                </div>
              </div>

              <button
                onClick={handleReset}
                className="w-full py-3 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
              >
                Check Another Business
              </button>
            </div>
          )
        )}

        {/* Trust signals */}
        <div className="mt-12 grid grid-cols-3 gap-4 text-center">
          {[
            { label: "20+", sub: "Businesses Made Compliant" },
            { label: "24hr", sub: "Setup Time" },
            { label: "Free", sub: "Demo Available" },
          ].map(({ label, sub }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-2xl font-bold" style={{ color: "#F97316" }}>
                {label}
              </p>
              <p className="text-xs text-gray-500 mt-1">{sub}</p>
            </div>
          ))}
        </div>

        {/* SEO blog links section */}
        <div className="mt-12 bg-white rounded-2xl border border-gray-200 p-7">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Learn More About FBR Compliance
          </h2>
          <ul className="space-y-3">
            {[
              {
                href: "/blog/fbr-pos-system-pakistan-complete-guide-2026",
                label: "FBR POS System Pakistan â€“ Complete Guide 2026",
              },
              {
                href: "/blog/how-to-register-pos-fbr-pakistan-step-by-step",
                label: "How to Register POS with FBR Pakistan â€“ Step by Step",
              },
              {
                href: "/blog/fbr-e-invoicing-pakistan-explained",
                label: "FBR e-Invoicing Pakistan Explained â€“ What Every Business Must Know",
              },
              {
                href: "/blog/retail-pos-compliance-pakistan-fbr-penalties-guide",
                label: "FBR POS Compliance for Retailers â€“ Avoid Penalties in 2026",
              },
            ].map(({ href, label }) => (
              <li key={href} className="flex items-center gap-2">
                <span style={{ color: "#F97316" }}>â†’</span>
                <Link href={href} className="text-sm text-gray-700 hover:text-orange-500 hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <footer className="border-t border-gray-200 mt-8 py-8 text-center text-sm text-gray-500">
        <p>Â© {new Date().getFullYear()} Phelix ERP Â· FBR-Compliant POS System Pakistan</p>
        <div className="flex gap-6 justify-center mt-3">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <Link href="/blog" className="hover:text-gray-700">Blog</Link>
          <Link href="/fbr-checker" className="hover:text-gray-700">FBR Checker</Link>
        </div>
      </footer>
    </main>
  );
}

