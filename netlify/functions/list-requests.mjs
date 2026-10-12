function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function env(name) {
  try {
    if (typeof Netlify !== "undefined" && Netlify?.env?.get) {
      const value = Netlify.env.get(name);
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {}
  return (process.env[name] || "").trim();
}
export default async (req) => {
  if (req.method !== "GET") return json({ error: "Use GET." }, 405);
  const base = env("SUPABASE_URL"), anon = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_PUNISHABLE_KEY"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !anon || !service) return json({ error: "Customer request storage is not configured yet." }, 503);
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to view customer requests." }, 401);
  try {
    const auth = await fetch(base + "/auth/v1/user", { headers: { apikey: anon, authorization: "Bearer " + token }, signal: AbortSignal.timeout(8000) });
    if (!auth.ok) return json({ error: "Your session expired. Please sign in again." }, 401);
    let user;
    try { user = await auth.json(); } catch { return json({ error: "Your session could not be verified. Please sign in again." }, 401); }
    if (!user || typeof user.id !== "string" || !user.id) return json({ error: "Your session could not be verified. Please sign in again." }, 401);
    const result = await fetch(base + "/rest/v1/customer_requests?user_id=eq." + encodeURIComponent(user.id) + "&select=request_code,service,label,quoted_price,payment_status,paid_at,included_with_pro,status,customer_email,customer_type,vehicle,details,deadline,preferred_timeline,created_at&order=created_at.desc&limit=100", {
      headers: { apikey: service, authorization: "Bearer " + service },
      signal: AbortSignal.timeout(10000)
    });
    if (!result.ok) { console.error("Customer request history lookup failed:", result.status); throw new Error("Request history lookup failed"); }
    let rows;
    try { rows = await result.json(); } catch {
      return json({ error: "Request history returned an unreadable response. Please retry shortly." }, 503);
    }
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
      return json({ error: "Request history returned an unexpected response. Please retry shortly." }, 503);
    }
    return json({ requests: rows.map(row => ({ ...row, id: row.request_code, email: row.customer_email, customerType: row.customer_type, price: row.quoted_price, created: row.created_at })) });
  } catch (e) {
    console.error("Customer request history error:", e?.message || "unknown");
    return json({ error: "Could not load request history right now." }, 503);
  }
};