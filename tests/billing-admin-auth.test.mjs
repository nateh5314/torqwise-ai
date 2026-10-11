import test from "node:test";
import assert from "node:assert/strict";
import createPortal from "../netlify/functions/create-portal.mjs";
import billingStatus from "../netlify/functions/billing-status.mjs";
import adminRequests from "../netlify/functions/admin-requests.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const base = "https://supabase.example";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function setup(authResponse) {
  Object.assign(process.env, {
    SUPABASE_URL: base,
    SUPABASE_ANON_KEY: "public-test-key",
    SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_PRO_PRICE_ID: "price_pro_monthly",
    SITE_URL: "https://torqwise.example",
    TORQWISE_ADMIN_USER_IDS: "admin-123",
  });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === base + "/auth/v1/user") return authResponse;
    throw new Error("Unexpected downstream request before identity validation: " + String(url));
  };
  return calls;
}
function request(path, method = "GET") {
  return new Request("https://torqwise.example/.netlify/functions/" + path, {
    method,
    headers: { authorization: "Bearer test-token" },
  });
}
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
});

test("billing status rejects an auth response without a user ID", async () => {
  const calls = setup(response({ email: "missing-id@example.com" }));
  const result = await billingStatus(request("billing-status"));
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { error: "Your session could not be verified." });
  assert.equal(calls.length, 1);
});

test("billing portal rejects malformed auth JSON", async () => {
  const calls = setup(new Response("not-json", { status: 200 }));
  const result = await createPortal(request("create-portal", "POST"));
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { error: "Your session could not be verified. Sign in again." });
  assert.equal(calls.length, 1);
});

test("operator endpoint rejects a missing user ID before checking admin access", async () => {
  const calls = setup(response({ email: "no-id@example.com" }));
  const result = await adminRequests(request("admin-requests"));
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { error: "Your session could not be verified." });
  assert.equal(calls.length, 1);
});

test("operator endpoint rejects malformed auth JSON without reading requests", async () => {
  const calls = setup(new Response("not-json", { status: 200 }));
  const result = await adminRequests(request("admin-requests"));
  assert.equal(result.status, 401);
  assert.equal(calls.length, 1);
});
