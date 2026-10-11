import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("async function diagImportHistory(event){");
const end = html.indexOf("\ndocument.getElementById('diagSearchForm')", start);
assert.notEqual(start, -1, "diagnostic backup import handler should exist");
assert.notEqual(end, -1, "diagnostic backup import handler should have a clear boundary");
const source = html.slice(start, end);

function harness(initial = []) {
  let stored = JSON.stringify(initial);
  const alerts = [];
  let renders = 0;
  const context = {
    localStorage: {
      getItem: key => key === "torqwise_diag_history_v1" ? stored : null,
      setItem: (key, value) => { if (key === "torqwise_diag_history_v1") stored = value; },
      removeItem: key => { if (key === "torqwise_diag_history_v1") stored = null; }
    },
    diagReadHistory: () => stored ? JSON.parse(stored) : [],
    diagRenderHistory: () => { renders++; },
    alert: message => alerts.push(message),
    Date, JSON, Number, Array, Set, Error, String, Math
  };
  vm.createContext(context);
  vm.runInContext(source + "\nglobalThis.runImport = diagImportHistory;", context);
  const input = { files: [], value: "selected.json" };
  return {
    run: async (payload, sizeOverride) => {
      const serialized = JSON.stringify(payload);
      const file = { size: sizeOverride ?? Buffer.byteLength(serialized), text: async () => serialized };
      input.files = [file];
      await context.runImport({ target: input });
      return { cases: stored ? JSON.parse(stored) : [], alerts, renders, inputValue: input.value };
    },
    getCases: () => stored ? JSON.parse(stored) : [],
    alerts,
    get renders() { return renders; },
    get inputValue() { return input.value; }
  };
}

const record = (id, created = "2026-10-10T12:00:00.000Z") => ({
  id, title: "Test case " + id, created, vehicle: "Test vehicle", kind: "code",
  code: "p0300", session: { answers: ["checked plugs"], findings: "misfire" }
});
const backup = cases => ({ format: "TORQWISE-DIAGNOSTIC-BACKUP", version: 1, cases });

test("imports valid cases and normalizes diagnostic codes", async () => {
  const h = harness();
  await h.run(backup([record("new-case")]));
  assert.equal(h.getCases().length, 1);
  assert.equal(h.getCases()[0].code, "P0300");
  assert.equal(h.renders, 1);
  assert.match(h.alerts[0], /Imported 1 new diagnostic case/);
});

test("deduplicates IDs already saved and repeated within one backup", async () => {
  const h = harness([record("existing")]);
  await h.run(backup([record("existing"), record("new"), record("new")]));
  assert.deepEqual(h.getCases().map(row => row.id), ["new", "existing"]);
  assert.match(h.alerts[0], /Imported 1 new diagnostic case/);
});

test("rejects invalid backups without changing saved cases", async () => {
  const existing = [record("keep")];
  const h = harness(existing);
  await h.run({ format: "wrong-format", version: 1, cases: [record("bad")] });
  assert.deepEqual(h.getCases(), existing);
  assert.equal(h.renders, 0);
  assert.match(h.alerts[0], /Unsupported TORQWISE diagnostic backup format/);
});

test("rejects a backup containing an invalid case atomically", async () => {
  const existing = [record("keep")];
  const h = harness(existing);
  await h.run(backup([record("good"), { id: "", title: "bad", created: "not-a-date" }]));
  assert.deepEqual(h.getCases(), existing);
  assert.equal(h.renders, 0);
  assert.match(h.alerts[0], /Backup contains an invalid case/);
});

test("retains only the 25 most recent cases", async () => {
  const cases = Array.from({ length: 30 }, (_, i) => record("case-" + i, new Date(Date.UTC(2026, 0, i + 1)).toISOString()));
  const h = harness();
  await h.run(backup(cases));
  assert.equal(h.getCases().length, 25);
  assert.equal(h.getCases()[0].id, "case-29");
  assert.equal(h.getCases().at(-1).id, "case-5");
});

test("rejects files larger than 2 MB and resets the file input", async () => {
  const existing = [record("keep")];
  const h = harness(existing);
  const result = await h.run(backup([record("oversized")]), 2 * 1024 * 1024 + 1);
  assert.deepEqual(h.getCases(), existing);
  assert.equal(h.renders, 0);
  assert.match(h.alerts[0], /larger than 2 MB/);
  assert.equal(h.inputValue, "");
  assert.equal(result.inputValue, "");
});

test("rejects backups over 500 records without partial import", async () => {
  const existing = [record("keep")];
  const h = harness(existing);
  const tooMany = Array.from({ length: 501 }, (_, i) => record("bulk-" + i));
  await h.run(backup(tooMany));
  assert.deepEqual(h.getCases(), existing);
  assert.equal(h.renders, 0);
  assert.match(h.alerts[0], /too many records/);
});
