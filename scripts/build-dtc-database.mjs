import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import initSqlJs from "sql.js";
import { parse } from "yaml";

const families = ["P0", "P2", "P3", "U0", "U3", "B0", "C0"];
const yamlBase = "https://raw.githubusercontent.com/foerbsnavi/OBDex/main/data/generic/";
const manufacturerSources = [
  "https://raw.githubusercontent.com/Wal33D/dtc-database/main/data/dtc_codes.db",
  "https://cdn.jsdelivr.net/gh/Wal33D/dtc-database@main/data/dtc_codes.db"
];
const MIN_GENERIC = 9000;
const MIN_ENGLISH_DEFINITIONS = 15000;

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}
async function fetchManufacturerDatabase() {
  let lastError;
  for (const url of manufacturerSources) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength < 1000000) throw new Error("SQLite database response is too small");
      return { bytes, url };
    } catch (error) {
      lastError = error;
      console.warn(`Manufacturer database source failed: ${url}: ${error.message}`);
    }
  }
  throw new Error(`Could not retrieve manufacturer DTC database: ${lastError?.message ?? "no source responded"}`);
}

const generic = [];
for (const family of families) {
  const url = `${yamlBase}${family}xxx_enriched.yaml`;
  const source = await fetchText(url);
  const rows = parse(source);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`Generic family ${family} is missing or malformed`);
  for (const row of rows) {
    if (!row || !/^[PBCU][0-9A-F]{4}$/i.test(String(row.code ?? "")) || !row.title || !row.description) {
      throw new Error(`Generic family ${family} contains malformed or incomplete code data`);
    }
    generic.push({ ...row, manufacturer: "", is_generic: true });
  }
  console.log(`Validated generic family ${family}: ${rows.length} entries`);
}
const genericCodes = new Set(generic.map(row => String(row.code).toUpperCase()));
if (generic.length < MIN_GENERIC || genericCodes.size < MIN_GENERIC) {
  throw new Error(`Generic dataset incomplete: ${generic.length} records / ${genericCodes.size} unique codes`);
}

const { bytes, url: manufacturerSource } = await fetchManufacturerDatabase();
const SQL = await initSqlJs();
const db = new SQL.Database(bytes);
let manufacturerRecords;
try {
  const schema = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='dtc_definitions'");
  if (!schema.length || !schema[0].values.length) throw new Error("Expected dtc_definitions table is missing");
  const result = db.exec("SELECT code, manufacturer, description, type, is_generic FROM dtc_definitions WHERE locale='en'");
  if (!result.length || result[0].values.length < MIN_ENGLISH_DEFINITIONS) throw new Error("English definition count failed validation");
  manufacturerRecords = result[0].values.map(([rawCode, rawMake, rawDescription, type, isGeneric]) => {
    const code = String(rawCode || "").trim().toUpperCase();
    const rawManufacturer = String(rawMake || "GENERIC").trim().toUpperCase();
    const genericEntry = Boolean(isGeneric) || rawManufacturer === "GENERIC";
    return {
      code,
      manufacturer: genericEntry ? "" : rawManufacturer,
      title: String(rawDescription || "").trim(),
      description: String(rawDescription || "").trim(),
      category: String(type || "diagnostic"),
      is_generic: genericEntry
    };
  }).filter(row => /^[PBCU][0-9A-F]{4}$/.test(row.code) && row.title);
  const makes = new Set(manufacturerRecords.filter(row => row.manufacturer).map(row => row.manufacturer));
  if (manufacturerRecords.length < MIN_ENGLISH_DEFINITIONS || makes.size < 20) throw new Error("Manufacturer dataset failed row/make validation");
  console.log(`Validated ${manufacturerRecords.length} English definitions across ${makes.size} makes from ${manufacturerSource}`);
} finally {
  db.close();
}

const merged = [...generic];
const seen = new Set(generic.map(row => String(row.code).toUpperCase() + "|"));
for (const row of manufacturerRecords) {
  const key = String(row.code).toUpperCase() + "|" + String(row.manufacturer || "").toUpperCase();
  if (seen.has(key)) continue;
  if (!row.manufacturer && genericCodes.has(row.code)) continue;
  merged.push(row);
  seen.add(key);
}
const uniqueGeneric = new Set(merged.filter(row => !row.manufacturer).map(row => row.code)).size;
const makeSpecific = merged.filter(row => row.manufacturer);
const makes = new Set(makeSpecific.map(row => row.manufacturer));
if (uniqueGeneric < MIN_GENERIC || makeSpecific.length < 5000 || makes.size < 20) {
  throw new Error(`Merged database failed completeness check: generic=${uniqueGeneric}, make-specific=${makeSpecific.length}, makes=${makes.size}`);
}
const target = "assets/dtc-database.json";
await mkdir(dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(merged));
console.log(`Bundled ${merged.length} definitions: ${uniqueGeneric} generic codes, ${makeSpecific.length} make-specific definitions across ${makes.size} makes to ${target} (${(Buffer.byteLength(JSON.stringify(merged))/1024/1024).toFixed(2)} MiB)`);
