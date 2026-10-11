import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function diagResumeCase(caseId){");
const end = html.indexOf("\nfunction diagClearHistory", start);
assert.notEqual(start, -1, "resume handler should exist");
assert.notEqual(end, -1, "resume handler should have a clear boundary");
const source = html.slice(start, end);

function makeContext(item) {
  const history = [item];
  let storedSessions = {};
  const calls = [];
  const context = {
    DIAG_SESSION_KEY: "torqwise_diag_sessions_v1",
    DIAG_SYMPTOMS: { nostart: { title: "Cranks but will not start" } },
    diagReadHistory: () => history,
    diagReadSessions: () => storedSessions,
    diagSessionKey: code => code + "|Test Vehicle",
    diagVehicle: () => "Test Vehicle",
    diagSetMode: mode => calls.push(["mode", mode]),
    diagShowDetail: code => calls.push(["show", code]),
    diagRunSymptom: key => calls.push(["symptom", key]),
    localStorage: { setItem: (key, value) => { storedSessions = JSON.parse(value); } },
    document: { getElementById: id => ({ scrollIntoView: () => calls.push(["scroll", id]) }) },
    Object, Array, String, JSON
  };
  vm.createContext(context);
  vm.runInContext(source + "\nglobalThis.resume = diagResumeCase;", context);
  return { context, calls, sessions: () => storedSessions };
}

test("resuming a code case restores saved answers and technician findings", () => {
  const h = makeContext({
    id: "case-1", code: "P0300", symptomId: null,
    sessionState: { answers: { "0": "yes", "1": "no" }, findings: "Fuel trim measured", updatedAt: "2026-10-10T12:00:00.000Z" }
  });
  h.context.resume("case-1");
  assert.deepEqual(h.sessions()["P0300|Test Vehicle"].answers, { "0": "yes", "1": "no" });
  assert.equal(h.sessions()["P0300|Test Vehicle"].findings, "Fuel trim measured");
  assert.deepEqual(h.calls.slice(0, 2), [["mode", "code"], ["show", "P0300"]]);
});

test("resuming a symptom case opens its saved symptom workflow", () => {
  const h = makeContext({ id: "case-2", code: null, symptomId: "nostart" });
  h.context.resume("case-2");
  assert.deepEqual(h.calls.slice(0, 2), [["mode", "symptom"], ["symptom", "nostart"]]);
});

test("unknown symptom identifiers do not trigger a resume action", () => {
  const h = makeContext({ id: "case-3", code: null, symptomId: "not-a-real-symptom" });
  h.context.resume("case-3");
  assert.equal(h.calls.some(call => call[0] === "symptom"), false);
});
