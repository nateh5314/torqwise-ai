import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse } from "yaml";

const families = ["P0xxx", "P2xxx", "P3xxx", "U0xxx", "U3xxx", "B0xxx", "C0xxx"];
const base = "https://raw.githubusercontent.com/foerbsnavi/OBDex/main/data/generic";
const all = [];

const english = value => typeof value === "string" ? value : value?.en || "";
for (const family of families) {
  const url = `${base}/${family}_enriched.yaml`;
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Cannot bundle ${family}: HTTP ${response.status} from OBDex`);
  const rows = parse(await response.text());
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`Source family ${family} did not contain DTC records`);
  for (const row of rows) {
    const code = String(row?.code ?? "").toUpperCase();
    if (!/^[PBCU][0-9A-F]{4}$/.test(code)) throw new Error(`Malformed DTC code in ${family}`);
    if (!english(row.title) || !english(row.description) || !Array.isArray(row.sources) || row.sources.length === 0) {
      throw new Error(`Missing English title, description or source references for ${code}`);
    }
    // Bundle only fields used by the website. Keep English reference content and
    // omit duplicate German text, unused metadata, and source-side scaffolding.
    all.push({
      code,
      category: String(row.category || "diagnostic"),
      title: { en: english(row.title) },
      description: { en: english(row.description) },
      sources: row.sources.filter(source => typeof source === "string" && /^https?:\/\//i.test(source)).slice(0, 8),
      common_causes: (row.common_causes || []).slice(0, 10).map(cause => ({
        label: { en: english(cause?.label || cause) || String(cause?.id || "Possible cause") }
      })),
      symptoms: (row.symptoms || []).slice(0, 10).map(english).filter(Boolean).map(en => ({ en })),
      affected_components: (row.affected_components || []).slice(0, 10).map(value => String(value)),
      related_codes: (row.related_codes || []).slice(0, 12).map(value => String(value)),
      repair: {
        ...(row.repair?.difficulty ? { difficulty: String(row.repair.difficulty) } : {}),
        ...(Array.isArray(row.repair?.estimated_cost_eur) ? { estimated_cost_eur: row.repair.estimated_cost_eur.slice(0, 2) } : {}),
        ...(Array.isArray(row.repair?.estimated_hours) ? { estimated_hours: row.repair.estimated_hours.slice(0, 2) } : {})
      },
      manufacturer: "",
      is_generic: true
    });
  }
  console.log(`Validated ${family}: ${rows.length} source records`);
}

const unique = new Map();
for (const row of all) if (!unique.has(row.code)) unique.set(row.code, row);
const records = [...unique.values()];
if (records.length < 9000) throw new Error(`Generic DTC dataset incomplete: ${records.length} unique codes (minimum 9,000)`);
if (records.some(row => !row.title.en || !row.description.en || !row.sources.length)) throw new Error("Normalized database is missing required fields");
const target = "assets/dtc-database.json";
await mkdir(dirname(target), { recursive: true });
const serialized = JSON.stringify(records);
await writeFile(target, serialized);
console.log(`Bundled ${records.length} validated generic DTC definitions into ${target} (${(Buffer.byteLength(serialized) / 1024 / 1024).toFixed(2)} MiB)`);
