"""
Append additional content sections to blogs that are under 1200 words.
Each appended block adds ~250-400 meaningful words.
"""
import json, os, re

BASE = r"C:\Users\Noman Traders\Downloads\fbr-pos-landing\data\blogs"

def word_count(html):
    text = re.sub(r'<[^>]+>', ' ', html)
    return len(text.split())

def append_content(slug, extra_html):
    path = os.path.join(BASE, slug + ".json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    # Insert before the last CTA div
    content = data["content"]
    cta_start = content.rfind("<div style='background:#FFF7ED")
    if cta_start > 0:
        data["content"] = content[:cta_start] + extra_html + "\n" + content[cta_start:]
    else:
        data["content"] = content + extra_html
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    new_wc = word_count(data["content"])
    print(f"OK {new_wc:5d}w  {slug[:55]}")

# ── fbr-pos-system-pakistan-complete-guide-2026 ──────────────────────────────
append_content("fbr-pos-system-pakistan-complete-guide-2026", """
<h2>Frequently Asked Questions About FBR POS in Pakistan</h2>
<p>These are the questions Pakistani business owners ask most often when starting the FBR POS integration process.</p>
<h3>What is a Tier-1 retailer under FBR rules?</h3>
<p>FBR defines Tier-1 retailers as businesses operating in air-conditioned premises, those belonging to national or international chains, and businesses with annual turnover above a specified threshold. The exact criteria have been updated through successive SROs — if you are unsure whether your business qualifies, the safest approach is to check your STRN status on IRIS and consult a registered tax practitioner.</p>
<h3>What if I am not registered for sales tax — do I need FBR POS?</h3>
<p>If your business is not registered for sales tax (no STRN), you are not yet subject to the POS integration mandate. However, if your business turnover exceeds the registration threshold, you are legally required to register for sales tax — at which point POS integration becomes mandatory. Voluntary registration is also possible and can provide business benefits including input tax credit claims.</p>
<h3>How does FBR POS help with monthly tax returns?</h3>
<p>Because every sale is already recorded in FBR IRIS in real time, your monthly return data is pre-populated when it comes time to file. Your POS generates a monthly sales summary report that maps directly to Form ST-7 fields. What previously took accountants a full day of manual compilation can be completed in under an hour.</p>
<h3>Is my existing POS software likely to be FBR compliant?</h3>
<p>If your current POS does not generate a QR code on every receipt or if you cannot see your transactions in the FBR IRIS portal within 30 seconds of a sale, it is not genuinely FBR compliant. Many older or international POS systems claim compatibility but lack the real-time IRIS API integration that the law requires. Request a live demonstration before assuming compliance.</p>
""")

# ── how-to-register-pos-fbr-pakistan-step-by-step ───────────────────────────
append_content("how-to-register-pos-fbr-pakistan-step-by-step", """
<h2>After Registration — Maintaining Compliance</h2>
<p>Registration is a one-time process, but maintaining compliance is ongoing. Here is what you need to do after going live:</p>
<ul>
<li><strong>Monthly reconciliation</strong> — Before filing your monthly ST-7 return, verify that all invoices in your POS match the invoices in your IRIS portal. Check for any failed submissions (offline invoices that did not sync) and resolve them before the 18th filing deadline.</li>
<li><strong>Software updates</strong> — FBR periodically changes its API specifications or invoice format requirements. Ensure your POS provider pushes updates automatically so you remain compliant without manual intervention.</li>
<li><strong>Staff changes</strong> — When you hire new staff, ensure they receive basic POS training before serving customers. Untrained staff making errors with the POS can create non-compliant invoices or failed submissions.</li>
<li><strong>Adding new branches</strong> — Each new branch location must be separately registered on IRIS before it begins operating. Do not open a new branch on your existing POS registration without registering the new location first.</li>
<li><strong>Business changes</strong> — If you change your business address, add new product categories with different tax rates, or make any other changes that affect your IRIS profile, update your details on IRIS and notify your POS provider.</li>
</ul>
<h2>Support and Troubleshooting</h2>
<p>When your POS integration experiences issues, time matters. A failed IRIS connection means your invoices are not reaching FBR — every sale during that period is a potential compliance violation. Your POS provider must offer responsive support — ideally WhatsApp-based with same-day response — and must be able to diagnose and resolve IRIS connectivity issues quickly.</p>
<p>Common issues to watch for: API credential expiry (FBR occasionally reissues credentials), IRIS portal maintenance windows (scheduled maintenance is announced on the FBR website), and tax rate misconfigurations that only become apparent when IRIS rejects a submission.</p>
""")

# ── best-pos-software-pakistan-fbr-compliant-2026 ───────────────────────────
append_content("best-pos-software-pakistan-fbr-compliant-2026", """
<h2>Questions to Ask Before Buying FBR POS Software</h2>
<p>Before committing to any POS software, ask these specific questions and expect direct, verifiable answers:</p>
<ul>
<li><strong>"Can you show me a live transaction appearing in my FBR IRIS portal right now?"</strong> — A genuine integration can demonstrate this in a live demo. If the vendor hesitates or cannot show this, the integration is not genuine.</li>
<li><strong>"What happens during an internet outage — do transactions still reach FBR?"</strong> — The answer must be: transactions are stored locally and auto-synced to IRIS when connectivity returns. Anything else is non-compliant.</li>
<li><strong>"How do you handle FBR API changes?"</strong> — FBR updates its API periodically. A proper vendor has a monitoring process and pushes updates proactively, not reactively after you receive an FBR penalty.</li>
<li><strong>"What is your response time when IRIS submission fails?"</strong> — You need a same-day or faster response. Delays in fixing submission failures create unreported transactions that compound your compliance risk.</li>
<li><strong>"How many Pakistani businesses are currently live on your system?"</strong> — An established provider with multiple live clients is lower risk than a new entrant claiming FBR support with no existing customers.</li>
</ul>
<h2>The True Cost of the Wrong Choice</h2>
<p>Choosing the wrong POS software has costs beyond the subscription fee: FBR penalties for non-compliance, the disruption of switching systems mid-operation, staff retraining, and the risk of data loss during migration. The cheapest option almost always becomes the most expensive when these hidden costs are counted. Choose a proven, Pakistan-specific solution from the start — the cost difference is marginal compared to the risk reduction.</p>
""")

# ── fbr-e-invoicing-pakistan-explained ─────────────────────────────────────
append_content("fbr-e-invoicing-pakistan-explained", """
<h2>Digital vs Printed FBR Invoices — What Is Allowed</h2>
<p>FBR allows both printed and digital invoices, giving businesses flexibility in how they issue receipts to customers:</p>
<ul>
<li><strong>Printed thermal receipts</strong> — The most common format for retail. A Bluetooth thermal printer produces QR-coded receipts at the point of sale. These printers cost PKR 8,000–15,000 and are widely available in Pakistan.</li>
<li><strong>Digital invoices via WhatsApp</strong> — Increasingly popular. The POS generates a digital invoice image or PDF with the QR code and sends it to the customer's WhatsApp number directly from the billing screen.</li>
<li><strong>Email invoices</strong> — Suitable for B2B transactions where the customer requires an email record. Must include all mandatory fields and the QR code.</li>
<li><strong>SMS invoices</strong> — A link to the FBR-registered invoice can be sent via SMS, though the QR code must be accessible through the link.</li>
</ul>
<p>Regardless of format, the legal requirement is the same: the invoice must be FBR-registered (submitted to IRIS), contain all mandatory fields, and include a scannable QR code.</p>
<h2>E-Invoicing for B2B Transactions</h2>
<p>FBR e-invoicing also applies to business-to-business transactions. When a registered business sells to another registered business, the buyer uses the invoice's STRN information to claim input tax credits. This creates a connected chain of verified transactions throughout the supply chain — making tax evasion at any level much more difficult to conceal. For B2B sellers, FBR-compliant invoicing protects your relationship with registered business customers who need your STRN-verified invoices for their own input tax credit claims.</p>
<h2>Record Keeping Requirements</h2>
<p>FBR requires all issued invoices to be retained for a minimum of five years. With FBR POS integration, your invoices are stored in two places: in your POS system's local database and in the FBR IRIS system. If your local device is lost or damaged, your IRIS records remain intact. This dual-storage approach means you are always audit-ready without any special backup effort.</p>
""")

# ── retail-pos-compliance-pakistan-fbr-penalties-guide ──────────────────────
append_content("retail-pos-compliance-pakistan-fbr-penalties-guide", """
<h2>Staying Compliant After Initial Setup</h2>
<p>Getting compliant is the first step — staying compliant is an ongoing responsibility. The most common reasons businesses fall out of compliance after initial setup:</p>
<ul>
<li><strong>POS software not updated</strong> — FBR changes its API requirements and invoice format specifications. If your POS software does not receive updates, it gradually becomes non-compliant. Choose a provider with automatic update deployment.</li>
<li><strong>New product categories without tax configuration</strong> — When you add new product lines, ensure they are correctly configured with the right tax rate in your POS. An unconfigured product defaults to whatever rate the POS assigns by default, which may be incorrect.</li>
<li><strong>Offline invoices not syncing</strong> — Monitor your POS for "pending sync" invoices after any internet outage. These must reach IRIS before your monthly filing date.</li>
<li><strong>Staff processing sales outside the POS</strong> — This is the most serious compliance failure. If any staff member processes a sale manually (handwritten receipt, WhatsApp payment) without recording it in the POS, you have an unregistered transaction that could be flagged in an audit. Enforce a strict policy: every transaction goes through the POS, no exceptions.</li>
</ul>
<h2>Building a Culture of Compliance</h2>
<p>FBR compliance is most robust when it becomes a non-negotiable part of your business culture, not just a software installation. Communicate to all staff that every sale must be recorded in the POS, that QR invoices must be provided to every customer, and that shortcuts in billing are never acceptable regardless of circumstances. A culture of compliance protects both the business and the individual staff members from legal liability.</p>
""")

# ── fbr-pos-system-for-pharmacies ──────────────────────────────────────────
append_content("fbr-pos-system-for-pharmacies-in-pakistan-complete-compliance-guide-2026", """
<h2>DRAP and FBR — Understanding Both Obligations</h2>
<p>Pharmacy owners sometimes confuse DRAP (Drug Regulatory Authority Pakistan) requirements with FBR compliance. These are separate obligations managed by different government bodies:</p>
<ul>
<li><strong>DRAP requirements</strong> — Govern drug licensing, storage standards, qualified pharmacist requirements, and which medicines can be dispensed. DRAP does not manage invoicing or tax compliance.</li>
<li><strong>FBR requirements</strong> — Govern sales tax registration, invoice issuance, and POS integration. FBR does not regulate pharmaceutical products or dispensing.</li>
</ul>
<p>A pharmacy must comply with both independently. Your DRAP drug sale license and your FBR STRN are both mandatory — one does not substitute for the other.</p>
<h2>Medicine Inventory and FBR Audit Readiness</h2>
<p>During an FBR audit of a pharmacy, auditors compare your IRIS invoice data (medicines sold) against your inventory records (medicines received from distributors). Discrepancies between what you purchased and what your invoices show as sold can trigger deeper investigation. Integrated pharmacy POS that tracks medicines from receipt to dispensing creates a complete chain of records that satisfies both FBR auditors and eliminates ambiguity about your tax position.</p>
<p>Pharmaceutical distributors who supply your pharmacy are also registered for sales tax. Their invoices to you serve as your input tax credit documentation. Keep all supplier invoices securely — they reduce your monthly sales tax payment through input credits.</p>
<h2>Digital Prescriptions and FBR Receipts</h2>
<p>A growing number of Pakistani pharmacies are moving toward digital prescription records alongside digital FBR receipts. When a patient presents a prescription, the pharmacist can record the prescription details alongside the FBR sale, creating a linked prescription-and-invoice record. This supports both patient care continuity and business compliance documentation.</p>
""")

# ── fbr-pos-system-for-restaurants ─────────────────────────────────────────
append_content("fbr-pos-system-for-restaurants-in-pakistan-what-you-must-know-in-2026", """
<h2>Handling Voids, Discounts, and Complimentary Items</h2>
<p>Restaurant operations regularly involve order voids, staff meals, and complimentary items for VIP customers. Each of these has specific FBR handling requirements:</p>
<ul>
<li><strong>Voided orders</strong> — When an order is cancelled before payment, a void transaction must be recorded in the POS. If the order was already submitted to IRIS (which happens when the bill is generated), a credit note must be issued against the original invoice.</li>
<li><strong>Discounts</strong> — Discounts applied at the point of billing reduce the invoice total and the tax amount accordingly. Ensure your POS records the pre-discount amount and the discount separately for clear audit records.</li>
<li><strong>Complimentary items (compliments of the house)</strong> — These must be recorded as zero-value sales in the POS rather than simply not rung up. Unrecorded complimentary items look identical to unrecorded sales in an FBR audit — both show as missing inventory without a corresponding invoice.</li>
<li><strong>Staff meals</strong> — Food consumed by staff should be tracked as internal consumption in your inventory system, not sold as a customer transaction. Many restaurants record these as zero-value invoices or internal transfers.</li>
</ul>
<h2>Managing Peak Hours and High Volume</h2>
<p>During Iftar in Ramadan, Eid holidays, or a busy Friday dinner service, a Karachi or Lahore restaurant can process 200–400 covers in a single session. Your POS must be able to handle this volume without slowing down IRIS submissions, generating duplicate invoices, or crashing mid-service. Test your system under simulated load before peak seasons — not during them. A system failure during peak hours costs both revenue and compliance.</p>
""")

# ── fbr-sales-tax-returns ──────────────────────────────────────────────────
append_content("fbr-sales-tax-returns-pakistan-how-pos-integration-simplifies-monthly-filing", """
<h2>Practical Monthly Filing Checklist</h2>
<p>Use this checklist before filing your monthly Form ST-7:</p>
<ul>
<li>Confirm no "pending sync" invoices remain in your POS (all must have reached IRIS)</li>
<li>Export your monthly sales summary from the POS (total sales by tax category)</li>
<li>Log in to IRIS and verify the total invoices for the month matches your POS count</li>
<li>Check for any void or credit note transactions and confirm they are correctly reflected</li>
<li>Compile all supplier invoices received during the month for input tax credit calculation</li>
<li>Verify each supplier invoice carries a valid STRN (you can only claim input credits from registered suppliers)</li>
<li>Calculate total output tax (from POS summary) minus total input tax credits (from supplier invoices)</li>
<li>Complete Form ST-7 on IRIS and submit before the 18th</li>
<li>Make the net tax payment via online banking using your IRIS payment reference</li>
<li>Save a copy of the filed return and payment confirmation for your records</li>
</ul>
<h2>Annual Reconciliation and Sales Tax Audit Preparation</h2>
<p>At the end of each financial year, reconcile your twelve monthly ST-7 returns against your total IRIS invoice data and your POS annual sales report. These three figures should agree. Any significant variance warrants investigation before FBR raises a query. Businesses that conduct this annual reconciliation proactively are in a much stronger position if FBR selects them for an audit — you can demonstrate clean, reconciled records rather than scrambling to reconstruct figures under pressure.</p>
""")

# ── how-to-generate-fbr-qr-invoices ────────────────────────────────────────
append_content("how-to-generate-fbr-qr-invoices-in-pakistan-step-by-step-guide", """
<h2>FBR QR Invoice Requirements for Specific Business Types</h2>
<p>While the core QR invoice requirements are universal, some business types have additional considerations:</p>
<p><strong>Pharmacies:</strong> QR invoices must correctly reflect the tax-exempt or standard-rated status of each medicine dispensed. A QR invoice showing 17% GST on an exempt medicine is technically non-compliant even if the QR code scans correctly.</p>
<p><strong>Restaurants:</strong> When split bills are issued, each split must have its own QR-coded IRIS invoice. The sum of all split invoices must equal the original table total. Partial payments that are not individually invoiced create reconciliation problems.</p>
<p><strong>Wholesale distributors:</strong> B2B invoices must include the buyer's STRN when selling to another registered business. This is mandatory for the buyer to claim input tax credits. Your POS should have a buyer STRN field for business customer invoices.</p>
<p><strong>Multi-branch businesses:</strong> Each branch must generate invoices under its own branch registration. QR codes from Branch A must show Branch A's registered details, not the head office or another branch.</p>
<h2>Future of FBR e-Invoicing in Pakistan</h2>
<p>FBR has publicly stated its goal of full e-invoicing coverage for all registered businesses in Pakistan. The roadmap includes extending QR invoice requirements to smaller registered businesses, integrating e-invoicing with the withholding tax system for B2B transactions, and eventually moving toward a fully digital tax ecosystem where IRIS data feeds directly into income tax assessments. Businesses that invest in proper FBR POS integration now are building the digital infrastructure that will be required across the board within the next few years.</p>
""")

# ── multi-branch-pos-system-pakistan ───────────────────────────────────────
append_content("multi-branch-pos-system-pakistan-managing-multiple-stores-with-fbr", """
<h2>Multi-Branch Compliance Audit Checklist</h2>
<p>Run through this checklist quarterly to ensure all branches remain fully compliant:</p>
<ul>
<li>All branches registered on IRIS with current address details</li>
<li>Each branch POS using its own API credentials (not shared with other branches)</li>
<li>No "pending sync" invoices on any branch's POS dashboard</li>
<li>All branch managers know the offline sync procedure</li>
<li>Monthly ST-7 returns filed covering all branches combined</li>
<li>Product tax configurations identical across all branches for the same product</li>
<li>Inventory reconciliation done at each branch — POS stock count matches physical count</li>
<li>Inter-branch transfers properly documented in the transfer log</li>
</ul>
<h2>Scaling from One Branch to Many</h2>
<p>The most challenging transition for Pakistani retailers is opening a second branch — the jump from a single location to a multi-location operation. At this point, compliance complexity doubles overnight. Owners who have been managing a single POS personally must now trust branch managers to maintain compliance at a location they cannot always monitor.</p>
<p>The right multi-branch POS system makes this transition manageable. Real-time visibility into each branch from the owner's phone means compliance issues surface immediately rather than being discovered during an FBR inspection. Businesses that invest in proper multi-branch POS infrastructure before opening their second location find that third, fourth, and fifth locations add incrementally less complexity rather than more.</p>
""")

# ── pos-system-karachi ──────────────────────────────────────────────────────
append_content("pos-system-karachi-fbr-compliant-solutions-for-karachi-businesses", """
<h2>Karachi's Major Business Districts — Compliance Context</h2>
<p><strong>Saddar and M.A. Jinnah Road:</strong> One of Karachi's oldest and busiest commercial areas. Electronics, clothing, pharmaceuticals, and general merchandise. High FBR inspection frequency given density of registered businesses. POS systems in Saddar must handle high transaction volumes and periodic power disruptions.</p>
<p><strong>Defence Housing Authority (DHA) and Clifton:</strong> Upscale retail, restaurants, and pharmacies serving higher-income demographics. Businesses in these areas often have the highest turnover and the most visible FBR compliance risk. Branded retailers and chain restaurants in DHA have been specifically targeted in FBR campaigns.</p>
<p><strong>SITE and Korangi Industrial Area:</strong> Wholesale distributors, manufacturers, and industrial suppliers. B2B businesses in these areas must issue compliant invoices to their retail clients who need the STRN documentation for input tax credits. Non-compliant distributors disrupt the input tax chain for all their customers.</p>
<p><strong>North Karachi and New Karachi:</strong> Residential commercial areas with dense concentrations of general stores, pharmacies, and clothing shops. FBR has been expanding enforcement into these areas as the initial focus on upscale commercial districts has been completed.</p>
<h2>Getting Support for Karachi FBR Compliance</h2>
<p>Karachi businesses can contact FBR's Regional Tax Office on Abdullah Haroon Road for compliance queries. However, most POS-related questions are resolved faster through your software provider's support channel. Phelix ERP's team responds via WhatsApp during Karachi business hours — no need to visit government offices for routine compliance matters.</p>
""")

# ── pos-system-lahore ───────────────────────────────────────────────────────
append_content("pos-system-lahore-fbr-integration-for-lahore-retailers-2026", """
<h2>Lahore's Key Commercial Areas — FBR Compliance Context</h2>
<p><strong>Liberty Market and Gulberg:</strong> Lahore's premier fashion and retail hub. Branded clothing stores, jewellers, and specialty retailers in this area are among the highest-profile FBR compliance targets. Businesses on MM Alam Road and adjacent streets have been visited multiple times by FBR inspection teams.</p>
<p><strong>Defence Housing Authority (DHA) Lahore:</strong> Upscale restaurants, pharmacies, and boutique retailers. DHA Phase 6 and Phase 8 commercial areas have seen significant FBR activity. Restaurant clusters near Y-Block and Phase 4 market have been particularly targeted.</p>
<p><strong>Johar Town:</strong> A rapidly growing commercial area with a mix of retail, pharmacies, and restaurants. Johar Town businesses serving the large residential population have become a focus for FBR enforcement as the area's commercial density has grown.</p>
<p><strong>Anarkali and Shah Alam Market:</strong> Lahore's traditional wholesale and textile markets. Textile and garment wholesalers in these areas have specific FBR obligations given the volume of B2B transactions they conduct with registered retailers across Punjab.</p>
<p><strong>Fortress Stadium and Cavalry Ground:</strong> Major shopping destinations with both chain and independent retailers. High footfall and high revenue businesses here are prime FBR enforcement targets.</p>
<h2>Lahore to Islamabad Business Expansion</h2>
<p>Many Lahore-headquartered businesses are expanding into Islamabad and Rawalpindi. A multi-city POS solution allows Lahore head offices to manage FBR compliance at Islamabad locations centrally — registering each new branch on IRIS from the same account and monitoring all cities from a single dashboard.</p>
""")

# ── retail-inventory-management ────────────────────────────────────────────
append_content("retail-inventory-management-pakistan-track-stock-with-fbr-pos-system", """
<h2>Inventory Management for Seasonal Businesses</h2>
<p>Pakistani retail has strong seasonal patterns — Eid sales, back-to-school seasons, winter clothing transitions, and Ramadan food demand all create inventory management challenges. An integrated POS helps seasonal retailers by:</p>
<ul>
<li><strong>Sales velocity analysis</strong> — Comparing sales rates in the weeks before Eid against normal weeks lets you project how much additional stock to order. Historical POS data makes this projection accurate rather than guesswork.</li>
<li><strong>Seasonal reorder timing</strong> — Set higher reorder quantities and lower reorder trigger points in the weeks before peak periods. Return to normal settings after the peak passes.</li>
<li><strong>Unsold seasonal stock</strong> — After Eid, identify which slow-moving seasonal items remain. Data-driven decisions about discounting or returning stock to suppliers are much more accurate when your POS has precise remaining stock counts.</li>
</ul>
<h2>Integrating Inventory with Your Accountant</h2>
<p>Your accountant needs inventory data for annual accounts — closing stock valuation, cost of goods sold, and gross margin calculations. An FBR POS system that tracks inventory precisely makes this data extraction straightforward. Most POS systems can export stock valuation reports at any date, giving your accountant exactly what is needed for financial statements and tax assessments. This eliminates the annual exercise of manually counting and valuing stock — a process that can take days in businesses without integrated inventory management.</p>
""")

print("\nExpansion complete - checking final word counts...")
import glob
files = sorted(glob.glob(r"C:\Users\Noman Traders\Downloads\fbr-pos-landing\data\blogs\*.json"))
ok = 0
warn = 0
for f in files:
    d = json.load(open(f, encoding="utf-8"))
    import re
    text = re.sub(r'<[^>]+>', ' ', d.get("content",""))
    words = len(text.split())
    faqs = len(d.get("faqs", []))
    slug = d["slug"][:50]
    status = "OK" if words >= 1200 and faqs >= 5 else "WARN"
    if status == "WARN": warn += 1
    else: ok += 1
    print(f"{status}  {words:5d}w  {faqs}faq  {slug}")
print(f"\n{ok} OK, {warn} warnings")
