import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/admin-requests.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const base = "https://supabase.example";

function restoreEnv() {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
}
function configure() {
  Object.assign(process.env, {
    SUPABASE_URL: base,
    SUPABASE_ANON_KEY: "public-test-key",
    SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
    TORQWISE_ADMIN_USER_IDS: "admin-user",
  });
}
function req({ method = "GET", token = "valid-token", body } = {}) {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request("https://torqwise.example/.netlify/functions/admin-requests", {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
}
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv();
});

test("rejects unsupported methods before accessing Supabase", async () => {
  configure();
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected fetch"); };
  const response = await handler(req({ method: "POST" }));
  assert.equal(response.status, 405);
  assert.equal(calls, 0);
});

test("requires a bearer token before reading any customer data", async () => {
  configure();
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected fetch"); };
  const response = await handler(req({ token: "" }));
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("rejects authenticated users who are not on the server-side admin allowlist", async () => {
  configure();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === base + "/auth/v1/user") return new Response(JSON.stringify({ id: "ordinary-user" }), { status: 200 });
    throw new Error("Customer data must not be requested for a non-admin");
  };
  const response = await handler(req());
  assert.equal(response.status, 403);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, base + "/auth/v1/user");
});

test("returns request data only after the server verifies the configured admin ID", async () => {
  configure();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === base + "/auth/v1/user") return new Response(JSON.stringify({ id: "admin-user" }), { status: 200 });
    if (String(url).includes("/rest/v1/customer_requests?")) return new Response(JSON.stringify([{ request_code: "TQ-TEST", status: "Request received" }]), { status: 200 });
    throw new Error("Unexpected fetch: " + url);
  };
  const response = await handler(req());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { requests: [{ request_code: "TQ-TEST", status: "Request received" }] });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.authorization, "Bearer server-test-key");
});

test("validates workflow statuses before updating a request", async () => {
  configure();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === base + "/auth/v1/user") return new Response(JSON.stringify({ id: "admin-user" }), { status: 200 });
    throw new Error("Invalid status must not update the database");
  };
  const response = await handler(req({ method: "PATCH", body: { request_code: "TQ-TEST", status: "make-admin" } }));
  assert.equal(response.status, 400);
  assert.equal(calls.length, 1);
});
