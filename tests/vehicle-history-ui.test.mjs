import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("Vehicle History Intelligence is integrated alongside the VIN workflow", () => {
  assert.match(html, /id="vin-lookup"/);
  assert.match(html, /id="vehicle-history"/);
  assert.match(html, /id="vhiUseVin"/);
  assert.match(html, /Use decoded VIN/);
});

test("history UI clearly discloses that CARFAX is not connected", () => {
  assert.match(html, /CARFAX API status: not connected/);
  assert.match(html, /does not yet have a live CARFAX Canada connection/);
  assert.match(html, /not verified CARFAX data/);
});

test("odometer evidence is VIN-scoped and remains in local browser storage", () => {
  assert.match(html, /torqwise_vhi_readings_v1_/);
  assert.match(html, /localStorage\.setItem\(key\(v\),JSON\.stringify\(a\)\)/);
  assert.match(html, /Readings are stored locally in this browser/);
});

test("timeline flags decreasing readings and conflicting dates without claiming proof of tampering", () => {
  assert.match(html, /Possible odometer inconsistency/);
  assert.match(html, /Conflicting readings are recorded for/);
  assert.match(html, /does not establish true mileage or rule out odometer tampering/);
});

test("timeline supports CSV export and clearing a single VIN's saved records", () => {
  assert.match(html, /id="vhiExport"/);
  assert.match(html, /torqwise-odometer-timeline-/);
  assert.match(html, /localStorage\.removeItem\(key\(v\)\)/);
});
