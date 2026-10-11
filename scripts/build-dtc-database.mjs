import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse } from "yaml";

const families = ["P0xxx", "P2xxx", "P3xxx", "U0xxx", "U3xxx", "B0xxx", "C0xxx"];
const base = "https://raw.githubusercontent.com/foerbsnavi/OBDex/main/data/generic";
const minimumRecords = 9000;
const all = [];
const failures = [];

for (const family of families) {
  const url = `${base}/${family}_enriched.yaml`;
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Cannot bundle ${family}: HTTP ${response.status} from the source repository`);
  const text = await response.text();
  const rows = parse(text);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`Source file ${family} did not contain a list of DTC records`);
  for (const row of rows) {
    if (!row || !/^[PBCU][0-9A-F]{4}$/i.test(String(row.code ?? ""))) {
      throw new Error(`Malformed code in source family ${family}`);
    }
    if (!row.title?.en || !row.sources?.length) {
      throw new Error(`Required English title/source missing for ${row.code}`);
    }
    all.push({ ...row, manufacturer: "", is_generic: true });
  }
  console.log(`Loaded ${family}: ${rows.length} source records`);
}

const codes = new Set(all.map(row => String(row.code).toUpperCase()));
if (all.length < minimumRecords || codes.size < minimumRecords) {
  throw new Error(`Generic DTC dataset incomplete: ${all.length} records, ${codes.size} unique codes`);
}
const duplicateCodes = all.length - codes.size;
if (duplicateCodes > 0) console.warn(`Source contains ${duplicateCodes} duplicate code records; first definition retained.`);
const deduped = [...new Map(all.map(row => [String(row.code).toUpperCase(), row])).values()];
const target = "assets/dtc-database.json";
await mkdir(dirname(target), { recursive: true });
const serialized = JSON.stringify(deduped);
await writeFile(target, serialized);
console.log(`Bundled ${deduped.length} generic DTC definitions to ${target} (${(Buffer.byteLength(serialized) / 1024 / 1024).toFixed(2)} MiB)`);
