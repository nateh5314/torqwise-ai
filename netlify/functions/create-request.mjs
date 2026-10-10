function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
const env = (name) => (process.env[name] || "").trim();
const clean = (v, max = 1800) => typeof v === "string" ? v.trim().slice(0, max) : "";
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const base = env("SUPABASE_URL"), anon = env("SUPABASE_ANON_KEY"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !anon || !service) return json({ error: "Customer request storage is not configured yet." }, 503);
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in to submit and track a customer request." }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  try {
    const auth = await fetch(base + "/auth/v1/user", { headers: { apikey: anon, authorization: "Bearer " + token } });
    if (!auth.ok) return json({ error: "Your session expired. Please sign in again." }, 401);
    const user = await auth.json();
    const code = "TQ-" + Date.now().toString().slice(-7) + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    const services = { parts: ["Parts Research", 15], estimate: ["Estimate Comparison", 25], used: ["Used Vehicle Research", 30], business: ["Business / custom research", null] };
    const serviceId = clean(body.service, 30);
    if (!services[serviceId]) return json({ error: "Choose a valid research service." }, 400);
    const details = clean(body.details);
    const vehicle = clean(body.vehicle, 240);
    if (!details || !vehicle) return json({ error: "Enter vehicle/equipment details and describe the request." }, 400);
    const row = {
      request_code: code, user_id: user.id, service: serviceId, label: services[serviceId][0],
      quoted_price: services[serviceId][1], status: "Request received", customer_email: user.email,
      customer_type: clean(body.customerType, 40), vehicle, details,
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(clean(body.deadline, 10)) ? clean(body.deadline, 10) : null
    };
    const saved = await fetch(base + "/rest/v1/customer_requests", {
      method: "POST",
      headers: { apikey: service, authorization: "Bearer " + service, "content-type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(row)
    });
    if (!saved.ok) {
      console.error("Customer request insert failed:", saved.status);
      return json({ error: "Could not save your request. Please try again shortly." }, 503);
    }
    const rows = await saved.json();
    return json({ request: { ...rows[0], id: rows[0].request_code, email: rows[0].customer_email, customerType: rows[0].customer_type, price: rows[0].quoted_price, created: rows[0].created_at } }, 201);
  } catch (e) {
    console.error("Customer request error:", e?.message || "unknown");
    return json({ error: "Could not submit your request right now." }, 503);
  }
};