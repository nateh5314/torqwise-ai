# TORQWISE billing setup (staging first)

This branch adds server-side billing endpoints. It does **not** turn on live payments, deploy the site, or complete frontend account wiring by itself. Keep the current live site unchanged until the staging checklist passes.

## Required Netlify environment variables
Set these on the **staging Netlify site**, with Functions/runtime scope:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (public project anon/publishable key; server uses it only to verify a session)
- `SUPABASE_SERVICE_ROLE_KEY` (secret; server functions only)
- `STRIPE_SECRET_KEY` (use a Stripe test-mode key first)
- `STRIPE_PRO_PRICE_ID` (a recurring monthly Stripe Price ID for CA$29.99)
- `STRIPE_WEBHOOK_SECRET` (signing secret for the staging webhook)
- `SITE_URL` (the exact HTTPS origin of the staging website)

Never put secret keys in HTML, commit them to Git, or send them in chat/screenshots.

## Supabase
1. Open the staging Supabase project SQL Editor.
2. Run `supabase/subscriptions.sql` and `supabase/research-usage.sql`.
3. Confirm email/password authentication is enabled and email confirmation settings are suitable for testing.
4. Keep the service-role key server-side only.

## Stripe test mode
1. In Stripe test mode, create a recurring monthly price of CAD 29.99 and copy its Price ID into `STRIPE_PRO_PRICE_ID`.
2. Add a webhook endpoint at `https://YOUR-STAGING-DOMAIN/.netlify/functions/stripe-webhook`.
3. Subscribe to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`.
4. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Use Stripe test cards only; do not enable live mode.

## Endpoints in this branch
- `POST /.netlify/functions/create-checkout`: verifies the Supabase access token and creates a hosted Stripe Checkout subscription session.
- `POST /.netlify/functions/create-portal`: verifies the signed-in user and creates a Stripe customer portal session for an existing subscription.
- `GET /.netlify/functions/public-config`: returns only the public Supabase URL and anon key for the browser; it never returns secret keys.
- `GET /.netlify/functions/billing-status`: verifies the user and returns that user's subscription state.
- `POST /.netlify/functions/stripe-webhook`: verifies Stripe's timestamped HMAC signature before syncing subscription events.

## Important limitations before public launch
- The staging HTML now wires the account modal to Supabase sign-up/sign-in, shows the CA$29.99/month Pro subscription option, checks the signed-in user's subscription status, and offers the Stripe customer portal when Pro is active. This wiring is not yet production-verified.
- Customer order/request history is still local to the browser; shared, durable customer records are not implemented.
- Pro access is not yet enforced server-side for the AI research endpoint. Do not advertise protected features as gated or grant access based on the checkout return URL alone.
- Do not take real payments until the UI uses real Supabase sign-in, checkout redirects are connected, the webhook and subscription status are tested, Pro access is enforced server-side for protected usage, and cancellation/refund/support/legal pages are ready.
- The existing AI research endpoint currently uses a best-effort in-memory rate limit, which is not suitable for a public paid product by itself.
- A successful checkout redirect is not proof of payment. Grant access only after a verified webhook updates the subscription record.
