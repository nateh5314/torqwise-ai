import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const guides = [...html.matchAll(/^\s*([PBCU][0-9A-F]{4})\s*:\s*torqGuidePair\s*\(\s*\{([\s\S]*?)\}\s*\),?/gm)];
const codes = guides.map(match => match[1]);

test("guided diagnostic catalogue has unique code entries", () => {
  assert.ok(codes.length >= 70, `Expected at least 70 guided DTC workflows, found ${codes.length}`);
  assert.equal(new Set(codes).size, codes.length, "guided diagnostic codes must not be duplicated");
});

test("high-value diagnostic workflows remain present", () => {
  for (const code of [
    "P0101", "P0113", "P0116", "P0131", "P0133", "P0171", "P0201", "P0299",
    "P0300", "P0301", "P0304", "P0335", "P0340", "P0420", "P0440", "P0446",
    "P0456", "P0507", "P0700", "P2002", "U0100", "U0121"
  ]) {
    assert.ok(codes.includes(code), `Missing guided diagnostic workflow: ${code}`);
  }
});

test("each guided workflow includes a beginner explanation and next step", () => {
  for (const match of guides) {
    const code = match[1];
    const body = match[2];
    assert.match(body, /beginner\s*:/, `${code} is missing its plain-language explanation`);
    assert.match(body, /next\s*:/, `${code} is missing a next-step caution`);
    assert.match(body, /advanced\s*:/, `${code} is missing its advanced test sequence`);
  }
});
