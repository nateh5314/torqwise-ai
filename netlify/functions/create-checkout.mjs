function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function env(name) { return (process.env[name] || "").trim(); }
async function getUser(accessToken) {
  const url = env("SUPABASE_URL") || "https://wnvmtjimldleqfjuuprl.supabase.co", key = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_PUNISHABLE_KEY");
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  const r = await fetch(url + "/auth/v1/user", { headers: { apikey: key, authorization: "Bearer " + accessToken } });
  if (!r.ok) return null;
  return await r.json();
}
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const stripeKey = env("STRIPE_SECRET_KEY"), price = env("STRIPE_PRO_PRICE_ID") || env("STRIPE_PRICE_PRO"), site = env("SITE_URL") || "https://torqwiseauto.netlify.app";
  if (!stripeKey || !price || !site) return json({ error: "Billing is not configured yet. Ask the site administrator to finish setup." }, 503);
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "Sign in before starting a subscription." }, 401);
  let user;
  try { user = await getUser(match[1]); } catch (e) {
    console.error("Supabase auth verification failed:", e?.message || "unknown");
    return json({ error: "Account verification is temporarily unavailable." }, 503);
  }
  if (!user?.id || !user?.email) return json({ error: "Your session is invalid or expired. Sign in again." }, 401);
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    customer_email: user.email,
    client_reference_id: user.id,
    "metadata[supabase_user_id]": user.id,
    "subscription_data[metadata][supabase_user_id]": user.id,
    success_url: site.replace(/\/$/, "") + "/?billing=success&session_id={CHECKOUT_SESSION_ID}#account",
    cancel_url: site.replace(/\/$/, "") + "/?billing=cancelled#services",
    allow_promotion_codes: "true",
  });
  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: "Bearer " + stripeKey, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = await r.json();
    if (!r.ok || !data.url) {
      console.error("Stripe checkout creation failed:", r.status, data?.error?.type || "unknown");
      return json({ error: "Checkout could not be started. Check Stripe test-mode product and price settings." }, 502);
    }
    return json({ url: data.url });
  } catch (e) {
    console.error("Stripe checkout network failure:", e?.name || "unknown");
    return json({ error: "Payment service is temporarily unreachable." }, 502);
  }
};