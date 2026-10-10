function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
const env = name => (process.env[name] || "").trim();
const serviceCatalog = {
  parts: { label: "Parts Research", amount: 1500 },
  estimate: { label: "Estimate Comparison", amount: 2500 },
  used: { label: "Used Vehicle Research", amount: 3000 },
};
async function getUser(token) {
  const base = env("SUPABASE_URL"), anon = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  if (!base || !anon) throw new Error("Supabase configuration is missing.");
  const r = await fetch(base + "/auth/v1/user", { headers: { apikey: anon, authorization: "Bearer " + token } });
  if (!r.ok) return null;
  return await r.json();
}
async function supabase(path, options = {}) {
  const base = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) throw new Error("Supabase service configuration is missing.");
  return fetch(base + "/rest/v1/" + path, {
    ...options,
    headers: { apikey: key, authorization: "Bearer " + key, "content-type": "application/json", ...(options.headers || {}) },
  });
}
export default async req => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const stripeKey = env("STRIPE_SECRET_KEY"), site = env("SITE_URL");
  if (!stripeKey || !site) return json({ error: "Service checkout is not configured yet." }, 503);
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in before paying for a research request." }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const code = typeof body.requestCode === "string" ? body.requestCode.trim().slice(0, 60) : "";
  if (!/^TQ-[A-Z0-9-]+$/i.test(code)) return json({ error: "Choose a valid saved request." }, 400);
  try {
    const user = await getUser(token);
    if (!user?.id || !user?.email) return json({ error: "Your session is invalid or expired. Sign in again." }, 401);
    const result = await supabase("customer_requests?request_code=eq." + encodeURIComponent(code) + "&user_id=eq." + encodeURIComponent(user.id) + "&select=request_code,user_id,service,label,quoted_price,payment_status,stripe_checkout_session_id&limit=1");
    if (!result.ok) throw new Error("Request lookup failed");
    const rows = await result.json(), request = rows[0];
    if (!request) return json({ error: "That research request was not found in your account." }, 404);
    if (request.payment_status === "paid") return json({ error: "This request is already marked as paid." }, 409);
    const product = serviceCatalog[request.service];
    if (!product) return json({ error: "Custom research requires a confirmed quote before payment." }, 409);
    if (Number(request.quoted_price) !== product.amount / 100) return json({ error: "The saved price does not match the current service price. Contact support before paying." }, 409);
    if (request.stripe_checkout_session_id) {
      const previous = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(request.stripe_checkout_session_id), {
        headers: { authorization: "Bearer " + stripeKey },
      });
      if (previous.ok) {
        const old = await previous.json();
        if (old.status === "open" && old.url) return json({ url: old.url, reused: true });
        if (old.payment_status === "paid") return json({ error: "Payment was received and is being confirmed. Refresh your request history shortly." }, 409);
      }
    }
    const form = new URLSearchParams({
      mode: "payment",
      "payment_method_types[0]": "card",
      customer_email: user.email,
      client_reference_id: code,
      "line_items[0][price_data][currency]": "cad",
      "line_items[0][price_data][unit_amount]": String(product.amount),
      "line_items[0][price_data][product_data][name]": "TORQWISE " + product.label,
      "line_items[0][price_data][product_data][description]": "Research request " + code + ". Scope and delivery are subject to the request details and TORQWISE confirmation.",
      "line_items[0][quantity]": "1",
      "metadata[request_code]": code,
      "metadata[supabase_user_id]": user.id,
      "payment_intent_data[metadata][request_code]": code,
      "payment_intent_data[metadata][supabase_user_id]": user.id,
      success_url: site.replace(/\/$/, "") + "/?service_payment=success&request_code=" + encodeURIComponent(code) + "#account",
      cancel_url: site.replace(/\/$/, "") + "/?service_payment=cancelled&request_code=" + encodeURIComponent(code) + "#account",
    });
    const checkout = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: "Bearer " + stripeKey, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const session = await checkout.json();
    if (!checkout.ok || !session.id || !session.url) {
      console.error("Service checkout creation failed:", checkout.status, session?.error?.type || "unknown");
      return json({ error: "Checkout could not be started. Please try again later." }, 502);
    }
    const saved = await supabase("customer_requests?request_code=eq." + encodeURIComponent(code) + "&user_id=eq." + encodeURIComponent(user.id), {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ stripe_checkout_session_id: session.id, payment_status: "pending" }),
    });
    if (!saved.ok) {
      console.error("Could not save service checkout session:", saved.status);
      return json({ error: "Checkout was created but could not be linked to the request. Contact support before retrying." }, 503);
    }
    return json({ url: session.url });
  } catch (e) {
    console.error("Service checkout error:", e?.message || "unknown");
    return json({ error: "Could not start checkout right now. Please try again shortly." }, 503);
  }
};
