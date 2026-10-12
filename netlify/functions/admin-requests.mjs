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
    let user;
    try { user = await auth.json(); } catch { return json({ error: "Your session could not be verified." }, 401); }
    if (!user || typeof user.id !== "string" || !user.id) return json({ error: "Your session could not be verified." }, 401);
    if (!admins.includes(user.id)) return json({ error: "You are not authorized to access the operator dashboard." }, 403);
    const headers = { apikey: service, authorization: "Bearer " + service, "content-type": "application/json" };
    if (req.method === "GET") {
      const result = await fetch(base + "/rest/v1/customer_requests?select=request_code,service,label,quoted_price,payment_status,paid_at,included_with_pro,status,customer_email,customer_type,vehicle,details,deadline,preferred_timeline,created_at&order=created_at.desc&limit=250", { headers });
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
    if (body.status === "Awaiting customer" && env("RESEND_API_KEY") && env("EMAIL_FROM") && env("SITE_URL") && rows[0].customer_email) {
      try {
        const request = rows[0];
        const amount = request.included_with_pro === true ? "included with TORQWISE Pro (no payment required)" : request.quoted_price == null ? "a quote to be confirmed" : "CA$" + Number(request.quoted_price).toFixed(2);
        const email = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: "Bearer " + env("RESEND_API_KEY"), "content-type": "application/json" },
          body: JSON.stringify({
            from: env("EMAIL_FROM"),
            to: [request.customer_email],
            subject: request.included_with_pro === true ? "Your TORQWISE Pro research request is in progress" : "Your TORQWISE research request is ready for payment",
            text: "Your TORQWISE request " + code + " has been reviewed.\\n\\nService: " + (request.label || request.service) + "\\nPrice: " + amount + "\\n\\nSign in to your TORQWISE account at " + env("SITE_URL").replace(/\\/$/, "") + "/#account to review the request. " + (request.included_with_pro === true ? "This request is covered by your Pro monthly allowance; no checkout is needed." : "Use secure checkout when available. Custom research remains quote-first. If the scope or price does not look right, contact support before paying.")
          })
        });
        if (!email.ok) console.error("Customer ready-for-payment email failed:", email.status);
      } catch (e) { console.error("Customer ready-for-payment email failed:", e?.message || "unknown"); }
    }
    return json({ request: rows[0] });
  } catch (e) {
    console.error("Operator request management failed:", e?.message || "unknown");
    return json({ error: "Could not manage customer requests right now." }, 503);
  }
};