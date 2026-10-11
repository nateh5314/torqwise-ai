import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse } from "yaml";

const families = ["P0xxx", "P2xxx", "P3xxx", "U0xxx", "U3xxx", "B0xxx", "C0xxx"];
const base = "https://raw.githubusercontent.com/foerbsnavi/OBDex/main/data/generic";
const all = [];

for (const family of families) {
  const url = `${base}/${family}_enriched.yaml`;
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Cannot bundle ${family}: HTTP ${response.status} from OBDex`);
  const rows = parse(await response.text());
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`Source family ${family} did not contain DTC records`);
  for (const row of rows) {
    const code = String(row?.code ?? "").toUpperCase();
    if (!/^[PBCU][0-9A-F]{4}$/.test(code)) throw new Error(`Malformed DTC code in ${family}`);
    if (!row.title?.en || !Array.isArray(row.sources) || row.sources.length === 0) throw new Error(`Missing English title or source references for ${code}`);
    all.push({ ...row, code, manufacturer: "", is_generic: true });
  }
  console.log(`Validated ${family}: ${rows.length} source records`);
}

const unique = new Map();
for (const row of all) if (!unique.has(row.code)) unique.set(row.code, row);
const records = [...unique.values()];
if (records.length < 9000) throw new Error(`Generic DTC dataset incomplete: ${records.length} unique codes (minimum 9,000)`);
const target = "assets/dtc-database.json";
await mkdir(dirname(target), { recursive: true });
const serialized = JSON.stringify(records);
await writeFile(target, serialized);
console.log(`Bundled ${records.length} validated generic DTC definitions into ${target} (${(Buffer.byteLength(serialized) / 1024 / 1024).toFixed(2)} MiB)`);
