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
  const brand = normalize(body.brand).slice(0, 100);
  const partType = normalize(body.partType).slice(0, 100);
  const engine = normalize(body.engine).slice(0, 120);
  const trim = normalize(body.trim).slice(0, 100);
  const driveType = normalize(body.driveType || body.drive_type).slice(0, 80);
  const axlePosition = normalize(body.axlePosition || body.axle_position).slice(0, 80);
  const absType = normalize(body.absType || body.abs_type).slice(0, 80);
  const year = Number.isInteger(Number(body.year)) && Number(body.year) >= 1900 && Number(body.year) <= 2200 ? Number(body.year) : null;
  if (!partNumber && !partType && !brand && !(make && model)) return respond({ error: "Enter a part number, brand or part type, or a vehicle year, make, and model." }, 400);
  const query = new URLSearchParams({
    select: "id,part_number,brand,part_name,vehicle_year_start,vehicle_year_end,make,model,trim,engine,drive_type,axle_position,abs_type,market,status,evidence,fitment_notes,reviewed_at,source_checked_at",
    status: "in.(verified,cross_reference)",
    limit: "300",
    order: "status.asc,part_number.asc",
  });
  if (partNumber) query.set("part_number", "ilike." + partNumber.replace(/[%,]/g, ""));
  if (make) query.set("make", "ilike." + make);
  if (model) query.set("model", "ilike.*" + model.replace(/[*%]/g, "") + "*");
  if (brand) query.set("brand", "ilike.*" + brand.replace(/[*%]/g, "") + "*");
  if (partType) query.set("part_name", "ilike.*" + partType.replace(/[*%]/g, "") + "*");
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
  }).filter(row => {
    // Exclude known contradictions; retain missing details as uncertain candidates.
    const conflicts = (requested, listed) => Boolean(requested && listed && normalize(listed) !== requested);
    return !conflicts(engine, row.engine)
      && !conflicts(trim, row.trim)
      && !conflicts(driveType, row.drive_type)
      && !conflicts(axlePosition, row.axle_position)
      && !conflicts(absType, row.abs_type);
  }).map(row => {
    const vehicleSpecified = year !== null && Boolean(make) && Boolean(model);
    const coreVehicleMatch = vehicleSpecified && Number.isInteger(row.vehicle_year_start) && Number.isInteger(row.vehicle_year_end) && year >= row.vehicle_year_start && year <= row.vehicle_year_end && normalize(row.make) === make && normalize(row.model) === model;
    const specificityMissing = [
      engine && !row.engine ? "catalog engine detail" : null,
      trim && !row.trim ? "catalog trim detail" : null,
      driveType && !row.drive_type ? "catalog drivetrain detail" : null,
      axlePosition && !row.axle_position ? "catalog axle/position detail" : null,
      absType && !row.abs_type ? "catalog ABS detail" : null,
      !engine && row.engine ? "engine" : null,
      !trim && row.trim ? "trim" : null,
      !driveType && row.drive_type ? "drivetrain" : null,
      !axlePosition && row.axle_position ? "axle/position" : null,
      !absType && row.abs_type ? "ABS configuration" : null,
      vehicleSpecified && (row.vehicle_year_start == null || row.vehicle_year_end == null) ? "catalog year-range detail" : null,
      vehicleSpecified && !row.market ? "market/region applicability" : null,
    ].filter(Boolean);
    const evidenceWarnings = [];
    if (!Array.isArray(row.evidence) || row.evidence.length === 0) evidenceWarnings.push("No source evidence attached to this record.");
    if (!row.reviewed_at) evidenceWarnings.push("Review timestamp is missing.");
    if (!row.source_checked_at) evidenceWarnings.push("Source-check timestamp is missing.");
    if (engine && !row.engine) evidenceWarnings.push("The catalog does not specify an engine, so the requested engine cannot be confirmed.");
    if (trim && !row.trim) evidenceWarnings.push("The catalog does not specify a trim, so the requested trim cannot be confirmed.");
    if (driveType && !row.drive_type) evidenceWarnings.push("The catalog does not specify drivetrain, so the requested drivetrain cannot be confirmed.");
    if (axlePosition && !row.axle_position) evidenceWarnings.push("The catalog does not specify axle/position, so the requested position cannot be confirmed.");
    if (absType && !row.abs_type) evidenceWarnings.push("The catalog does not specify ABS/brake configuration, so that configuration cannot be confirmed.");
    const confidence = row.status === "cross_reference" ? "HIGH-CONFIDENCE CROSS-REFERENCE" : coreVehicleMatch && specificityMissing.length === 0 && evidenceWarnings.length === 0 ? "REVIEWED VEHICLE MATCH - CONFIRM SOURCE RESTRICTIONS" : "REVIEWED CATALOG RECORD - VEHICLE DETAILS STILL NEED CONFIRMATION";
    const guaranteeNote = row.status === "cross_reference"
      ? "Reviewed cross-reference record; not an OEM-confirmed guarantee. Check configuration restrictions before ordering."
      : coreVehicleMatch
        ? "Year, make, and model align with the query. Confirm remaining configuration restrictions before ordering."
        : "The catalog model must match the supplied model exactly before this result can receive the vehicle-match label. Confirm engine, trim, drivetrain, axle/position, ABS, market, and source restrictions before ordering.";
    return { ...row, confidence, specificityMissing, evidenceWarnings, guaranteeNote };
  }).sort((a, b) => (a.status === "verified" ? 0 : 1) - (b.status === "verified" ? 0 : 1) || String(a.part_number || "").localeCompare(String(b.part_number || "")));
  return respond({
    query: { partNumber: partNumber || null, partType: partType || null, brand: brand || null, year, make: make || null, model: model || null, engine: engine || null, trim: trim || null, driveType: driveType || null, axlePosition: axlePosition || null, absType: absType || null },
    matches,
    count: matches.length,
    catalogStatus: matches.length ? "matches_found" : "no_reviewed_match",
    message: matches.length
      ? "Matches below come from TORQWISE's reviewed first-party catalog."
      : "No reviewed match exists in TORQWISE's catalog yet. No fitment is guaranteed from this lookup.",
  });
};
