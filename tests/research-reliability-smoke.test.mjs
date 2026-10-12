import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/research.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const base = "https://supabase.example";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function setup({ provider = jsonResponse({
  output: [{ type: "message", content: [{ type: "output_text", text: "P0300 is a random/multiple-cylinder misfire code. Capture freeze-frame and misfire counters before replacing parts." }] }],
  model: "gpt-5-mini",
}), release = jsonResponse(true), reservation = jsonResponse({ allowed: true, remaining: 2, usage_id: 41 }) } = {}) {
  Object.assign(process.env, {
    SUPABASE_URL: base,
    SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    OPENAI_API_KEY: "test-openai-key",
  });
  delete process.env.STRIPE_PRICE_PRO;
  delete process.env.STRIPE_PRO_PRICE_ID;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const address = String(url);
    calls.push({ url: address, options });
    if (address === base + "/auth/v1/user") return jsonResponse({ id: "smoke-user" });
    if (address === base + "/rest/v1/subscriptions?user_id=eq.smoke-user&select=status,price_id&order=updated_at.desc&limit=10") return jsonResponse([]);
    if (address === base + "/rest/v1/rpc/reserve_research_usage") return reservation;
    if (address === base + "/rest/v1/rpc/release_research_usage") return release;
    if (address === "https://api.openai.com/v1/responses") return provider;
    if (address.includes("/rest/v1/fitment_applications?")) return jsonResponse([]);
    throw new Error("Unexpected outbound request: " + address);
  };
  return calls;
}

function request(body = { asset: "2018 pickup", question: "What should I check for P0300?" }) {
  return new Request("https://torqwise.example/.netlify/functions/research", {
    method: "POST",
    headers: { authorization: "Bearer test-session", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
});

test("research smoke test returns a non-empty answer and JSON response", async () => {
  const calls = setup();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/json/i);
  const result = await response.json();
  assert.match(result.answer, /P0300/);
  assert.ok(result.answer.trim().length > 20);
  assert.equal(result.remaining, 2);
  assert.ok(calls.some(call => call.url === "https://api.openai.com/v1/responses"));
});

test("rejects an empty question before any account or provider calls", async () => {
  const calls = setup();
  const response = await handler(request({ asset: "", question: "  " }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /vehicle\/equipment name or a question/i);
  assert.equal(calls.length, 0);
});

test("releases the reserved free report when the AI provider returns an error", async () => {
  const calls = setup({ provider: jsonResponse({ error: { code: "rate_limit_exceeded" } }, 429) });
  const response = await handler(request());
  assert.equal(response.status, 429);
  assert.ok(calls.some(call => call.url === base + "/rest/v1/rpc/release_research_usage"));
  const result = await response.json();
  assert.doesNotMatch(JSON.stringify(result), /test-openai-key|test-service-key/);
});

test("returns a safe error and releases quota when the provider response is unreadable", async () => {
  const calls = setup({ provider: new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } }) });
  const response = await handler(request());
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /unreadable response/i);
  assert.ok(calls.some(call => call.url === base + "/rest/v1/rpc/release_research_usage"));
});
