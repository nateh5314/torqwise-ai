import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function diagRunSearch(q){");
const end = html.indexOf("\nfunction diagShowDetail", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const source = html.slice(start, end);

function harness(db) {
  const output = {
    innerHTML: "",
    handlers: [],
    querySelectorAll(selector) {
      assert.equal(selector, "[data-open-code]");
      return [];
    }
  };
  const context = {
    DIAG_DB: db,
    document: {
      getElementById: id => id === "diagOutput" ? output : ({ value: id === "diagMake" ? "Ford" : "" }),
    },
    diagVehicle: () => "2018 Ford F-150 5.0L",
    escapeHtml: value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch])),
    String, Object, Array, RegExp, Set
  };
  vm.createContext(context);
  vm.runInContext(source + "\nglobalThis.search = diagRunSearch;", context);
  return { output, search: context.search };
}

test("researches multiple trouble codes together with vehicle context", () => {
  const h = harness([
    { code: "P0300", title: "Random misfire", summary: "Multiple cylinder misfire", manufacturer: "", isGeneric: true },
    { code: "U0100", title: "Lost communication with ECM/PCM", summary: "Network communication fault", manufacturer: "", isGeneric: true }
  ]);
  h.search("P0300, U0100");
  assert.match(h.output.innerHTML, /Multi-code research/);
  assert.match(h.output.innerHTML, /2018 Ford F-150 5.0L/);
  assert.match(h.output.innerHTML, /Random misfire/);
  assert.match(h.output.innerHTML, /Lost communication with ECM\/PCM/);
  assert.match(h.output.innerHTML, /data-open-code="P0300"/);
  assert.match(h.output.innerHTML, /data-open-code="U0100"/);
});

test("reports missing codes separately instead of hiding codes with no definition", () => {
  const h = harness([{ code: "P0300", title: "Random misfire", summary: "Misfire", manufacturer: "", isGeneric: true }]);
  h.search("P0300 U0121");
  assert.match(h.output.innerHTML, /Random misfire/);
  assert.match(h.output.innerHTML, /U0121/);
  assert.match(h.output.innerHTML, /No bundled definition found/);
});

test("does not switch to multi-code mode for a single code", () => {
  const h = harness([{ code: "P0300", title: "Random misfire", summary: "Misfire", manufacturer: "", isGeneric: true }]);
  h.search("P0300");
  assert.doesNotMatch(h.output.innerHTML, /Multi-code research/);
});
