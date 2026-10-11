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


test("create-request rejects null and array JSON bodies before contacting Supabase", async () => {
  for (const raw of ["null", "[]"]) {
    const calls = setup(response({ id: "verified-user", email: "test@example.com" }));
    const result = await createRequest(new Request("https://torqwise.example/.netlify/functions/create-request", {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: raw,
    }));
    assert.equal(result.status, 400);
    assert.deepEqual(await result.json(), { error: "Request body must be a JSON object." });
    assert.equal(calls.length, 0);
    globalThis.fetch = originalFetch;
  }
});


test("create-request returns success if the insert succeeds but its representation is malformed", async () => {
  setup(response({ id: "verified-user", email: "test@example.com" }));
  globalThis.fetch = async (url) => {
    if (String(url) === base + "/auth/v1/user") return response({ id: "verified-user", email: "test@example.com" });
    if (String(url) === base + "/rest/v1/customer_requests") return new Response("not-json", { status: 201 });
    throw new Error("Unexpected provider request: " + String(url));
  };
  const result = await createRequest(req("create-request", "POST", {
    service: "parts", vehicle: "2018 pickup", details: "Find front brake pads",
  }));
  assert.equal(result.status, 201);
  const body = await result.json();
  assert.match(body.request.id, /^TQ-/);
  assert.equal(body.request.email, "test@example.com");
  assert.equal(body.request.vehicle, "2018 pickup");
});


test("list-requests rejects malformed history JSON without crashing", async () => {
  setup(response({ id: "verified-user" }));
  globalThis.fetch = async (url) => {
    if (String(url) === base + "/auth/v1/user") return response({ id: "verified-user" });
    if (String(url).includes("/rest/v1/customer_requests?")) return new Response("not-json", { status: 200 });
    throw new Error("Unexpected provider request: " + String(url));
  };
  const result = await listRequests(req("list-requests", "GET"));
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: "Request history returned an unreadable response. Please retry shortly." });
});

test("list-requests rejects unexpected history response shapes", async () => {
  for (const body of [{ request_code: "TQ-1" }, [null], "not-an-array"]) {
    setup(response({ id: "verified-user" }));
    globalThis.fetch = async (url) => {
      if (String(url) === base + "/auth/v1/user") return response({ id: "verified-user" });
      if (String(url).includes("/rest/v1/customer_requests?")) return response(body);
      throw new Error("Unexpected provider request: " + String(url));
    };
    const result = await listRequests(req("list-requests", "GET"));
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { error: "Request history returned an unexpected response. Please retry shortly." });
  }
});


test("create-request warns customers to check history when a write times out", async () => {
  setup(response({ id: "verified-user", email: "test@example.com" }));
  globalThis.fetch = async (url) => {
    if (String(url) === base + "/auth/v1/user") return response({ id: "verified-user", email: "test@example.com" });
    if (String(url) === base + "/rest/v1/customer_requests") {
      const error = new Error("request timed out");
      error.name = "TimeoutError";
      throw error;
    }
    throw new Error("Unexpected provider request: " + String(url));
  };
  const result = await createRequest(req("create-request", "POST", {
    service: "parts", vehicle: "2018 pickup", details: "Find front brake pads",
  }));
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), {
    error: "We could not confirm whether your request was saved. Check your request history before submitting again to avoid a duplicate."
  });
});
