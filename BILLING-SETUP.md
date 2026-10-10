# TORQWISE deployment and account configuration

The repository now contains the website, account integration, server-side research entitlement, subscription billing endpoints, customer request storage, operator request management, and draft legal/support pages. Publishing still requires connecting the repository to Netlify and configuring the operator-owned Supabase, Stripe, and email accounts. Do not enable live charges until the legal/business details and billing settings are correct.

## Required Supabase migrations

Before enabling AI research, run `supabase/research-usage.sql` in the Supabase SQL Editor. This creates the private usage table and the atomic monthly reservation/release functions used by the server. The endpoint fails closed if this migration is missing; do not bypass that check. Free accounts are limited to 3 successful AI research reports per calendar month. Pro access is determined server-side from the subscription table.

## Required Netlify environment variables
Set these on the Netlify site, with Functions/runtime scope. Start with Stripe test mode; switch to live credentials only when you are ready to accept real payments:
- `OPENAI_API_KEY` (required for AI research; secret, server-side only)
- `OPENAI_MODEL` (optional; defaults to `gpt-5-mini`)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (public project anon/publishable key; server uses it only to verify a session)
- `SUPABASE_SERVICE_ROLE_KEY` (secret; server functions only)
- `STRIPE_SECRET_KEY` (use a Stripe test-mode key first)
- `STRIPE_PRO_PRICE_ID` (a recurring monthly Stripe Price ID for CA$29.99)
- `STRIPE_WEBHOOK_SECRET` (signing secret for the staging webhook)
- `SITE_URL` (the exact HTTPS origin of the staging website)
- `RESEND_API_KEY` (optional; enables request notification emails)
- `SUPPORT_EMAIL` (optional; operator inbox for new request notifications)
- `EMAIL_FROM` (optional; verified sender address for request notifications)
- `TORQWISE_ADMIN_USER_IDS` (comma-separated Supabase user UUIDs permitted to access `/admin.html`)

Never put secret keys in HTML, commit them to Git, or send them in chat/screenshots.

## Supabase
1. Open the staging Supabase project SQL Editor.
2. Run `supabase/subscriptions.sql`, `supabase/research-usage.sql`, `supabase/customer-requests.sql`, and `supabase/account-history.sql`. The last script creates the per-account saved research, diagnostic, parts, and job history table.
3. Confirm email/password authentication is enabled and email confirmation settings are suitable for testing.
4. Keep the service-role key server-side only.
5. Add the final site origin to Supabase Auth's allowed redirect URLs for email confirmation and password reset.

## Stripe test mode
1. In Stripe test mode, create a recurring monthly price of CAD 29.99 and copy its Price ID into `STRIPE_PRO_PRICE_ID`.
2. Add a webhook endpoint at `https://YOUR-STAGING-DOMAIN/.netlify/functions/stripe-webhook`.
3. Subscribe to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`.
4. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Use Stripe test cards only; do not enable live mode.
6. For one-time service payments, verify the request's server-stored price is used, users cannot pay for another user's request, a pending session is reused, cancelled checkout does not mark the request paid, and only a verified `checkout.session.completed` event with `mode=payment` and `payment_status=paid` marks the request paid.

## Endpoints in this branch
- `POST /.netlify/functions/create-checkout`: verifies the Supabase access token and creates a hosted Stripe Checkout subscription session.
- `POST /.netlify/functions/create-service-checkout`: verifies the signed-in user owns the request, applies the server-side CAD price for fixed-scope research, and creates/reuses a hosted one-time Stripe Checkout session.
- `POST /.netlify/functions/create-portal`: verifies the signed-in user and creates a Stripe customer portal session for an existing subscription.
- `GET /.netlify/functions/public-config`: returns only the public Supabase URL and anon key for the browser; it never returns secret keys.
- `POST /.netlify/functions/create-request`: validates the signed-in account and stores a customer research request.
- `GET /.netlify/functions/list-requests`: returns only the signed-in customer's saved request history.
- `GET/PATCH /.netlify/functions/admin-requests`: operator-only request management, restricted to `TORQWISE_ADMIN_USER_IDS`.
- `GET /.netlify/functions/billing-status`: verifies the user and returns that user's subscription state.
- `GET/POST/DELETE /.netlify/functions/account-history`: verifies the Supabase session and lists, saves, or deletes only the signed-in user's saved research, diagnostic, parts, and job history.
- `POST /.netlify/functions/stripe-webhook`: verifies Stripe's timestamped HMAC signature before syncing subscription events.

## Account history setup and verification
- Run `supabase/account-history.sql` before testing the saved-history panel; the feature returns a configuration/storage error until its table exists.
- The API uses the server-side service-role key only after verifying the caller's bearer token, and scopes database reads/deletes to that verified user ID. Keep the service-role key out of browser code.
- The staging CI runs regression tests for authentication requirements, per-user filtering, save validation, safe source URLs, and delete scoping. These are API tests, not a substitute for testing the deployed Supabase project and mobile UI.

## Important limitations before public launch
- The staging site now includes draft Privacy Policy, Terms of Service, and Support pages. Confirm legal business identity, monitored contact address, refund terms, and privacy wording before public launch. The staging HTML wires the account modal to Supabase sign-up/sign-in, shows the CA$29.99/month Pro subscription option, checks the signed-in user's subscription status, and offers the Stripe customer portal when Pro is active. This wiring is not yet production-verified.
- Fixed-price service requests can use a separate one-time Stripe Checkout flow. The signed webhook marks a request paid only after Stripe reports a completed, paid checkout session, and verifies the stored checkout session ID, currency, and amount against the saved request. Checkout is blocked until an operator reviews scope and changes the request status to `Awaiting customer`. If Resend is configured, that status change emails the customer to return to their account. Custom/business research remains quote-first. This is code-ready but still requires provider configuration and end-to-end test-mode verification.
- Customer request submission and history are wired to persistent Supabase storage. Optional request notification emails are supported through Resend environment variables, and `/admin.html` provides a restricted request-status dashboard. Set `SUPPORT_EMAIL`, configure the sender, and add the operator's Supabase user UUID to `TORQWISE_ADMIN_USER_IDS` before launch.
- The AI research endpoint now checks the signed-in user's subscription and enforces a three-report monthly free allowance using `research_usage`. This is a basic count-based quota, not an atomic quota reservation under concurrent requests.
- Before enabling live payments, the operator must complete the account configuration, verify that the Stripe price is the intended CA$29.99 recurring plan, set up the billing portal, confirm refund/cancellation terms, and replace or approve the draft legal pages. The site code does not replace these account-level decisions.
- The existing AI research endpoint currently uses a best-effort in-memory rate limit, which is not suitable for a public paid product by itself.
- A successful checkout redirect is not proof of payment. Grant access only after a verified webhook updates the subscription record.
