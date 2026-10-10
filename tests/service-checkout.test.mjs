import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/create-service-checkout.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const base = "https://supabase.example";
const userId = "user-123";
const requestCode = "TQ-1234567-ABCD";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function configure({ authResponse = response({ id: userId, email: "mechanic@example.com" }), requestRow = {
  request_code: requestCode,
  user_id: userId,
  service: "parts",
  label: "Parts Research",
  quoted_price: 15,
  payment_status: "unpaid",
  status: "Awaiting customer",
  stripe_checkout_session_id: null,
}, stripeSession = { id: "cs_test_1", url: "https://checkout.stripe.example/session" } } = {}) {
  Object.assign(process.env, {
    SUPABASE_URL: base,
    SUPABASE_ANON_KEY: "public-test-key",
    SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    SITE_URL: "https://torqwise.example",
  });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, options });
    if (target === base + "/auth/v1/user") return authResponse;
    if (target.includes("/rest/v1/customer_requests?") && (!options.method || options.method === "GET")) {
      return response(requestRow ? [requestRow] : []);
    }
    if (target.includes("/rest/v1/customer_requests?") && options.method === "PATCH") {
      return response([]);
    }
    if (target.includes("/v1/checkout/sessions/cs_old")) {
      return response({ id: "cs_old", status: "open", url: "https://checkout.stripe.example/old" });
    }
    if (target === "https://api.stripe.com/v1/checkout/sessions" && options.method === "POST") {
      return response(stripeSession, 200);
    }
    throw new Error("Unexpected fetch: " + target);
  };
  return calls;
}
function request(method = "POST", body, token = "valid-token") {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request("https://torqwise.example/.netlify/functions/create-service-checkout", {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
}
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
});

test("rejects unsupported methods and unauthenticated requests", async () => {
  const calls = configure();
  assert.equal((await handler(request("GET"))).status, 405);
  assert.equal((await handler(request("POST", { requestCode }, ""))).status, 401);
  assert.equal(calls.length, 0);
});

test("rejects a successful auth response without a user ID before querying requests", async () => {
  const calls = configure({ authResponse: response({ email: "missing-id@example.com" }) });
  const result = await handler(request("POST", { requestCode }));
  assert.equal(result.status, 401);
  assert.equal((await result.json()).error, "Your session is invalid or expired. Sign in again.");
  assert.equal(calls.filter(c => c.url.includes("/rest/v1/customer_requests?")).length, 0);
  assert.equal(calls.filter(c => c.url.includes("/v1/checkout/sessions")).length, 0);
});

test("requires a valid request code", async () => {
  const calls = configure();
  const result = await handler(request("POST", { requestCode: "../another-user" }));
  assert.equal(result.status, 400);
  assert.equal(calls.length, 0);
});

test("uses the server-side CAD price and scopes lookup to the signed-in user", async () => {
  const calls = configure();
  const result = await handler(request("POST", { requestCode, amount: 1, currency: "usd" }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).url, "https://checkout.stripe.example/session");
  const lookup = calls.find(c => c.url.includes("/rest/v1/customer_requests?") && !c.options.method);
  assert.match(lookup.url, /user_id=eq\.user-123/);
  const stripe = calls.find(c => c.url === "https://api.stripe.com/v1/checkout/sessions" && c.options.method === "POST");
  const form = new URLSearchParams(stripe.options.body);
  assert.equal(form.get("mode"), "payment");
  assert.equal(form.get("line_items[0][price_data][currency]"), "cad");
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), "1500");
  assert.equal(form.get("metadata[request_code]"), requestCode);
  assert.ok(calls.some(c => c.options.method === "PATCH" && c.url.includes("customer_requests")));
});

test("blocks quote-first, paid, and inconsistent-price requests", async () => {
  configure({ requestRow: { request_code: requestCode, user_id: userId, service: "business", quoted_price: null, payment_status: "unpaid", status: "Awaiting customer" } });
  assert.equal((await handler(request("POST", { requestCode }))).status, 409);
  configure({ requestRow: { request_code: requestCode, user_id: userId, service: "parts", quoted_price: 15, payment_status: "paid", status: "Awaiting customer" } });
  assert.equal((await handler(request("POST", { requestCode }))).status, 409);
  configure({ requestRow: { request_code: requestCode, user_id: userId, service: "parts", quoted_price: 25, payment_status: "unpaid", status: "Awaiting customer" } });
  assert.equal((await handler(request("POST", { requestCode }))).status, 409);
});

test("reuses an existing open Stripe checkout session", async () => {
  const calls = configure({ requestRow: { request_code: requestCode, user_id: userId, service: "parts", quoted_price: 15, payment_status: "pending", status: "Awaiting customer", stripe_checkout_session_id: "cs_old" } });
  const result = await handler(request("POST", { requestCode }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { url: "https://checkout.stripe.example/old", reused: true });
  assert.equal(calls.some(c => c.url === "https://api.stripe.com/v1/checkout/sessions" && c.options.method === "POST"), false);
});

test("requires operator review before collecting payment", async () => {
  configure({ requestRow: {
    request_code: requestCode, user_id: userId, service: "parts", quoted_price: 15,
    payment_status: "unpaid", status: "Request received", stripe_checkout_session_id: null,
  } });
  const result = await handler(request("POST", { requestCode }));
  assert.equal(result.status, 409);
  assert.match((await result.json()).error, /reviewed and marked ready for payment/i);
});
