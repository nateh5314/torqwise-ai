import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/research.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const base = "https://supabase.example";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function configure({ userResponse = response({ id: "user-123" }), reservation = response({ allowed: true, remaining: 2, usage_id: 101 }), subscriptions = response([]), fitmentResponse = response([]), proPriceId = "", openaiResponse = response({ output: [{ type: "message", content: [{ type: "output_text", text: "Test research answer", annotations: [] }] }, { type: "web_search_call", action: { sources: [{ url: "https://example.com/source", title: "Example source" }] } }], model: "gpt-5-mini" }) } = {}) {
  Object.assign(process.env, {
    SUPABASE_URL: base,
    SUPABASE_ANON_KEY: "public-test-key",
    SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
    OPENAI_API_KEY: "test-placeholder",
  });
  delete process.env.STRIPE_PRO_PRICE_ID;
  delete process.env.STRIPE_PRICE_PRO;
  if (proPriceId) process.env.STRIPE_PRO_PRICE_ID = proPriceId;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === base + "/auth/v1/user") return userResponse;
    if (String(url) === base + "/rest/v1/subscriptions?user_id=eq.user-123&select=status,price_id&order=updated_at.desc&limit=10") return subscriptions;
    if (String(url).includes("/rest/v1/fitment_applications?")) return fitmentResponse;
    if (String(url) === base + "/rest/v1/rpc/reserve_research_usage") return reservation;
    if (String(url) === base + "/rest/v1/rpc/release_research_usage") return response(true);
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

test("configured active Pro subscription bypasses free research quota", async () => {
  const calls = configure({
    proPriceId: "price_pro_monthly",
    subscriptions: response([{ status: "active", price_id: "price_pro_monthly" }]),
  });
  const result = await handler(request());
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.isPro, true);
  assert.equal(data.remaining, null);
  assert.ok(!calls.some(c => c.url === base + "/rest/v1/rpc/reserve_research_usage"));
  assert.ok(calls.some(c => c.url === "https://api.openai.com/v1/responses"));
});

test("does not consume free quota when subscription lookup has a server error", async () => {
  const calls = configure({ subscriptions: response({ error: "temporary database failure" }, 500) });
  const result = await handler(request());
  assert.equal(result.status, 503);
  assert.match((await result.json()).error, /could not verify your subscription/i);
  assert.ok(!calls.some(c => c.url === base + "/rest/v1/rpc/reserve_research_usage"));
  assert.ok(!calls.some(c => c.url === "https://api.openai.com/v1/responses"));
});

test("active subscription for another price does not grant Pro research access", async () => {
  const calls = configure({
    proPriceId: "price_pro_monthly",
    subscriptions: response([{ status: "active", price_id: "price_driver_monthly" }]),
  });
  const result = await handler(request());
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.isPro, false);
  assert.equal(data.remaining, 2);
  assert.ok(calls.some(c => c.url === base + "/rest/v1/rpc/reserve_research_usage"));
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
  const result = await handler(request());
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.remaining, 2);
  assert.equal(data.answer, "Test research answer");
  assert.ok(calls.some(c => c.url === base + "/rest/v1/rpc/reserve_research_usage"));
  assert.ok(calls.some(c => c.url === "https://api.openai.com/v1/responses"));
  assert.ok(!calls.some(c => c.url.includes("/rest/v1/research_usage?")));
});

test("passes structured diagnostic evidence into the AI research request", async () => {
  const calls = configure();
  const result = await handler(request({ body: {
    asset: "2018 Ford F-150 5.0L",
    question: "Diagnose intermittent misfire",
    symptoms: "Shakes at warm idle",
    dtcs: "P0302 current; P0300 pending",
    freezeFrame: "720 rpm, coolant 94 C",
    liveData: "STFT bank 1 +18%, bank 2 +2%",
    testsPerformed: "Swapped coil 2 with coil 3; misfire stayed on cylinder 2",
    repairsAttempted: "None"
  }}));
  assert.equal(result.status, 200);
  const aiCall = calls.find(c => c.url === "https://api.openai.com/v1/responses");
  assert.ok(aiCall, "AI provider should be called");
  const payload = JSON.parse(aiCall.options.body);
  for (const detail of [
    "Technician-observed symptoms: Shakes at warm idle",
    "Diagnostic trouble codes (preserve exact codes and status): P0302 current; P0300 pending",
    "Freeze-frame / snapshot data: 720 rpm, coolant 94 C",
    "Scan-tool live data and units: STFT bank 1 +18%, bank 2 +2%",
    "Tests already performed and measured results: Swapped coil 2 with coil 3; misfire stayed on cylinder 2",
    "Repairs or parts already tried: None"
  ]) assert.ok(payload.input.includes(detail), "Missing structured diagnostic detail: " + detail);
});

test("passes detected DTC tokens as a group without inventing code status", async () => {
  const calls = configure();
  const result = await handler(request({ body: {
    asset: "2018 Ford F-150 5.0L",
    question: "Intermittent misfire with P0302 and P0171",
    dtcs: "P0302 current; P0171 pending"
  }}));
  assert.equal(result.status, 200);
  const aiCall = calls.find(c => c.url === "https://api.openai.com/v1/responses");
  const payload = JSON.parse(aiCall.options.body);
  assert.ok(payload.input.includes("P0302, P0171"));
  assert.ok(payload.input.includes("status not inferred"));
  assert.ok(payload.input.includes("Analyze relationships across codes"));
});

test("adds a cautious safety instruction when severe brake symptoms are reported", async () => {
  const calls = configure();
  const result = await handler(request({ body: {
    asset: "2018 pickup",
    question: "Brake pedal goes to floor and brake fluid is leaking"
  }}));
  assert.equal(result.status, 200);
  const aiCall = calls.find(c => c.url === "https://api.openai.com/v1/responses");
  const payload = JSON.parse(aiCall.options.body);
  assert.ok(payload.input.includes("Potential safety-critical language detected"));
  assert.ok(payload.input.includes("stop operation if continued use could cause harm"));
  assert.ok(payload.input.includes("braking"));
});

test("follow-up research carries new test results and prior report without reserving another report", async () => {
  const calls = configure();
  const result = await handler(request({ body: {
    asset: "2018 Ford F-150 5.0L",
    question: "The misfire stayed on cylinder 2 after swapping coils. What next?",
    followUp: true,
    previousAnswer: "Hypothesis: ignition coil failure; not yet confirmed.",
    symptoms: "Rough warm idle",
    dtcs: "P0302 current",
    testsPerformed: "Swapped cylinder 2 and 3 coils; misfire stayed on cylinder 2"
  }}));
  assert.equal(result.status, 200);
  const aiCall = calls.find(c => c.url === "https://api.openai.com/v1/responses");
  const payload = JSON.parse(aiCall.options.body);
  assert.ok(payload.input.includes("Previous TORQWISE report"));
  assert.ok(payload.input.includes("misfire stayed on cylinder 2"));
  assert.ok(payload.instructions.includes("new evidence"));
  assert.ok(!calls.some(c => c.url === base + "/rest/v1/rpc/reserve_research_usage"));
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


test("rejects null, array, and primitive research bodies before checking quota", async () => {
  for (const raw of ["null", "[]", "42", "\"text\""]) {
    const calls = configure();
    const result = await handler(new Request("https://torqwise.example/.netlify/functions/research", {
      method: "POST",
      headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
      body: raw,
    }));
    assert.equal(result.status, 400);
    assert.deepEqual(await result.json(), { error: "The request body must be a JSON object." });
    assert.ok(!calls.some(c => c.url.includes("/rest/v1/rpc/reserve_research_usage")));
    assert.ok(!calls.some(c => c.url === "https://api.openai.com/v1/responses"));
  }
});


test("bounds identity and subscription lookup requests", async () => {
  const calls = configure();
  const result = await handler(request());
  assert.equal(result.status, 200);
  const identity = calls.find(c => c.url === base + "/auth/v1/user");
  const subscription = calls.find(c => c.url.includes("/rest/v1/subscriptions?"));
  assert.ok(identity?.options.signal, "identity verification should have a timeout");
  assert.ok(subscription?.options.signal, "subscription lookup should have a timeout");
});


test("bounds research usage reservation and release network waits", async () => {
  const calls = configure({ openaiResponse: response({ error: { code: "rate_limit_exceeded" } }, 429) });
  const result = await handler(request());
  assert.equal(result.status, 429);
  const reserve = calls.find(c => c.url === base + "/rest/v1/rpc/reserve_research_usage");
  const release = calls.find(c => c.url === base + "/rest/v1/rpc/release_research_usage");
  assert.ok(reserve?.options.signal, "usage reservation should have a timeout");
  assert.ok(release?.options.signal, "usage release should have a timeout");
});


test("returns only valid HTTP(S) citation links with bounded titles", async () => {
  const calls = configure({ openaiResponse: response({
    output: [{ type: "message", content: [{
      type: "output_text",
      text: "Use verified sources.",
      annotations: [
        { type: "url_citation", url: "javascript:alert(1)", title: "unsafe" },
        { type: "url_citation", url: "https://example.com/oem", title: "OEM manual" },
        { type: "url_citation", url: "https://example.com/other", title: "T".repeat(400) },
        { type: "url_citation", url: "not-a-url", title: "invalid" },
        { type: "url_citation", url: "https://", title: "malformed URL" }
      ]
    }] }, {
      type: "web_search_call",
      action: { sources: [
        { url: "javascript:alert(1)", title: "unsafe search source" },
        { url: "https://example.com/search-source", title: "Search source" },
        { url: "https://", title: "malformed search source" },
        { url: "https://example.com/search-source", title: "Duplicate source" }
      ] }
    }],
    model: "gpt-5-mini"
  })});
  const result = await handler(request());
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.deepEqual(data.sources, [
    { url: "https://example.com/oem", title: "OEM manual" },
    { url: "https://example.com/other", title: "T".repeat(240) },
    { url: "https://example.com/search-source", title: "Search source" }
  ]);
  assert.ok(calls.some(c => c.url === "https://api.openai.com/v1/responses"));
});


test("labels incomplete reviewed fitment records as insufficient to verify fitment", async () => {
  const calls = configure({
    fitmentResponse: response([{
      id: 7, part_number: "ABC123", brand: "Example", part_name: "Brake pad",
      vehicle_year_start: 2018, vehicle_year_end: 2020, make: "Example Motors",
      model: "Pickup", trim: null, engine: "5.3L", drive_type: null,
      axle_position: null, abs_type: null, market: "US", status: "verified",
      evidence: [], reviewed_at: null, source_checked_at: null,
    }]),
    openaiResponse: response({ output: [{ type: "message", content: [{ type: "output_text", text: "Fitment needs verification.", annotations: [] }] }] })
  });
  const result = await handler(request({body:{
    asset:"2019 Example Motors Pickup 5.3L",topic:"parts",
    question:"Check part ABC123 for this vehicle"
  }}));
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.fitmentMatches.length, 1);
  assert.equal(data.fitmentMatches[0].confidence, "INCOMPLETE CATALOG RECORD — NOT SUFFICIENT TO VERIFY FITMENT");
  assert.ok(data.fitmentMatches[0].evidenceWarnings.length >= 1);
  assert.ok(data.fitmentMatches[0].missingApplicationDetails.includes("trim"));
  const fitmentCall = calls.find(c => c.url.includes("/rest/v1/fitment_applications?"));
  assert.ok(fitmentCall, "fitment lookup should run");
  assert.equal(new URL(fitmentCall.url).searchParams.get("part_number"), "eq.ABC123");
});


test("flags fitment records with source checks older than one year", async () => {
  const oldDate = new Date(Date.now() - 400 * 86400000).toISOString();
  configure({
    fitmentResponse: response([{
      id: 8, part_number: "OLD123", brand: "Example", part_name: "Brake component",
      vehicle_year_start: 2018, vehicle_year_end: 2020, make: "Example Motors",
      model: "Pickup", trim: "LT", engine: "5.3L", drive_type: "4WD",
      axle_position: "front", abs_type: "ABS", market: "CA", status: "verified",
      evidence: [{ url: "https://example.com/catalog" }],
      reviewed_at: oldDate, source_checked_at: oldDate,
    }]),
    openaiResponse: response({ output: [{ type: "message", content: [{ type: "output_text", text: "Revalidate the catalog source." }] }] })
  });
  const result = await handler(request({ body: {
    asset: "2019 Example Motors Pickup 5.3L", topic: "parts",
    question: "Check part OLD123 for this vehicle"
  }}));
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.fitmentMatches[0].confidence, "STALE SOURCE CHECK — REVALIDATION REQUIRED BEFORE RELYING ON THIS RECORD");
  assert.ok(data.fitmentMatches[0].evidenceWarnings.some(w => w.includes("more than 12 months")));
});


test("flags tire and restraint-system safety risks without claiming a diagnosis", async () => {
  for (const [symptoms, expected] of [
    ["Tire sidewall bulge", "tire or wheel failure"],
    ["SRS warning is on", "airbag or supplemental restraint system"],
  ]) {
    const calls = configure();
    const result = await handler(request({ body: {
      asset: "2019 passenger vehicle", question: "Assess this concern", symptoms,
    }}));
    assert.equal(result.status, 200);
    const upstream = calls.find(c => c.url === "https://api.openai.com/v1/responses");
    const payload = JSON.parse(upstream.options.body);
    assert.ok(payload.input.includes("Potential safety-critical language detected"));
    assert.ok(payload.input.includes(expected));
    assert.ok(payload.input.includes("heuristic only, not a diagnosis"));
  }
});


test("flags exhaust exposure and unintended acceleration risks", async () => {
  for (const [symptoms, expected] of [
    ["Exhaust fumes inside the cabin", "exhaust intrusion or carbon-monoxide exposure"],
    ["Engine has unintended acceleration", "unintended acceleration or throttle-control fault"],
  ]) {
    const calls = configure();
    const result = await handler(request({ body: {
      asset: "Passenger vehicle", question: "Assess this symptom", symptoms,
    }}));
    assert.equal(result.status, 200);
    const upstream = calls.find(c => c.url === "https://api.openai.com/v1/responses");
    const payload = JSON.parse(upstream.options.body);
    assert.ok(payload.input.includes("Potential safety-critical language detected"));
    assert.ok(payload.input.includes(expected));
  }
});


test("flags damaged or overheating EV traction batteries", async () => {
  for (const symptoms of [
    "EV battery pack is smoking",
    "Lithium-ion battery is swelling and venting",
  ]) {
    const calls = configure();
    const result = await handler(request({ body: {
      asset: "Electric vehicle", question: "Assess this concern", symptoms,
    }}));
    assert.equal(result.status, 200);
    const upstream = calls.find(c => c.url === "https://api.openai.com/v1/responses");
    const payload = JSON.parse(upstream.options.body);
    assert.ok(payload.input.includes("Potential safety-critical language detected"));
    assert.ok(payload.input.includes("battery thermal runaway or damaged traction battery"));
    assert.ok(payload.input.includes("avoid hazardous testing"));
  }
});


test("adds specific emergency guidance for suspected EV traction battery failure", async () => {
  const calls = configure();
  const result = await handler(request({ body: {
    asset: "Electric vehicle",
    question: "Assess battery issue",
    symptoms: "EV battery pack is smoking",
  }}));
  assert.equal(result.status, 200);
  const upstream = calls.find(c => c.url === "https://api.openai.com/v1/responses");
  const payload = JSON.parse(upstream.options.body);
  assert.ok(payload.input.includes("do not charge, restart, touch, or attempt to open it"));
  assert.ok(payload.input.includes("move people away"));
  assert.ok(payload.input.includes("contact emergency services"));
});


test("flags invalid and future fitment evidence timestamps", async () => {
  const future = new Date(Date.now() + 3 * 86400000).toISOString();
  configure({
    fitmentResponse: response([{
      id: 9, part_number: "TIME123", brand: "Example", part_name: "Brake component",
      vehicle_year_start: 2018, vehicle_year_end: 2020, make: "Example Motors",
      model: "Pickup", trim: "LT", engine: "5.3L", drive_type: "4WD",
      axle_position: "front", abs_type: "ABS", market: "CA", status: "verified",
      evidence: [{ url: "https://example.com/catalog" }],
      reviewed_at: future, source_checked_at: future,
    }]),
    openaiResponse: response({ output: [{ type: "message", content: [{ type: "output_text", text: "Revalidate the catalog record." }] }] })
  });
  const result = await handler(request({ body: {
    asset: "2019 Example Motors Pickup 5.3L", topic: "parts",
    question: "Check part TIME123 for this vehicle"
  }}));
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.fitmentMatches[0].confidence, "INVALID EVIDENCE TIMESTAMP — REVALIDATE BEFORE RELYING ON THIS RECORD");
  assert.ok(data.fitmentMatches[0].evidenceWarnings.some(w => w.includes("more than 24 hours in the future")));
});
