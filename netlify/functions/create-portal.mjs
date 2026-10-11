function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
const env = (name) => {\n  try {\n    if (typeof Netlify !== "undefined" && Netlify?.env?.get) {\n      const value = Netlify.env.get(name);\n      if (typeof value === "string" && value.trim()) return value.trim();\n    }\n  } catch {}\n  return (process.env[name] || "").trim();\n};
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const stripeKey = env("STRIPE_SECRET_KEY"), site = env("SITE_URL") || "https://torqwiseauto.netlify.app";
  const proPriceId = env("STRIPE_PRO_PRICE_ID") || env("STRIPE_PRICE_PRO");
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
    // Keep the Pro management portal scoped to the configured Pro subscription.
    const proSubscription = Array.isArray(rows) ? rows.find(row => row.price_id === proPriceId && row.stripe_customer_id) : null;
    const customer = proSubscription?.stripe_customer_id;
    if (!customer) return json({ error: "No Pro subscription is linked to this account yet." }, 404);
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
