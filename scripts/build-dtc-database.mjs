import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const sources = [
  "https://foerbsnavi.github.io/obdex/generic.min.json",
  "https://cdn.jsdelivr.net/gh/foerbsnavi/OBDex@main/dist/generic.min.json"
];
const minimumRecords = 9000;
let records;
let lastError;

for (const url of sources) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length < minimumRecords) {
      throw new Error(`Expected at least ${minimumRecords} records; received ${rows?.length ?? "invalid payload"}`);
    }
    const codes = new Set();
    for (const row of rows) {
      if (!row || !/^[PBCU][0-9A-F]{4}$/i.test(String(row.code ?? "")) || !row.title || !row.description) {
        throw new Error("Dataset contains malformed or incomplete code definitions");
      }
      codes.add(String(row.code).toUpperCase());
    }
    if (codes.size < minimumRecords) throw new Error(`Only ${codes.size} unique codes passed validation`);
    records = rows.map(row => ({ ...row, manufacturer: "", is_generic: true }));
    console.log(`Validated ${rows.length} generic DTC records / ${codes.size} unique codes from ${url}`);
    break;
  } catch (error) {
    lastError = error;
    console.warn(`Source failed: ${url}: ${error.message}`);
  }
}

if (!records) {
  throw new Error(`Cannot build TORQWISE: no complete generic DTC dataset was retrieved. Deployment must stop rather than ship incomplete coverage. ${lastError?.message ?? ""}`);
}

const target = "assets/dtc-database.json";
await mkdir(dirname(target), { recursive: true });
const serialized = JSON.stringify(records);
await writeFile(target, serialized);
console.log(`Bundled ${records.length} records into ${target} (${(Buffer.byteLength(serialized) / 1024 / 1024).toFixed(2)} MiB)`);
