# TORQWISE — Automotive & Equipment Research

TORQWISE is a mobile-friendly automotive/heavy-equipment research and diagnostic website prototype. The current frontend is served from the repository root; it is **not** stored in a `public/` directory.

## Netlify deployment layout

The repository is structured for a Git-connected Netlify deployment:

- `index.html` — website entry point (repository root)
- `manifest.webmanifest`, `icon.svg`, `sw.js` — app metadata, icon and static cache
- `netlify.toml` — publishes the repository root and configures Netlify Functions
- `netlify/functions/research.mjs` — server-side AI research endpoint
- `package.json` — runtime metadata and dependencies

The Netlify configuration intentionally uses `publish = "."` and `functions = "netlify/functions"`. **Do not change the publish directory to `public` unless the site files are moved into that folder.** No frontend build step is currently required.

## Deploy / recover the public site

1. Open the existing Netlify site for TORQWISE. Avoid creating a replacement site or overwriting a working deploy unnecessarily.
2. In the site's deploy settings, confirm it is connected to the intended GitHub repository and branch (`main`).
3. Confirm the base directory is blank/repository root, the publish directory is `.`, and the functions directory is `netlify/functions` as defined in `netlify.toml`.
4. Trigger a deploy and inspect the deploy log. If it fails, use the first actual error in the log; do not guess that a `public/` folder should exist.
5. After deploy succeeds, open the public URL and test the homepage, navigation, VIN decoder, diagnostics, and research links.
6. Test the AI research button separately. It requires `OPENAI_API_KEY` configured as a server-side Netlify environment variable and a successful function deploy. Never put the key in frontend code, screenshots, or Git.
7. If a service-worker cache makes an old version appear, hard refresh the site or clear its site data before retesting.

## Environment variables

- `OPENAI_API_KEY` — secret key used only by the Netlify Function.
- `OPENAI_MODEL` — optional model override; the function has a default.

After changing function environment variables, trigger a new deploy. Confirm the variables are available to Functions/runtime.

## What works vs. what is not production-ready

The site contains offline diagnostic starter content, a VIN lookup flow, research links, and demo request/account interfaces. Browser-stored demo accounts and requests are local to that browser and are **not** secure customer accounts or cloud-synced records.

The AI endpoint uses public web search; it is not a replacement for paid OEM service databases, licensed wiring diagrams, or factory repair information. A small in-memory request limit is best-effort only and can reset in serverless environments.

Do not collect real customer passwords or sensitive information, accept real orders, or take payments until secure authentication, durable usage limits, customer data storage, verified payment handling, privacy/terms, refund policy, contact details, and applicable Canadian business/tax obligations are implemented and tested.

## Pre-launch smoke test

- [ ] Public homepage loads over HTTPS on phone and laptop.
- [ ] Navigation links jump to the right sections.
- [ ] VIN flow handles empty, invalid and valid test VINs gracefully.
- [ ] Diagnostic search: P0300, P0420 and P0171.
- [ ] Symptom workflow: cranks but will not start.
- [ ] Research links open in a new tab and don't claim an unverified result is confirmed.
- [ ] Demo account/request copy clearly warns that it is browser-local.
- [ ] AI endpoint succeeds with a low-risk question, or clearly reports that it is unavailable.
- [ ] No API key is visible in the page source or browser requests.
