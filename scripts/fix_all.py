"""
fix_all.py — Full system fix
Fixes: titles, FAQs, markdown, meta descriptions, clusters,
       pinnedTitle flag, new blog, author bio (index.json)
"""
import json, os, re, glob

BASE  = r"C:\Users\Noman Traders\Downloads\fbr-pos-landing\data\blogs"
IDX   = r"C:\Users\Noman Traders\Downloads\fbr-pos-landing\data\index.json"

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def load(slug):
    with open(os.path.join(BASE, slug + ".json"), encoding="utf-8") as f:
        return json.load(f)

def save(slug, data):
    with open(os.path.join(BASE, slug + ".json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def patch(slug, **kwargs):
    d = load(slug)
    for k, v in kwargs.items():
        d[k] = v
    save(slug, d)


# ──────────────────────────────────────────────────────────────────────────────
# FIX 1 — Restore correct titles (6 blogs agent overwrote)
# ──────────────────────────────────────────────────────────────────────────────
print("FIX 1: Restoring correct titles...")

patch("retail-pos-compliance-pakistan-fbr-penalties-guide",
      title="Retail POS Compliance Pakistan: FBR Penalties, Fines & How to Stay Compliant in 2026",
      pinnedTitle=True)

patch("fbr-pos-system-for-restaurants-in-pakistan-what-you-must-know-in-2026",
      title="FBR POS System for Restaurants in Pakistan: What You Must Know in 2026",
      pinnedTitle=True)

patch("pos-system-karachi-fbr-compliant-solutions-for-karachi-businesses",
      title="POS System Karachi: FBR-Compliant Solutions for Karachi Businesses 2026",
      pinnedTitle=True)

patch("fbr-sales-tax-returns-pakistan-how-pos-integration-simplifies-monthly-filing",
      title="FBR Sales Tax Returns Pakistan: How POS Integration Simplifies Monthly Filing",
      pinnedTitle=True)

patch("retail-inventory-management-pakistan-track-stock-with-fbr-pos-system",
      title="Retail Inventory Management Pakistan: Track Stock with FBR POS System",
      pinnedTitle=True)

patch("multi-branch-pos-system-pakistan-managing-multiple-stores-with-fbr",
      title="Multi-Branch POS System Pakistan: Managing Multiple Stores with FBR 2026",
      pinnedTitle=True)

print("  Done — 6 titles restored + pinnedTitle=True set")


# ──────────────────────────────────────────────────────────────────────────────
# FIX 2 — Add pinnedTitle=True to remaining 8 hand-written blogs
# ──────────────────────────────────────────────────────────────────────────────
print("FIX 2: Setting pinnedTitle on remaining hand-written blogs...")

for slug in [
    "best-pos-software-pakistan-fbr-compliant-2026",
    "fbr-compliance-checklist-for-pakistani-businesses-2026-complete-guide",
    "fbr-e-invoicing-pakistan-explained",
    "fbr-pos-system-for-pharmacies-in-pakistan-complete-compliance-guide-2026",
    "fbr-pos-system-pakistan-complete-guide-2026",
    "how-to-generate-fbr-qr-invoices-in-pakistan-step-by-step-guide",
    "how-to-register-pos-fbr-pakistan-step-by-step",
    "pos-system-lahore-fbr-integration-for-lahore-retailers-2026",
]:
    patch(slug, pinnedTitle=True)

print("  Done — 8 more blogs pinned")


# ──────────────────────────────────────────────────────────────────────────────
# FIX 3 — Restore FAQs for 3 blogs that agent wiped
# ──────────────────────────────────────────────────────────────────────────────
print("FIX 3: Restoring FAQs for 3 blogs...")

patch("fbr-sales-tax-returns-pakistan-how-pos-integration-simplifies-monthly-filing",
      faqs=[
          {"question": "Does FBR POS integration automatically prepare my monthly sales tax return?",
           "answer": "FBR-integrated POS systems record every sale with the correct tax rate in real time. At month end the data is already structured correctly, so you can file Form STR-7 directly from POS reports without manual data entry or reconciliation."},
          {"question": "What is the deadline for monthly FBR sales tax return filing in Pakistan?",
           "answer": "The monthly sales tax return (Form STR-7) is due by the 18th of the following month. FBR POS integration ensures all sales are recorded accurately so you are ready to file on time without last-minute data scrambling."},
          {"question": "Can I still file manually if I have FBR POS integration?",
           "answer": "Yes. POS integration automates invoice submission to IRIS in real time, but the monthly return is still a separate filing step. The advantage is your data is already accurate and complete, making manual filing significantly faster."},
          {"question": "What happens if my POS sales data does not match my FBR IRIS records?",
           "answer": "Mismatches trigger audit flags in the FBR system. With real-time POS integration every invoice is submitted immediately so your IRIS records always match your POS records — eliminating reconciliation issues before they become audit risks."},
          {"question": "Does Phelix ERP generate sales tax reports ready for FBR return filing?",
           "answer": "Yes. Phelix ERP generates monthly tax summary reports broken down by tax rate, sale type, and product category — exactly the format needed for FBR STR-7 filing, saving hours of manual compilation each month."}
      ])

patch("multi-branch-pos-system-pakistan-managing-multiple-stores-with-fbr",
      faqs=[
          {"question": "Does each branch need its own FBR POS registration?",
           "answer": "Yes. FBR requires a separate POS registration (unique POSID) for each branch location. All branches can operate under the same business STRN, but each point of sale must be individually registered in IRIS."},
          {"question": "Can I see consolidated sales reports from all branches in one dashboard?",
           "answer": "Yes. Phelix ERP provides a central dashboard that aggregates sales, tax collected, and invoice counts from all registered branches so you get a group-level view alongside branch-level detail in real time."},
          {"question": "What happens if one branch goes offline — do I lose FBR compliance?",
           "answer": "Phelix ERP queues invoices locally when a branch loses connectivity and submits them to FBR IRIS as soon as the connection restores. FBR allows a short grace window for documented network outages."},
          {"question": "Can different branches have different product catalogues in the same system?",
           "answer": "Yes. Phelix ERP supports branch-specific product lists, pricing, and tax mappings while maintaining a shared customer and item master across all locations for consistency."},
          {"question": "How long does it take to add a new branch to an existing Phelix ERP setup?",
           "answer": "Adding a new branch typically takes 24 to 48 hours — FBR IRIS registration for the new POSID, hardware setup, and data sync from the central system. Phelix ERP manages the IRIS registration steps on your behalf."}
      ])

patch("retail-inventory-management-pakistan-track-stock-with-fbr-pos-system",
      faqs=[
          {"question": "Does FBR require inventory records to be connected to the POS system?",
           "answer": "FBR does not mandate a specific inventory module, but accurate invoicing requires correct product descriptions, HS codes, and quantities — all of which come from your inventory master. A connected system prevents invoice rejections caused by missing or wrong item data."},
          {"question": "How does real-time inventory tracking help with FBR compliance?",
           "answer": "Real-time inventory ensures the product details on your FBR invoices exactly match your actual stock records. Discrepancies between physical stock and invoiced quantities are a common audit trigger in FBR inspections."},
          {"question": "Can Phelix ERP track stock across multiple branches and sync with FBR?",
           "answer": "Yes. Phelix ERP tracks inventory across all branches in a single dashboard. Each branch submits FBR invoices independently, but stock levels and product masters are shared and managed centrally."},
          {"question": "What is an HS code and why does it matter for inventory in FBR invoices?",
           "answer": "HS (Harmonized System) codes classify products for tax purposes. FBR requires the correct HS code on every invoice to determine the applicable sales tax rate. Phelix ERP validates HS codes against your inventory automatically and flags wrong entries before submission."},
          {"question": "How often should I reconcile physical stock with my POS inventory records?",
           "answer": "Best practice is a weekly spot-check and a full physical count monthly. FBR audits look for consistency between purchase records, inventory, and sales — regular reconciliation keeps you audit-ready at all times."}
      ])

print("  Done — FAQs restored on 3 blogs")


# ──────────────────────────────────────────────────────────────────────────────
# FIX 4 — Convert retail-inventory blog from Markdown to proper HTML
# ──────────────────────────────────────────────────────────────────────────────
print("FIX 4: Converting retail-inventory blog from Markdown to HTML...")

WA = "923118366981"
INVENTORY_HTML = """<h2>Why Retail Inventory Management Is Central to FBR Compliance</h2>
<p>For Pakistani retailers operating under FBR POS obligations, inventory management is not a back-office function — it is a compliance function. Every invoice you submit to FBR IRIS contains product details pulled directly from your item master: the product name, HS code, unit of measure, quantity, and applicable tax rate. If any of these are wrong in your inventory, every invoice is wrong. And wrong invoices mean FBR rejection, resubmission overhead, and audit exposure.</p>
<p>Phelix ERP connects your inventory master directly to your FBR POS billing layer. The moment a product is set up with the correct HS code and UOM, that data flows automatically into every invoice — no manual entry, no copy-paste errors.</p>

<h2>What FBR Actually Requires in Your Invoice Line Items</h2>
<p>Under SRO 1(I)/2023 and subsequent FBR directives, every POS invoice submitted to IRIS must include for each line item: the product description, the applicable HS code, the unit of measure (UOM), quantity sold, unit price, and the correct sales tax rate. These are not optional fields — IRIS rejects invoices where any of these are missing or mismatched.</p>
<p>This is where most Pakistani retailers run into problems. Their legacy billing software had generic product names with no HS codes. When FBR POS was mandated, they added HS codes as an afterthought — often wrong ones. A mobile phone shop in Lahore's Hall Road was found during an FBR inspection to have used the HS code for accessories on handset sales, resulting in a tax rate discrepancy across 4,000 invoices.</p>

<h2>How Phelix ERP Handles Inventory for FBR Invoices</h2>
<p>Phelix ERP treats your item master as the single source of truth for all FBR submissions. Here is how it works in practice:</p>
<ul>
<li><strong>HS code assignment:</strong> Set the HS code once on each product. Phelix ERP validates it against FBR's published HS code list on setup and again daily after automatic rate syncs.</li>
<li><strong>UOM validation:</strong> The system checks your selected unit of measure against the HS code. If you select "dozen" for an HS code that only accepts "piece" as a valid UOM, the system flags it and suggests the correct unit before you can save.</li>
<li><strong>Rate auto-calculation:</strong> Once HS code and UOM are set, the tax rate is calculated automatically based on sale type (retail, wholesale, export). No manual rate lookup required.</li>
<li><strong>Stock movement tracking:</strong> Every sale decrements stock in real time. Every return increments it. Purchase entries from suppliers update stock with correct cost prices for margin reporting.</li>
</ul>

<h2>Multi-Branch Inventory Across Pakistan</h2>
<p>Retailers with more than one location face an additional layer of complexity: each branch must have its own FBR POSID, and each branch's invoices are filed under that POSID. But the product catalogue, HS codes, and pricing should be consistent across all branches to avoid discrepancies if FBR cross-references invoice data.</p>
<p>Phelix ERP manages a central product master shared across all branches. When you update an HS code or price on any product, the change propagates to all branch POS terminals. Each branch still files independently, but from the same product master — eliminating the risk of one branch submitting a different HS code for the same product than another branch.</p>

<h2>Stock Reconciliation and FBR Audit Readiness</h2>
<p>FBR inspectors increasingly cross-reference invoice data against purchase records and physical stock. If a retailer's IRIS invoices show 500 units of an item sold but purchase records only show 300 units procured, it triggers a detailed audit. Phelix ERP's inventory reports let you run a full stock reconciliation — purchase history vs sales vs current stock on hand — in minutes, giving you audit-ready data before an inspector arrives.</p>
<p>Best practice for Tier-1 retailers in Pakistan:</p>
<ul>
<li>Run weekly spot-checks on your 10 fastest-moving items</li>
<li>Run a full physical count at month end before filing your STR-7 return</li>
<li>Reconcile your Phelix ERP inventory report against your purchase invoices quarterly</li>
</ul>

<h2>Bulk Import for Large Catalogues</h2>
<p>Retailers with large product catalogues — supermarkets, electronics stores, clothing wholesalers — often have hundreds or thousands of SKUs. Setting up each item manually is impractical. Phelix ERP supports bulk item import via spreadsheet: upload your product list with HS codes, UOMs, and prices, and the system validates and imports all items in one step. HS code mismatches and invalid UOMs are flagged before import so you fix them upfront rather than discovering errors during FBR submission.</p>

<h2>Getting Started with Phelix ERP Inventory</h2>
<p>Setting up inventory in Phelix ERP for FBR compliance involves three steps: import your product catalogue (or build it item by item), assign HS codes with Phelix ERP's built-in validation, and connect your branches. The system handles the rest — daily HS code syncs from FBR, automatic rate calculations, and real-time stock movement tracking across every sale and return.</p>
<p>Businesses in Karachi, Lahore, Islamabad, and Faisalabad have completed this setup within 24 to 48 hours with Phelix ERP's onboarding team handling the FBR IRIS registration and initial product catalogue validation.</p>

<div style='background:#FFF7ED;border:1px solid #FDBA74;border-radius:12px;padding:24px;margin:32px 0;'>
<p style='font-weight:700;font-size:18px;margin:0 0 8px;'>Get your inventory FBR-ready in 24 hours.</p>
<p style='margin:0 0 16px;color:#374151;'>Our team sets up your item master, HS codes, and FBR IRIS connection. Free demo on WhatsApp.</p>
<a href='https://wa.me/923118366981' style='background:#25D366;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;'>Start Free WhatsApp Demo</a>
</div>"""

patch("retail-inventory-management-pakistan-track-stock-with-fbr-pos-system",
      content=INVENTORY_HTML)

print("  Done — Markdown converted to HTML")


# ──────────────────────────────────────────────────────────────────────────────
# FIX 5 — Fix new agent-generated blog (lowercase title + bad meta)
# ──────────────────────────────────────────────────────────────────────────────
print("FIX 5: Fixing new blog title and meta...")

patch("how-to-setup-fbr-penalty-in-pakistan",
      title="FBR Penalty in Pakistan: What It Costs, How It's Applied & How to Avoid It in 2026",
      metaDescription="Complete guide to FBR penalties in Pakistan 2026 — exact fine amounts for missing POS, late filing, wrong invoices, and step-by-step guide to staying penalty-free.",
      pinnedTitle=True)

print("  Done — new blog title and meta fixed")


# ──────────────────────────────────────────────────────────────────────────────
# FIX 6 — Trim meta descriptions to ≤155 chars
# ──────────────────────────────────────────────────────────────────────────────
print("FIX 6: Trimming meta descriptions to 155 chars...")

META_FIXES = {
    "best-pos-software-pakistan-fbr-compliant-2026":
        "How to choose the best FBR-compliant POS software in Pakistan 2026 — key features, red flags, pricing, and what real compliance actually looks like.",

    "fbr-compliance-checklist-for-pakistani-businesses-2026-complete-guide":
        "FBR compliance checklist for Pakistani businesses 2026 — STRN verification, POS registration, QR invoicing, and monthly filing steps in one complete guide.",

    "fbr-e-invoicing-pakistan-explained":
        "FBR e-invoicing explained — what QR invoices contain, how IRIS integration works, and which businesses in Pakistan are legally required to comply in 2026.",

    "fbr-pos-system-for-pharmacies-in-pakistan-complete-compliance-guide-2026":
        "FBR POS compliance for pharmacies in Pakistan — SRO 1216 requirements, how medicine sales are taxed, and which POS systems are approved for 2026.",

    "fbr-sales-tax-returns-pakistan-how-pos-integration-simplifies-monthly-filing":
        "How FBR POS integration simplifies monthly sales tax returns in Pakistan — automate STR-7 data, cut reconciliation time, and file on time every month.",

    "multi-branch-pos-system-pakistan-managing-multiple-stores-with-fbr":
        "How to manage multiple retail branches with FBR-compliant POS in Pakistan — POSID per branch, central reporting, and avoiding cross-branch compliance gaps.",

    "pos-system-karachi-fbr-compliant-solutions-for-karachi-businesses":
        "FBR-compliant POS systems for Karachi businesses in 2026 — which Karachi markets are FBR-targeted, what fines apply, and how to get compliant fast.",

    "retail-inventory-management-pakistan-track-stock-with-fbr-pos-system":
        "Retail inventory management for FBR POS compliance in Pakistan — HS code validation, UOM matching, stock reconciliation, and audit-ready reporting.",
}

for slug, meta in META_FIXES.items():
    assert len(meta) <= 155, f"Meta too long: {slug} = {len(meta)}"
    patch(slug, metaDescription=meta)

print(f"  Done — {len(META_FIXES)} meta descriptions trimmed to <=155 chars")


# ──────────────────────────────────────────────────────────────────────────────
# FIX 7 — Assign clusters to all 15 blogs
# ──────────────────────────────────────────────────────────────────────────────
print("FIX 7: Assigning clusters to all 15 blogs...")

CLUSTER_MAP = {
    "fbr-pos-system-pakistan-complete-guide-2026":                              "fbr-compliance",
    "how-to-register-pos-fbr-pakistan-step-by-step":                           "fbr-compliance",
    "fbr-compliance-checklist-for-pakistani-businesses-2026-complete-guide":   "fbr-compliance",
    "retail-pos-compliance-pakistan-fbr-penalties-guide":                      "fbr-compliance",
    "how-to-setup-fbr-penalty-in-pakistan":                                    "fbr-compliance",

    "fbr-e-invoicing-pakistan-explained":                                      "fbr-invoicing",
    "how-to-generate-fbr-qr-invoices-in-pakistan-step-by-step-guide":         "fbr-invoicing",
    "fbr-sales-tax-returns-pakistan-how-pos-integration-simplifies-monthly-filing": "fbr-invoicing",

    "best-pos-software-pakistan-fbr-compliant-2026":                           "pos-software",
    "multi-branch-pos-system-pakistan-managing-multiple-stores-with-fbr":      "pos-software",
    "retail-inventory-management-pakistan-track-stock-with-fbr-pos-system":    "pos-software",

    "fbr-pos-system-for-restaurants-in-pakistan-what-you-must-know-in-2026":  "pos-by-industry",
    "fbr-pos-system-for-pharmacies-in-pakistan-complete-compliance-guide-2026": "pos-by-industry",

    "pos-system-karachi-fbr-compliant-solutions-for-karachi-businesses":       "pos-by-city",
    "pos-system-lahore-fbr-integration-for-lahore-retailers-2026":             "pos-by-city",
}

for slug, cluster in CLUSTER_MAP.items():
    patch(slug, cluster=cluster)

print(f"  Done — {len(CLUSTER_MAP)} blogs assigned to clusters")


# ──────────────────────────────────────────────────────────────────────────────
# FIX 8 — Update index.json: sync titles, clusters, pinnedTitle, lastUpdated
# ──────────────────────────────────────────────────────────────────────────────
print("FIX 8: Syncing index.json with all blog fixes...")

with open(IDX, encoding="utf-8") as f:
    index = json.load(f)

updated_index = []
for entry in index:
    slug = entry.get("slug", "")
    blog_path = os.path.join(BASE, slug + ".json")
    if not os.path.exists(blog_path):
        updated_index.append(entry)
        continue
    blog = json.load(open(blog_path, encoding="utf-8"))
    entry["title"]           = blog.get("title", entry.get("title"))
    entry["metaDescription"] = blog.get("metaDescription", entry.get("metaDescription", ""))
    entry["cluster"]         = blog.get("cluster", entry.get("cluster", ""))
    entry["pinnedTitle"]     = blog.get("pinnedTitle", False)
    # Mark as recently updated so agent won't immediately re-process
    entry["lastUpdated"]     = "2026-05-09T00:00:00.000Z"
    updated_index.append(entry)

with open(IDX, "w", encoding="utf-8") as f:
    json.dump(updated_index, f, ensure_ascii=False, indent=2)

print("  Done — index.json fully synced")


# ──────────────────────────────────────────────────────────────────────────────
# VERIFY — Final check
# ──────────────────────────────────────────────────────────────────────────────
print()
print("=" * 80)
print("FINAL VERIFICATION")
print("=" * 80)

def wc(html):
    return len(re.sub(r"<[^>]+>", " ", html).split())

def has_md(html):
    return bool(re.search(r"^#{1,3} |\*\*", html, re.MULTILINE))

files = sorted(glob.glob(BASE + r"\*.json"))
all_ok = True
for fp in files:
    d = json.load(open(fp, encoding="utf-8"))
    slug    = d.get("slug", "")[:48]
    words   = wc(d.get("content", ""))
    faqs    = len(d.get("faqs", []))
    md      = "MARKDOWN!" if has_md(d.get("content", "")) else "ok"
    meta_l  = len(d.get("metaDescription", ""))
    cluster = d.get("cluster", "NONE")
    pinned  = "PIN" if d.get("pinnedTitle") else "---"
    warn    = ""
    if words < 1200: warn += " WORDS<1200"
    if faqs < 5:     warn += " FAQS<5"
    if md != "ok":   warn += " MARKDOWN"
    if meta_l > 155: warn += f" META:{meta_l}"
    if cluster == "NONE": warn += " NO-CLUSTER"
    if warn: all_ok = False
    status = "WARN" if warn else " OK "
    print(f"[{status}] {pinned} {words:>5}w {faqs}faq {meta_l:>3}ch {cluster:<18} {slug}{warn}")

print()
print("ALL CLEAR!" if all_ok else "ISSUES REMAIN — check above")
