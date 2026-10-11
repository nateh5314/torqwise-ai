import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/create-checkout.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const base = "https://supabase.example";
const userId = "user-123";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function configure({ auth = response({ id: userId, email: "mechanic@example.com" }), subscriptions = response([]), stripe = response({ url: "https://checkout.stripe.example/session" }) } = {}) {
  Object.assign(process.env, {
    SUPABASE_URL: base,
    SUPABASE_ANON_KEY: "public-test-key",
    SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_PRO_PRICE_ID: "price_pro_monthly",
    SITE_URL: "https://torqwise.example",
  });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, options });
    if (target === base + "/auth/v1/user") return auth;
    if (target.includes("/rest/v1/subscriptions?")) return subscriptions;
    if (target === "https://api.stripe.com/v1/checkout/sessions" && options.method === "POST") return stripe;
    throw new Error("Unexpected fetch: " + target);
  };
  return calls;
}

function request(method = "POST", token = "valid-token") {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  return new Request("https://torqwise.example/.netlify/functions/create-checkout", { method, headers });
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

test("fails closed when active subscription lookup finds existing Pro subscription", async () => {
  const calls = configure({ subscriptions: response([{ stripe_subscription_id: "sub_existing" }]) });
  const result = await handler(request());
  assert.equal(result.status, 409);
  assert.match((await result.json()).error, /already active/i);
  assert.ok(!calls.some(c => c.url === "https://api.stripe.com/v1/checkout/sessions"));
});

test("fails closed when subscription lookup is unavailable", async () => {
  const calls = configure({ subscriptions: response({ message: "database unavailable" }, 503) });
  const result = await handler(request());
  assert.equal(result.status, 503);
  assert.ok(!calls.some(c => c.url === "https://api.stripe.com/v1/checkout/sessions"));
});

test("creates Pro checkout with server-configured price and account metadata", async () => {
  const calls = configure();
  const result = await handler(request());
  assert.equal(result.status, 200);
  assert.equal((await result.json()).url, "https://checkout.stripe.example/session");
  const lookup = calls.find(c => c.url.includes("/rest/v1/subscriptions?"));
  assert.match(lookup.url, /user_id=eq\.user-123/);
  assert.match(lookup.url, /price_id=eq\.price_pro_monthly/);
  const stripe = calls.find(c => c.url === "https://api.stripe.com/v1/checkout/sessions");
  const form = new URLSearchParams(stripe.options.body);
  assert.equal(form.get("mode"), "subscription");
  assert.equal(form.get("line_items[0][price]"), "price_pro_monthly");
  assert.equal(form.get("line_items[0][quantity]"), "1");
  assert.equal(form.get("client_reference_id"), userId);
  assert.equal(form.get("metadata[supabase_user_id]"), userId);
  assert.equal(form.get("subscription_data[metadata][supabase_user_id]"), userId);
});


test("fails closed when subscription lookup returns a non-array JSON body", async () => {
  const calls = configure({ subscriptions: response({ unexpected: true }) });
  const result = await handler(request());
  assert.equal(result.status, 503);
  assert.match((await result.json()).error, /could not verify your current subscription/i);
  assert.ok(!calls.some(c => c.url === "https://api.stripe.com/v1/checkout/sessions"));
});
