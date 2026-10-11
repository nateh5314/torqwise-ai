import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import initSqlJs from "sql.js";
import { parse } from "yaml";

const families = ["P0xxx", "P2xxx", "P3xxx", "U0xxx", "U3xxx", "B0xxx", "C0xxx"];
const base = "https://raw.githubusercontent.com/foerbsnavi/OBDex/main/data/generic";
const manufacturerSources = [
  "https://raw.githubusercontent.com/Wal33D/dtc-database/main/data/dtc_codes.db",
  "https://cdn.jsdelivr.net/gh/Wal33D/dtc-database@main/data/dtc_codes.db"
];
const all = [];
for (const family of families) {
  const url = `${base}/${family}_enriched.yaml`;
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Cannot bundle ${family}: HTTP ${response.status} from the source repository`);
  const rows = parse(await response.text());
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`Source file ${family} did not contain a list of DTC records`);
  for (const row of rows) {
    if (!row || !/^[PBCU][0-9A-F]{4}$/i.test(String(row.code ?? ""))) throw new Error(`Malformed code in source family ${family}`);
    if (!row.title?.en || !row.sources?.length) throw new Error(`Required English title/source missing for ${row.code}`);
    all.push({ ...row, manufacturer: "", is_generic: true });
  }
  console.log(`Loaded generic family ${family}: ${rows.length} source records`);
}
const genericCodes = new Set(all.map(row => String(row.code).toUpperCase()));
if (genericCodes.size < 9000) throw new Error(`Generic DTC dataset incomplete: ${genericCodes.size} unique codes`);
const generic = [...new Map(all.map(row => [String(row.code).toUpperCase(), row])).values()];

let bytes, lastError;
for (const url of manufacturerSources) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 1000000) throw new Error("Manufacturer SQLite database response too small");
    console.log(`Retrieved manufacturer database from ${url}`);
    break;
  } catch (error) { lastError = error; console.warn(`Manufacturer source failed: ${url}: ${error.message}`); }
}
if (!bytes) throw new Error(`Could not retrieve manufacturer database: ${lastError?.message || "no source responded"}`);
const SQL = await initSqlJs();
const db = new SQL.Database(bytes);
let manufacturerRows;
try {
  const table = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='dtc_definitions'");
  if (!table.length || !table[0].values.length) throw new Error("Expected dtc_definitions table missing");
  const result = db.exec("SELECT code, manufacturer, description, type, is_generic FROM dtc_definitions WHERE locale='en'");
  if (!result.length || result[0].values.length < 15000) throw new Error("English manufacturer database failed row-count validation");
  manufacturerRows = result[0].values.map(([rawCode, rawMake, rawDescription, type, isGeneric]) => {
    const code = String(rawCode || "").trim().toUpperCase();
    const rawManufacturer = String(rawMake || "GENERIC").trim().toUpperCase();
    const genericEntry = Boolean(isGeneric) || rawManufacturer === "GENERIC";
    return { code, manufacturer: rawManufacturer === "GENERIC" ? "" : rawManufacturer, title: String(rawDescription || "").trim(), description: String(rawDescription || "").trim(), category: String(type || "diagnostic"), is_generic: genericEntry };
  }).filter(row => /^[PBCU][0-9A-F]{4}$/.test(row.code) && row.title);
  const makes = new Set(manufacturerRows.filter(row => row.manufacturer).map(row => row.manufacturer));
  if (manufacturerRows.length < 15000 || makes.size < 20) throw new Error("Manufacturer database failed completeness/make validation");
  console.log(`Loaded ${manufacturerRows.length} English definitions across ${makes.size} makes`);
} finally { db.close(); }

const seen = new Set(generic.map(row => String(row.code).toUpperCase() + "|"));
const merged = [...generic];
for (const row of manufacturerRows) {
  const key = String(row.code).toUpperCase() + "|" + String(row.manufacturer || "").toUpperCase();
  if (seen.has(key)) continue;
  if (!row.manufacturer && genericCodes.has(row.code)) continue;
  merged.push(row); seen.add(key);
}
const genericCount = new Set(merged.filter(row => !row.manufacturer).map(row => row.code)).size;
const makeRows = merged.filter(row => row.manufacturer);
const makeCount = new Set(makeRows.map(row => row.manufacturer)).size;
if (genericCount < 9000 || makeRows.length < 5000 || makeCount < 20) throw new Error(`Merged dataset failed validation: ${genericCount} generic, ${makeRows.length} make-specific, ${makeCount} makes`);
const target = "assets/dtc-database.json";
await mkdir(dirname(target), { recursive: true });
const serialized = JSON.stringify(merged);
await writeFile(target, serialized);
console.log(`Bundled ${merged.length} definitions: ${genericCount} generic codes and ${makeRows.length} make-specific definitions across ${makeCount} makes to ${target} (${(Buffer.byteLength(serialized)/1024/1024).toFixed(2)} MiB)`);
