import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import handler from "../netlify/functions/stripe-webhook.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const base = "https://supabase.example";
const secret = "whsec_test_secret";

function response(body, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function configure() {
  Object.assign(process.env, {
    SUPABASE_URL: base,
    SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_WEBHOOK_SECRET: secret,
  });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith(base + "/rest/v1/subscriptions?")) return response(null, 204);
    throw new Error("Unexpected fetch: " + String(url));
  };
  return calls;
}

function signedRequest(event, { valid = true, method = "POST" } = {}) {
  const raw = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(timestamp + "." + raw).digest("hex");
  return new Request("https://torqwise.example/.netlify/functions/stripe-webhook", {
    method,
    headers: { "stripe-signature": "t=" + timestamp + ",v1=" + (valid ? signature : "0".repeat(64)) },
    body: method === "POST" ? raw : undefined,
  });
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
});

test("rejects unsigned or invalid-signature webhook requests before database writes", async () => {
  const calls = configure();
  const result = await handler(signedRequest({ type: "customer.subscription.updated", data: { object: { id: "sub_1" } } }, { valid: false }));
  assert.equal(result.status, 400);
  assert.equal(calls.length, 0);
});

test("subscription update persists Pro price, status, period end, and cancellation state", async () => {
  const calls = configure();
  const event = {
    type: "customer.subscription.updated",
    data: { object: {
      id: "sub_pro_1",
      customer: "cus_1",
      status: "active",
      current_period_end: 1791763200,
      cancel_at_period_end: true,
      metadata: { supabase_user_id: "user-123" },
      items: { data: [{ price: { id: "price_pro_monthly" } }] },
    } },
  };
  const result = await handler(signedRequest(event));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { received: true });
  const write = calls[0];
  assert.match(write.url, /subscriptions\?on_conflict=stripe_subscription_id/);
  assert.equal(write.options.method, "POST");
  const payload = JSON.parse(write.options.body);
  assert.equal(payload.user_id, "user-123");
  assert.equal(payload.stripe_subscription_id, "sub_pro_1");
  assert.equal(payload.price_id, "price_pro_monthly");
  assert.equal(payload.status, "active");
  assert.equal(payload.cancel_at_period_end, true);
  assert.equal(payload.current_period_end, new Date(1791763200 * 1000).toISOString());
});

test("failed invoice marks the customer's subscription past due", async () => {
  const calls = configure();
  const result = await handler(signedRequest({
    type: "invoice.payment_failed",
    data: { object: { customer: "cus_1" } },
  }));
  assert.equal(result.status, 200);
  assert.match(calls[0].url, /subscriptions\?stripe_customer_id=eq\.cus_1/);
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(JSON.parse(calls[0].options.body).status, "past_due");
});
