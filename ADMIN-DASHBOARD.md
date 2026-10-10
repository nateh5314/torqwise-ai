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
- Adds a private Income & expenses view: totals recorded paid custom-research income, manually entered business expenses, and a simple tracked net figure.
- Lets the operator record categorized expenses (including software/AI and hosting), dates, and notes, and remove mistaken entries.
- Filters the loaded finance ledger by month and exports the currently selected income/expense records as CSV for use in a spreadsheet.
- Shows recorded AI research reservations, model names, and provider-reported input/output token counts by selected month. Token counts are not yet converted to provider-dollar costs.

## Enable the finance ledger

After the admin dashboard change is deployed, run `supabase/business-expenses.sql` once in the correct Supabase project's SQL Editor. The finance endpoint uses the same `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `TORQWISE_ADMIN_USER_IDS` variables and verifies the operator UUID server-side before accessing financial records. Do not put the service-role key in the browser or share it in chat.

**Important limitations:** paid custom-research orders are currently the only automatically counted income source. Membership subscription revenue, Stripe fees, refunds, AI API costs, and hosting costs are not automatically reconciled yet; enter expenses manually and keep receipts. The net figure is only the difference between loaded paid requests and recorded expenses, not formal accounting profit or a tax report. CSV export contains the selected, currently loaded records and should not be treated as a complete ledger until subscription revenue and other costs are reconciled. The endpoint currently loads the most recent 1,000 paid requests and 500 expenses, so old records may require a future reporting/pagination upgrade.

## Customer data and payment safety

The browser does not receive the service-role key. The server verifies the Supabase bearer token and checks the user UUID against the admin allowlist before reading or changing requests. Payment status is controlled by the server-side Stripe webhook, not the admin UI.

## Not implemented / not verified yet

This is an early operator console, not yet a complete business control centre. Customer membership management, AI report generation/review/approval, report delivery, refunds, role management, audit history, and complete revenue/cost reconciliation still need dedicated implementation and testing. The finance UI and endpoint have not yet been verified against the real Supabase project. Email notices require the optional Resend configuration. Never enable live payments until the order, cancellation/refund, legal, and webhook workflows have been tested end-to-end in Stripe test mode.
