import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/research.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const base = "https://supabase.example";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function configure({ userResponse = response({ id: "user-123" }), reservation = response({ allowed: true, remaining: 2, usage_id: 101 }), openaiResponse = response({ output: [{ type: "message", content: [{ type: "output_text", text: "Test research answer", annotations: [] }] }, { type: "web_search_call", action: { sources: [{ url: "https://example.com/source", title: "Example source" }] } }], model: "gpt-5-mini", usage: { input_tokens: 100, output_tokens: 40 } }) } = {}) {
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
    if (String(url) === base + "/rest/v1/subscriptions?user_id=eq.user-123&select=status&order=updated_at.desc&limit=1") return response([]);
    if (String(url) === base + "/rest/v1/rpc/reserve_research_usage") return reservation;
    if (String(url) === base + "/rest/v1/rpc/release_research_usage") return response(true);
    if (String(url).startsWith(base + "/rest/v1/research_usage?id=eq.101&user_id=eq.user-123") && options.method === "PATCH") return response({});
    if (String(url) === "https://api.openai.com/v1/responses") return openaiResponse;
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


test("requires atomic quota reservation before calling the AI provider", async () => {
  const calls = configure();
  process.env.TORQWISE_OPENAI_INPUT_USD_PER_MILLION = "0.15";
  process.env.TORQWISE_OPENAI_OUTPUT_USD_PER_MILLION = "0.60";
  const result = await handler(request());
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.remaining, 2);
  assert.equal(data.answer, "Test research answer");
  assert.ok(calls.some(c => c.url === base + "/rest/v1/rpc/reserve_research_usage"));
  assert.ok(calls.some(c => c.url === "https://api.openai.com/v1/responses"));
  const usageUpdate = calls.find(c => c.url.includes("/rest/v1/research_usage?id=eq.101") && c.options.method === "PATCH");
  assert.ok(usageUpdate);
  assert.equal(JSON.parse(usageUpdate.options.body).input_tokens, 100);
  assert.equal(JSON.parse(usageUpdate.options.body).estimated_cost_usd, 0.000039);
});

test("blocks exhausted monthly allowance without calling the AI provider", async () => {
  const calls = configure({ reservation: response({ allowed: false, remaining: 0 }) });
  const result = await handler(request());
  assert.equal(result.status, 402);
  assert.match((await result.json()).error, /3 free AI research reports this month/);
  assert.ok(!calls.some(c => c.url === "https://api.openai.com/v1/responses"));
});

test("releases the reserved report when the AI provider fails", async () => {
  const calls = configure({ openaiResponse: response({ error: { code: "rate_limit_exceeded" } }, 429) });
  const result = await handler(request());
  assert.equal(result.status, 429);
  assert.ok(calls.some(c => c.url === base + "/rest/v1/rpc/release_research_usage"));
});
