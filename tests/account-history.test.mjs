import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/account-history.mjs";

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

function configure({ token = "valid-token", rest = () => response([]) } = {}) {
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_ANON_KEY = "public-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-test-key";
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === base + "/auth/v1/user") {
      return token ? response({ id: userId }) : response({ message: "unauthorized" }, 401);
    }
    return rest(String(url), options);
  };
  return calls;
}

function request(method, path = "/", body, token = "valid-token") {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request("https://torqwise.example/.netlify/functions/account-history" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
});

test("rejects unsupported methods before contacting Supabase", async () => {
  const calls = configure();
  const result = await handler(request("PUT"));
  assert.equal(result.status, 405);
  assert.equal(calls.length, 0);
});

test("requires a bearer token", async () => {
  const calls = configure();
  const result = await handler(request("GET", "/", undefined, ""));
  assert.equal(result.status, 401);
  assert.equal((await result.json()).error, "Sign in to access your saved history.");
  assert.equal(calls.length, 0);
});

test("lists only the verified user's history and clamps the requested limit", async () => {
  let restUrl = "";
  const calls = configure({ rest: (url) => {
    restUrl = url;
    return response([{ id: 7, kind: "diagnostic" }]);
  } });
  const result = await handler(request("GET", "/?limit=999&kind=diagnostic"));
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).entries, [{ id: 7, kind: "diagnostic" }]);
  assert.match(restUrl, /user_id=eq\.user-123/);
  assert.match(restUrl, /limit=100/);
  assert.match(restUrl, /kind=eq\.diagnostic/);
  assert.equal(calls.length, 2);
});

test("rejects malformed JSON and invalid save payloads", async () => {
  configure();
  const malformed = new Request("https://torqwise.example/.netlify/functions/account-history", {
    method: "POST",
    headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
    body: "{",
  });
  const badJson = await handler(malformed);
  assert.equal(badJson.status, 400);

  const invalid = await handler(request("POST", "/", { kind: "unknown", title: "Example" }));
  assert.equal(invalid.status, 400);
});

test("saves supported records with only HTTP(S) source links", async () => {
  let saved;
  configure({ rest: (url, options) => {
    if (url.includes("/rest/v1/account_history")) {
      saved = JSON.parse(options.body);
      return response([{ id: 8, ...saved }], 201);
    }
    return response([]);
  } });
  const result = await handler(request("POST", "/", {
    kind: "parts",
    title: "Brake pads",
    sources: [
      { title: "Supplier", url: "https://supplier.example/search" },
      { title: "Unsafe", url: "javascript:alert(1)" },
    ],
    metadata: { vehicle: "Test vehicle" },
  }));
  assert.equal(result.status, 201);
  assert.equal(saved.user_id, userId);
  assert.equal(saved.kind, "parts");
  assert.deepEqual(saved.sources, [{ title: "Supplier", url: "https://supplier.example/search" }]);
  assert.deepEqual(saved.metadata, { vehicle: "Test vehicle" });
});

test("requires a valid delete target and scopes deletion to the verified user", async () => {
  let deleteUrl = "";
  configure({ rest: (url, options) => {
    if (options.method === "DELETE") deleteUrl = url;
    return response([]);
  } });
  const invalid = await handler(request("DELETE", "/", { id: "not-an-id" }));
  assert.equal(invalid.status, 400);

  const result = await handler(request("DELETE", "/", { id: 12 }));
  assert.equal(result.status, 200);
  assert.match(deleteUrl, /id=eq\.12/);
  assert.match(deleteUrl, /user_id=eq\.user-123/);
});


test("clear-all deletes only the verified user's cloud history", async () => {
  let deleteUrl = "";
  configure({ rest: (url, options) => {
    if (options.method === "DELETE") deleteUrl = url;
    return response([]);
  } });
  const result = await handler(request("DELETE", "/", { clearAll: true }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { deleted: "all" });
  assert.match(deleteUrl, /user_id=eq\\.user-123/);
  assert.doesNotMatch(deleteUrl, /[?&]id=eq/);
});
