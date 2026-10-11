import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/fitment-lookup.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function request(body) {
  return new Request("https://torqwise.example/.netlify/functions/fitment-lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function catalogRow(overrides = {}) {
  return {
    id: 1,
    part_number: "TEST-123",
    brand: "TestBrand",
    part_name: "Front brake pad",
    vehicle_year_start: 2020,
    vehicle_year_end: 2022,
    make: "Ford",
    model: "F-150",
    trim: "XLT",
    engine: "5.0L",
    drive_type: "4WD",
    axle_position: "front",
    abs_type: "standard ABS",
    market: "US/Canada",
    status: "verified",
    evidence: ["https://example.com/catalog"],
    fitment_notes: "Test record",
    reviewed_at: "2026-01-01T00:00:00Z",
    source_checked_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}
function configure(rows) {
  process.env.SUPABASE_ANON_KEY = "test-anon";
  globalThis.fetch = async () => new Response(JSON.stringify(rows), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
});

test("only gives vehicle-match confidence when model and explicit year range match", async () => {
  configure([catalogRow()]);
  const response = await handler(request({ year: "2021", make: "Ford", model: "F-150", partType: "brake pad", engine: "5.0L", trim: "XLT", driveType: "4WD", axlePosition: "front", absType: "standard ABS" }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.matches[0].confidence, "REVIEWED VEHICLE MATCH - CONFIRM SOURCE RESTRICTIONS");
});

test("does not award vehicle-match confidence to a partial model-name match", async () => {
  configure([catalogRow({ model: "F-150 SuperCrew" })]);
  const response = await handler(request({ year: "2021", make: "Ford", model: "F-150", partType: "brake pad", engine: "5.0L", trim: "XLT", driveType: "4WD", axlePosition: "front", absType: "standard ABS" }));
  const data = await response.json();
  assert.equal(data.matches[0].confidence, "REVIEWED CATALOG RECORD - VEHICLE DETAILS STILL NEED CONFIRMATION");
});

test("retains missing configuration as a candidate but flags uncertainty", async () => {
  configure([catalogRow({ engine: null, drive_type: null })]);
  const response = await handler(request({ year: "2021", make: "Ford", model: "F-150", partType: "brake pad", engine: "5.0L", driveType: "4WD" }));
  const data = await response.json();
  assert.equal(data.matches.length, 1);
  assert.ok(data.matches[0].evidenceWarnings.some(note => note.includes("engine")));
  assert.ok(data.matches[0].specificityMissing.includes("catalog engine detail"));
  assert.notEqual(data.matches[0].confidence, "REVIEWED VEHICLE MATCH - CONFIRM SOURCE RESTRICTIONS");
});

test("filters a known engine contradiction instead of showing it as a candidate", async () => {
  configure([catalogRow({ engine: "3.5L EcoBoost" })]);
  const response = await handler(request({ year: "2021", make: "Ford", model: "F-150", partType: "brake pad", engine: "5.0L" }));
  const data = await response.json();
  assert.equal(data.matches.length, 0);
});
