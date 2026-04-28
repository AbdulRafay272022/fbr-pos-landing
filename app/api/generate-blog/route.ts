import { NextRequest, NextResponse } from "next/server";
import { isDuplicateSlug, countWords, type BlogPost } from "@/lib/blogStore";

// ── GitHub CMS: persist blogs permanently in data/blogs.json ──────────────────
async function pushBlogToGitHub(blog: BlogPost): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? "main";

  if (!token || !owner || !repo) {
    throw new Error("GitHub env vars not set (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)");
  }

  const filePath = "data/blogs.json";
  const apiBase  = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const headers  = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // 1. Fetch current file + sha
  const getRes = await fetch(apiBase, { headers });
  if (!getRes.ok) throw new Error(`GitHub GET failed: ${getRes.status}`);
  const getJson = (await getRes.json()) as { content: string; sha: string };

  const currentBlogs: BlogPost[] = JSON.parse(
    Buffer.from(getJson.content, "base64").toString("utf8")
  );

  // 2. Append new blog (skip if slug already exists)
  if (currentBlogs.some((b) => b.slug === blog.slug)) return;
  const updated = [blog, ...currentBlogs];

  // 3. Push updated file back
  const putRes = await fetch(apiBase, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `blog: add "${blog.title}"`,
      content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
      sha: getJson.sha,
      branch,
    }),
  });

  if (!putRes.ok) {
    const errText = await putRes.text().catch(() => "unknown");
    throw new Error(`GitHub PUT failed: ${putRes.status} — ${errText}`);
  }
}

const WA_NUMBER = "923118366981";
const MIN_WORD_COUNT = 1200;

const BLOG_TOPICS = [
  {
    title: "FBR POS System for Pharmacies in Pakistan – Complete Compliance Guide 2026",
    keywords: ["pharmacy POS Pakistan", "FBR POS pharmacy Pakistan", "medical store POS FBR"],
    focus: "FBR POS compliance for pharmacies and medical stores in Pakistan",
    businessType: "pharmacy",
  },
  {
    title: "How to Generate FBR QR Invoices in Pakistan – Step by Step Guide",
    keywords: ["FBR QR invoice Pakistan", "QR invoice generator Pakistan", "FBR invoice QR code"],
    focus: "generating QR-coded FBR invoices for Pakistani businesses",
    businessType: "general",
  },
  {
    title: "FBR POS System for Restaurants in Pakistan – What You Must Know in 2026",
    keywords: ["restaurant POS Pakistan", "FBR POS restaurant", "food business FBR compliance Pakistan"],
    focus: "FBR POS requirements for restaurants and food businesses in Pakistan",
    businessType: "restaurant",
  },
  {
    title: "POS System Karachi – FBR Compliant Solutions for Karachi Businesses",
    keywords: ["POS system Karachi", "FBR POS Karachi", "Karachi retail POS software"],
    focus: "FBR-compliant POS solutions for businesses operating in Karachi",
    businessType: "general",
  },
  {
    title: "POS System Lahore – FBR Integration for Lahore Retailers 2026",
    keywords: ["POS system Lahore", "FBR POS Lahore", "Lahore retail POS software"],
    focus: "FBR-compliant POS systems for businesses operating in Lahore",
    businessType: "general",
  },
  {
    title: "FBR Sales Tax Returns Pakistan – How POS Integration Simplifies Monthly Filing",
    keywords: ["FBR sales tax return Pakistan", "monthly tax filing Pakistan", "FBR POS tax filing"],
    focus: "how FBR POS integration makes monthly sales tax returns easier in Pakistan",
    businessType: "general",
  },
  {
    title: "Retail Inventory Management Pakistan – Track Stock with FBR POS System",
    keywords: ["retail inventory management Pakistan", "inventory tracking Pakistan", "POS inventory system Pakistan"],
    focus: "inventory management and stock tracking integrated with FBR POS systems in Pakistan",
    businessType: "retail",
  },
  {
    title: "FBR Compliance Checklist for Pakistani Businesses – 2026 Complete Guide",
    keywords: ["FBR compliance checklist Pakistan", "FBR requirements 2026", "FBR compliance Pakistan business"],
    focus: "complete FBR compliance checklist for Pakistani businesses in 2026",
    businessType: "general",
  },
  {
    title: "Multi-Branch POS System Pakistan – Managing Multiple Stores with FBR",
    keywords: ["multi branch POS Pakistan", "chain store POS Pakistan", "FBR POS multiple branches"],
    focus: "managing multi-branch retail operations with FBR-compliant POS software in Pakistan",
    businessType: "retail",
  },
  {
    title: "Cloud POS System Pakistan – Benefits of Cloud-Based FBR POS for Businesses",
    keywords: ["cloud POS Pakistan", "cloud based POS FBR Pakistan", "online POS system Pakistan"],
    focus: "advantages of cloud-based FBR POS systems for Pakistani businesses",
    businessType: "general",
  },
  {
    title: "FBR POS for Wholesale Distributors in Pakistan – Compliance Requirements",
    keywords: ["wholesale POS Pakistan", "FBR distributor compliance", "wholesale FBR invoicing Pakistan"],
    focus: "FBR POS compliance requirements for wholesale distributors in Pakistan",
    businessType: "wholesale",
  },
  {
    title: "FBR IRIS Portal Pakistan – Complete Guide to POS Registration and Integration",
    keywords: ["FBR IRIS portal Pakistan", "IRIS POS registration", "FBR IRIS integration guide"],
    focus: "using the FBR IRIS portal for POS registration and integration in Pakistan",
    businessType: "general",
  },
];

function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const entry = { ts: new Date().toISOString(), level, message, ...(data ? { data } : {}) };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function generateWithGroq(topic: (typeof BLOG_TOPICS)[0]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const prompt = `You are a senior SEO content writer specialising in FBR compliance and Pakistani business technology.

Write a LONG, DETAILED, SEO-optimised blog post titled: "${topic.title}"
Focus: ${topic.focus}

STRICT REQUIREMENTS:
- You MUST write AT LEAST 1400 words of actual content. Do not stop early.
- Target: Pakistani ${topic.businessType} business owners
- Include ALL of these sections (each section must be 150-200 words minimum):
  1. Introduction — what this topic means for Pakistani businesses
  2. What the FBR law says — specific SRO references, penalties
  3. Step-by-step compliance guide — numbered list, 6-8 steps
  4. Common mistakes businesses make — 4-5 bullet points with explanations
  5. How FBR IRIS integration works — technical but simple explanation
  6. QR invoicing requirements — what it means and how to implement
  7. Benefits of being compliant — 4+ benefits with details
  8. Frequently asked questions — 3 Q&As
  9. Conclusion with CTA to contact Phelix ERP via WhatsApp: https://wa.me/${WA_NUMBER}
- Use H2 and H3 headings, bullet lists, and numbered steps throughout
- Output ONLY clean HTML tags (h2, h3, p, ul, li, ol, strong)
- Do NOT include <html>, <head>, <body>, or <article> wrappers
- Start directly with an <h2> tag
- IMPORTANT: Do not truncate or summarise — write the full content for every section`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 6000,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "unknown");
    throw new Error(`Groq ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0].message.content;
}

function generateTemplate(topic: (typeof BLOG_TOPICS)[0]): string {
  const shortTitle = topic.title.split("–")[0].trim();
  const keyword = topic.keywords[0];

  return `<h2>Understanding ${shortTitle}</h2>
<p>Pakistan's Federal Board of Revenue (FBR) has fundamentally changed how businesses must operate. With the mandatory POS integration requirement actively enforced across major cities, business owners who delay compliance face serious financial and legal consequences. This comprehensive guide explains everything about ${topic.focus}, helping you stay compliant, avoid penalties, and run your business more efficiently.</p>
<p>Whether you are a first-time entrepreneur or an established retailer, understanding your obligations under the FBR POS system is no longer optional. FBR inspections intensified significantly in 2025 and 2026, with non-compliant businesses facing fines, STRN suspension, and forced closures. This guide gives you a clear path to full compliance.</p>

<h2>What Is the FBR POS Integration Mandate?</h2>
<p>The FBR POS integration mandate requires businesses to connect their Point of Sale systems directly to FBR IRIS in real time. Every sale is automatically recorded with the FBR, a QR-coded invoice is generated for the customer, and sales tax is calculated and submitted without manual intervention.</p>
<p>This requirement was introduced under SRO 1006(I)/2019 and has been progressively expanded to cover more business categories. It is not optional — it is a legal obligation enforced through the Sales Tax Act. Businesses that operate outside this system are in violation of Pakistani tax law.</p>

<h2>Who Must Comply with ${keyword}?</h2>
<p>FBR's POS integration requirements currently apply to:</p>
<ul>
<li><strong>Tier-1 Retailers</strong> – Businesses with annual turnover above the FBR threshold</li>
<li><strong>Chain Stores and Franchises</strong> – Any business operating from multiple locations</li>
<li><strong>Pharmacies and Medical Stores</strong> – Especially in Karachi, Lahore, Islamabad, Rawalpindi, and Faisalabad</li>
<li><strong>Restaurants and Food Businesses</strong> – Dine-in restaurants, fast food outlets registered for sales tax</li>
<li><strong>Wholesale Distributors</strong> – Distributors with an STRN supplying goods to retailers</li>
<li><strong>Departmental Stores</strong> – Multi-category retail businesses under one roof</li>
</ul>
<p>FBR has stated its intention to extend requirements to all STRN-registered businesses. If your business is registered for sales tax, assume that POS integration will be required — getting ahead of this now puts you in a far stronger position.</p>

<h2>How FBR IRIS Integration Works</h2>
<p>FBR IRIS (Integrated Revenue Information System) is the central government platform managing tax registrations, filings, and real-time invoice data. When your POS is integrated with FBR IRIS, the following happens automatically with every transaction:</p>
<ol>
<li>Your POS captures sale details — items, quantities, prices</li>
<li>Sales tax is calculated at the applicable rate for each product category</li>
<li>Invoice data is transmitted to FBR IRIS via a secure API connection</li>
<li>FBR assigns a unique verification code to the invoice</li>
<li>A QR code is generated and printed on the customer receipt</li>
<li>The transaction is permanently recorded in the FBR system</li>
</ol>
<p>Customers can scan the QR code to verify the invoice on the FBR website, confirming the purchase has been properly recorded. This builds customer trust and reduces the risk of internal sales fraud.</p>

<h2>Step-by-Step: Getting Your Business Compliant</h2>
<h3>Step 1 – Verify Your STRN</h3>
<p>Before integrating any POS system, you need a valid Sales Tax Registration Number (STRN). Log in to iris.fbr.gov.pk using your NTN credentials. If not yet registered for sales tax, complete registration first — you need your CNIC, NTN, and business registration documents.</p>

<h3>Step 2 – Choose an FBR-Compatible POS System</h3>
<p>Not every POS system supports genuine FBR IRIS integration. Look for software that explicitly supports real-time API connection to FBR IRIS, has a track record with Pakistani businesses, and includes local support in English and Urdu. Generic international software rarely meets these requirements without significant customisation.</p>

<h3>Step 3 – Register on FBR IRIS</h3>
<p>Navigate to the POS System Registration section in the IRIS portal. Enter your STRN, business address, and number of POS terminals. FBR will issue API credentials that your POS provider uses to establish the integration.</p>

<h3>Step 4 – Configure and Test</h3>
<p>Provide your API credentials to your POS provider. A qualified provider handles all technical configuration — FBR connection, tax rate setup, and test invoice generation. Before going live, verify at least five test transactions appear correctly in your IRIS portal.</p>

<h3>Step 5 – Train Staff and Go Live</h3>
<p>FBR-compliant POS systems are designed for non-technical users. Staff training takes 20–30 minutes. Ensure all team members understand the basic sales flow and how to handle offline transactions (which sync automatically when connectivity returns).</p>

<h2>FBR Penalties for Non-Compliance</h2>
<p>The consequences of operating without proper FBR POS integration are severe:</p>
<ul>
<li><strong>Monetary fines</strong> – PKR 10,000 for a first offense, up to PKR 1,000,000 for persistent violations</li>
<li><strong>STRN suspension</strong> – Makes it illegal to issue sales tax invoices, disrupting your entire supply chain</li>
<li><strong>Business raids</strong> – FBR inspectors conduct surprise visits and can physically close operations</li>
<li><strong>Tax audit trigger</strong> – Non-integrated businesses are automatically flagged for comprehensive tax audits</li>
<li><strong>Reputation damage</strong> – FBR can publish lists of non-compliant businesses</li>
</ul>
<p>The cumulative cost of non-compliance — fines, disruption, audit fees, lost business — far exceeds the cost of a proper POS system. Compliance is an investment, not an expense.</p>

<h2>Business Benefits Beyond Compliance</h2>
<p>FBR POS integration delivers tangible operational benefits:</p>
<ul>
<li><strong>Automated bookkeeping</strong> – Every transaction is digitally recorded, eliminating manual entries and errors</li>
<li><strong>Simplified tax filing</strong> – Monthly sales tax returns are prepared from your FBR-submitted data, saving accountant time</li>
<li><strong>Real-time inventory tracking</strong> – Know exactly what is in stock, preventing overstocking and stockouts</li>
<li><strong>Fraud prevention</strong> – QR-coded invoices make it impossible for staff to pocket cash from unrecorded sales</li>
<li><strong>Business analytics</strong> – Daily, weekly, and monthly reports give you data to make better decisions</li>
<li><strong>Customer confidence</strong> – Scannable receipts signal that your business is professional and trustworthy</li>
</ul>

<h2>Common Questions About ${keyword}</h2>
<h3>Does FBR integration require expensive hardware?</h3>
<p>No. Modern FBR-compatible POS software runs on standard smartphones, tablets, and computers. You do not need specialised POS terminals — though printers can be added for a professional setup.</p>
<h3>What if my internet connection goes down?</h3>
<p>Quality FBR POS systems include offline mode. Transactions processed without internet are stored locally and automatically synced to FBR IRIS when connectivity returns.</p>
<h3>How quickly can I get set up?</h3>
<p>With the right provider, complete setup — FBR IRIS registration, API integration, configuration, and training — can be done within 24 hours. Many businesses are live the same day they sign up.</p>

<h2>How Phelix ERP Handles FBR Compliance for You</h2>
<p>Phelix ERP is Pakistan's dedicated FBR-integrated POS and business management system, built from the ground up for Pakistani compliance requirements. Here is what you get:</p>
<ul>
<li>Real-time FBR IRIS API integration with automatic QR invoice generation</li>
<li>STRN registration assistance handled by our team</li>
<li>Multi-branch POS management from a single account</li>
<li>Inventory management with automatic stock deduction on every sale</li>
<li>Daily, weekly, and monthly sales reports</li>
<li>Cloud backup — data is safe even if your device is lost</li>
<li>Works on any Android phone, iPhone, tablet, or laptop</li>
<li>Staff training completed in under 30 minutes</li>
<li>Ongoing support in English and Urdu via WhatsApp</li>
</ul>
<p>Phelix ERP serves 20+ businesses across Karachi, Lahore, Islamabad, Faisalabad, Rawalpindi, and other major cities. Plans start at PKR 1,500 per month — a fraction of the cost of a single FBR penalty.</p>

<div style='background:#FFF7ED;border:1px solid #FDBA74;border-radius:12px;padding:24px;margin:32px 0;'>
<p style='font-weight:700;font-size:18px;margin:0 0 8px;'>Get FBR compliant in 24 hours.</p>
<p style='margin:0 0 8px;color:#374151;'>Our team handles the complete FBR IRIS setup for you. Free demo on WhatsApp — we respond in minutes and can have you live the same day.</p>
<p style='margin:0 0 16px;color:#374151;'><strong>No technical knowledge needed. No hidden fees. Setup in 24 hours.</strong></p>
<a href='https://wa.me/${WA_NUMBER}' style='background:#25D366;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;'>Start Free WhatsApp Demo</a>
</div>`;
}

function pickTopicOrder(dayOffset: number): (typeof BLOG_TOPICS) {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const ordered: typeof BLOG_TOPICS = [];
  for (let i = 0; i < BLOG_TOPICS.length; i++) {
    ordered.push(BLOG_TOPICS[(dayOfYear + dayOffset + i) % BLOG_TOPICS.length]);
  }
  return ordered;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    // Vercel cron sends the secret as Bearer; also accept direct header from Vercel infra
    const isVercelCron = req.headers.get("x-vercel-signature") !== null;
    if (!isVercelCron && auth !== `Bearer ${cronSecret}`) {
      log("warn", "Unauthorized blog generation attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const topicOffset = parseInt(req.nextUrl.searchParams.get("topic") ?? "0", 10);
  log("info", "Blog generation started", { topicOffset });

  const candidates = pickTopicOrder(topicOffset);
  let selectedTopic = candidates[0];
  let slug = slugify(selectedTopic.title);

  for (const candidate of candidates) {
    const candidateSlug = slugify(candidate.title);
    const dupe = await isDuplicateSlug(candidateSlug);
    if (!dupe) {
      selectedTopic = candidate;
      slug = candidateSlug;
      log("info", "Topic selected", { slug, title: selectedTopic.title });
      break;
    }
    log("info", "Skipping duplicate slug", { candidateSlug });
  }

  if (await isDuplicateSlug(slug)) {
    log("warn", "All candidate topics already published", { slug });
    return NextResponse.json({ success: false, reason: "All topics already published today" });
  }

  let content: string;
  let source: "groq" | "template";

  try {
    log("info", "Attempting Groq generation");
    content = await generateWithGroq(selectedTopic);
    const words = countWords(content);
    log("info", "Groq generation complete", { words });

    if (words < MIN_WORD_COUNT) {
      log("warn", "Groq output below minimum — falling back to template", { words, minimum: MIN_WORD_COUNT });
      content = generateTemplate(selectedTopic);
      source = "template";
    } else {
      source = "groq";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("warn", "Groq failed — using template fallback", { error: message });
    content = generateTemplate(selectedTopic);
    source = "template";
  }

  const finalWords = countWords(content);

  if (finalWords < MIN_WORD_COUNT) {
    log("error", "Content still below minimum after fallback", { words: finalWords });
    return NextResponse.json(
      { success: false, reason: "Content below minimum word count", words: finalWords },
      { status: 500 }
    );
  }

  const blog: BlogPost = {
    slug,
    title: selectedTopic.title,
    metaDescription: `${selectedTopic.focus.charAt(0).toUpperCase() + selectedTopic.focus.slice(1)} — complete guide for Pakistani businesses. FBR POS compliance, e-invoicing requirements, and step-by-step setup.`,
    keywords: selectedTopic.keywords,
    content,
    publishedAt: new Date().toISOString(),
    readTime: Math.max(1, Math.ceil(finalWords / 200)),
  };

  try {
    await pushBlogToGitHub(blog);
    log("info", "Blog pushed to GitHub", { slug, source, words: finalWords });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", "Failed to push blog to GitHub", { slug, error: message });
    return NextResponse.json(
      { success: false, reason: "GitHub push failed", error: message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    slug: blog.slug,
    title: blog.title,
    source,
    words: finalWords,
    readTime: blog.readTime,
  });
}
