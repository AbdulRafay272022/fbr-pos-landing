import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FBR Compliance Checker — Is Your Business FBR Compliant?",
  description:
    "Free FBR compliance checker for Pakistani businesses. Get your compliance score, risk level, and exact steps to fix issues. Used by retailers, pharmacies, and restaurants across Pakistan.",
  keywords: [
    "FBR compliance checker Pakistan",
    "FBR POS compliance check",
    "is my business FBR compliant",
    "FBR compliance score Pakistan",
    "FBR POS checker",
    "check FBR compliance Pakistan",
  ],
  openGraph: {
    title: "FBR Compliance Checker — Free Tool for Pakistani Businesses",
    description:
      "Check if your business is FBR compliant in 60 seconds. Get a compliance score, risk level, and a personalized fix plan.",
    type: "website",
    url: "https://phelixerp.vercel.app/fbr-checker",
    images: [
      {
        url: "/dashboard-screenshot.png",
        width: 1200,
        height: 630,
        alt: "FBR Compliance Checker by Phelix ERP",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FBR Compliance Checker — Free Tool for Pakistani Businesses",
    description:
      "Check your FBR compliance score in 60 seconds. Get a risk level and personalised action plan.",
    images: ["/dashboard-screenshot.png"],
  },
  alternates: {
    canonical: "https://phelixerp.vercel.app/fbr-checker",
  },
};

export default function FBRCheckerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

