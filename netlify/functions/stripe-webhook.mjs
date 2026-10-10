import { createHmac, timingSafeEqual } from "node:crypto";
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
const env = (name) => (process.env[name] || "").trim();
function verifySignature(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => {
    const i = part.indexOf("="); return i < 0 ? ["", ""] : [part.slice(0, i), part.slice(i + 1)];
  }));
  const timestamp = parts.t;
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(timestamp + "." + raw).digest("hex");
  return (header.match(/(?:^|,)v1=([a-f0-9]+)/g) || []).some((part) => {
    const sig = part.replace(/^,?v1=/, "");
    try { return sig.length === expected.length && timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex")); } catch { return false; }
  });
}
async function supabaseRequest(path, method, body) {
  const url = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase webhook configuration missing");
  return fetch(url + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: key,
      authorization: "Bearer " + key,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function isoUnix(value) { return value ? new Date(value * 1000).toISOString() : null; }
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const secret = env("STRIPE_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhook is not configured." }, 503);
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("stripe-signature"), secret)) return json({ error: "Invalid signature." }, 400);
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400); }
  try {
    const obj = event.data?.object || {};
    if (event.type === "checkout.session.completed" && obj.mode === "subscription" && obj.subscription) {
      const userId = obj.client_reference_id || obj.metadata?.supabase_user_id;
      if (!userId) return json({ error: "Subscription checkout is missing user metadata." }, 400);
      const sr = await fetch("https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(obj.subscription), {
        headers: { authorization: "Bearer " + env("STRIPE_SECRET_KEY") },
      });
      const sub = await sr.json();
      if (!sr.ok) throw new Error("Stripe subscription lookup failed");
      const r = await supabaseRequest("subscriptions?on_conflict=stripe_subscription_id", "POST", {
        user_id: userId,
        stripe_customer_id: typeof obj.customer === "string" ? obj.customer : obj.customer?.id,
        stripe_subscription_id: sub.id,
        price_id: sub.items?.data?.[0]?.price?.id || null,
        status: sub.status,
        current_period_end: isoUnix(sub.current_period_end),
        cancel_at_period_end: !!sub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      });
      if (!r.ok) throw new Error("Supabase subscription upsert failed");
    } else if (event.type === "checkout.session.completed" && obj.mode === "payment" && obj.payment_status === "paid") {
      const requestCode = typeof obj.metadata?.request_code === "string" ? obj.metadata.request_code.trim() : "";
      const userId = typeof obj.metadata?.supabase_user_id === "string" ? obj.metadata.supabase_user_id.trim() : "";
      if (!requestCode || !userId) return json({ error: "Service checkout is missing request metadata." }, 400);
      const url = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !key) throw new Error("Supabase webhook configuration missing");
      const r = await fetch(url + "/rest/v1/customer_requests?request_code=eq." + encodeURIComponent(requestCode) + "&user_id=eq." + encodeURIComponent(userId), {
        method: "PATCH",
        headers: {
          apikey: key,
          authorization: "Bearer " + key,
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({
          payment_status: "paid",
          paid_at: new Date().toISOString(),
        }),
      });
      if (!r.ok) throw new Error("Supabase service payment update failed");
      const rows = await r.json();
      if (!rows.length) throw new Error("Paid service request was not found; retry webhook after request sync");
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = obj;
      const userId = sub.metadata?.supabase_user_id;
      if (!userId && !sub.id) return json({ received: true });
      const query = "stripe_subscription_id=eq." + encodeURIComponent(sub.id);
      const payload = {
        ...(userId ? { user_id: userId } : {}),
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
        stripe_subscription_id: sub.id,
        price_id: sub.items?.data?.[0]?.price?.id || null,
        status: sub.status || (event.type.endsWith(".deleted") ? "canceled" : "unknown"),
        current_period_end: isoUnix(sub.current_period_end),
        cancel_at_period_end: !!sub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      };
      const r = await supabaseRequest("subscriptions?on_conflict=stripe_subscription_id", "POST", payload);
      if (!r.ok) {
        // Existing subscription events may arrive before checkout completion; report failure for Stripe retry.
        throw new Error("Supabase subscription upsert failed");
      }
    } else if (event.type === "invoice.payment_failed") {
      const customer = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      if (customer) {
        const r = await supabaseRequest("subscriptions?stripe_customer_id=eq." + encodeURIComponent(customer), "PATCH", {
          status: "past_due", updated_at: new Date().toISOString(),
        });
        if (!r.ok) throw new Error("Failed to mark subscription past due");
      }
    }
    return json({ received: true });
  } catch (e) {
    console.error("Stripe webhook processing failed:", e?.message || "unknown");
    return json({ error: "Webhook processing failed; Stripe may retry." }, 500);
  }
};