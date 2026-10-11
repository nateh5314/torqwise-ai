import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function diagRunSearch(q){");
const end = html.indexOf("\nfunction diagShowDetail", start);
assert.notEqual(start, -1, "diagnostic search handler should exist");
assert.notEqual(end, -1, "diagnostic search handler should have a clear boundary");
const source = html.slice(start, end);

function harness() {
  const output = {
    innerHTML: "",
    children: [],
    prepend(node) { this.children.unshift(node); }
  };
  const nodes = {
    diagOutput: output,
    diagMake: { value: "" },
    diagSymptom: { value: "" }
  };
  const modes = [];
  const runs = [];
  const context = {
    DIAG_DB: [],
    DIAG_SYMPTOMS: { nostart: {}, crankno: {}, misfire: {}, overheat: {}, stall: {}, brake: {}, battery: {}, power: {} },
    document: {
      getElementById: id => nodes[id],
      createElement: () => ({ className: "", textContent: "" })
    },
    diagSetMode: mode => modes.push(mode),
    diagRunSymptom: key => runs.push(key),
    String, Object, Array, RegExp
  };
  vm.createContext(context);
  vm.runInContext(source + "\nglobalThis.search = diagRunSearch;", context);
  return { context, output, nodes, modes, runs };
}

test("recognizes cranks-but-won't-start phrasing and opens symptom workflow", () => {
  const h = harness();
  h.context.search("cranks but wont start");
  assert.deepEqual(h.modes, ["symptom"]);
  assert.deepEqual(h.runs, ["nostart"]);
  assert.equal(h.nodes.diagSymptom.value, "nostart");
  assert.match(h.output.children[0].textContent, /recognized a symptom/i);
});

test("recognizes common no-crank wording", () => {
  const h = harness();
  h.context.search("truck will not crank");
  assert.deepEqual(h.runs, ["crankno"]);
});

test("unknown phrase keeps a useful no-match message and suggests symptom search", () => {
  const h = harness();
  h.context.search("mystery engine noise");
  assert.match(h.output.innerHTML, /No match in the bundled diagnostic library/);
  assert.match(h.output.innerHTML, /Symptoms tab/);
});
