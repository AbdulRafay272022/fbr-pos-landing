import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Analytics from "@/components/Analytics";
import { organizationSchema, webSiteSchema } from "@/lib/schema";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://fbr-pos-landing.vercel.app"),
  title: {
    default: "Phelix ERP â€“ FBR POS System Pakistan | FBR e-Invoicing Software",
    template: "%s | Phelix ERP Pakistan",
  },
  description:
    "Pakistan's leading FBR-compliant POS system. Real-time QR invoice submission to FBR IRIS, inventory management, and sales reports. Setup in 24 hours. Trusted by 20+ businesses.",
  keywords: [
    "FBR POS system Pakistan",
    "FBR e-invoicing software Pakistan",
    "POS software Pakistan FBR compliant",
    "QR invoice system Pakistan",
    "retail POS Pakistan",
    "FBR POS Karachi",
    "FBR POS Lahore",
    "pharmacy POS Pakistan",
    "FBR invoice QR generator",
    "FBR compliance Pakistan",
    "how to register POS with FBR",
    "Phelix ERP",
    "FBR POS software",
    "Pakistan billing software",
    "FBR integrated POS",
    "ERP Pakistan small business",
  ],
  authors: [{ name: "Phelix ERP", url: "https://fbr-pos-landing.vercel.app" }],
  creator: "Phelix ERP",
  publisher: "Phelix ERP",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_PK",
    url: "https://fbr-pos-landing.vercel.app",
    siteName: "Phelix ERP",
    title: "Phelix ERP â€“ FBR POS System Pakistan | FBR e-Invoicing Software",
    description:
      "Pakistan's leading FBR-compliant POS system. QR invoices, FBR IRIS integration, inventory management. Setup in 24 hours.",
    images: [
      {
        url: "/dashboard-screenshot.png",
        width: 1200,
        height: 630,
        alt: "Phelix ERP â€“ FBR POS System Pakistan dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Phelix ERP â€“ FBR POS System Pakistan",
    description:
      "FBR-compliant POS with QR invoicing, inventory management & sales reports. Trusted by 20+ Pakistan businesses.",
    images: ["/dashboard-screenshot.png"],
  },
  alternates: {
    canonical: "https://fbr-pos-landing.vercel.app",
  },
  category: "technology",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-PK"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema()),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(webSiteSchema()),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Analytics />
        {children}
      </body>
    </html>
  );
}

