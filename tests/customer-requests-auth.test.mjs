import test from "node:test";
import assert from "node:assert/strict";
import createRequest from "../netlify/functions/create-request.mjs";
import listRequests from "../netlify/functions/list-requests.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const base = "https://supabase.example";
function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function setup(userResponse) {
  Object.assign(process.env, {
    SUPABASE_URL: base,
    SUPABASE_ANON_KEY: "public-test-key",
    SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
  });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === base + "/auth/v1/user") return userResponse;
    throw new Error("Unexpected provider request before identity validation: " + String(url));
  };
  return calls;
}
function req(path, method, body) {
  return new Request("https://torqwise.example/.netlify/functions/" + path, {
    method,
    headers: { authorization: "Bearer test-token", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
});

test("create-request refuses an auth response without a verified user ID", async () => {
  const calls = setup(response({ email: "no-id@example.com" }));
  const result = await createRequest(req("create-request", "POST", {
    service: "parts", vehicle: "2018 pickup", details: "Find front brake pads",
  }));
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { error: "Your session could not be verified. Please sign in again." });
  assert.equal(calls.length, 1);
});

test("list-requests refuses an auth response without a verified user ID", async () => {
  const calls = setup(response({ email: "no-id@example.com" }));
  const result = await listRequests(req("list-requests", "GET"));
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { error: "Your session could not be verified. Please sign in again." });
  assert.equal(calls.length, 1);
});

test("create-request rejects malformed auth JSON without writing a request", async () => {
  const calls = setup(new Response("not-json", { status: 200 }));
  const result = await createRequest(req("create-request", "POST", {
    service: "parts", vehicle: "2018 pickup", details: "Find front brake pads",
  }));
  assert.equal(result.status, 401);
  assert.equal(calls.length, 1);
});

test("list-requests rejects malformed auth JSON without querying request history", async () => {
  const calls = setup(new Response("not-json", { status: 200 }));
  const result = await listRequests(req("list-requests", "GET"));
  assert.equal(result.status, 401);
  assert.equal(calls.length, 1);
});
