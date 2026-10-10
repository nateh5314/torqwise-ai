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
- `STRIPE_SECRET_KEY` — Stripe **test-mode** secret key, server-side only.
- `STRIPE_PRICE_PRO` — test-mode Price ID for the $29.99 CAD monthly TORQWISE Pro price.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the Stripe webhook endpoint `/.netlify/functions/stripe-webhook`.
- `SITE_URL` — optional canonical site origin for checkout return URLs; defaults to the deployed Netlify URL.
- Optional OPENAI_MODEL — defaults to gpt-5-mini.

After changing variables, redeploy the staging site. Do not share screenshots that reveal secret values.

## Supabase setup

Apply the SQL migrations in timestamp order from supabase/migrations/ to the staging Supabase project before testing research quotas:

1. 20261010050000_torqwise_core_usage.sql — usage and subscription tables plus the original server-only quota RPC.
2. 20261010060000_torqwise_refund_question.sql — legacy rollback function retained for compatibility.
3. 20261010070000_torqwise_quota_reservations.sql — reservation-based consume/refund RPCs; the current research endpoint uses these v2 functions.
4. 20261010080000_torqwise_stripe_subscriptions.sql — Stripe customer/subscription linkage fields used by billing webhooks and the customer portal.

The current quota defaults are 3 questions/day for free accounts, 100/month for the Driver plan, and 400/month for Pro. Paid access is only recognized when the database subscription record is active and its current period has not expired. Stripe integration code is present on the development branch but is not active until staging environment variables, the test-mode webhook, and the matching staging database migration are configured and tested. Do not enable live payments.

## Stripe test-mode setup

1. Create the TORQWISE Pro recurring price in Stripe test mode at CAD $29.99/month and set its Price ID as `STRIPE_PRICE_PRO` in the staging Netlify site's runtime environment.
2. Add a test-mode Stripe secret key as `STRIPE_SECRET_KEY` in Netlify. Never expose it in client code or chat.
3. Create a Stripe webhook endpoint at `https://YOUR-STAGING-SITE/.netlify/functions/stripe-webhook` and subscribe to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`. Add the webhook signing secret to Netlify as `STRIPE_WEBHOOK_SECRET`.
4. Apply the migrations above to a dedicated staging Supabase project, including the Stripe linkage migration. Do not apply these to production without an explicit migration plan.
5. Redeploy the staging site after setting variables. Sign in, use a Stripe test card, and verify the subscription row and Pro quota. Then test cancellation and a failed renewal/payment.
6. Configure the Stripe customer portal in test mode if you want customers to manage/cancel subscriptions there.

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
