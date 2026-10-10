# TORQWISE — AI Diagnostics, Parts Research & Marketplace

TORQWISE is being built as a technician-focused automotive and equipment research workspace. The goal is to combine guided diagnostics, VIN lookup, source-linked AI research, customer workflows, and eventually a trusted multi-supplier parts marketplace.

## Website features in this release candidate

- Black/red responsive website design
- VIN decoding through the public NHTSA vPIC API
- Guided diagnostic starter library and symptom/code workflows
- AI Research Hub with server-side OpenAI Responses API web search
- Saved job context and export on the current device
- Parts marketplace beta: supplier search shortcuts, a local parts shortlist, removal/export, and a handoff into AI parts research
- Supabase account sign-in, persistent research requests, and request history (requires configuration)
- Pro Technician subscription flow and restricted operator dashboard (requires configuration)

The marketplace is currently a research and comparison shortlist. It does **not** yet provide verified live pricing/inventory, guaranteed fitment, a universal supplier cart, or direct checkout. See [MARKETPLACE-ROADMAP.md](MARKETPLACE-ROADMAP.md) for the staged plan.

## Deploy configuration

This repository deploys from the repository root. There is no required `public/` directory.

The root `netlify.toml` sets:

- Publish directory: `.`
- Functions directory: `netlify/functions`
- Node bundling: `esbuild`

Connect the GitHub repository to Netlify so static files and Netlify Functions deploy together. A static drag-and-drop upload will not deploy the server-side functions. Do not assume the public site is updated until the Netlify deploy completes and the actual public URL is tested.

## Environment variables

For the AI endpoint:
- `OPENAI_API_KEY` — secret, server-side only
- `OPENAI_MODEL` — optional; defaults to `gpt-5-mini`

For accounts, usage limits, customer requests, and subscriptions, see [BILLING-SETUP.md](BILLING-SETUP.md). Never commit secret keys or place them in browser code. Start with Stripe test mode; do not accept real payments until business identity, policies, billing, and order workflows are verified.

## Validation and launch

The GitHub Actions workflow checks Node function syntax, inline browser JavaScript syntax, required integration files, and the presence of important security gates. Passing these checks is not a substitute for a real deployment test.

Use [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) to finish configuration and test the deployed site. The legal/support pages are drafts and require the owner's correct business identity and contact details before launch.

## Important limits

- AI web research can be incomplete or wrong. Verify important findings against OEM/manufacturer documentation and authoritative sources.
- The VIN decoder is not an OEM parts catalogue and may not expose every configuration detail.
- Diagnostic starter content is not a confirmed diagnosis or a replacement for vehicle-specific service procedures.
- Supplier search links are not live product feeds and do not confirm fitment, stock, shipping, seller quality, or final price.
- Customer request starting prices are not automatically charged; scope and final price must be confirmed separately.
- The public website has not been confirmed live by these repository changes alone.
