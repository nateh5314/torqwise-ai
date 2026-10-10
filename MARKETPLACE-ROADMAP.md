# TORQWISE Parts Marketplace Roadmap

## Product goal

Make TORQWISE the fastest trusted workflow for identifying a repair need, finding the correct part, comparing real purchasing options, and getting the part ordered. The long-term experience should feel like an Expedia-style comparison engine, but fitment accuracy and shop-grade trust matter more than showing the most listings.

## Product architecture: one platform, not separate tools

The parts marketplace is a major priority, but diagnostics and repair research remain equally important pillars. TORQWISE should connect the workflow from the first symptom to a verified repair plan and compatible parts.

### Connected mechanic workflow

1. **Identify the asset:** VIN, year/make/model/engine, or equipment make/model/serial number.
2. **Describe the problem:** diagnostic trouble code, symptom, test result, noise, warning light, or repair question.
3. **Diagnose and research:** guided test sequences, likely causes ranked by evidence, wiring/technical references where legally available, specifications, and clear safety warnings.
4. **Build a repair case:** record symptoms, tests, measurements, confirmed findings, and next steps. Clearly distinguish a possible cause from a confirmed failure.
5. **Find compatible parts:** search OEM and aftermarket numbers, new/remanufactured/used options where legally sourced, supersessions and cross-references, then compare authorized supplier offers.
6. **Save and continue:** keep the asset, diagnostic case, research, parts shortlist, and supplier links together when account storage is configured.

### Navigation and usability principles

- Preserve the existing charcoal/black and red visual identity.
- Keep top-level navigation focused: **Diagnose**, **Research**, **Parts**, and **My Garage / Saved Jobs**.
- Allow users to start from a fault code, symptom, VIN, part number, or equipment model.
- Reuse vehicle/equipment details across all tools instead of repeatedly asking for the same information.
- Show simple explanations by default, with an optional advanced technician view.
- Reveal complex options when needed; do not cram every function onto the home screen.
- Keep the site responsive, fast, keyboard-accessible, and usable on a phone in a workshop.
- Never claim a part definitely fits or a component definitely failed unless the evidence supports that claim.
- Show sources, confidence/verification status, and data freshness for critical diagnostic and parts information.

### Product pillars

1. **Diagnostics:** DTC lookup, symptom-led troubleshooting, guided tests, complex multi-code cases, evidence capture, and repair verification.
2. **Technical research:** service information and specifications from authorized sources, wiring/connector references where licensed, service bulletins, procedures, and citations.
3. **Parts intelligence:** new and used offers where permitted, fitment, cross-references, supersessions, delivered-cost comparison, and supplier handoff.
4. **Garage and shop workspace:** saved vehicles/equipment, repair history, work notes, parts lists, maintenance reminders, and eventually team/fleet workflows.

## What is in the current beta

- Part/job description, vehicle or equipment details, and delivery region fields
- One-click searches across Google Shopping and supplier-specific search results
- A local shortlist saved in the browser, with remove and text export
- Clear warnings that search links are not verified live prices, fitment, inventory, shipping, or checkout

This is a research/shortlist feature only. It does not scrape retailer pages, guarantee prices, reserve inventory, or take payments.

## Build in stages

### Stage 1 — Useful launch feature

- Keep the current black/red design and continue improving VIN decoding, guided diagnostics, symptom-based troubleshooting, and AI research alongside marketplace development.
- Make part searches reuse the vehicle context already entered in the research workspace.
- Provide clear source links and distinguish verified information from unconfirmed candidates.
- Collect feedback from a small number of technicians before expanding the workflow.
- Measure whether users find a correct part faster, not just how many results are displayed.

### Stage 2 — Structured comparison results

For each candidate part, aim to display:

- Supplier and direct product page
- Brand, manufacturer part number, supplier SKU, and condition (new/remanufactured/used)
- Price and currency, taxes where known, shipping estimate, and estimated delivered total
- Availability and pickup/shipping region
- Fitment status: confirmed by authoritative catalogue, probable, or unverified
- Return policy/warranty summary, seller identity, and timestamp of last update

Never label a part “fits” based only on similar wording or a search snippet. Match exact vehicle configuration, engine, trim, production date, drivetrain, and relevant option codes when available. For heavy equipment, use model/serial-number breaks and OEM part supersessions.

### Stage 3 — Legitimate supplier data access

Prioritize supplier APIs, authorized product feeds, affiliate catalogues, and written data partnerships. Respect each supplier's terms, rate limits, and attribution requirements. Avoid relying on brittle scraping or presenting cached prices as live.

Create a normalized catalogue that maps OEM numbers, superseded numbers, aftermarket cross-references, brand/SKU, and compatible applications. Keep the original source and the time each value was checked.

### Stage 4 — Cart and ordering

Start with a cross-supplier comparison list and links to each seller's checkout. A true universal checkout is a separate project: suppliers must support ordering or a commercial integration, inventory and shipping must be reconfirmed, and cancellation/returns/customer support responsibilities must be clear.

Before TORQWISE accepts payment directly, implement secure payment processing, supplier order creation, order status/reconciliation, tax and shipping handling, refund workflows, fraud controls, and support procedures. Do not charge customers for parts that have not been confirmed orderable.

### Stage 5 — Shop-grade platform

- Saved vehicles, equipment, and fleet profiles
- Shop/team accounts, roles, shared job history, and approval limits
- Work orders and parts lists linked to diagnostic cases
- Bulk quote requests and shop-level pricing where supplier agreements allow
- Cross-reference lookup and supersession history
- Stock/lead-time comparison and backorder alerts
- Purchase history, receipts, warranty/return reminders, and reorder lists
- Fleet maintenance planning and service reminders
- Feedback on actual fitment and supplier reliability, with moderation and evidence
- Optional integrations with shop-management systems and parts distributors

## Business model options to validate

1. Affiliate or referral revenue from qualifying supplier purchases.
2. Paid technician/shop subscriptions for advanced research, saved fleets, shared workflows, and higher research limits.
3. Supplier-sponsored listings only when clearly labelled and never allowed to override fitment or relevance.
4. Shop purchasing tools or supplier lead generation, subject to contracts and transparent pricing.

Avoid assuming one model will work before measuring technician demand and talking to suppliers. The core asset should be trusted fitment and workflow quality, not ads or inflated search-result counts.

## Reliability and safety rules

- Show sources for important claims and preserve the source's identity.
- Display the last-checked time for price and stock data.
- Compare delivered cost, not just sticker price, whenever shipping/tax data are available.
- Flag missing VIN, engine, trim, serial number, or production-date details before claiming fitment.
- Never let a language model invent part numbers, compatibility, torque specs, stock, or price.
- Keep diagnostics separate from confirmed repair instructions; flag safety-critical systems for OEM verification.
- Store API keys and supplier credentials only on the server.
- Track supplier search failures and stale listings.
- Disclose affiliate relationships and sponsored placement.
- Confirm legal, privacy, tax, consumer-protection, and returns obligations before taking orders.

## Suggested first success metrics

- Time from question to a verified candidate part
- Percentage of part searches with exact fitment confirmed
- Price accuracy versus supplier checkout
- Percentage of searches with multiple genuinely orderable options
- Wrong-part/return rate and supplier complaint rate
- Repeat use by technicians and shops
- Revenue per active shop, not only website traffic

## Decision gate before a real universal cart

Do not promise “buy anywhere from one cart” until at least two suppliers provide reliable product data and an approved ordering/checkout path. Until then, the honest and useful product is a parts research and comparison workspace that routes users to the seller to complete purchase.
