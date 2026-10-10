import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/research.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const base = "https://supabase.example";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function configure({ userResponse = response({ id: "user-123" }) } = {}) {
  Object.assign(process.env, {
    SUPABASE_URL: base,
    SUPABASE_ANON_KEY: "public-test-key",
    SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
    OPENAI_API_KEY: "test-placeholder",
  });
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === base + "/auth/v1/user") return userResponse;
    throw new Error("Unexpected fetch: " + String(url));
  };
  return calls;
}
function request({ token = "valid-token", body = { asset: "2018 pickup", question: "P0300" }, method = "POST" } = {}) {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== null && body !== undefined) headers["content-type"] = "application/json";
  return new Request("https://torqwise.example/.netlify/functions/research", {
    method, headers, body: body === null || body === undefined ? undefined : JSON.stringify(body),
  });
}
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
});

test("rejects unsupported methods before calling providers", async () => {
  const calls = configure();
  const result = await handler(request({ method: "GET", body: null }));
  assert.equal(result.status, 405);
  assert.equal(calls.length, 0);
});

test("requires a bearer token before looking up an account", async () => {
  const calls = configure();
  const result = await handler(request({ token: "" }));
  assert.equal(result.status, 401);
  assert.equal(calls.length, 0);
});

test("rejects a successful auth response without a verified user ID", async () => {
  const calls = configure({ userResponse: response({ email: "no-id@example.com" }) });
  const result = await handler(request());
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), {
    error: "Your session could not be verified. Please sign in again.",
    remaining: null,
  });
  assert.equal(calls.length, 1);
});

test("rejects unreadable auth JSON instead of continuing with an invalid identity", async () => {
  const calls = configure({ userResponse: new Response("not-json", { status: 200 }) });
  const result = await handler(request());
  assert.equal(result.status, 401);
  assert.equal(calls.length, 1);
});
