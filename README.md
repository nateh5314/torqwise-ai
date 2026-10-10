# TORQWISE — Automotive & Equipment Research

TORQWISE is a mobile-friendly automotive/heavy-equipment research and diagnostic workspace. The goal is to combine guided diagnostics, VIN lookup, source-linked AI research, customer workflows, and a trusted multi-supplier parts marketplace.

## Website features in this release candidate

- Black/red responsive website design
- VIN decoding through the public NHTSA vPIC API
- Guided diagnostic starter library and symptom/code workflows
- AI Research Hub with server-side OpenAI Responses API web search
- Saved job context and export on the current device
- Parts marketplace beta: supplier search shortcuts, a local parts shortlist, removal/export, and a handoff into AI parts research
- Account history API for saved research reports, diagnostic cases, job contexts, and parts investigations (requires Supabase setup and sign-in)
- Supabase account sign-in, persistent research requests, and request history (requires configuration)
- Pro Technician subscription flow and restricted operator dashboard (requires configuration; see [ADMIN-DASHBOARD.md](ADMIN-DASHBOARD.md) for setup, permissions, and current scope)

The marketplace is currently a research and comparison shortlist. It does **not** yet provide verified live pricing/inventory, guaranteed fitment, a universal supplier cart, or direct checkout. See [MARKETPLACE-ROADMAP.md](MARKETPLACE-ROADMAP.md) for the staged plan.

## Netlify deployment layout

The repository deploys from the root; there is no required `public/` directory.

- `index.html` — website entry point
- `manifest.webmanifest`, `icon.svg`, `sw.js` — app metadata, icon and static cache
- `netlify.toml` — root publish configuration and Netlify Functions settings
- `netlify/functions/` — server-side AI research, account history, customer requests, and billing endpoints
- `supabase/` — SQL schema files that must be applied to the intended Supabase project

The Netlify configuration intentionally uses `publish = "."` and `functions = "netlify/functions"`. **Do not change the publish directory to `public` unless the site files are moved into that folder.** No frontend build step is currently required.

## Deploy / recover the public site

1. Open the existing Netlify site for TORQWISE. Avoid creating a replacement site or overwriting a working deploy unnecessarily.
2. In deploy settings, confirm it is connected to the intended GitHub repository and branch (`main`) once the release candidate is reviewed and merged.
3. Confirm the base directory is blank/repository root, the publish directory is `.`, and the functions directory is `netlify/functions` as defined in `netlify.toml`.
4. Trigger a deploy and inspect the deploy log. If it fails, use the first actual error in the log; do not guess that a `public/` folder should exist.
5. After deploy succeeds, open the public URL and test the homepage, navigation, VIN decoder, diagnostics, AI research, parts shortlist, account history, and mobile layouts.
6. Test AI research separately. It requires `OPENAI_API_KEY` configured as a server-side Netlify environment variable and a successful function deploy. Never put the key in frontend code, screenshots, or Git.
7. If a service-worker cache makes an old version appear, hard refresh the site or clear its site data before retesting.

## Environment variables

For the AI endpoint:
- `OPENAI_API_KEY` — secret, server-side only
- `OPENAI_MODEL` — optional model override; defaults to `gpt-5-mini`

For accounts, cloud history, usage limits, customer requests, and subscriptions, see [BILLING-SETUP.md](BILLING-SETUP.md). Before enabling AI research, apply `supabase/research-usage.sql`; free accounts are limited to 3 successful AI research reports per calendar month through an atomic server-side reservation. Never commit secret keys or place them in browser code. Start with Stripe test mode; do not accept real payments until business identity, policies, billing, and order workflows are verified.

## Validation and launch

The GitHub Actions workflow checks Netlify function syntax, inline browser JavaScript syntax, important page anchors, diagnostic-to-research/parts handoffs, required integration files, and security gates. Passing these checks is not a substitute for a real deployment test.

Use [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) to finish configuration and test the deployed site. The legal/support pages are drafts and require the owner's correct business identity and contact details before launch.

## Important limits

- AI web research can be incomplete or wrong. Verify important findings against OEM/manufacturer documentation and authoritative sources.
- The VIN decoder is not an OEM parts catalogue and may not expose every configuration detail.
- Diagnostic starter content is not a confirmed diagnosis or a replacement for vehicle-specific service procedures.
- Supplier search links are not live product feeds and do not confirm fitment, stock, shipping, seller quality, or final price.
- Customer request starting prices are not automatically charged; scope and final price must be confirmed separately.
- Browser-local drafts are device-specific. Cloud account history requires the account-history SQL schema to be run in Supabase and the Netlify functions to be deployed.
- The public website has not been confirmed live by these repository changes alone.

## Pre-launch smoke test

- [ ] Public homepage loads over HTTPS on phone and laptop.
- [ ] Navigation links jump to the right sections.
- [ ] VIN flow handles empty, invalid and valid test VINs gracefully.
- [ ] Diagnostic search: P0300, P0420 and P0171.
- [ ] Symptom workflow: cranks but will not start.
- [ ] Research links open in a new tab and don't claim an unverified result is confirmed.
- [ ] Account history saves and loads after a fresh sign-in; deletion remains account-scoped.
- [ ] AI endpoint succeeds with a low-risk question, or clearly reports that it is unavailable.
- [ ] No API key is visible in the page source or browser requests.
