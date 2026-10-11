function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
const env = (name) => {\n  try {\n    if (typeof Netlify !== "undefined" && Netlify?.env?.get) {\n      const value = Netlify.env.get(name);\n      if (typeof value === "string" && value.trim()) return value.trim();\n    }\n  } catch {}\n  return (process.env[name] || "").trim();\n};
export default async (req) => {
  if (req.method !== "GET") return json({ error: "Use GET." }, 405);
  const auth = req.headers.get("authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to view subscription status." }, 401);
  const url = env("SUPABASE_URL") || "https://wnvmtjimldleqfjuuprl.supabase.co", anon = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_PUNISHABLE_KEY"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Subscription status is not configured yet." }, 503);
  try {
    const ur = await fetch(url + "/auth/v1/user", { headers: { apikey: anon, authorization: "Bearer " + token } });
    if (!ur.ok) return json({ error: "Your session is invalid or expired." }, 401);
    let user;
    try { user = await ur.json(); } catch { return json({ error: "Your session could not be verified." }, 401); }
    if (!user || typeof user.id !== "string" || !user.id) return json({ error: "Your session could not be verified." }, 401);
    const sr = await fetch(url + "/rest/v1/subscriptions?user_id=eq." + encodeURIComponent(user.id) + "&select=status,current_period_end,cancel_at_period_end,price_id&order=updated_at.desc&limit=10", {
      headers: { apikey: service, authorization: "Bearer " + service }
    });
    if (!sr.ok) throw new Error("subscription query failed");
    const rows = await sr.json();
    const proPriceId = env("STRIPE_PRO_PRICE_ID") || env("STRIPE_PRICE_PRO");
    const proSubscription = Array.isArray(rows)
      ? rows.find(row => !!proPriceId && ["active", "trialing"].includes(row.status) && row.price_id === proPriceId) || null
      : null;
    const currentSubscription = proSubscription || (Array.isArray(rows) ? rows[0] || null : null);
    return json({ isPro: !!proSubscription, subscription: currentSubscription });
  } catch (e) {
    console.error("Subscription status lookup failed:", e?.message || "unknown");
    return json({ error: "Could not load subscription status right now." }, 503);
  }
};