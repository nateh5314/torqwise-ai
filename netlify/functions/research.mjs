function env(name) {
  // Netlify's runtime env API is the supported path for function-scoped variables.
  // Keep process.env as a compatibility fallback for local development and tests.
  try {
    if (typeof Netlify !== "undefined" && Netlify?.env?.get) {
      const value = Netlify.env.get(name);
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {}
  return (process.env[name] || "").trim();
}
function supabaseBase() {
  const raw = (env("SUPABASE_URL") || "https://wnvmtjimldleqfjuuprl.supabase.co").trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(raw)) return raw;
  const host = raw.match(/^([a-z0-9-]+\.supabase\.co)$/i);
  if (host) return "https://" + host[1];
  const ref = raw.match(/^([a-z0-9-]{15,40})$/i);
  if (ref) return "https://" + ref[1] + ".supabase.co";
  return raw;
}

const MAX_FIELD = 1800;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;
const recentRequests = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function clean(value, max = MAX_FIELD) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function getClientKey(req) {
  // Used only for a small best-effort burst limit. Serverless memory can reset,
  // so this is not a replacement for a persistent rate limiter or authentication.
  return req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
function tooManyRequests(key) {
  const now = Date.now();
  for (const [k, v] of recentRequests) if (now - v.start > WINDOW_MS) recentRequests.delete(k);
  let item = recentRequests.get(key);
  if (!item || now - item.start > WINDOW_MS) item = { start: now, count: 0 };
  item.count += 1; recentRequests.set(key, item);
  return item.count > MAX_REQUESTS_PER_WINDOW;
}
async function getResearchAccess(req, followUp = false) {
  const base = supabaseBase();
  const anon = (env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_PUNISHABLE_KEY") || '').trim();
  const service = (env("SUPABASE_SERVICE_ROLE_KEY") || '').trim();
  if (!base || !anon || !service) return { error: 'Research accounts are not configured yet.', status: 503 };
  const token = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: 'Sign in to use AI research. Free accounts include 3 reports per month.', status: 401 };
  const userResponse = await fetch(base + '/auth/v1/user', { headers: { apikey: anon, authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) });
  if (!userResponse.ok) return { error: 'Your session expired. Please sign in again.', status: 401 };
  let user;
  try { user = await userResponse.json(); } catch { return { error: 'Your session could not be verified. Please sign in again.', status: 401 }; }
  if (!user || typeof user.id !== 'string' || !user.id) return { error: 'Your session could not be verified. Please sign in again.', status: 401 };
  const headers = { apikey: service, authorization: 'Bearer ' + service };
  // Billing is optional for free-tier research. If the subscriptions table has
  // not been installed yet, fail closed to the free tier rather than blocking
  // every signed-in user. Unexpected server errors still fail safely.
  // Keep entitlement checks aligned with billing-status.mjs and create-portal.mjs.
  // The live environment must use its matching live price ID and credentials.
  const proPriceId = (env("STRIPE_PRICE_PRO") || env("STRIPE_PRO_PRICE_ID") || "").trim();
  let subs = [];
  const subsResponse = await fetch(base + '/rest/v1/subscriptions?user_id=eq.' + encodeURIComponent(user.id) + '&select=status,price_id&order=updated_at.desc&limit=10', { headers, signal: AbortSignal.timeout(8000) });
  if (subsResponse.ok) {
    let result;
    try { result = await subsResponse.json(); } catch {
      return { error: 'We could not verify your subscription right now. Your free research allowance has not been used. Please retry shortly.', status: 503 };
    }
    if (!Array.isArray(result)) {
      return { error: 'We could not verify your subscription right now. Your free research allowance has not been used. Please retry shortly.', status: 503 };
    }
    subs = result;
  } else if (![400, 404, 406].includes(subsResponse.status)) {
    // A transient billing lookup failure must not silently treat a paid Pro
    // customer as free and consume their monthly allowance.
    console.error('Subscription lookup unavailable:', subsResponse.status);
    return { error: 'We could not verify your subscription right now. Your free research allowance has not been used. Please retry shortly.', status: 503 };
  }
  // Only the configured Pro Technician recurring price grants unlimited research.
  // Other active plans (including the lower-priced Driver plan) must not inherit Pro access.
  if (proPriceId && subs.some(row => ['active', 'trialing'].includes(row.status) && row.price_id === proPriceId)) {
    return { userId: user.id, isPro: true, remaining: null };
  }
  // Follow-ups clarify a completed report, skip web search, and do not reserve another monthly report.
  if (followUp) return { userId: user.id, isPro: false, remaining: null, isFollowUp: true };
  const reserveResponse = await fetch(base + '/rest/v1/rpc/reserve_research_usage', {
    method: 'POST',
    headers: { apikey: service, authorization: 'Bearer ' + service, 'content-type': 'application/json' },
    body: JSON.stringify({ p_user_id: user.id, p_monthly_limit: 3 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!reserveResponse.ok) throw new Error('Usage reservation failed; apply supabase/research-usage.sql before enabling AI research');
  const reservation = await reserveResponse.json();
  if (!reservation || reservation.allowed !== true || !Number.isSafeInteger(reservation.usage_id)) {
    return { error: 'You have used your 3 free AI research reports this month. Your allowance resets at the start of next month (UTC). Upgrade to Pro Technician for $29.99 CAD/month for continued research.', status: 402, remaining: 0 };
  }
  return { userId: user.id, isPro: false, remaining: Number(reservation.remaining), usageId: reservation.usage_id };
}
async function releaseResearchUsage(userId, usageId) {
  if (!userId || !Number.isSafeInteger(usageId)) return;
  const base = supabaseBase(); const key = (env("SUPABASE_SERVICE_ROLE_KEY") || '').trim();
  const response = await fetch(base + '/rest/v1/rpc/release_research_usage', {
    method: 'POST',
    headers: { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ p_user_id: userId, p_usage_id: usageId }),
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error('Usage reservation release failed');
}

async function lookupReviewedFitment(partNumber) {
  const cleanPart = clean(partNumber, 100);
  if (!cleanPart) return [];
  const base = supabaseBase();
  const anon = (env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_PUNISHABLE_KEY") || "").trim();
  if (!base || !anon) return [];
  const params = new URLSearchParams({
    select: "id,part_number,brand,part_name,vehicle_year_start,vehicle_year_end,make,model,trim,engine,drive_type,axle_position,abs_type,market,status,evidence,fitment_notes,reviewed_at,source_checked_at",
    part_number: "eq." + cleanPart,
    status: "in.(verified,cross_reference)",
    limit: "30",
  });
  try {
    const response = await fetch(base + "/rest/v1/fitment_applications?" + params.toString(), {
      headers: { apikey: anon, authorization: "Bearer " + anon },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    const rows = await response.json();
    if (!Array.isArray(rows)) return [];
    return rows.map(row => {
      const evidenceWarnings = [];
      if (!Array.isArray(row.evidence) || row.evidence.length === 0) {
        evidenceWarnings.push("No source evidence attached.");
      } else {
        const hasUsableEvidenceUrl = row.evidence.some((item) => {
          const candidate = typeof item === "string" ? item : item && typeof item.url === "string" ? item.url : item && typeof item.uri === "string" ? item.uri : "";
          if (!candidate) return false;
          try {
            const parsed = new URL(candidate.trim());
            return (parsed.protocol === "https:" || parsed.protocol === "http:") && Boolean(parsed.hostname);
          } catch {
            return false;
          }
        });
        if (!hasUsableEvidenceUrl) evidenceWarnings.push("Source evidence has no valid HTTP(S) URL to inspect.");
      }
      if (!row.reviewed_at) evidenceWarnings.push("Review timestamp missing.");
      if (!row.source_checked_at) evidenceWarnings.push("Source-check timestamp missing.");
      const now = Date.now();
      const reviewedAt = row.reviewed_at ? Date.parse(row.reviewed_at) : NaN;
      const sourceCheckedAt = row.source_checked_at ? Date.parse(row.source_checked_at) : NaN;
      const reviewedTimestampInvalid = Boolean(row.reviewed_at) && (!Number.isFinite(reviewedAt) || reviewedAt > now + 86400000);
      const sourceTimestampInvalid = Boolean(row.source_checked_at) && (!Number.isFinite(sourceCheckedAt) || sourceCheckedAt > now + 86400000);
      const sourceCheckAgeDays = Number.isFinite(sourceCheckedAt)
        ? Math.floor((now - sourceCheckedAt) / 86400000)
        : null;
      const sourceCheckStale = sourceCheckAgeDays !== null && sourceCheckAgeDays > 365;
      if (reviewedTimestampInvalid) evidenceWarnings.push("Review timestamp is invalid or more than 24 hours in the future.");
      if (sourceTimestampInvalid) evidenceWarnings.push("Source-check timestamp is invalid or more than 24 hours in the future.");
      if (sourceCheckStale) evidenceWarnings.push("Source evidence was last checked more than 12 months ago; revalidation is recommended.");
      const missingApplicationDetails = [
        row.vehicle_year_start == null || row.vehicle_year_end == null ? "complete year range" : null,
        !row.make ? "make" : null,
        !row.model ? "model" : null,
        !row.engine ? "engine" : null,
        !row.trim ? "trim" : null,
        !row.drive_type ? "drivetrain" : null,
        !row.axle_position ? "axle/position" : null,
        !row.abs_type ? "ABS/brake configuration" : null,
        !row.market ? "market/region" : null,
      ].filter(Boolean);
      const evidenceComplete = evidenceWarnings.length === 0 && missingApplicationDetails.length === 0;
      const confidence = sourceCheckStale
        ? "STALE SOURCE CHECK — REVALIDATION REQUIRED BEFORE RELYING ON THIS RECORD"
        : reviewedTimestampInvalid || sourceTimestampInvalid
          ? "INVALID EVIDENCE TIMESTAMP — REVALIDATE BEFORE RELYING ON THIS RECORD"
          : !evidenceComplete
          ? "INCOMPLETE CATALOG RECORD — NOT SUFFICIENT TO VERIFY FITMENT"
          : row.status === "cross_reference"
            ? "REVIEWED CROSS-REFERENCE — EXACT VEHICLE FITMENT NOT YET CONFIRMED"
            : "VERIFIED CATALOG RECORD — EXACT VEHICLE FITMENT NOT YET CONFIRMED";
      return {
        ...row,
        confidence,
        evidenceWarnings,
        missingApplicationDetails,
        fitmentCaution: "This catalog record alone does not prove fitment for the vehicle in the current question. Compare year, make, model, engine, trim, drivetrain, axle/position, ABS, and market restrictions before recommending it.",
      };
    });
  } catch {
    return [];
  }
}

function extractText(response) {
  // Accept the normal structured Responses output and the convenience
  // output_text field, so valid answers aren't discarded for shape differences.
  const parts = [];
  for (const item of response.output || []) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if ((part.type === "output_text" || part.type === "text") && typeof part.text === "string" && part.text.trim()) parts.push(part.text);
      }
    }
  }
  return parts.join("\n\n").trim() || (typeof response.output_text === "string" ? response.output_text.trim() : "");
}
function extractSources(response) {
  const sources = new Map();
  const addSource = (candidateUrl, candidateTitle) => {
    if (typeof candidateUrl !== "string") return;
    const url = candidateUrl.trim();
    if (!/^https?:\/\//i.test(url)) return;
    let parsed;
    try { parsed = new URL(url); } catch { return; }
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) return;
    const title = typeof candidateTitle === "string" && candidateTitle.trim()
      ? candidateTitle.trim().slice(0, 240)
      : url;
    if (!sources.has(url)) sources.set(url, { url, title });
  };
  for (const item of Array.isArray(response.output) ? response.output : []) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        for (const annotation of Array.isArray(part.annotations) ? part.annotations : []) {
          if (annotation.type === "url_citation") addSource(annotation.url, annotation.title);
        }
      }
    }
    if (item.type === "web_search_call") {
      const found = item.action?.sources || item.sources || [];
      for (const source of Array.isArray(found) ? found : []) {
        addSource(source?.url || source?.uri, source?.title);
      }
    }
  }
  return [...sources.values()].slice(0, 12);
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST to submit a research question." }, 405);
  if (!env("OPENAI_API_KEY")) return json({ error: "The server is missing OPENAI_API_KEY. Add it in Netlify environment variables and redeploy." }, 503);
  let body;
  try { body = await req.json(); } catch { return json({ error: "The request body must be valid JSON." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "The request body must be a JSON object." }, 400);
  }
  const asset = clean(body.asset, 240);
  const serial = clean(body.serial, 100);
  const topic = clean(body.topic, 40) || "general";
  const question = clean(body.question, MAX_FIELD);
  const userLocation = clean(body.location, 180);
  const userCoordinates = clean(body.coordinates, 80);
  const locationContext = userLocation
    ? `User-approved location for nearby requests: ${userLocation}${userCoordinates ? ` (approximate coordinates: ${userCoordinates})` : ""}. Use this as the local search area when the question asks for nearby businesses or services; prioritize Canadian results and CAD where relevant.`
    : "No current location has been shared. If the user asks for nearby options, do not assume a US ZIP code or silently invent a location. Ask for a Canadian city/province or suggest the Use current location control.";

  const symptoms = clean(body.symptoms, 1200);
  const dtcs = clean(body.dtcs || body.faultCodes, 800);
  const freezeFrame = clean(body.freezeFrame, 1200);
  const liveData = clean(body.liveData, 1800);
  const testsPerformed = clean(body.testsPerformed, 1200);
  const repairsAttempted = clean(body.repairsAttempted, 800);
  // Extract only code-shaped tokens for cross-code reasoning; never infer code status.
  const detectedDtcCodes = [...new Set([question, dtcs, symptoms, freezeFrame, liveData, testsPerformed, repairsAttempted].join(" ").match(/\b[PCBU][0-9A-F]{4}\b/gi) || [])]
    .map(code => code.toUpperCase())
    .slice(0, 20);
  // Heuristic flags prompt caution; they are not a diagnosis or proof of danger.
  const safetyText = [question, symptoms, dtcs, liveData, testsPerformed].join(" ").toLowerCase();
  const safetyFlags = [
    { flag: "braking", pattern: /brake pedal (?:goes to floor|soft|spongy)|brake failure|no brakes|brake fluid leak|brakes? (?:not working|failed)/ },
    { flag: "steering or vehicle control", pattern: /steering (?:failed|locked|loss|failure)|lost steering|wheel (?:about to come off|loose)|control arm (?:broken|separated)/ },
    { flag: "tire or wheel failure", pattern: /tire (?:blowout|blown|sidewall bulge|cords exposed|separated tread)|tyre (?:blowout|blown|sidewall bulge|cords exposed|separated tread)|wheel (?:studs? broken|lug nuts? missing|coming off)/ },
    { flag: "airbag or supplemental restraint system", pattern: /airbag (?:deployed unexpectedly|light on with crash|not working|fault)|srs (?:fault|warning|not working)|seat belt pretensioner (?:fault|deployed)/ },
    { flag: "fire, smoke, or fuel leak", pattern: /fuel leak|gasoline leak|diesel leak|smoke from (?:engine|vehicle|wiring)|electrical fire|flames|burning wiring/ },
    { flag: "exhaust intrusion or carbon-monoxide exposure", pattern: /carbon monoxide|co poisoning|exhaust fumes? (?:in|inside) (?:the )?cabin|exhaust smell inside|fumes entering (?:the )?(?:cab|cabin|operator compartment)/ },
    { flag: "unintended acceleration or throttle-control fault", pattern: /unintended acceleration|vehicle accelerat(?:es|ing) without (?:input|command)|throttle stuck open|engine will not return to idle|runaway engine/ },
    { flag: "severe overheating", pattern: /overheating|temperature gauge (?:in red|pegged)|coolant boiling|coolant spraying/ },
    { flag: "high-voltage electric vehicle", pattern: /high[- ]voltage|orange cable|ev battery pack|hybrid battery|electric vehicle battery/ },
    { flag: "battery thermal runaway or damaged traction battery", pattern: /battery (?:thermal runaway|swelling|swollen|venting|hissing)|ev battery (?:pack )?(?:is )?(?:smoking|swollen|overheating)|lithium[- ]ion battery (?:is )?(?:smoking|swelling|venting)|traction battery (?:is )?(?:damaged|smoking|overheating)/ },
    { flag: "pressurized hydraulic or injection hazard", pattern: /hydraulic (?:hose|line) (?:burst|ruptured|leaking)|pinhole leak|high[- ]pressure (?:fuel|hydraulic)|diesel injection injury/ },
  ].filter(item => item.pattern.test(safetyText)).map(item => item.flag);
  const followUp = body.followUp === true;
  const previousAnswer = clean(body.previousAnswer, 8000);
  // Vision and document inputs use bounded data URLs; never fetch client-supplied URLs.
  const rawImages = Array.isArray(body.images) ? body.images : [];
  if (rawImages.length > 4) return json({ error: "Attach up to 4 images per research question." }, 400);
  const images = [];
  for (const rawImage of rawImages) {
    if (typeof rawImage !== "string" || rawImage.length > 5_500_000 ||
        !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(rawImage)) {
      return json({ error: "One of the images is invalid or too large. Use JPG, PNG, or WebP images under about 4 MB each." }, 400);
    }
    images.push(rawImage);
  }
  const rawFiles = Array.isArray(body.files) ? body.files : [];
  if (rawFiles.length > 2) return json({ error: "Attach up to 2 files per research question." }, 400);
  const allowedMime = new Set(["application/pdf", "text/plain", "text/markdown", "text/csv", "application/json", "application/xml"]);
  const files = []; let totalFileBytes = 0;
  for (const rawFile of rawFiles) {
    if (!rawFile || typeof rawFile.name !== "string" || typeof rawFile.mime !== "string" || !allowedMime.has(rawFile.mime)) return json({ error: "One of the attached files has an unsupported type." }, 400);
    const name = clean(rawFile.name, 160);
    if (rawFile.mime === "application/pdf") {
      if (!name.toLowerCase().endsWith(".pdf") || typeof rawFile.data !== "string") return json({ error: "The PDF attachment is invalid." }, 400);
      const prefix = "data:application/pdf;base64,";
      if (!rawFile.data.startsWith(prefix) || !/^[A-Za-z0-9+/=]+$/.test(rawFile.data.slice(prefix.length)) || rawFile.data.length > 2_100_000) return json({ error: "Each PDF must be valid and under about 1.5 MB." }, 400);
      totalFileBytes += rawFile.data.length;
      files.push({ name, mime: rawFile.mime, data: rawFile.data });
    } else {
      if (typeof rawFile.text !== "string" || rawFile.text.length > 120000) return json({ error: "A text attachment is invalid or too large." }, 400);
      totalFileBytes += rawFile.text.length;
      files.push({ name, mime: rawFile.mime, text: rawFile.text });
    }
    if (totalFileBytes > 3_800_000) return json({ error: "The attached files are too large to send together. Remove a file and try again." }, 400);
  }
  if (followUp && (!question || !previousAnswer)) return json({ error: "A follow-up needs a question and the previous research report." }, 400);
  if (!asset && !question) return json({ error: "Enter a vehicle/equipment name or a question." }, 400);

  if (tooManyRequests(getClientKey(req))) return json({ error: "Too many research requests from this connection. Wait a few minutes and try again." }, 429);
  let access;
  try { access = await getResearchAccess(req, followUp); } catch (e) {
    console.error("Research access lookup failed:", e?.message || "unknown");
    const detail = String(e?.message || "");
    if (detail.includes("apply supabase/research-usage.sql")) {
      return json({ error: "AI research setup is incomplete: the Supabase research-usage migration is missing. Run supabase/research-usage.sql in the connected Supabase SQL Editor, then retry." }, 503);
    }
    if (detail.includes("Subscription lookup failed")) {
      return json({ error: "AI research setup is incomplete: the public.subscriptions table is missing or inaccessible. Run supabase/subscriptions.sql in the connected Supabase SQL Editor, then retry." }, 503);
    }
    if (detail.includes("Usage reservation failed")) {
      return json({ error: "AI research setup is incomplete: the research quota function is missing or inaccessible. Run supabase/research-usage.sql in the connected Supabase SQL Editor, then retry." }, 503);
    }
    return json({ error: "Could not verify your AI research allowance. Check the Supabase subscriptions and research-usage migrations and the Supabase logs." }, 503);
  }
  if (access.error) return json({ error: access.error, remaining: access.remaining ?? null }, access.status);
  // Infer intent from the actual request so the assistant works as a general shop partner,
  // not just a diagnostic form. Fresh commercial and technical facts need source-backed search.
  const requestText = [asset, serial, question, symptoms, dtcs, freezeFrame, liveData, testsPerformed, repairsAttempted, userLocation].join(" ").toLowerCase();
  const intentPatterns = [
    { intent: "parts sourcing and purchasing", pattern: /\b(cheapest|lowest price|best price|price compare|buy|where (?:can i|to) (?:get|buy|find)|supplier|retailer|in stock|availability|available now|fastest|quickest|deliver(?:y|ed)?|shipping|ship to|order|part number|oem number|aftermarket|cross.?reference|tire|tyre|what size)\b/ },
    { intent: "installation or service procedure", pattern: /\b(install|installation|remove and replace|replacement procedure|how to fit|mount(?:ing)?|setup|set up|vehicle lift|two.?post lift|four.?post lift|alignment|service procedure)\b/ },
    { intent: "technical specification or component location", pattern: /\b(torque spec|torque specification|torque value|fluid capacity|oil capacity|fluid type|specification|specs|dimensions|measurement|pressure spec|wiring diagram|pinout|fuse location|where is the|location of|what type|fitment|compatible|recall|service bulletin|tsb|service manual)\b/ },
    { intent: "diagnosis and troubleshooting", pattern: /\b(diagnos|troubleshoot|fault|code p[0-9a-f]{4}|dtc|misfire|no.?start|won.t start|leak|noise|overheat|symptom|test result|live data)\b/ },
  ];
  const inferredIntent = intentPatterns.find(item => item.pattern.test(requestText))?.intent || "general question and shop assistance";
  const webSearchSetting = env("TORQWISE_ENABLE_WEB_SEARCH").toLowerCase();
  const evidenceTopics = new Set(["parts", "service", "diagram", "spec", "bulletin"]);
  const needsCurrentEvidence = /\b(cheapest|lowest price|best price|buy|supplier|retailer|in stock|availability|available now|fastest|quickest|deliver(?:y|ed)?|shipping|ship to|price|part number|oem number|tire|tyre|install|installation|torque spec|torque specification|fluid capacity|specification|wiring diagram|pinout|fuse location|where is the|location of|fitment|compatible|recall|service bulletin|tsb|service manual|manual)\b/.test(requestText);
  const useWebSearch = webSearchSetting === "true" ||
    (!["false", "0", "off"].includes(webSearchSetting) && (evidenceTopics.has(topic) || needsCurrentEvidence));
  const deepReasoningTopics = new Set(["diagnostic", "parts", "service", "diagram", "spec", "bulletin"]);
  const topicNames = {
    diagnostic: "diagnostic troubleshooting and test sequence",
    service: "service procedures and manual availability",
    diagram: "wiring diagrams, electrical schematics or hydraulic diagrams",
    spec: "torque, fluid, capacity and technical specifications",
    parts: "parts identification, fitment and catalog research",
    bulletin: "recalls, technical service bulletins and campaigns",
    general: "general technical research",
  };
  const partCandidate = topic === "parts" ? (question.match(/\b[A-Z]{1,8}[- ]?\d{3,}[A-Z0-9-]*\b/i)?.[0] || "") : "";
  const fitmentMatches = partCandidate ? await lookupReviewedFitment(partCandidate) : [];
  const input = followUp
    ? [
        `Asset / vehicle / equipment: ${asset || "Not provided"}`,
        `VIN / serial / PIN: ${serial || "Not provided"}`,
        locationContext,
        `Research category: ${topicNames[topic] || topicNames.general}`,
        `Inferred task intent: ${inferredIntent}. Answer the actual user request even if the selected category is imperfect.`,
        `Previous TORQWISE report (context only; may contain unverified claims):\n${previousAnswer}`,
        ...(detectedDtcCodes.length ? [`DTC tokens detected in the supplied text (code-shaped tokens only; status not inferred): ${detectedDtcCodes.join(", ")}. Analyze relationships across codes rather than treating each in isolation.`] : []),
        ...(safetyFlags.length ? [`Potential safety-critical language detected (heuristic only, not a diagnosis): ${safetyFlags.join(", ")}. Address immediate safety first; stop operation if continued use could cause harm, avoid hazardous testing, and use qualified assistance or the applicable OEM safety procedure.${safetyFlags.some(flag => ["braking", "steering or vehicle control", "tire or wheel failure"].includes(flag)) ? " If the report involves loss of braking, steering control, or a wheel/tire that may fail, do not road-test or drive the vehicle; secure the area and arrange qualified inspection or recovery." : ""}${safetyFlags.includes("battery thermal runaway or damaged traction battery") ? " If an EV or lithium-ion traction battery is smoking, venting, swelling, or heating abnormally, do not charge, restart, touch, or attempt to open it; move people away and contact emergency services if there is active smoke, fire, or immediate danger. Follow the manufacturer emergency response procedure." : ""}`] : []),
        ...(symptoms ? [`Technician-observed symptoms: ${symptoms}`] : []),
        ...(dtcs ? [`Diagnostic trouble codes and status: ${dtcs}`] : []),
        ...(freezeFrame ? [`Freeze-frame / snapshot data: ${freezeFrame}`] : []),
        ...(liveData ? [`Scan-tool live data and units: ${liveData}`] : []),
        ...(testsPerformed ? [`Tests already performed and measured results: ${testsPerformed}`] : []),
        ...(repairsAttempted ? [`Repairs or parts already tried: ${repairsAttempted}`] : []),
        `Technician follow-up question: ${question}`,
      ].join("\n\n")
    : [
        `Asset / vehicle / equipment: ${asset || "Not provided"}`,
        `VIN / serial / PIN: ${serial || "Not provided"}`,
        locationContext,
        `Research category selected: ${topicNames[topic] || topicNames.general}`,
        `Inferred task intent: ${inferredIntent}. Answer the actual user request even if the selected category is imperfect.`,
        `Question / symptoms / code / part: ${question || "Please provide an initial research overview based on the available context."}`,
        ...(detectedDtcCodes.length ? [`DTC tokens detected in the supplied text (code-shaped tokens only; status not inferred): ${detectedDtcCodes.join(", ")}. Analyze relationships across codes rather than treating each in isolation.`] : []),
        ...(safetyFlags.length ? [`Potential safety-critical language detected (heuristic only, not a diagnosis): ${safetyFlags.join(", ")}. Address immediate safety first; stop operation if continued use could cause harm, avoid hazardous testing, and use qualified assistance or the applicable OEM safety procedure.${safetyFlags.some(flag => ["braking", "steering or vehicle control", "tire or wheel failure"].includes(flag)) ? " If the report involves loss of braking, steering control, or a wheel/tire that may fail, do not road-test or drive the vehicle; secure the area and arrange qualified inspection or recovery." : ""}${safetyFlags.includes("battery thermal runaway or damaged traction battery") ? " If an EV or lithium-ion traction battery is smoking, venting, swelling, or heating abnormally, do not charge, restart, touch, or attempt to open it; move people away and contact emergency services if there is active smoke, fire, or immediate danger. Follow the manufacturer emergency response procedure." : ""}`] : []),
        ...(symptoms ? [`Technician-observed symptoms: ${symptoms}`] : []),
        ...(dtcs ? [`Diagnostic trouble codes (preserve exact codes and status): ${dtcs}`] : []),
        ...(freezeFrame ? [`Freeze-frame / snapshot data: ${freezeFrame}`] : []),
        ...(liveData ? [`Scan-tool live data and units: ${liveData}`] : []),
        ...(testsPerformed ? [`Tests already performed and measured results: ${testsPerformed}`] : []),
        ...(repairsAttempted ? [`Repairs or parts already tried: ${repairsAttempted}`] : []),
        ...(fitmentMatches.length ? [`TORQWISE reviewed first-party fitment catalog records (use exact status and restrictions; do not overstate):\n${JSON.stringify(fitmentMatches)}`] : []),
      ].join("\n");
  const fileText = files.filter(file => file.text).map(file => `Attached text file: ${file.name}\n${file.text}`).join("\n\n");
  const requestInput = images.length || files.some(file => file.data)
    ? [{ role: "user", content: [
        { type: "input_text", text: input + (fileText ? "\n\n" + fileText : "") + (images.length ? "\n\nAnalyze the attached workshop images as evidence. Describe only what is visibly supported, identify uncertainty, and relate observations to the vehicle/equipment context. Do not claim a hidden component has failed from appearance alone." : "") + (files.length ? "\n\nReview the attached file(s) as user-provided evidence. Identify relevant specifications, codes, procedures, measurements, tables, or diagrams. Refer to the filename when discussing its contents and state when a detail is not present or legible." : "") },
        ...images.map(image_url => ({ type: "input_image", image_url, detail: "high" })),
        ...files.filter(file => file.data).map(file => ({ type: "input_file", filename: file.name, file_data: file.data })),
      ] }]
    : (fileText ? input + "\n\n" + fileText : input);
  const instructions = `You are TORQWISE, a mechanic-specific conversational AI assistant for automotive, diesel, and heavy-equipment technicians. Work like an experienced diagnostic partner: understand the actual question, interpret supplied images and measurements, carry useful context forward, explain the reasoning in practical shop language, and adapt detail to the user's experience. Give the most useful answer possible immediately; do not pad the report with generic safety disclaimers or repeat the question. When an image is supplied, describe visible evidence first, distinguish observation from inference, identify what cannot be determined from the image, and connect it to the next useful inspection or test. If one missing detail materially changes the diagnosis, ask one focused follow-up rather than dumping a long questionnaire. Do not pretend to have eyes on hidden parts, live scan data, or a vehicle you cannot inspect.

Answer style:
- Start with the direct answer. Sound like a sharp, practical human shop partner: natural, clear, and confident where evidence supports it. Avoid rigid templates when they do not fit.
- For parts sourcing, compare exact matching options, prefer Canadian suppliers for a Canadian buyer, show seller, exact item/part number, price/currency, source link, and available stock/delivery evidence. Identify the lowest listed price and the fastest credible option separately. Never claim cheapest/fastest without enough evidence. Separate item price from shipping/tax and say when stock or delivery cannot be confirmed. Ask for postal code or vehicle details only when they materially affect fitment, pickup, or delivery.
- For technical specs, provide exact values and units only when reliable application-specific evidence supports them. State the relevant engine, transmission, model, year, location, temperature or other conditions when applicable. If the application is ambiguous, ask one focused question.
- For installation questions, give practical ordered steps, required tools/equipment, model-specific checks, key hazards, and source/manual links when available. Never invent safety-critical lift anchor, concrete, torque or capacity requirements.
- For diagnosis, explain what the evidence means, rank plausible causes, and recommend the single most informative next test with normal/abnormal outcomes.
- For images, describe visible evidence before inference. For general questions, answer conversationally without forcing a diagnostic checklist.
- Make useful progress with available information. Ask only for missing details that materially change the answer.

Use the provided context, technician observations, measurements, codes, prior findings, and first-party fitment records. Interpret supplied data directly and update hypotheses rather than restarting with generic checklists. Distinguish confirmed facts, likely explanations, and unknowns. Never invent part numbers, OEM specifications, torque values, wiring details, service bulletins, citations, or source links. For an unfamiliar part number, preserve the exact query, normalize spacing/hyphens/case for alternate searches, identify the component from credible catalogs, then search supplier listings; an internal-catalog miss is not evidence that the part is unknown. Compare distinct offers by condition, fitment evidence, currency and total cost when available; mark unavailable fields honestly and sort cheapest first only within comparable groups. Do not claim live web research or source verification unless actual source results are present. When source results are returned, connect key claims to the relevant source and prefer manufacturer/OEM or primary technical sources. If sources conflict, explain the conflict instead of silently choosing one. For prices, state the listed currency and avoid claiming a delivered total unless shipping and taxes are included. For fitment, state VERIFIED MATCH only with exact credible application evidence; use HIGH-CONFIDENCE CROSS-REFERENCE only when independent credible catalog evidence agrees; otherwise state NOT YET VERIFIED. Still give useful known guidance and the most specific next step rather than only asking for a VIN. Never recommend replacing a component without evidence supporting its failure. Preserve exact DTC status and freeze-frame; test before replacing parts. Flag critical hazards concisely. For repair and parts questions, be decisive about what is supported, but transparent about uncertainty. This is research support, not a confirmed diagnosis.`;

  const requestInstructions = followUp
    ? "You are TORQWISE answering a follow-up about a previous automotive or heavy-equipment report. Treat the prior report as context, not proof. Start from the new evidence and the previous confirmed measurements, not from the previous answer's conclusions. Separate confirmed observations from hypotheses, keep a short ranked differential, and explain how the new information changes that ranking. Recommend the single most informative safe next test where possible, with normal/abnormal branches and what each result would imply. If the user supplies a test result, interpret that result directly before suggesting more checks. Correct or qualify unsupported prior claims, especially part fitment. Never say a part fits a specific year/model unless supplied context verifies it. State the precise missing detail or specification when it blocks a conclusion. Do not invent specifications, procedures, or source links. Keep the response focused and do not repeat the entire earlier checklist."
    : instructions + " For parts questions, never infer fitment from a part number alone. Identify what source supports each claimed application, distinguish seller cross-reference listings from OEM-confirmed fitment, and explicitly say when reliable fitment evidence is unavailable.";
  let upstream;
  let payload;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "authorization": `Bearer ${env("OPENAI_API_KEY")}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: env("OPENAI_MODEL") || "gpt-5-mini",
        instructions: requestInstructions,
        input: requestInput,
        // Keep the synchronous Netlify request within its execution window. A separate web-search tool call was repeatedly exceeding the hosting timeout before any useful answer could be returned. The model must still clearly label unverified fitment/specifications and never invent citations.
        ...(useWebSearch ? { tools: [{ type: "web_search", search_context_size: evidenceTopics.has(topic) ? "medium" : "low" }] } : {}),
        max_output_tokens: followUp ? 1200 : (deepReasoningTopics.has(topic) || inferredIntent !== "general question and shop assistance" ? 1900 : 1600),
        reasoning: { effort: deepReasoningTopics.has(topic) || inferredIntent !== "general question and shop assistance" ? "medium" : "low" },
        store: false,
      }),
      // Allow technical web research more time, while preserving room for a fallback.
      signal: AbortSignal.timeout(13000),
    });
  } catch (err) {
    console.error("TORQWISE OpenAI request failed:", err?.name || "network error");
    // Web search can exceed the function's useful response window. On timeout,
    // try a bounded no-web-search response rather than immediately returning 504.
    if (err?.name === "TimeoutError") {
      try {
        const retry = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "authorization": `Bearer ${env("OPENAI_API_KEY")}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: env("OPENAI_MODEL") || "gpt-5-mini",
            instructions: requestInstructions + " Web research timed out. Give the best concise evidence-led answer possible from available knowledge, clearly label anything unverified, and never invent citations, part numbers, or fitment.",
            input: requestInput,
            max_output_tokens: followUp ? 900 : 1400,
            store: false,
          }),
          // A concise no-search fallback should finish within the remaining function budget.
          signal: AbortSignal.timeout(8000),
        });
        let retryPayload = {};
        try { retryPayload = await retry.json(); } catch {}
        const retryAnswer = retry.ok ? extractText(retryPayload) : "";
        if (retryAnswer) {
          payload = retryPayload;
          upstream = null;
          // Continue through the normal answer/source handling below.
        } else {
          try { if (!followUp) await releaseResearchUsage(access.userId, access.usageId); } catch (releaseError) { console.error("Research quota release failed:", releaseError?.message || "unknown"); }
          return json({ error: "Web research timed out and the AI could not complete a concise fallback. Please retry with a narrower question; your report allowance was returned." }, 504);
        }
      } catch (retryError) {
        console.error("TORQWISE timeout fallback failed:", retryError?.name || "network error");
        try { if (!followUp) await releaseResearchUsage(access.userId, access.usageId); } catch (releaseError) { console.error("Research quota release failed:", releaseError?.message || "unknown"); }
        return json({ error: "AI research timed out. Please retry with a narrower question; your report allowance was returned." }, 504);
      }
    } else {
      try { if (!followUp) await releaseResearchUsage(access.userId, access.usageId); } catch (releaseError) { console.error("Research quota release failed:", releaseError?.message || "unknown"); }
      return json({ error: "Could not reach the AI research service. Please retry shortly." }, 502);
    }
  }
  // Read the upstream body once as text first. Some upstream/proxy failures return
  // non-JSON bodies; parsing JSON before checking HTTP status hid the real failure
  // behind the generic "unreadable response" message.
  if (!payload && upstream) {
    let rawBody = "";
    try { rawBody = await upstream.text(); } catch {}
    if (rawBody) {
      try { payload = JSON.parse(rawBody); }
      catch {
        console.error("TORQWISE OpenAI returned a non-JSON body:", upstream.status, rawBody.slice(0, 240));
        payload = null;
      }
    }
  }
  if (upstream && !upstream.ok) {
    try { if (!followUp) await releaseResearchUsage(access.userId, access.usageId); } catch (releaseError) { console.error("Research quota release failed:", releaseError?.message || "unknown"); }
    console.error("TORQWISE OpenAI API error:", upstream.status, payload?.error?.code || "non_json_or_unknown");
    if (upstream.status === 401) return json({ error: "The server rejected the API key. Check OPENAI_API_KEY in Netlify; never paste it into the website." }, 502);
    if (upstream.status === 429) return json({ error: "The AI service is rate-limited or out of available API credit. Check API billing and usage." }, 429);
    if (upstream.status >= 500) return json({ error: "The AI service is temporarily unavailable. Please retry shortly." }, 502);
    return json({ error: "The AI service rejected this request. Check the model configuration and research request, then retry." }, 502);
  }
  if (!payload) {
    // A proxy/CDN can occasionally return a non-JSON body even when the
    // upstream request technically completes. Do not stop here: make one
    // independent, bounded retry without web search before failing the report.
    console.warn("TORQWISE received a non-JSON AI response; retrying without web search.");
    try {
      const retry = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "authorization": `Bearer ${env("OPENAI_API_KEY")}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: env("OPENAI_MODEL") || "gpt-5-mini",
          instructions: requestInstructions + " The previous request returned an unreadable response. Provide a concise evidence-led answer, clearly label unknowns, and never invent citations, part numbers, or fitment.",
          input: requestInput,
          max_output_tokens: followUp ? 900 : 1400,
          store: false,
        }),
        signal: AbortSignal.timeout(10000),
      });
      let retryPayload = {};
      try { retryPayload = await retry.json(); } catch {}
      const retryAnswer = retry.ok ? extractText(retryPayload) : "";
      if (retryAnswer) {
        payload = retryPayload;
      } else {
        console.error("TORQWISE no-web fallback failed:", retry.status, retryPayload?.error?.code || "unreadable");
        try { if (!followUp) await releaseResearchUsage(access.userId, access.usageId); } catch (releaseError) { console.error("Research quota release failed:", releaseError?.message || "unknown"); }
        return json({ error: retry.status === 429
          ? "The AI service is rate-limited or out of available API credit. Check API billing and usage."
          : "TORQWISE could not get a readable answer from the AI service after retrying. Check OpenAI API usage and the Netlify research function logs." }, retry.status === 429 ? 429 : 502);
      }
    } catch (retryError) {
      console.error("TORQWISE non-JSON fallback failed:", retryError?.name || "network error");
      try { if (!followUp) await releaseResearchUsage(access.userId, access.usageId); } catch (releaseError) { console.error("Research quota release failed:", releaseError?.message || "unknown"); }
      return json({ error: "TORQWISE could not reach the AI service after retrying. Please check OpenAI API status and Netlify function logs." }, 502);
    }
  }
  let answer = extractText(payload);
  // A successful Responses API call can occasionally finish without a text block.
  // Retry once without web search to recover from transient tool/completion issues.
  if (!answer) {
    console.warn("TORQWISE research returned no text; attempting one concise fallback response.");
    try {
      const retry = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "authorization": `Bearer ${env("OPENAI_API_KEY")}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: env("OPENAI_MODEL") || "gpt-5-mini",
          instructions: requestInstructions + " Return a useful, concise answer even if some details cannot be verified. Explicitly label unknowns; do not invent facts or sources.",
          input: requestInput,
          max_output_tokens: 2200,
          store: false,
        }),
        signal: AbortSignal.timeout(12000),
      });
      let retryPayload = {};
      try { retryPayload = await retry.json(); } catch {}
      if (retry.ok) {
        const retryAnswer = extractText(retryPayload);
        if (retryAnswer) {
          answer = retryAnswer;
          payload = retryPayload;
        }
      } else {
        console.error("TORQWISE fallback research request failed:", retry.status, retryPayload?.error?.code || "unknown");
      }
    } catch (retryError) {
      console.error("TORQWISE fallback research request failed:", retryError?.name || "network error");
    }
  }
  if (!answer) {
    try { if (!followUp) await releaseResearchUsage(access.userId, access.usageId); } catch (releaseError) { console.error("Research quota release failed:", releaseError?.message || "unknown"); }
    return json({ error: "The AI service could not produce a text answer after one retry. Your question was not answered; please try again shortly or narrow the request." }, 502);
  }
  return json({ answer, sources: extractSources(payload), fitmentMatches, model: payload.model || env("OPENAI_MODEL") || "gpt-5-mini", isPro: access.isPro, followUp, remaining: access.isPro ? null : access.remaining });
};
