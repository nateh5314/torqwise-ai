# TORQWISE Business Operating Plan
_Last updated: 2026-10-10 · Internal working plan_

## Mission
TORQWISE is a commercial automotive and equipment research website that helps people move from a vehicle/machine problem to a safer diagnostic next step, organized repair notes, and relevant parts-purchasing options. The goal is a product customers return to and are willing to pay for—not just a visually polished website.

## Business outcome
Build a sustainable, revenue-generating business with a credible reputation among mechanics, equipment technicians, apprentices, and capable DIY owners. Revenue and recognition must be earned through reliability, transparent sourcing, useful workflows, customer support, and repeat use. Do not promise guaranteed diagnosis, fitment, supplier prices, or results that the product cannot verify.

## Initial customer focus
Start in Canada and validate with hands-on users in Newfoundland and Labrador, while keeping the product technically usable elsewhere in Canada.
1. Independent mechanics and small shops: recurring research, saved cases, and faster parts discovery.
2. Apprentices and mobile technicians: guided troubleshooting and organized evidence.
3. Experienced DIY owners: plain-language explanation, sensible tests, and fitment cautions.
Use interviews and real tasks to identify which audience has the strongest recurring need before broad marketing.

## Product priorities
### Pilot release
- Mobile-friendly black/red website.
- VIN lookup and starter diagnostic guides.
- AI research with source links, limits, and safe error handling.
- Parts supplier search and a saved shortlist, with clear warnings that outbound links are not live inventory or confirmed fitment.
- Sign-in and account history only after real provider configuration and end-to-end testing.
- Transparent terms, privacy, support, and subscription details.

### Core differentiator
Connect the full workflow: asset details → symptom/code → guided tests → findings and source links → repair case → relevant parts search. Preserve context between steps so customers do not need to repeatedly enter the same vehicle or machine details.

### Future releases
- Structured repair cases with symptoms, test results, measurements, confirmed findings, and next steps.
- Better guided diagnostic trees with safe test order, expected observations, stop conditions, and confidence labels.
- Structured parts records for OE numbers, fitment, condition, seller, currency, price, shipping, source timestamp, and confidence.
- Supplier feeds/APIs only with appropriate permission and a clear business case.
- Universal checkout, paid catalogue licences, and broad inventory claims are deferred until demand, supplier permission, and economics are proven.

## Monetization to validate
- Free tier with a clearly stated monthly AI research allowance; current candidate is three reports per month.
- Pro Technician candidate at CA$29.99/month, subject to willingness-to-pay testing. Sell repeatable workflow and time savings—not infallibility or data rights we do not have.
- Optional assisted research only if scope, turnaround, quality, support load, and delivery can be reliably fulfilled.
- Longer-term authorized referral/affiliate relationships, shop plans, or licensed data partnerships after terms and demand are verified.

Before live payments, test checkout, signed webhook processing, subscription entitlement, cancellation, failed payment, refunds, account deletion, and support. Never grant paid access based only on a checkout redirect.

## First 90 days: disciplined budget
Initial spend ceiling: CA$500–$1,000 total, preserving a reserve. Use earlier planning caps of CA$100–$200 in month one, CA$150–$300 in month two, and CA$150–$300 in month three only when each stage's gate is met. Avoid expensive catalogues, ads, and uncontrolled AI usage before proof of demand.

### Days 1–30: make a trustworthy pilot
- Stabilize the staging release candidate and audit authentication, usage limits, deletion, and server-side secret handling.
- Configure hosting/database/billing only through the owner's private provider accounts.
- Interview 10–15 prospective users; recruit five hands-on testers.
- Test 10 real, anonymized repair/parts tasks and record usefulness, mistakes, and missing context.
**Gate:** testers can complete core tasks with little help and recurring pain points are clear.

### Days 31–60: fix real friction
- Fix the top three issues from pilot feedback.
- Improve context transfer from diagnostics to research and parts.
- Track return use, saved cases, and supplier-link usefulness.
- Ask what users would pay for and why.
**Gate:** evidence of repeat use or clear willingness to pay before additional spending.

### Days 61–90: limited paid pilot
- Invite 10–20 users to a small pilot.
- Audit at least 20 real research/parts tasks for source quality, fitment uncertainty, and outcomes.
- Test billing in test mode before accepting live payments.
- Contact potential suppliers only for specific, permission-based opportunities.
**Gate:** repeat use, user trust, and serving costs compatible with revenue.

## Metrics to review weekly
- Activation: new users completing one useful task.
- Time to useful next step.
- 7-day and 30-day return use.
- Cases saved with asset details, tests, and next step.
- Research quality: source relevance, corrections, overconfidence, and unsafe advice.
- Parts usefulness: plausible options, fitment confirmation, and helpful supplier clicks.
- Free-to-paid conversion and cancellations.
- AI cost per completed task, fees, refunds, support time, hosting usage, and net revenue.
- Reliability: error rates, latency, failed saves, auth failures, and quota enforcement.
Set a baseline before claiming an improvement.

## Trust, safety, and business readiness
- Distinguish verified information from general guidance and hypotheses.
- Do not treat a trouble code alone as proof of a failed part.
- Highlight safety-critical work and when OEM procedures or qualified technicians are required.
- Show source and freshness information where available; never imply a supplier link proves price, stock, or fitment.
- Protect personal data, isolate accounts, and provide understandable deletion/export controls.
- Confirm operator identity, support contact, refund/cancellation policy, privacy disclosures, terms, and applicable Canadian obligations with appropriate professional advice.
- Keep API, service-role, and payment secrets server-side and out of source control, browser code, screenshots, and chat.
- Do not scrape or republish restricted supplier/catalogue data without permission.

## Release discipline
- Work on staging; keep the main website stable.
- Require automated checks to pass and review changes before merging.
- Test deployed integrations against provider test accounts; CI syntax checks alone do not prove production readiness.
- Keep a known-good rollback point and a short owner-only setup runbook.
- Show progress through concrete commits and tested behaviour, not promises.

## Current order of work
1. Finish reviewing the release candidate and keep it off main until verified.
2. Validate account history and deletion with per-user regression tests.
3. Audit AI usage limits, billing and access-control paths, and provider cost exposure.
4. Improve the diagnostic-to-research-to-parts handoff.
5. Prepare the Chromebook setup checklist for owner-controlled configuration.
6. Run a small pilot before paying for marketing or deep supplier integrations.

## Decision rule
Build what users prove they need, verify what TORQWISE claims, and spend only to remove a demonstrated bottleneck. The goal is a serious, sustainable business with repeat customers—not a launch that looks finished but fails in real use.
