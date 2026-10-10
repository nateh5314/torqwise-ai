# TORQWISE launch handoff

This repository branch is the prepared release candidate. Keep the existing live site unchanged until you choose to publish it.

## Included in this release candidate

- Existing TORQWISE landing page, VIN decoder, guided diagnostic starters, Research Hub, and source links
- Parts marketplace beta with supplier search shortcuts, a local shortlist/export, and a handoff into AI parts research
- Marketplace roadmap in `MARKETPLACE-ROADMAP.md`; current beta is not a live-price engine or universal checkout
- Supabase account creation, sign-in, and password-reset request flow
- Free AI research allowance (3 reports per calendar month) and server-side Pro entitlement checks
- Pro Technician subscription checkout at CA$29.99/month
- Fixed-price one-time checkout flow for Parts Research (CA$15), Estimate Comparison (CA$25), and Used Vehicle Research (CA$30); custom research remains quote-first
- Verified Stripe webhook processing and Stripe customer portal endpoint
- Persistent customer research requests and customer request history
- Restricted operator dashboard at `/admin.html`
- Optional request-notification email integration
- Privacy, terms, and support pages
- Baseline hosting security headers

## Product direction: one mechanic workspace

The marketplace is a major priority, but diagnostics remain a core product pillar and must continue to improve alongside parts search. The intended workflow is asset identification → symptoms/fault codes → guided tests and source-backed research → repair case → compatible parts comparison.

Keep the existing black/red identity and prioritize simple top-level navigation: Diagnose, Research, Parts, and My Garage / Saved Jobs. Reuse vehicle/equipment context across tools; distinguish confirmed findings from hypotheses and unverified parts candidates.

## Focused functional test checklist

### Diagnostics and technical research
- [ ] VIN decoder handles a valid test VIN, invalid input, network failure, and empty results gracefully.
- [ ] Each diagnostic starter opens the correct code/symptom content and gives useful next steps without presenting a suspected cause as a confirmed failure.
- [ ] Research inputs accept vehicle/equipment context and a specific question; errors and usage limits are clear.
- [ ] Safety-critical repair guidance calls for authoritative service information and appropriate precautions.
- [ ] Navigation between Diagnose, Research, and Parts preserves relevant vehicle/equipment context where implemented.

### Parts marketplace
- [ ] Search works with a part name/number and vehicle/equipment context.
- [ ] Supplier links open the intended supplier search and preserve useful query terms.
- [ ] Shortlist add/remove/export works, including empty and duplicate cases.
- [ ] The AI research handoff carries the selected part and relevant vehicle context.
- [ ] Results clearly distinguish supplier-search links from verified live data.
- [ ] Do not claim a part fits, is in stock, or has a current price unless the data source supports that claim.

### Paid research requests
- [ ] Run the updated `supabase/customer-requests.sql` so `payment_status`, `stripe_checkout_session_id`, and `paid_at` columns exist.
- [ ] In Stripe test mode, submit a fixed-price request and confirm the checkout amount is set server-side in CAD, not accepted from browser input.
- [ ] Confirm a user cannot create checkout for another account's request or a custom quote.
- [ ] Confirm cancel/failure does not mark a request paid and a successful test payment is marked paid only after the verified Stripe webhook.
- [ ] Confirm request history shows unpaid/pending/paid status and the user can retry an expired checkout without duplicating an open session.

### Account history and continuity
- [ ] Run `supabase/account-history.sql` in the intended Supabase project before testing cloud history.
- [ ] Confirm a signed-in user can save an AI report, diagnostic case, and job context and see them after a fresh sign-in/session.
- [ ] Confirm one account cannot retrieve or delete another account's history; test entry deletion and keep local drafts working if cloud history is unavailable.
- [ ] Confirm saved source links reopen correctly and long reports remain readable on mobile.

### General usability and release safety
- [ ] Test mobile navigation, keyboard access, readable errors, and narrow-screen layouts.
- [ ] Check console/network failures and ensure the core page remains usable if optional services are unavailable.
- [ ] Test account, research quota, and billing flows with test credentials and Stripe test mode before accepting real charges.
- [ ] Confirm no secret credentials are included in client-side files or commits.
- [ ] Run automated checks and manually test the deployed Netlify site before announcing launch.

## Before connecting or publishing

- Confirm the intended Netlify site and deployment branch. The repository deploys from the root (`publish = "."`) and includes Netlify Functions; do not use a static-only drag-and-drop upload.
- Keep the existing design and feature set stable while validating the release candidate. First test the deployed home page, VIN lookup, diagnostics, AI research, parts shortlist, mobile navigation, and customer request flow.
- Treat supplier links as research shortcuts only. Do not advertise live price/stock comparison, verified fitment, or direct checkout until the corresponding data/ordering integrations are implemented and tested.

## Operator-owned configuration required before public use

1. Connect this GitHub repository to the Netlify site so Netlify deploys the functions as well as the static website. A drag-and-drop static upload alone is not sufficient for these server functions.
2. Configure the Supabase project and run the SQL files under `supabase/`, including `account-history.sql` so signed-in users can sync saved research, diagnostic cases, and parts investigations.
3. Add the environment variables listed in `BILLING-SETUP.md` in Netlify. Keep all secret keys server-side.
4. Add the site's exact HTTPS origin to Supabase Auth redirect URLs.
5. Create the recurring CA$29.99 CAD Stripe price, configure the Stripe webhook and customer portal, and use test-mode keys until ready for real charges.
6. Create the operator's Supabase account, then add that account's UUID to `TORQWISE_ADMIN_USER_IDS` to enable `/admin.html`.
7. Set a monitored `SUPPORT_EMAIL`. Configure Resend and a verified `EMAIL_FROM` if you want automatic new-request email notifications.
8. Review and approve `privacy.html` and `terms.html`, including the correct business identity, cancellation/refund terms, and support contact. The included policy text is a working draft, not legal advice.

## Account and billing secrets

Never commit keys to Git, place secret keys in browser code, or send them in chat. The browser receives only the public Supabase URL and anon/publishable key from `/.netlify/functions/public-config`.

## Known operational boundaries

- Research requests are inquiries, not paid orders. The listed starting prices are not charged automatically; confirm scope and final pricing separately.
- Pro status is granted from the server-side subscription record after a verified Stripe webhook, not from the success redirect.
- Customer request status can be managed from `/admin.html` by an authorized operator.
- The live site has not been deployed by this repository change. Publishing and account-level configuration remain under the site owner's control.
