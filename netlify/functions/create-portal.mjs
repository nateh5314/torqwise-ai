function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
const env = (name) => {
  try {
    if (typeof Netlify !== "undefined" && Netlify?.env?.get) {
      const value = Netlify.env.get(name);
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {}
  return (process.env[name] || "").trim();
};
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const stripeKey = env("STRIPE_SECRET_KEY"), site = env("SITE_URL") || "https://torqwiseauto.netlify.app";
  const proPriceId = env("STRIPE_PRICE_PRO") || env("STRIPE_PRO_PRICE_ID") || "price_1UOqWAIpQUHCdBSxunv5OqtK";
  const supabaseUrl = env("SUPABASE_URL") || "https://wnvmtjimldleqfjuuprl.supabase.co", anon = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_PUNISHABLE_KEY"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!stripeKey || !site || !supabaseUrl || !anon || !service || !proPriceId) return json({ error: "Billing management is not configured yet." }, 503);
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to manage your subscription." }, 401);
  try {
    const ur = await fetch(supabaseUrl + "/auth/v1/user", { headers: { apikey: anon, authorization: "Bearer " + token } });
    if (!ur.ok) return json({ error: "Your session is invalid or expired. Sign in again." }, 401);
    let user;
    try { user = await ur.json(); } catch { return json({ error: "Your session could not be verified. Sign in again." }, 401); }
    if (!user || typeof user.id !== "string" || !user.id) return json({ error: "Your session could not be verified. Sign in again." }, 401);
    const sr = await fetch(supabaseUrl + "/rest/v1/subscriptions?user_id=eq." + encodeURIComponent(user.id) + "&select=stripe_customer_id,status,price_id&order=updated_at.desc&limit=10", {
      headers: { apikey: service, authorization: "Bearer " + service }
    });
    if (!sr.ok) throw new Error("Subscription lookup failed");
    const rows = await sr.json();
    // Prefer the verified account mapping. If the webhook has not yet written
    // the subscription row, reconcile against Stripe using this authenticated
    // user's verified email and only accept a matching Pro subscription.
    let customer = Array.isArray(rows) ? rows.find(row => row.price_id === proPriceId && row.stripe_customer_id && ["active","trialing","past_due","unpaid"].includes(row.status))?.stripe_customer_id : null;
    if (!customer) {
      // Stripe checkout records the authenticated Supabase user ID in
      // subscription metadata. Use that stable link before falling back to email.
      const sr2 = await fetch("https://api.stripe.com/v1/subscriptions?status=all&limit=100", { headers: { authorization: "Bearer " + stripeKey } });
      const sd = await sr2.json();
      if (sr2.ok && Array.isArray(sd.data)) {
        const match = sd.data.find(sub =>
          sub.metadata?.supabase_user_id === user.id &&
          ["active","trialing","past_due","unpaid"].includes(sub.status) &&
          sub.items?.data?.some(item => item.price?.id === proPriceId)
        );
        if (match && typeof match.customer === "string") customer = match.customer;
      }
    }
    if (!customer && typeof user.email === "string" && user.email) {
      const escapedEmail = user.email.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const search = new URLSearchParams({ query: "email:'" + escapedEmail + "'", limit: "10" });
      const cr = await fetch("https://api.stripe.com/v1/customers/search?" + search.toString(), { headers: { authorization: "Bearer " + stripeKey } });
      const cd = await cr.json();
      if (cr.ok && Array.isArray(cd.data)) {
        for (const candidate of cd.data) {
          const sr2 = await fetch("https://api.stripe.com/v1/subscriptions?customer=" + encodeURIComponent(candidate.id) + "&status=all&limit=20", { headers: { authorization: "Bearer " + stripeKey } });
          const sd = await sr2.json();
          const match = sr2.ok && Array.isArray(sd.data) && sd.data.some(sub => ["active","trialing","past_due","unpaid"].includes(sub.status) && sub.items?.data?.some(item => item.price?.id === proPriceId));
          if (match) { customer = candidate.id; break; }
        }
      }
    }
    if (!customer) return json({ error: "We couldn't find an active Pro subscription linked to this account. Confirm you used the same sign-in email at checkout, then refresh status." }, 404);
    const form = new URLSearchParams({ customer, return_url: site.replace(/\/$/, "") + "/#account" });
    const pr = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { authorization: "Bearer " + stripeKey, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    const data = await pr.json();
    if (!pr.ok || !data.url) {
      console.error("Stripe portal creation failed:", pr.status, data?.error?.type || "unknown");
      return json({ error: "Could not open subscription management. Check the Stripe customer portal configuration." }, 502);
    }
    return json({ url: data.url });
  } catch (e) {
    console.error("Subscription portal error:", e?.message || "unknown");
    return json({ error: "Could not load subscription management right now." }, 503);
  }
};
