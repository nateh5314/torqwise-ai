import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import handler from "../netlify/functions/stripe-webhook.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const secret = "whsec_test_placeholder";
const base = "https://supabase.example";
const requestCode = "TQ-1234567-ABCD";
const sessionId = "cs_test_123";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
}
function signedRequest(event, valid = true) {
  const raw = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(timestamp + "." + raw).digest("hex");
  return new Request("https://torqwise.example/.netlify/functions/stripe-webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=" + timestamp + ",v1=" + (valid ? signature : "0".repeat(64)) },
    body: raw,
  });
}
function paymentEvent({ amount = 1500, currency = "cad" } = {}) {
  return {
    id: "evt_test_123",
    type: "checkout.session.completed",
    data: { object: {
      id: sessionId,
      mode: "payment",
      payment_status: "paid",
      amount_total: amount,
      currency,
      metadata: { request_code: requestCode, supabase_user_id: "user-123" },
    } },
  };
}
function configure({ matching = true } = {}) {
  Object.assign(process.env, {
    STRIPE_WEBHOOK_SECRET: secret,
    SUPABASE_URL: base,
    SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
  });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, options });
    if (target.includes("/rest/v1/customer_requests?") && (!options.method || options.method === "GET")) {
      const sessionMatches = target.includes("stripe_checkout_session_id=eq." + encodeURIComponent(sessionId));
      return response(matching && sessionMatches ? [{
        request_code: requestCode,
        quoted_price: 15,
        payment_status: "pending",
        stripe_checkout_session_id: sessionId,
      }] : []);
    }
    if (target.includes("/rest/v1/customer_requests?") && options.method === "PATCH") {
      return response([{ request_code: requestCode, payment_status: "paid" }]);
    }
    throw new Error("Unexpected fetch: " + target);
  };
  return calls;
}
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
});

test("rejects an invalid Stripe signature before touching storage", async () => {
  const calls = configure();
  const result = await handler(signedRequest(paymentEvent(), false));
  assert.equal(result.status, 400);
  assert.equal(calls.length, 0);
});

test("marks only the matching request and exact CAD amount as paid", async () => {
  const calls = configure();
  const result = await handler(signedRequest(paymentEvent()));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { received: true });
  const lookup = calls.find(c => !c.options.method);
  assert.match(lookup.url, /request_code=eq.TQ-1234567-ABCD/);
  assert.match(lookup.url, /user_id=eq.user-123/);
  assert.match(lookup.url, /stripe_checkout_session_id=eq.cs_test_123/);
  const patch = calls.find(c => c.options.method === "PATCH");
  assert.deepEqual(JSON.parse(patch.options.body).payment_status, "paid");
  assert.deepEqual(JSON.parse(patch.options.body).status, "In progress");
  assert.ok(JSON.parse(patch.options.body).paid_at);
});

test("does not mark a request paid when the amount or currency differs", async () => {
  const calls = configure();
  const amount = await handler(signedRequest(paymentEvent({ amount: 100 })));
  assert.equal(amount.status, 400);
  assert.equal(calls.some(c => c.options.method === "PATCH"), false);
  const currency = await handler(signedRequest(paymentEvent({ currency: "usd" })));
  assert.equal(currency.status, 400);
  assert.equal(calls.some(c => c.options.method === "PATCH"), false);
});

test("ignores a signed event that does not match a stored checkout session", async () => {
  const calls = configure({ matching: false });
  const result = await handler(signedRequest(paymentEvent()));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { received: true, ignored: true });
  assert.equal(calls.some(c => c.options.method === "PATCH"), false);
});

test("does not mark a request paid when the event belongs to a different checkout session", async () => {
  const calls = configure();
  const event = paymentEvent();
  event.data.object.id = "cs_someone_else";
  const result = await handler(signedRequest(event));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { received: true, ignored: true });
  assert.equal(calls.some(c => c.options.method === "PATCH"), false);
});
