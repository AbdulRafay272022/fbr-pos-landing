"""Fix blog titles, FAQs, and new blog metadata that the agent overwrote."""
import json, os

BASE = r"C:\Users\Noman Traders\Downloads\fbr-pos-landing\data\blogs"

def fix(slug, **kwargs):
    path = os.path.join(BASE, slug + ".json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    for k, v in kwargs.items():
        data[k] = v
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Fixed: {slug[:60]}")

# ── 1. Restore correct titles ─────────────────────────────────────────────────
fix("retail-pos-compliance-pakistan-fbr-penalties-guide",
    title="Retail POS Compliance Pakistan: FBR Penalties, Fines & How to Stay Compliant in 2026")

fix("fbr-pos-system-for-restaurants-in-pakistan-what-you-must-know-in-2026",
    title="FBR POS System for Restaurants in Pakistan: What You Must Know in 2026")

fix("pos-system-karachi-fbr-compliant-solutions-for-karachi-businesses",
    title="POS System Karachi: FBR-Compliant Solutions for Karachi Businesses 2026")

fix("fbr-sales-tax-returns-pakistan-how-pos-integration-simplifies-monthly-filing",
    title="FBR Sales Tax Returns Pakistan: How POS Integration Simplifies Monthly Filing")

fix("retail-inventory-management-pakistan-track-stock-with-fbr-pos-system",
    title="Retail Inventory Management Pakistan: Track Stock with FBR POS System")

fix("multi-branch-pos-system-pakistan-managing-multiple-stores-with-fbr",
    title="Multi-Branch POS System Pakistan: Managing Multiple Stores with FBR 2026")

# ── 2. Restore FAQs for 3 blogs that lost them ───────────────────────────────
fix("fbr-sales-tax-returns-pakistan-how-pos-integration-simplifies-monthly-filing",
    faqs=[
        {
            "q": "Does FBR POS integration automatically prepare my monthly sales tax return?",
            "a": "FBR-integrated POS systems record every sale with the correct tax rate in real time. At month end the data is already structured correctly, so your accountant or you can file Form STR-7 directly from the POS reports without manual data entry."
        },
        {
            "q": "What is the deadline for monthly FBR sales tax return filing in Pakistan?",
            "a": "The monthly sales tax return (Form STR-7) is due by the 18th of the following month. FBR POS integration ensures all sales are recorded correctly so you are ready to file on time without last-minute reconciliation."
        },
        {
            "q": "Can I still file manually if I have FBR POS integration?",
            "a": "Yes. POS integration automates invoice submission to IRIS in real time, but the monthly return is still a separate filing step. The integration just means your data is already accurate and complete, making manual filing much faster."
        },
        {
            "q": "What happens if my POS sales data does not match my FBR IRIS records?",
            "a": "Mismatches trigger audit flags in the FBR system. With real-time POS integration every invoice is submitted immediately, so your IRIS records always match your POS records — eliminating reconciliation issues."
        },
        {
            "q": "Does Phelix ERP generate sales tax reports for return filing?",
            "a": "Yes. Phelix ERP generates monthly tax summary reports broken down by tax rate, sale type, and product category — exactly the format needed for FBR STR-7 filing, saving hours of manual compilation."
        }
    ])

fix("retail-inventory-management-pakistan-track-stock-with-fbr-pos-system",
    faqs=[
        {
            "q": "Does FBR require inventory records to be connected to the POS system?",
            "a": "FBR does not mandate a specific inventory module, but accurate invoicing requires correct product descriptions, HS codes, and quantities — all of which come from your inventory master. A connected inventory system prevents invoice rejections."
        },
        {
            "q": "How does real-time inventory tracking help with FBR compliance?",
            "a": "Real-time inventory ensures that the product details on your FBR invoices exactly match your actual stock records. Discrepancies between physical stock and invoiced quantities are a common audit trigger."
        },
        {
            "q": "Can Phelix ERP track stock across multiple branches and sync it with FBR?",
            "a": "Yes. Phelix ERP tracks inventory across all branches in a single dashboard. Each branch submits FBR invoices independently, but stock levels and product masters are shared centrally."
        },
        {
            "q": "What is an HS code and why does it matter for inventory in FBR invoices?",
            "a": "HS (Harmonized System) codes classify products for tax purposes. FBR requires the correct HS code on every invoice to determine the applicable sales tax rate. Phelix ERP validates HS codes against your inventory automatically."
        },
        {
            "q": "How often should I reconcile physical stock with my POS inventory records?",
            "a": "Best practice is a weekly spot-check and a full physical count monthly. FBR audits look for consistency between purchase records, inventory, and sales — regular reconciliation keeps you audit-ready at all times."
        }
    ])

fix("multi-branch-pos-system-pakistan-managing-multiple-stores-with-fbr",
    faqs=[
        {
            "q": "Does each branch need its own FBR POS registration?",
            "a": "Yes. FBR requires a separate POS registration (and a unique POSID) for each branch location. All branches can be managed under the same STRN, but each point of sale must be individually registered in IRIS."
        },
        {
            "q": "Can I see consolidated sales reports from all branches in one place?",
            "a": "Yes. Phelix ERP provides a central dashboard that aggregates sales, tax collected, and invoice counts from all registered branches — so you get a group-level view alongside branch-level detail."
        },
        {
            "q": "What happens if one branch goes offline — do I lose FBR compliance?",
            "a": "Phelix ERP queues invoices locally when a branch loses connectivity and submits them to FBR IRIS as soon as the connection is restored. FBR allows a short grace window for network outages."
        },
        {
            "q": "Can different branches have different product catalogues in the same POS system?",
            "a": "Yes. Phelix ERP supports branch-specific product lists, pricing, and tax mappings, while maintaining a shared customer and item master across all locations."
        },
        {
            "q": "How long does it take to add a new branch to an existing Phelix ERP setup?",
            "a": "Adding a new branch typically takes 24-48 hours — FBR IRIS registration for the new POSID, hardware setup, and data sync from the central system. Phelix ERP handles the IRIS registration steps on your behalf."
        }
    ])

# ── 3. Fix new agent-generated blog ──────────────────────────────────────────
fix("how-to-setup-fbr-penalty-in-pakistan",
    title="FBR Penalty in Pakistan: What It Is, How Much It Costs & How to Avoid It in 2026",
    metaDescription="Complete guide to FBR penalties in Pakistan 2026 — penalty amounts for missing POS registration, late filing, incorrect invoices, and how to avoid them with the right POS system.")

print("\nAll done.")
