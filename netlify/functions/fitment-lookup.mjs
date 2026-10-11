function respond(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function env(name) { return (process.env[name] || "").trim(); }
function normalize(value) { return typeof value === "string" ? value.trim().toLowerCase() : ""; }

export default async (req) => {
  if (req.method !== "POST") return respond({ error: "Use POST to look up fitment." }, 405);
  const base = env("SUPABASE_URL") || "https://wnvmtjimldleqfjuuprl.supabase.co";
  const anon = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_PUNISHABLE_KEY");
  if (!anon) return respond({ error: "Fitment lookup is not configured." }, 503);
  let body;
  try { body = await req.json(); } catch { return respond({ error: "The request body must be valid JSON." }, 400); }
  const partNumber = typeof body.partNumber === "string" ? body.partNumber.trim().slice(0, 100) : "";
  const make = normalize(body.make).slice(0, 100);
  const model = normalize(body.model).slice(0, 100);
  const year = Number.isInteger(Number(body.year)) && Number(body.year) >= 1900 && Number(body.year) <= 2200 ? Number(body.year) : null;
  if (!partNumber && !(make && model)) return respond({ error: "Enter a part number or a vehicle year, make, and model." }, 400);
  const query = new URLSearchParams({
    select: "id,part_number,brand,part_name,vehicle_year_start,vehicle_year_end,make,model,trim,engine,drive_type,axle_position,abs_type,market,status,evidence,fitment_notes,reviewed_at,source_checked_at",
    status: "in.(verified,cross_reference)",
    limit: "300",
    order: "status.asc,part_number.asc",
  });
  if (partNumber) query.set("part_number", "ilike." + partNumber.replace(/[%,]/g, ""));
  if (make) query.set("make", "ilike." + make);
  if (model) query.set("model", "ilike." + model);
  let response;
  try {
    response = await fetch(base.replace(/\/+$/, "") + "/rest/v1/fitment_applications?" + query.toString(), {
      headers: { apikey: anon, authorization: "Bearer " + anon },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return respond({ error: "Fitment database could not be reached. Try again shortly." }, 502);
  }
  if (!response.ok) {
    console.error("Fitment catalog lookup failed:", response.status);
    return respond({ error: response.status === 404 ? "Fitment catalog is not installed yet." : "Fitment catalog is temporarily unavailable." }, 503);
  }
  let rows;
  try { rows = await response.json(); } catch { return respond({ error: "Fitment catalog returned an unreadable response." }, 502); }
  const matches = (Array.isArray(rows) ? rows : []).filter(row => {
    if (year !== null && row.vehicle_year_start !== null && row.vehicle_year_start !== undefined && year < row.vehicle_year_start) return false;
    if (year !== null && row.vehicle_year_end !== null && row.vehicle_year_end !== undefined && year > row.vehicle_year_end) return false;
    return true;
  }).map(row => ({
    ...row,
    confidence: row.status === "verified" ? "VERIFIED MATCH" : "HIGH-CONFIDENCE CROSS-REFERENCE",
    guaranteeNote: row.status === "verified"
      ? "Reviewed record. Confirm all listed variant restrictions match the supplied vehicle before ordering."
      : "Multiple-source cross-reference; not an OEM-confirmed guarantee.",
  }));
  return respond({
    query: { partNumber: partNumber || null, year, make: make || null, model: model || null },
    matches,
    count: matches.length,
    catalogStatus: matches.length ? "matches_found" : "no_reviewed_match",
    message: matches.length
      ? "Matches below come from TORQWISE's reviewed first-party catalog."
      : "No reviewed match exists in TORQWISE's catalog yet. No fitment is guaranteed from this lookup.",
  });
};
