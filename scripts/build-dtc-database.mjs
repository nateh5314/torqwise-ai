import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const sources = [
  "https://foerbsnavi.github.io/obdex/generic.min.json",
  "https://cdn.jsdelivr.net/gh/foerbsnavi/OBDex@main/generic.min.json"
];
const minimumRecords = 9000;
let records;
let lastError;

for (const url of sources) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload) || payload.length < minimumRecords) {
      throw new Error(`Dataset completeness check failed (${payload?.length ?? "not an array"} records)`);
    }
    const codes = new Set();
    for (const row of payload) {
      if (!row || !/^[PBCU][0-9A-F]{4}$/i.test(String(row.code ?? ""))) {
        throw new Error("Dataset contains a malformed diagnostic trouble code");
      }
      codes.add(String(row.code).toUpperCase());
      if (!row.title || !row.description) throw new Error("Dataset is missing required definitions");
    }
    if (codes.size < minimumRecords) throw new Error(`Only ${codes.size} unique codes passed validation`);
    records = payload;
    console.log(`Validated ${payload.length} records / ${codes.size} unique generic DTC codes from ${url}`);
    break;
  } catch (error) {
    lastError = error;
    console.warn(`DTC source failed: ${url}: ${error.message}`);
  }
}

if (!records) {
  throw new Error(`Could not build the bundled generic DTC database. Deployment stopped rather than publishing a falsely complete diagnostic library. ${lastError?.message ?? ""}`);
}

const target = "assets/dtc-generic.json";
await mkdir(dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(records));
console.log(`Wrote ${target} (${(Buffer.byteLength(JSON.stringify(records)) / 1024 / 1024).toFixed(2)} MiB)`);
