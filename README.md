# TORQWISE AI Research Connector (staging package)

This package adds a server-side OpenAI Responses API connection with web search to the TORQWISE research workspace. The API key is read only by the Netlify Function and is not shipped in the public website files.

## Important: deploy as a separate staging site first

Do **not** drag the `public` folder over the existing live site. Your existing production site is not modified by this package. Netlify Functions need a build/deploy flow that processes `netlify/functions`; a plain static drag-and-drop deploy is not enough. Connect this folder to a new Git-based Netlify site (or deploy using Netlify CLI) so the function is built.

## Files

- `public/` — website assets
- `netlify/functions/research.mjs` — private server-side AI endpoint
- `netlify.toml` — Netlify build configuration

## Environment variables

In the **new staging site's** Netlify environment variables, add:

- `OPENAI_API_KEY` — your secret API key; never add it to `public/` or commit it to Git.
- Optional `OPENAI_MODEL` — defaults to `gpt-5-mini`.

After adding/changing variables, trigger a new deploy. Confirm variable scope includes Functions/runtime. Do not share screenshots that reveal any key value.

## Safety and limitations

- This is a first AI-connected research test, not a finished ALLDATA replacement. It uses public web search and can only cite sources the search tool returns. It does not unlock licensed OEM service manuals, factory wiring diagrams, or parts databases.
- A small in-memory burst limit is included, but serverless memory can reset. Before public launch, add durable rate limiting and authentication/usage controls to prevent API-cost abuse. Keep this on a private/unlisted staging site during testing.
- Do not use it as the only authority for safety-critical repairs, exact specifications, parts fitment, or diagnosis. Verify exact vehicle/equipment variant and source procedures.
- Existing offline diagnostic starter content and local saved cases remain part of the site. Browser-saved cases are not cloud-synced.

## First test

1. Deploy this package to a **new** Netlify staging site using a Git repository or Netlify CLI.
2. Add `OPENAI_API_KEY` to that new site's environment variables.
3. Redeploy.
4. Open the research hub and test a low-risk question, such as: `What public official sources should I check for recalls on a 2018 Ford F-150?`
5. Verify that a response appears, source links open, and Netlify function logs show no key or private input values.

If deployment fails, inspect the build log and function logs; do not expose the API key while troubleshooting.
