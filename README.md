# TORQWISE — secure research workspace

TORQWISE is a mobile-friendly automotive and equipment research workspace with a server-side OpenAI Responses API connection and web search. The website is served from the repository root (index.html); private research calls run through Netlify Functions.

## Deployment safety

Use a separate staging site and a separate staging Supabase project for integration testing. Do not merge this branch into main or replace the production site until the checks and real staging tests pass. Netlify Functions require a Git-based Netlify deploy or Netlify CLI; a static drag-and-drop upload does not build the server function.

## Netlify environment variables

Set these in the staging site's Netlify environment variables, scoped to Functions/runtime where applicable:

- OPENAI_API_KEY — secret key for the research endpoint; never place it in browser code or commit it.
- SUPABASE_URL — staging Supabase project URL.
- SUPABASE_PUBLISHABLE_KEY — Supabase publishable/anon key used for session verification.
- SUPABASE_SECRET_KEY — server-only Supabase secret/service-role key used for privileged quota RPC calls. Never expose it to the browser.
- Optional OPENAI_MODEL — defaults to gpt-5-mini.

After changing variables, redeploy the staging site. Do not share screenshots that reveal secret values.

## Supabase setup

Apply the SQL migrations in timestamp order from supabase/migrations/ to the staging Supabase project before testing research quotas:

1. 20261010050000_torqwise_core_usage.sql — usage and subscription tables plus the original server-only quota RPC.
2. 20261010060000_torqwise_refund_question.sql — legacy rollback function retained for compatibility.
3. 20261010070000_torqwise_quota_reservations.sql — reservation-based consume/refund RPCs; the current research endpoint uses these v2 functions.

The current quota defaults are 3 questions/day for free accounts, 100/month for the Driver plan, and 400/month for Pro. Paid access is only recognized when the database subscription record is active and its current period has not expired. Billing/webhook synchronization is not implemented yet, so do not sell subscriptions or enable live payments.

## Test checklist

- Confirm account sign-up, sign-in, sign-out, and session expiry behavior.
- Ask one low-risk research question and verify that the answer includes relevant source links.
- Confirm the allowance decrements once per successful question.
- Simulate an upstream AI failure in staging and verify the exact reservation is refunded once.
- Repeat a refund call for the same reservation and verify it does not decrement usage again.
- Confirm the public config endpoint never returns the Supabase secret key.
- Check Netlify function logs for errors without exposing keys or private customer data.

Keep staging private/unlisted until the checks pass. Never merge or overwrite the live site merely because static checks pass.

## Scope and limitations

This is research support, not a finished ALLDATA replacement. Public web search cannot unlock licensed OEM service manuals, factory wiring diagrams, or proprietary parts databases. Verify exact vehicle/equipment applicability and safety-critical specifications against authoritative service information. The current in-memory burst limiter is best-effort only and is not a substitute for a durable rate limiter. Saved cases are currently browser-local rather than cloud-synced.
