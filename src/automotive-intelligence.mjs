/**
 * TORQWISE automotive intelligence core.
 * Deterministic workflow and parts-offer safety helpers; no fabricated diagnosis or pricing.
 */

export const DIAGNOSTIC_WORKFLOWS = Object.freeze({
  P0300: {
    code: "P0300",
    title: "Random/multiple cylinder misfire",
    safety: "If the check-engine light is flashing, the engine is shaking severely, or power is reduced, stop driving when safe; continued misfire can damage the catalytic converter.",
    firstChecks: [
      "Record all codes, freeze-frame data, fuel trims, engine temperature, and misfire counters before clearing anything.",
      "Check service history and inspect intake/vacuum hoses, wiring, connectors, and obvious air or fuel leaks.",
      "Compare cylinder misfire counters and inspect ignition components using the vehicle-specific service procedure.",
      "If ignition checks pass, verify fuel delivery and injector operation; use compression/leak-down testing when evidence points to a mechanical cause."
    ],
    avoid: ["Do not replace all ignition parts based on P0300 alone.", "Do not condemn a catalytic converter until the misfire cause is addressed."]
  },
  P0420: {
    code: "P0420",
    title: "Catalyst system efficiency below threshold (Bank 1)",
    safety: "If there is severe power loss, overheating, smoke, or a strong exhaust leak, stop and inspect before further driving.",
    firstChecks: [
      "Check for other codes, exhaust leaks, misfire history, and fuel-control problems first.",
      "Review freeze-frame data and confirm the engine reaches the correct operating temperature.",
      "Use vehicle-specific scan data and the OEM test procedure to evaluate upstream/downstream oxygen-sensor behaviour.",
      "Only assess catalyst efficiency after engine performance and sensor/exhaust faults have been ruled out."
    ],
    avoid: ["P0420 alone does not prove the catalytic converter has failed.", "Do not replace oxygen sensors solely because this code is present."]
  },
  P0171: {
    code: "P0171",
    title: "System too lean (Bank 1)",
    safety: "If the engine stalls in traffic, overheats, or runs dangerously poorly, stop driving when safe.",
    firstChecks: [
      "Record fuel trims at idle and raised RPM, coolant temperature, MAF/MAP data, and all related codes.",
      "Inspect intake ducting after the MAF, vacuum hoses, PCV plumbing, brake-booster hose, and intake gaskets.",
      "Perform an appropriate smoke test for unmetered air; use safe, approved methods only.",
      "If no air leak is found, verify MAF/MAP plausibility, fuel pressure/volume, injector operation, and exhaust integrity using vehicle-specific specifications."
    ],
    avoid: ["Do not assume the oxygen sensor is faulty from P0171 alone.", "Do not use flammable sprays to hunt for vacuum leaks."]
  },
  CRANKS_NO_START: {
    code: "CRANKS_NO_START",
    title: "Engine cranks but does not start",
    safety: "Keep clear of belts and fans during cranking tests. Follow fuel-system, high-voltage ignition, and hybrid/EV isolation procedures where applicable.",
    firstChecks: [
      "Confirm battery voltage and cranking speed are adequate; note whether the security/immobilizer indicator is active.",
      "Scan all modules for codes and check live engine RPM while cranking.",
      "Verify fuel level and test fuel pressure/delivery using the correct vehicle-specific procedure.",
      "Check spark/injector command only with suitable equipment and safe procedures; confirm crank/cam synchronization.",
      "If fuel, spark, and synchronization are present, continue with compression, timing, and mechanical checks."
    ],
    avoid: ["Do not spray starting fluid into an unknown intake or diesel engine.", "Do not bypass immobilizer or safety interlocks."]
  }
});

export function normalizeDtc(input) {
  const code = String(input ?? "").trim().toUpperCase().replace(/\\s+/g, "");
  if (/^P[0-9A-F]{4}$/.test(code)) return code;
  if (code === "CRANKS_NO_START" || code === "CRANKS-NO-START") return "CRANKS_NO_START";
  return "";
}

export function getDiagnosticWorkflow(input) {
  const code = normalizeDtc(input);
  return DIAGNOSTIC_WORKFLOWS[code] ?? null;
}

export function createDiagnosticCase({ vehicle = {}, codes = [], symptoms = [], freezeFrame = {}, liveData = {}, testResults = [] } = {}) {
  const normalizedCodes = [...new Set((Array.isArray(codes) ? codes : [codes]).map(normalizeDtc).filter(Boolean))];
  return {
    vehicle: { year: vehicle.year ?? null, make: vehicle.make ?? null, model: vehicle.model ?? null, engine: vehicle.engine ?? null, vin: vehicle.vin ?? null },
    codes: normalizedCodes,
    symptoms: (Array.isArray(symptoms) ? symptoms : [symptoms]).map(v => String(v ?? "").trim()).filter(Boolean),
    freezeFrame: freezeFrame && typeof freezeFrame === "object" ? { ...freezeFrame } : {},
    liveData: liveData && typeof liveData === "object" ? { ...liveData } : {},
    testResults: (Array.isArray(testResults) ? testResults : []).map(result => ({
      test: String(result?.test ?? "").trim(),
      result: String(result?.result ?? "").trim(),
      notes: String(result?.notes ?? "").trim(),
      observedAt: result?.observedAt ?? null
    })),
    createdAt: new Date().toISOString()
  };
}

export function buildDiagnosticPlan(input) {
  const caseData = input && typeof input === "object" && "codes" in input ? input : createDiagnosticCase(input);
  const workflows = caseData.codes.map(code => getDiagnosticWorkflow(code)).filter(Boolean);
  const unsupportedCodes = caseData.codes.filter(code => !getDiagnosticWorkflow(code));
  return {
    vehicle: caseData.vehicle,
    workflows,
    unsupportedCodes,
    nextStep: workflows.length
      ? "Start with the listed checks and the correct service information for this exact vehicle. Record measured results before moving to parts replacement."
      : "No supported workflow matches the supplied codes. Gather vehicle details and retrieve an authoritative, vehicle-specific diagnostic procedure before recommending tests.",
    conclusion: "No root cause is confirmed. Diagnosis requires test results and vehicle-specific specifications."
  };
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function finiteNonNegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function normalizeSupplierOffer(offer = {}) {
  const price = finiteNonNegative(offer.price);
  const shipping = finiteNonNegative(offer.shipping);
  const tax = finiteNonNegative(offer.tax);
  const currency = String(offer.currency ?? "").trim().toUpperCase();
  const url = safeHttpUrl(offer.url);
  const verifiedAt = offer.verifiedAt ? String(offer.verifiedAt) : null;
  const completeCost = price !== null && shipping !== null && tax !== null && /^[A-Z]{3}$/.test(currency);
  return {
    supplier: String(offer.supplier ?? "").trim() || "Unknown supplier",
    partNumber: String(offer.partNumber ?? "").trim() || null,
    description: String(offer.description ?? "").trim() || null,
    fitment: ["confirmed", "possible", "unknown", "incompatible"].includes(offer.fitment) ? offer.fitment : "unknown",
    availability: ["in_stock", "backorder", "out_of_stock", "unknown"].includes(offer.availability) ? offer.availability : "unknown",
    price,
    shipping,
    tax,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
    total: completeCost ? Math.round((price + shipping + tax) * 100) / 100 : null,
    url,
    sourceType: ["official_api", "authorized_feed", "manual", "search_result", "cached"].includes(offer.sourceType) ? offer.sourceType : "unknown",
    verifiedAt,
    priceStatus: completeCost ? "provided_components_complete" : "incomplete_not_comparable",
    caveats: [
      ...(url ? [] : ["No valid supplier URL was provided."]),
      ...(offer.fitment === "confirmed" ? [] : ["Vehicle fitment is not confirmed."]),
      ...(completeCost ? [] : ["A comparable landed total cannot be calculated from the supplied data."]),
      ...(verifiedAt ? [] : ["Price and stock verification time is unknown."])
    ]
  };
}

export function compareOffers(offers = []) {
  const normalized = (Array.isArray(offers) ? offers : []).map(normalizeSupplierOffer);
  const currencies = [...new Set(normalized.filter(o => o.total !== null).map(o => o.currency))];
  const comparable = currencies.length === 1
    ? normalized.filter(o => o.total !== null && o.currency === currencies[0] && o.fitment === "confirmed" && o.availability !== "out_of_stock").sort((a, b) => a.total - b.total)
    : [];
  return {
    offers: normalized,
    comparableCurrency: currencies.length === 1 ? currencies[0] : null,
    rankedConfirmedFitment: comparable,
    status: currencies.length > 1 ? "mixed_currencies_not_ranked" : comparable.length ? "ranked_confirmed_fitment_only" : "no_comparable_confirmed_offers",
    warning: "Only supplied offer data is summarized. This function does not fetch or independently verify live prices, inventory, or fitment."
  };
}

export function summarizeOfferCoverage(offers = []) {
  const items = Array.isArray(offers) ? offers.map(normalizeSupplierOffer) : [];
  return {
    offerCount: items.length,
    withValidUrl: items.filter(o => o.url).length,
    confirmedFitment: items.filter(o => o.fitment === "confirmed").length,
    knownAvailability: items.filter(o => o.availability !== "unknown").length,
    completeLandedCost: items.filter(o => o.total !== null).length,
    liveVerified: items.filter(o => ["official_api", "authorized_feed"].includes(o.sourceType) && Boolean(o.verifiedAt)).length,
    note: "Coverage describes the supplied records only; it is not a claim of marketplace completeness."
  };
}
