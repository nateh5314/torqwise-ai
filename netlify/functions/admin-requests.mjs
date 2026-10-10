function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
const env = name => (process.env[name] || "").trim();
export default async req => {
  if (!["GET", "PATCH"].includes(req.method)) return json({ error: "Use GET or PATCH." }, 405);
  const base = env("SUPABASE_URL"), anon = env("SUPABASE_ANON_KEY"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  const admins = env("TORQWISE_ADMIN_USER_IDS").split(",").map(x => x.trim()).filter(Boolean);
  if (!base || !anon || !service || !admins.length) return json({ error: "Operator dashboard is not configured." }, 503);
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in with an authorized operator account." }, 401);
  try {
    const auth = await fetch(base + "/auth/v1/user", { headers: { apikey: anon, authorization: "Bearer " + token } });
    if (!auth.ok) return json({ error: "Your session is invalid or expired." }, 401);
    const user = await auth.json();
    if (!admins.includes(user.id)) return json({ error: "You are not authorized to access the operator dashboard." }, 403);
    const headers = { apikey: service, authorization: "Bearer " + service, "content-type": "application/json" };
    if (req.method === "GET") {
      const result = await fetch(base + "/rest/v1/customer_requests?select=request_code,service,label,quoted_price,payment_status,paid_at,stripe_checkout_session_id,status,customer_email,customer_type,vehicle,details,deadline,created_at&order=created_at.desc&limit=250", { headers });
      if (!result.ok) throw new Error("Could not load requests");
      return json({ requests: await result.json() });
    }
    let body;
    try { body = await req.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
    const code = typeof body.request_code === "string" ? body.request_code.trim().slice(0, 60) : "";
    const allowed = ["Request received", "In progress", "Awaiting customer", "Completed", "Declined"];
    if (!code || !allowed.includes(body.status)) return json({ error: "Choose a valid request and status." }, 400);
    const result = await fetch(base + "/rest/v1/customer_requests?request_code=eq." + encodeURIComponent(code), {
      method: "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify({ status: body.status })
    });
    if (!result.ok) throw new Error("Could not update request status");
    const rows = await result.json();
    if (!rows.length) return json({ error: "Request not found." }, 404);
    return json({ request: rows[0] });
  } catch (e) {
    console.error("Operator request management failed:", e?.message || "unknown");
    return json({ error: "Could not manage customer requests right now." }, 503);
  }
};