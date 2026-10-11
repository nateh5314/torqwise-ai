import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import initSqlJs from "sql.js";

const genericSources = [
  "https://foerbsnavi.github.io/obdex/generic.min.json",
  "https://cdn.jsdelivr.net/gh/foerbsnavi/OBDex@main/generic.min.json"
];
const manufacturerSources = [
  "https://raw.githubusercontent.com/Wal33D/dtc-database/main/data/dtc_codes.db",
  "https://cdn.jsdelivr.net/gh/Wal33D/dtc-database@main/data/dtc_codes.db"
];
const MIN_GENERIC = 9000;
const MIN_ENGLISH_DEFINITIONS = 15000;

async function fetchFirstValid(urls, validate, label) {
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = await validate(response);
      console.log(`Validated ${label} from ${url}`);
      return value;
    } catch (error) {
      lastError = error;
      console.warn(`${label} source failed: ${url}: ${error.message}`);
    }
  }
  throw new Error(`Could not build bundled ${label}: ${lastError?.message ?? "no source responded"}`);
}

const generic = await fetchFirstValid(genericSources, async response => {
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length < MIN_GENERIC) throw new Error("Generic dataset is incomplete");
  const codes = new Set();
  for (const row of rows) {
    if (!row || !/^[PBCU][0-9A-F]{4}$/i.test(String(row.code ?? "")) || !row.title || !row.description) {
      throw new Error("Generic dataset contains malformed or incomplete definitions");
    }
    codes.add(String(row.code).toUpperCase());
  }
  if (codes.size < MIN_GENERIC) throw new Error(`Only ${codes.size} unique generic codes`);
  console.log(`Generic dataset: ${rows.length} records / ${codes.size} unique codes`);
  return rows.map(row => ({ ...row, manufacturer: "", is_generic: true }));
}, "generic DTC database");

const manufacturerRecords = await fetchFirstValid(manufacturerSources, async response => {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1000000) throw new Error("SQLite database response is too small");
  const SQL = await initSqlJs();
  const db = new SQL.Database(bytes);
  try {
    const schema = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='dtc_definitions'");
    if (!schema.length || !schema[0].values.length) throw new Error("Expected dtc_definitions table is missing");
    const result = db.exec("SELECT code, manufacturer, description, type, is_generic FROM dtc_definitions WHERE locale='en'");
    if (!result.length || result[0].values.length < MIN_ENGLISH_DEFINITIONS) throw new Error("English definition count failed validation");
    const rows = result[0].values.map(([rawCode, rawMake, rawDescription, type, isGeneric]) => ({
      code: String(rawCode || "").trim().toUpperCase(),
      manufacturer: String(rawMake || "GENERIC").trim().toUpperCase(),
      title: String(rawDescription || "").trim(),
      description: String(rawDescription || "").trim(),
      category: String(type || "diagnostic"),
      is_generic: Boolean(isGeneric) || String(rawMake || "").toUpperCase() === "GENERIC"
    })).filter(row => /^[PBCU][0-9A-F]{4}$/.test(row.code) && row.title);
    const makes = new Set(rows.filter(row => !row.is_generic).map(row => row.manufacturer));
    if (rows.length < MIN_ENGLISH_DEFINITIONS || makes.size < 20) throw new Error("Manufacturer dataset failed row/make validation");
    console.log(`Manufacturer dataset: ${rows.length} English definitions across ${makes.size} makes`);
    return rows;
  } finally {
    db.close();
  }
}, "manufacturer DTC database");

const merged = [...generic];
const seen = new Set(generic.map(row => String(row.code).toUpperCase() + "|"));
for (const row of manufacturerRecords) {
  const make = row.is_generic ? "" : row.manufacturer;
  const key = String(row.code).toUpperCase() + "|" + make;
  if (seen.has(key)) continue;
  // Generic entries from the second source do not replace the richer CC0 generic data.
  if (!make && generic.some(item => String(item.code).toUpperCase() === String(row.code).toUpperCase())) continue;
  merged.push({ ...row, manufacturer: make });
  seen.add(key);
}
const uniqueGeneric = new Set(merged.filter(row => !row.manufacturer).map(row => row.code)).size;
const uniqueMakeDefinitions = merged.filter(row => row.manufacturer).length;
if (uniqueGeneric < MIN_GENERIC || uniqueMakeDefinitions < 5000) {
  throw new Error(`Merged database failed completeness check: generic=${uniqueGeneric}, make-specific=${uniqueMakeDefinitions}`);
}
const target = "assets/dtc-database.json";
await mkdir(dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(merged));
console.log(`Bundled ${merged.length} entries (${uniqueGeneric} generic codes + ${uniqueMakeDefinitions} make-specific definitions) to ${target} (${(Buffer.byteLength(JSON.stringify(merged))/1024/1024).toFixed(2)} MiB)`);
