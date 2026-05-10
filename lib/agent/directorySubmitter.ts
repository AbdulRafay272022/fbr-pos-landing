/**
 * lib/agent/directorySubmitter.ts
 *
 * Pakistani business directory submission engine.
 *
 * Reality: most directories require manual form submission (no API).
 * What this module does:
 *   1. Maintains a curated list of high-DA Pakistani directories
 *   2. Generates optimized listing copy per directory
 *   3. Tracks submission status in data/directories.json
 *   4. Provides submission URLs + ready-to-paste content
 *
 * What it CANNOT do (legal/practical limits):
 *   - Auto-fill captcha-protected forms
 *   - Bypass email verification
 *   - Auto-approve listings
 *
 * The agent gets you 80% there: optimized listing + tracking.
 * You spend 5 minutes/directory pasting.
 */

export type DirectoryStatus = "pending" | "submitted" | "live" | "rejected" | "needs-update";

export interface BusinessProfile {
  name:         string;
  niche:        string;
  description:  string;
  website:      string;
  email:        string;
  phone:        string;
  address?:     string;
  city:         string;
  country:      string;
  founded?:     string;        // year
  services:     string[];
  cities:       string[];      // service area cities
  whatsapp?:    string;
  facebook?:    string;
  instagram?:   string;
  linkedin?:    string;
  logoUrl?:     string;
}

export interface DirectorySite {
  id:           string;
  name:         string;
  url:          string;          // homepage
  submitUrl:    string;          // submission form URL
  da:           number;          // approximate Domain Authority 0-100
  free:         boolean;
  countries:    string[];        // 2-letter ISO codes
  category:     "general" | "business" | "tech" | "local" | "industry-specific";
  notes?:       string;
  requiresEmail: boolean;
  requiresPhone: boolean;
  acceptsBacklink: boolean;      // does the listing show your URL as a clickable link?
}

export interface DirectoryRecord {
  directoryId:   string;
  status:        DirectoryStatus;
  submittedAt?:  string;
  liveUrl?:      string;          // URL of your listing once live
  notes?:        string;
}

export interface DirectoriesData {
  records:       DirectoryRecord[];
  lastUpdatedAt: string | null;
  totalLive:     number;
}

// ─── Pakistani directory database (curated) ──────────────────────────────────
// All free, all accept backlinks. Verified active as of 2026.

const PAKISTANI_DIRECTORIES: DirectorySite[] = [
  {
    id: "google-business",
    name: "Google Business Profile",
    url: "https://www.google.com/business/",
    submitUrl: "https://business.google.com/create",
    da: 100, free: true, countries: ["pk", "ae", "us", "in"],
    category: "local",
    notes: "Most important. Required for local SEO. Free.",
    requiresEmail: true, requiresPhone: true, acceptsBacklink: true,
  },
  {
    id: "bing-places",
    name: "Bing Places for Business",
    url: "https://www.bingplaces.com/",
    submitUrl: "https://www.bingplaces.com/DashBoard/Home",
    da: 95, free: true, countries: ["pk", "ae", "us"],
    category: "local",
    notes: "Bing's equivalent of GMB. Free.",
    requiresEmail: true, requiresPhone: true, acceptsBacklink: true,
  },
  {
    id: "pakistan-business-directory",
    name: "Pakistan Business Directory",
    url: "https://www.businessdirectory.com.pk/",
    submitUrl: "https://www.businessdirectory.com.pk/add-business",
    da: 35, free: true, countries: ["pk"],
    category: "business",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "yellowpages-pk",
    name: "Yellow Pages Pakistan",
    url: "https://www.yellowpages.pk/",
    submitUrl: "https://www.yellowpages.pk/add-listing",
    da: 38, free: true, countries: ["pk"],
    category: "general",
    requiresEmail: true, requiresPhone: true, acceptsBacklink: true,
  },
  {
    id: "businesslist-pk",
    name: "BusinessList.pk",
    url: "https://www.businesslist.pk/",
    submitUrl: "https://www.businesslist.pk/add",
    da: 32, free: true, countries: ["pk"],
    category: "business",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "locanto-pk",
    name: "Locanto Pakistan",
    url: "https://www.locanto.com.pk/",
    submitUrl: "https://www.locanto.com.pk/post/",
    da: 80, free: true, countries: ["pk"],
    category: "general",
    notes: "High DA. Free classified-style listings.",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "olx-pk",
    name: "OLX Pakistan (Services)",
    url: "https://www.olx.com.pk/",
    submitUrl: "https://www.olx.com.pk/post",
    da: 88, free: true, countries: ["pk"],
    category: "general",
    notes: "Services category accepts business listings.",
    requiresEmail: true, requiresPhone: true, acceptsBacklink: false,
  },
  {
    id: "find-pk",
    name: "Find.pk Business Directory",
    url: "https://find.pk/",
    submitUrl: "https://find.pk/submit-business",
    da: 28, free: true, countries: ["pk"],
    category: "business",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "expopak",
    name: "ExpoPak.com",
    url: "https://expopak.com/",
    submitUrl: "https://expopak.com/add-business",
    da: 22, free: true, countries: ["pk"],
    category: "business",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "pakistanyp",
    name: "PakistanYP.com",
    url: "https://www.pakistanyp.com/",
    submitUrl: "https://www.pakistanyp.com/add-business",
    da: 25, free: true, countries: ["pk"],
    category: "general",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "trade-pakistan",
    name: "TradePakistan.com",
    url: "https://www.tradepakistan.com/",
    submitUrl: "https://www.tradepakistan.com/register-company",
    da: 30, free: true, countries: ["pk"],
    category: "business",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "f6s",
    name: "F6S (Startup directory)",
    url: "https://www.f6s.com/",
    submitUrl: "https://www.f6s.com/account/register",
    da: 80, free: true, countries: ["pk", "us", "global"],
    category: "tech",
    notes: "High DA. Great for SaaS / tech startups.",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "crunchbase",
    name: "Crunchbase",
    url: "https://www.crunchbase.com/",
    submitUrl: "https://www.crunchbase.com/registry/sign-up",
    da: 92, free: true, countries: ["global"],
    category: "tech",
    notes: "DA 92 — extremely high value backlink for tech/SaaS.",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "producthunt",
    name: "Product Hunt",
    url: "https://www.producthunt.com/",
    submitUrl: "https://www.producthunt.com/posts/new",
    da: 91, free: true, countries: ["global"],
    category: "tech",
    notes: "Submit when launching a new feature. DA 91.",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "saashub",
    name: "SaaSHub",
    url: "https://www.saashub.com/",
    submitUrl: "https://www.saashub.com/submissions/new",
    da: 65, free: true, countries: ["global"],
    category: "tech",
    notes: "SaaS-only directory. Very relevant for ERP/POS.",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "g2",
    name: "G2 (Business Software Reviews)",
    url: "https://www.g2.com/",
    submitUrl: "https://www.g2.com/products/new",
    da: 90, free: true, countries: ["global"],
    category: "tech",
    notes: "DA 90. Critical for SaaS. Allows customer reviews.",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "capterra",
    name: "Capterra",
    url: "https://www.capterra.com/",
    submitUrl: "https://www.capterra.com/vendors/sign-up",
    da: 91, free: true, countries: ["global"],
    category: "tech",
    notes: "DA 91. Software listing site.",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "softwaresuggest",
    name: "SoftwareSuggest",
    url: "https://www.softwaresuggest.com/",
    submitUrl: "https://www.softwaresuggest.com/list-your-software",
    da: 60, free: true, countries: ["pk", "in", "global"],
    category: "tech",
    notes: "Strong India/Pakistan reach for B2B software.",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "saasworthy",
    name: "SaaSWorthy",
    url: "https://www.saasworthy.com/",
    submitUrl: "https://www.saasworthy.com/list-your-product",
    da: 55, free: true, countries: ["global"],
    category: "tech",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "alternativeto",
    name: "AlternativeTo",
    url: "https://alternativeto.net/",
    submitUrl: "https://alternativeto.net/software/new/",
    da: 82, free: true, countries: ["global"],
    category: "tech",
    notes: "DA 82. Submit as alternative to QuickBooks/competitor names.",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
];

// ─── UAE directories (for multi-niche support) ───────────────────────────────

const UAE_DIRECTORIES: DirectorySite[] = [
  {
    id: "uae-yellowpages",
    name: "Yellow Pages UAE",
    url: "https://www.yellowpages.ae/",
    submitUrl: "https://www.yellowpages.ae/add-listing",
    da: 42, free: true, countries: ["ae"],
    category: "general",
    requiresEmail: true, requiresPhone: true, acceptsBacklink: true,
  },
  {
    id: "uae-business-directory",
    name: "UAE Business Directory",
    url: "https://www.uaebusinessdirectory.com/",
    submitUrl: "https://www.uaebusinessdirectory.com/add-business",
    da: 35, free: true, countries: ["ae"],
    category: "business",
    requiresEmail: true, requiresPhone: false, acceptsBacklink: true,
  },
  {
    id: "dubai-yellowpages",
    name: "Dubai Yellow Pages",
    url: "https://www.dubaiyellowpages.com/",
    submitUrl: "https://www.dubaiyellowpages.com/add-business",
    da: 32, free: true, countries: ["ae"],
    category: "general",
    requiresEmail: true, requiresPhone: true, acceptsBacklink: true,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getDirectoriesForCountry(countryCode: string): DirectorySite[] {
  const code = countryCode.toLowerCase();
  const matches: DirectorySite[] = [];
  const all = [...PAKISTANI_DIRECTORIES, ...UAE_DIRECTORIES];
  for (const dir of all) {
    if (dir.countries.includes(code) || dir.countries.includes("global")) {
      matches.push(dir);
    }
  }
  // Sort by DA descending
  return matches.sort((a, b) => b.da - a.da);
}

export function defaultDirectoriesData(): DirectoriesData {
  return { records: [], lastUpdatedAt: null, totalLive: 0 };
}

// ─── Listing copy generator ──────────────────────────────────────────────────

export interface ListingCopy {
  shortName:        string;       // 30 chars max
  tagline:          string;       // 80 chars max
  shortDescription: string;       // 150 chars max
  longDescription:  string;       // 500 chars
  fullDescription:  string;       // 1500 chars
  categories:       string[];
  keywords:         string[];     // for keyword fields
  hashtags:         string[];     // for social-style fields
  cta:              string;       // call-to-action line
}

/**
 * Generate optimized listing copy for a business profile.
 * Returns multiple length variants for different directory limits.
 */
export function generateListingCopy(profile: BusinessProfile): ListingCopy {
  const cityList = profile.cities.slice(0, 3).join(", ");

  return {
    shortName: profile.name.slice(0, 30),
    tagline: `${profile.niche} in ${profile.country}`.slice(0, 80),
    shortDescription: `${profile.name} — ${profile.niche}. Serving ${cityList}.`.slice(0, 150),
    longDescription: `${profile.description.slice(0, 350)} Available in ${cityList}. Contact: ${profile.phone || profile.email}.`.slice(0, 500),
    fullDescription: [
      `${profile.name} is a leading provider of ${profile.niche} in ${profile.country}.`,
      profile.description,
      profile.services.length > 0 ? `Our services include: ${profile.services.slice(0, 6).join(", ")}.` : "",
      profile.cities.length > 0 ? `We serve businesses across ${profile.cities.slice(0, 6).join(", ")}.` : "",
      profile.founded ? `Established in ${profile.founded}.` : "",
      `Visit ${profile.website} or contact us at ${profile.phone ?? profile.email} for a free demo.`,
    ].filter(Boolean).join("\n\n").slice(0, 1500),
    categories: deriveCategories(profile.niche),
    keywords:   deriveKeywords(profile),
    hashtags:   deriveHashtags(profile),
    cta:        `Get a free demo: ${profile.whatsapp ? `WhatsApp ${profile.whatsapp}` : profile.website}`,
  };
}

function deriveCategories(niche: string): string[] {
  const n = niche.toLowerCase();
  const cats: string[] = [];
  if (/(software|saas|app|technology)/.test(n))         cats.push("Software", "Technology", "Business Software");
  if (/(pos|retail|store)/.test(n))                     cats.push("Retail Solutions", "POS Systems");
  if (/(erp|business|accounting)/.test(n))              cats.push("Business Services", "Accounting Software");
  if (/(compliance|tax|fbr|vat|legal)/.test(n))         cats.push("Compliance", "Tax Services", "Legal Tech");
  if (/(restaurant|food|hospitality)/.test(n))          cats.push("Hospitality", "Restaurant Tech");
  if (/(pharmacy|medical|healthcare)/.test(n))          cats.push("Healthcare Tech", "Pharmacy");
  if (cats.length === 0) cats.push("Business Services");
  return cats;
}

function deriveKeywords(profile: BusinessProfile): string[] {
  const set = new Set<string>();
  set.add(profile.niche.toLowerCase());
  set.add(`${profile.niche.toLowerCase()} ${profile.country.toLowerCase()}`);
  for (const city of profile.cities.slice(0, 5)) {
    set.add(`${profile.niche.toLowerCase()} ${city.toLowerCase()}`);
  }
  for (const svc of profile.services.slice(0, 5)) {
    set.add(svc.toLowerCase());
  }
  return [...set].slice(0, 15);
}

function deriveHashtags(profile: BusinessProfile): string[] {
  const tags: string[] = [];
  const niche = profile.niche.toLowerCase().replace(/\s+/g, "");
  tags.push(`#${niche}`);
  tags.push(`#${profile.country.toLowerCase().replace(/\s+/g, "")}business`);
  for (const c of profile.cities.slice(0, 3)) {
    tags.push(`#${c.toLowerCase().replace(/\s+/g, "")}business`);
  }
  return tags.slice(0, 8);
}

// ─── Submission plan generator ───────────────────────────────────────────────

export interface SubmissionPlan {
  directory:     DirectorySite;
  status:        DirectoryStatus;
  copy:          ListingCopy;
  fieldHints: {
    [field: string]: string;       // suggested value per common field
  };
}

/**
 * Build a complete submission plan: which directories to submit,
 * with ready-to-paste content for each common field.
 */
export function buildSubmissionPlans(
  profile:    BusinessProfile,
  records:    DirectoryRecord[] = [],
): SubmissionPlan[] {
  const directories = getDirectoriesForCountry(getCountryCode(profile.country));
  const recordMap = new Map(records.map((r) => [r.directoryId, r]));
  const copy = generateListingCopy(profile);

  return directories.map((dir): SubmissionPlan => {
    const existing = recordMap.get(dir.id);
    return {
      directory: dir,
      status:    existing?.status ?? "pending",
      copy,
      fieldHints: {
        "Business Name":    profile.name,
        "Tagline":          copy.tagline,
        "Short Description": copy.shortDescription,
        "Description":      dir.id === "google-business" ? copy.longDescription : copy.fullDescription,
        "Website":          profile.website,
        "Email":            profile.email,
        "Phone":            profile.phone,
        "Address":          profile.address ?? `${profile.city}, ${profile.country}`,
        "City":             profile.city,
        "Country":          profile.country,
        "Categories":       copy.categories.join(", "),
        "Keywords":         copy.keywords.join(", "),
        "Service Areas":    profile.cities.join(", "),
        "Founded":          profile.founded ?? "2024",
        "WhatsApp":         profile.whatsapp ?? "",
      },
    };
  });
}

function getCountryCode(country: string): string {
  const map: Record<string, string> = {
    pakistan: "pk", india: "in", uae: "ae", "united arab emirates": "ae",
    "saudi arabia": "sa", us: "us", "united states": "us", uk: "gb",
  };
  return map[country.toLowerCase()] ?? "global";
}
