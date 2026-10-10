# TORQWISE operator dashboard

The private operator console is served at `/admin.html`. It uses the same Supabase email/password account system as the customer website, but the server-side function separately checks the signed-in user's UUID against `TORQWISE_ADMIN_USER_IDS` before it returns customer records or updates a request.

## Required configuration

1. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in Netlify for Functions/runtime use.
2. Create your own operator account through the TORQWISE sign-up flow in the intended Supabase project.
3. In Supabase Authentication / Users, copy that account's user UUID. Put the UUID—not the email—in Netlify variable `TORQWISE_ADMIN_USER_IDS`. Multiple operator UUIDs may be comma-separated.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` secret and server-side only. Never place it in HTML or share it in screenshots/chat.
5. Redeploy the Netlify site after environment changes, then open `/admin.html` and sign in with the authorized operator account.

## Current dashboard capabilities

- Loads the latest 250 customer research requests after server-side authorization.
- Shows total loaded requests, requests needing attention, in-progress requests, and requests marked paid by the verified Stripe webhook.
- Searches by request code, customer email, service, vehicle/equipment, and request details.
- Filters by workflow status and payment status.
- Lets an authorized operator change workflow status.
- Keeps payment status read-only; never mark an order paid manually in the dashboard.

## Customer data and payment safety

The browser does not receive the service-role key. The server verifies the Supabase bearer token and checks the user UUID against the admin allowlist before reading or changing requests. Payment status is controlled by the server-side Stripe webhook, not the admin UI.

## Not implemented / not verified yet

This is a request-management console, not yet a complete business control centre. Revenue reconciliation, customer membership management, AI report generation/review/approval, report delivery, refunds, role management, and audit history still need dedicated implementation and testing. Email notices require the optional Resend configuration. Never enable live payments until the order, cancellation/refund, legal, and webhook workflows have been tested end-to-end in Stripe test mode.
