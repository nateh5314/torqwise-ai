import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/create-portal.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const base = "https://supabase.example";
const userId = "user-123";
function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function configure({ subscriptions = response([]), stripe = response({ url: "https://billing.stripe.example/session" }), auth = response({ id: userId }) } = {}) {
  Object.assign(process.env, {
    SUPABASE_URL: base, SUPABASE_ANON_KEY: "public-test-key", SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
    STRIPE_SECRET_KEY: "sk_test_placeholder", STRIPE_PRO_PRICE_ID: "price_pro_monthly", SITE_URL: "https://torqwise.example",
  });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, options });
    if (target === base + "/auth/v1/user") return auth;
    if (target.includes("/rest/v1/subscriptions?")) return subscriptions;
    if (target === "https://api.stripe.com/v1/billing_portal/sessions") return stripe;
    throw new Error("Unexpected fetch: " + target);
  };
  return calls;
}
function request(method = "POST", token = "valid-token") {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  return new Request("https://torqwise.example/.netlify/functions/create-portal", { method, headers });
}
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
});

test("rejects unsupported methods and unauthenticated requests before provider calls", async () => {
  const calls = configure();
  assert.equal((await handler(request("GET"))).status, 405);
  assert.equal((await handler(request("POST", ""))).status, 401);
  assert.equal(calls.length, 0);
});

test("does not open a billing portal for an account without a Pro subscription", async () => {
  const calls = configure({ subscriptions: response([{ stripe_customer_id: "cus_driver", price_id: "price_driver_monthly", status: "active" }]) });
  const result = await handler(request());
  assert.equal(result.status, 404);
  assert.match((await result.json()).error, /No Pro subscription/i);
  assert.ok(!calls.some(c => c.url === "https://api.stripe.com/v1/billing_portal/sessions"));
});

test("opens billing portal for the configured Pro price even when a different plan is more recently updated", async () => {
  const calls = configure({ subscriptions: response([
    { stripe_customer_id: "cus_driver", price_id: "price_driver_monthly", status: "active" },
    { stripe_customer_id: "cus_pro", price_id: "price_pro_monthly", status: "active" },
  ]) });
  const result = await handler(request());
  assert.equal(result.status, 200);
  assert.equal((await result.json()).url, "https://billing.stripe.example/session");
  const stripe = calls.find(c => c.url === "https://api.stripe.com/v1/billing_portal/sessions");
  assert.equal(new URLSearchParams(stripe.options.body).get("customer"), "cus_pro");
  assert.equal(new URLSearchParams(stripe.options.body).get("return_url"), "https://torqwise.example/#account");
});

test("fails closed when the subscription lookup fails", async () => {
  const calls = configure({ subscriptions: response({ error: "unavailable" }, 503) });
  const result = await handler(request());
  assert.equal(result.status, 503);
  assert.ok(!calls.some(c => c.url === "https://api.stripe.com/v1/billing_portal/sessions"));
});
