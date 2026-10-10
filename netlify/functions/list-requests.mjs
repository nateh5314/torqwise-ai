function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
const env = (name) => (process.env[name] || "").trim();
export default async (req) => {
  if (req.method !== "GET") return json({ error: "Use GET." }, 405);
  const base = env("SUPABASE_URL"), anon = env("SUPABASE_ANON_KEY"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !anon || !service) return json({ error: "Customer request storage is not configured yet." }, 503);
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to view customer requests." }, 401);
  try {
    const auth = await fetch(base + "/auth/v1/user", { headers: { apikey: anon, authorization: "Bearer " + token } });
    if (!auth.ok) return json({ error: "Your session expired. Please sign in again." }, 401);
    const user = await auth.json();
    const result = await fetch(base + "/rest/v1/customer_requests?user_id=eq." + encodeURIComponent(user.id) + "&select=request_code,service,label,quoted_price,status,customer_email,customer_type,vehicle,details,deadline,created_at&order=created_at.desc&limit=100", {
      headers: { apikey: service, authorization: "Bearer " + service }
    });
    if (!result.ok) throw new Error("Request history lookup failed");
    const rows = await result.json();
    return json({ requests: rows.map(row => ({ ...row, id: row.request_code, email: row.customer_email, customerType: row.customer_type, price: row.quoted_price, created: row.created_at })) });
  } catch (e) {
    console.error("Customer request history error:", e?.message || "unknown");
    return json({ error: "Could not load request history right now." }, 503);
  }
};