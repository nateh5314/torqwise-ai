function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
const env = (name) => (process.env[name] || "").trim();
export default async (req) => {
  if (req.method !== "GET") return json({ error: "Use GET." }, 405);
  const auth = req.headers.get("authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to view subscription status." }, 401);
  const url = env("SUPABASE_URL"), anon = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Subscription status is not configured yet." }, 503);
  try {
    const ur = await fetch(url + "/auth/v1/user", { headers: { apikey: anon, authorization: "Bearer " + token } });
    if (!ur.ok) return json({ error: "Your session is invalid or expired." }, 401);
    const user = await ur.json();
    const sr = await fetch(url + "/rest/v1/subscriptions?user_id=eq." + encodeURIComponent(user.id) + "&select=status,current_period_end,cancel_at_period_end,price_id&order=updated_at.desc&limit=1", {
      headers: { apikey: service, authorization: "Bearer " + service }
    });
    if (!sr.ok) throw new Error("subscription query failed");
    const rows = await sr.json(), row = rows[0] || null;
    return json({ isPro: !!row && ["active", "trialing"].includes(row.status), subscription: row });
  } catch (e) {
    console.error("Subscription status lookup failed:", e?.message || "unknown");
    return json({ error: "Could not load subscription status right now." }, 503);
  }
};