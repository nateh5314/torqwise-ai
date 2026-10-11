import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDiagnosticPlan, createDiagnosticCase, getDiagnosticWorkflow,
  normalizeDtc, normalizeSupplierOffer, compareOffers, summarizeOfferCoverage
} from "../src/automotive-intelligence.mjs";

test("normalizes DTC input and recognizes supported workflows", () => {
  assert.equal(normalizeDtc(" p0300 "), "P0300");
  assert.equal(normalizeDtc("cranks-no-start"), "CRANKS_NO_START");
  assert.equal(normalizeDtc("not-a-code"), "");
  for (const code of ["P0300", "P0420", "P0171", "CRANKS_NO_START"]) assert.ok(getDiagnosticWorkflow(code));
});

test("diagnostic plan never presents a cause as confirmed", () => {
  const record = createDiagnosticCase({
    vehicle: { year: 2018, make: "Ford", model: "F-150" },
    codes: ["p0300", "P0300", "P0171"],
    symptoms: ["rough idle", "rough idle"],
    testResults: [{ test: "smoke test", result: "leak found", notes: "intake boot" }]
  });
  assert.deepEqual(record.codes, ["P0300", "P0171"]);
  assert.equal(record.testResults.length, 1);
  const plan = buildDiagnosticPlan(record);
  assert.equal(plan.workflows.length, 2);
  assert.match(plan.conclusion, /No root cause is confirmed/);
});

test("unknown diagnostic code is explicitly unsupported", () => {
  const plan = buildDiagnosticPlan({ codes: ["P9999"] });
  assert.deepEqual(plan.unsupportedCodes, ["P9999"]);
  assert.equal(plan.workflows.length, 0);
});

test("offer totals require all landed-cost components and currency", () => {
  const complete = normalizeSupplierOffer({ supplier: "Parts Co", price: 100, shipping: 10, tax: 15, currency: "CAD", fitment: "confirmed", availability: "in_stock", url: "https://example.com/p", sourceType: "official_api", verifiedAt: "2026-10-10T12:00:00Z" });
  assert.equal(complete.total, 125);
  const incomplete = normalizeSupplierOffer({ price: 100, currency: "CAD" });
  assert.equal(incomplete.total, null);
  assert.equal(incomplete.fitment, "unknown");
});

test("offers with mixed currencies are not ranked together", () => {
  const result = compareOffers([
    { supplier: "A", price: 100, shipping: 0, tax: 0, currency: "CAD", fitment: "confirmed", availability: "in_stock" },
    { supplier: "B", price: 70, shipping: 0, tax: 0, currency: "USD", fitment: "confirmed", availability: "in_stock" }
  ]);
  assert.equal(result.status, "mixed_currencies_not_ranked");
  assert.equal(result.rankedConfirmedFitment.length, 0);
});

test("unsafe supplier URLs are rejected and coverage is explicit", () => {
  const offer = normalizeSupplierOffer({ supplier: "Example", price: 10, shipping: 1, tax: 1, currency: "CAD", url: "javascript:alert(1)", fitment: "possible", availability: "unknown", sourceType: "search_result" });
  assert.equal(offer.url, null);
  const coverage = summarizeOfferCoverage([offer]);
  assert.equal(coverage.withValidUrl, 0);
  assert.equal(coverage.confirmedFitment, 0);
  assert.equal(coverage.liveVerified, 0);
});
