"""
inject_schema_fix_titles.py
1. Inject Article + FAQPage JSON-LD schema into all 15 blogs that lack it
2. Trim 7 titles that exceed 70 chars (Google truncation in SERPs)
"""
import json, os, glob, re

BASE     = r"C:\Users\Noman Traders\Downloads\fbr-pos-landing\data\blogs"
IDX      = r"C:\Users\Noman Traders\Downloads\fbr-pos-landing\data\index.json"
SITE_URL = "https://phelixerp.vercel.app"
SITE_NAME = "Phelix ERP"

# ──────────────────────────────────────────────────────────────────────────────
# FIX 1 — Trim titles to ≤70 chars
# ──────────────────────────────────────────────────────────────────────────────

TITLE_FIXES = {
    "fbr-compliance-checklist-for-pakistani-businesses-2026-complete-guide":
        "FBR Compliance Checklist for Pakistani Businesses 2026",  # 54

    "fbr-pos-system-for-pharmacies-in-pakistan-complete-compliance-guide-2026":
        "FBR POS System for Pharmacies in Pakistan: 2026 Guide",   # 53

    "fbr-sales-tax-returns-pakistan-how-pos-integration-simplifies-monthly-filing":
        "FBR Sales Tax Returns Pakistan: How POS Integration Helps", # 58

    "how-to-setup-fbr-penalty-in-pakistan":
        "FBR Penalty Pakistan: Costs, Rules & How to Avoid It 2026", # 58

    "multi-branch-pos-system-pakistan-managing-multiple-stores-with-fbr":
        "Multi-Branch POS System Pakistan: Managing Multiple Stores", # 57

    "pos-system-karachi-fbr-compliant-solutions-for-karachi-businesses":
        "POS System Karachi: FBR-Compliant Solutions 2026",          # 49

    "retail-pos-compliance-pakistan-fbr-penalties-guide":
        "Retail POS Compliance Pakistan: FBR Penalties Guide 2026",  # 57
}

# Validate all are ≤70
for slug, title in TITLE_FIXES.items():
    assert len(title) <= 70, f"Still too long ({len(title)}): {title}"

print("FIX 1: Trimming long titles...")
for slug, title in TITLE_FIXES.items():
    path = os.path.join(BASE, slug + ".json")
    d = json.load(open(path, encoding="utf-8"))
    old = d["title"]
    d["title"] = title
    json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"  {len(old):>3}ch -> {len(title):>2}ch  {title}")
print()


# ──────────────────────────────────────────────────────────────────────────────
# FIX 2 — Inject Article + FAQPage schema into all blogs missing it
# ──────────────────────────────────────────────────────────────────────────────

def has_schema(html):
    return 'application/ld+json' in html

def build_article_schema(blog, site_url, site_name):
    url = f"{site_url.rstrip('/')}/blog/{blog['slug']}"
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": blog["title"],
        "description": blog.get("metaDescription", ""),
        "author": {"@type": "Organization", "name": site_name},
        "publisher": {"@type": "Organization", "name": site_name},
        "datePublished": blog.get("publishedAt", "2025-01-01T00:00:00.000Z"),
        "dateModified":  blog.get("lastUpdated") or blog.get("publishedAt", "2025-01-01T00:00:00.000Z"),
        "url": url,
        "keywords": ", ".join(blog.get("keywords", [])),
    }

def build_faq_schema(blog):
    faqs = blog.get("faqs", [])
    if not faqs:
        return None
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": faq["q"] if "q" in faq else faq.get("question", ""),
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": faq["a"] if "a" in faq else faq.get("answer", ""),
                }
            }
            for faq in faqs
        ]
    }

def wrap_jsonld(obj):
    return f'<script type="application/ld+json">\n{json.dumps(obj, indent=2, ensure_ascii=False)}\n</script>'

def inject_schema(html, blog, site_url, site_name):
    if has_schema(html):
        return html  # already has it
    article = build_article_schema(blog, site_url, site_name)
    faq     = build_faq_schema(blog)
    blocks  = [wrap_jsonld(article)]
    if faq:
        blocks.append(wrap_jsonld(faq))
    injection = "\n" + "\n".join(blocks) + "\n"
    return html + injection  # append to end

print("FIX 2: Injecting Article + FAQPage schema into all blogs...")

files = sorted(glob.glob(BASE + r"\*.json"))
injected = 0
already  = 0

for fp in files:
    d = json.load(open(fp, encoding="utf-8"))
    slug = d.get("slug", "")

    if has_schema(d.get("content", "")):
        already += 1
        print(f"  SKIP  {slug[:55]}  (schema already present)")
        continue

    new_content = inject_schema(d.get("content", ""), d, SITE_URL, SITE_NAME)
    d["content"] = new_content
    json.dump(d, open(fp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    injected += 1
    faq_count = len(d.get("faqs", []))
    print(f"  INJ   {slug[:55]}  ({faq_count} FAQs in schema)")

print(f"\n  Injected: {injected}  Already had schema: {already}")
print()


# ──────────────────────────────────────────────────────────────────────────────
# FIX 3 — Sync index.json with updated titles
# ──────────────────────────────────────────────────────────────────────────────
print("FIX 3: Syncing index.json titles...")

with open(IDX, encoding="utf-8") as f:
    index = json.load(f)

for entry in index:
    slug = entry.get("slug", "")
    path = os.path.join(BASE, slug + ".json")
    if os.path.exists(path):
        blog = json.load(open(path, encoding="utf-8"))
        entry["title"] = blog.get("title", entry.get("title"))

with open(IDX, "w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False, indent=2)
print("  Done")
print()


# ──────────────────────────────────────────────────────────────────────────────
# FINAL VERIFICATION
# ──────────────────────────────────────────────────────────────────────────────
print("=" * 80)
print("FINAL VERIFICATION — ALL 15 BLOGS")
print("=" * 80)
print(f"{'SLUG':<52} {'W':>5} {'F':>3} {'H2':>3} {'M':>3} {'S':>3} {'T':>3} STATUS")
print("-" * 80)

def wc(html):
    return len(re.sub(r"<[^>]+>", " ", html).split())

def count_h2(html):
    return len(re.findall(r"<h2", html, re.IGNORECASE))

def has_md(html):
    return bool(re.search(r"^#{1,3} |\*\*", html, re.MULTILINE))

all_ok = True
for fp in sorted(glob.glob(BASE + r"\*.json")):
    d     = json.load(open(fp, encoding="utf-8"))
    slug  = d.get("slug", "")
    title = d.get("title", "")
    cont  = d.get("content", "")
    faqs  = d.get("faqs", [])

    words = wc(cont)
    nfaq  = len(faqs)
    h2    = count_h2(cont)
    md    = "YES" if has_md(cont) else " ok"
    sch   = " ok" if has_schema(cont) else "NO!"
    tlen  = len(title)
    tflag = "NO!" if tlen > 70 else " ok"

    issues = []
    if words < 1200: issues.append(f"WORDS:{words}")
    if nfaq < 5:     issues.append(f"FAQS:{nfaq}")
    if md == "YES":  issues.append("MARKDOWN")
    if sch == "NO!": issues.append("NO-SCHEMA")
    if tlen > 70:    issues.append(f"TITLE:{tlen}ch")

    status = "WARN" if issues else " OK "
    if issues: all_ok = False

    print(f"[{status}] {slug[:50]:<52} {words:>5} {nfaq:>3} {h2:>3} {md:>3} {sch:>3} {tflag:>3}")
    if issues:
        print(f"         Title({tlen}ch): {title}")
        print(f"         Issues: {', '.join(issues)}")

print()
print("ALL BLOGS PASS" if all_ok else "SOME BLOGS NEED ATTENTION — see above")
