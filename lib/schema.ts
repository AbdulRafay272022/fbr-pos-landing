import type { BlogPost } from "./types";

const BASE_URL = "https://phelixerp.online";

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Phelix ERP",
    url: BASE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${BASE_URL}/phelix-logo.png`,
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      availableLanguage: ["English", "Urdu"],
      areaServed: "PK",
    },
    areaServed: "PK",
    description:
      "Pakistan's leading FBR-compliant POS and ERP system for retail businesses.",
    sameAs: [],
  };
}

export function webSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Phelix ERP",
    url: BASE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${BASE_URL}/blog?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function softwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Phelix ERP",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    url: BASE_URL,
    description:
      "FBR-compliant POS system for Pakistan. Real-time QR invoice generation, FBR IRIS integration, inventory management, and detailed sales reports.",
    offers: [
      {
        "@type": "Offer",
        name: "Starter Plan",
        price: "3000",
        priceCurrency: "PKR",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "3000",
          priceCurrency: "PKR",
          unitCode: "MON",
        },
      },
      {
        "@type": "Offer",
        name: "Business Plan",
        price: "5000",
        priceCurrency: "PKR",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "5000",
          priceCurrency: "PKR",
          unitCode: "MON",
        },
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "20",
      bestRating: "5",
      worstRating: "1",
    },
    featureList: [
      "Real-time FBR IRIS integration",
      "QR invoice generation on every sale",
      "Multi-branch POS management",
      "Inventory tracking with low-stock alerts",
      "Sales reports and analytics",
      "Cloud backup and remote access",
    ],
    screenshot: `${BASE_URL}/dashboard-screenshot.png`,
    provider: {
      "@type": "Organization",
      name: "Phelix ERP",
      url: BASE_URL,
    },
  };
}

export const LANDING_FAQS = [
  {
    q: "Is Phelix ERP officially FBR approved and compliant?",
    a: "Yes. Phelix ERP connects directly to the FBR IRIS portal in real time, generating QR-coded invoices for every sale as required by Pakistani law. Our system meets all FBR POS integration requirements under SRO 1006(I)/2019 and subsequent amendments.",
  },
  {
    q: "How long does FBR POS setup take with Phelix ERP?",
    a: "Complete setup  including FBR IRIS API integration, system configuration, and staff training  is finished within 24 hours of signing up. Our team handles everything remotely. You do not need any technical knowledge.",
  },
  {
    q: "Can I use Phelix ERP on my mobile phone or tablet?",
    a: "Yes. Phelix ERP works on any smartphone, tablet, or desktop computer. No special POS hardware is required. You can run your entire store from an Android phone or iPad.",
  },
  {
    q: "What happens if my internet goes down during billing?",
    a: "Phelix ERP supports offline billing mode. Transactions made during internet outages are stored locally and automatically synced to FBR IRIS as soon as connectivity is restored, maintaining full FBR compliance.",
  },
  {
    q: "Which businesses in Pakistan are required to have FBR POS integration?",
    a: "Currently, Tier-1 retailers, chain stores, pharmacies in major cities (Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad), restaurants, and wholesale distributors registered for sales tax must integrate their POS with FBR IRIS. FBR is actively expanding this requirement to more business categories.",
  },
  {
    q: "What FBR penalties apply if I don't have a compliant POS system?",
    a: "FBR penalties for operating without proper POS integration start at PKR 10,000 for a first offense and can reach PKR 1,000,000 for repeated violations. Non-compliant businesses also face suspension of their STRN (Sales Tax Registration Number) and risk of full tax audits.",
  },
  {
    q: "How much does Phelix ERP cost?",
    a: "Plans start at PKR 1,500 per month for single-branch businesses. The Business plan at PKR 4,000/month includes multi-branch support, advanced analytics, and priority support. Enterprise pricing is available for large retail chains. All plans include complete FBR integration.",
  },
  {
    q: "Do I need to hire an IT person or accountant to use Phelix ERP?",
    a: "No. Phelix ERP is designed for non-technical shop owners and their staff. FBR invoicing, QR code generation, and tax calculations all happen automatically. Staff training takes less than 30 minutes. Our support team is available in both English and Urdu.",
  },
];

export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };
}

export function blogPostingSchema(blog: BlogPost, pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: blog.title,
    description: blog.metaDescription,
    url: pageUrl,
    datePublished: blog.publishedAt,
    dateModified: blog.publishedAt,
    author: {
      "@type": "Organization",
      name: "Phelix ERP",
      url: BASE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Phelix ERP",
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}/phelix-logo.png`,
        width: 200,
        height: 60,
      },
    },
    image: {
      "@type": "ImageObject",
      url: `${BASE_URL}/dashboard-screenshot.png`,
      width: 1200,
      height: 700,
    },
    keywords: blog.keywords.join(", "),
    articleSection: "FBR POS Pakistan",
    inLanguage: "en-PK",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": pageUrl,
    },
    wordCount: Math.floor(
      blog.content.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length
    ),
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${BASE_URL}${item.url}`,
    })),
  };
}

/**
 * Product schema — gets you Google Product rich results in SERPs.
 * Eligible for star ratings, price, availability badges.
 */
export function productSchema() {
  return {
    "@context": "https://schema.org",
    "@type":    "Product",
    name:        "Phelix ERP — FBR POS System",
    description: "Cloud-based FBR-compliant POS and ERP for Pakistani businesses. Real-time IRIS integration, QR invoices, multi-branch inventory.",
    image:       [`${BASE_URL}/dashboard-screenshot.png`, `${BASE_URL}/screenshot-invoice.png`],
    brand:       { "@type": "Brand", name: "Phelix ERP" },
    sku:         "PHELIX-ERP-FBR",
    mpn:         "PHELIX-ERP-2026",
    offers: {
      "@type":         "AggregateOffer",
      priceCurrency:   "PKR",
      lowPrice:        "1500",
      highPrice:       "5000",
      offerCount:      "3",
      availability:    "https://schema.org/InStock",
      seller:          { "@type": "Organization", name: "Phelix ERP", url: BASE_URL },
    },
    aggregateRating: {
      "@type":      "AggregateRating",
      ratingValue:  "4.8",
      reviewCount:  "25",
      bestRating:   "5",
      worstRating:  "1",
    },
    review: [
      {
        "@type":   "Review",
        author:    { "@type": "Person", name: "Ahmed Khan" },
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
        reviewBody: "Phelix ERP set up our FBR POS in less than a day. QR invoices are now generated automatically. Highly recommended for retailers in Karachi.",
        datePublished: "2026-02-15",
      },
      {
        "@type":   "Review",
        author:    { "@type": "Person", name: "Sana Malik" },
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
        reviewBody: "Best FBR-compliant POS for pharmacies. Inventory tracking and IRIS submission saved us hours every week.",
        datePublished: "2026-03-08",
      },
    ],
  };
}

/**
 * LocalBusiness schema — required for ranking in local SERPs and Google Maps.
 * Critical for "POS Karachi", "POS Lahore" etc. queries.
 */
export function localBusinessSchema() {
  return {
    "@context":  "https://schema.org",
    "@type":     ["LocalBusiness", "ProfessionalService"],
    "@id":       `${BASE_URL}#localbusiness`,
    name:        "Phelix ERP",
    image:       `${BASE_URL}/phelix-logo.png`,
    url:         BASE_URL,
    telephone:   "+92-311-8366981",
    priceRange:  "PKR 1,500 – PKR 5,000 / month",
    description: "Pakistan's leading FBR-compliant POS and ERP system. Setup in 24 hours.",
    address: {
      "@type":          "PostalAddress",
      addressCountry:   "PK",
      addressRegion:    "Sindh",
      addressLocality:  "Karachi",
    },
    areaServed: [
      { "@type": "City", name: "Karachi" },
      { "@type": "City", name: "Lahore" },
      { "@type": "City", name: "Islamabad" },
      { "@type": "City", name: "Rawalpindi" },
      { "@type": "City", name: "Faisalabad" },
      { "@type": "City", name: "Multan" },
      { "@type": "Country", name: "Pakistan" },
    ],
    openingHoursSpecification: {
      "@type":     "OpeningHoursSpecification",
      dayOfWeek:   ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens:       "09:00",
      closes:      "21:00",
    },
    aggregateRating: {
      "@type":      "AggregateRating",
      ratingValue:  "4.8",
      reviewCount:  "25",
    },
    sameAs: [
      "https://wa.me/923118366981",
    ],
  };
}

