# TORQWISE launch handoff

This repository branch is the prepared release candidate. Keep the existing live site unchanged until you choose to publish it.

## Included in this release candidate

- Existing TORQWISE landing page, VIN decoder, guided diagnostic starters, Research Hub, and source links
- Parts marketplace beta with supplier search shortcuts, a local shortlist/export, and a handoff into AI parts research
- Marketplace roadmap in `MARKETPLACE-ROADMAP.md`; current beta is not a live-price engine or universal checkout
- Supabase account creation, sign-in, and password-reset request flow
- Free AI research allowance (3 reports per calendar month) and server-side Pro entitlement checks
- Pro Technician subscription checkout at CA$29.99/month
- Verified Stripe webhook processing and Stripe customer portal endpoint
- Persistent customer research requests and customer request history
- Restricted operator dashboard at `/admin.html`
- Optional request-notification email integration
- Privacy, terms, and support pages
- Baseline hosting security headers

## Before connecting or publishing

- Confirm the intended Netlify site and deployment branch. The repository deploys from the root (`publish = "."`) and includes Netlify Functions; do not use a static-only drag-and-drop upload.
- Keep the existing design and feature set stable while validating the release candidate. First test the deployed home page, VIN lookup, diagnostics, AI research, parts shortlist, mobile navigation, and customer request flow.
- Treat supplier links as research shortcuts only. Do not advertise live price/stock comparison, verified fitment, or direct checkout until the corresponding data/ordering integrations are implemented and tested.

## Operator-owned configuration required before public use

1. Connect this GitHub repository to the Netlify site so Netlify deploys the functions as well as the static website. A drag-and-drop static upload alone is not sufficient for these server functions.
2. Configure the Supabase project and run the three SQL files under `supabase/`.
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
