function supabaseBase() {
  const raw = (process.env.SUPABASE_URL || "https://wnvmtjimldleqfjuuprl.supabase.co").trim().replace(/\/+$/, "");
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
  const anon = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUNISHABLE_KEY || '').trim();
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !anon || !service) return { error: 'Research accounts are not configured yet.', status: 503 };
  const token = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: 'Sign in to use AI research. Free accounts include 3 reports per month.', status: 401 };
  const userResponse = await fetch(base + '/auth/v1/user', { headers: { apikey: anon, authorization: 'Bearer ' + token } });
  if (!userResponse.ok) return { error: 'Your session expired. Please sign in again.', status: 401 };
  let user;
  try { user = await userResponse.json(); } catch { return { error: 'Your session could not be verified. Please sign in again.', status: 401 }; }
  if (!user || typeof user.id !== 'string' || !user.id) return { error: 'Your session could not be verified. Please sign in again.', status: 401 };
  const headers = { apikey: service, authorization: 'Bearer ' + service };
  // Billing is optional for free-tier research. If the subscriptions table has
  // not been installed yet, fail closed to the free tier rather than blocking
  // every signed-in user. Unexpected server errors still fail safely.
  let subs = [];
  const subsResponse = await fetch(base + '/rest/v1/subscriptions?user_id=eq.' + encodeURIComponent(user.id) + '&select=status&order=updated_at.desc&limit=1', { headers });
  if (subsResponse.ok) {
    const result = await subsResponse.json();
    if (Array.isArray(result)) subs = result;
  } else if (![400, 404, 406].includes(subsResponse.status)) {
    console.error('Subscription lookup unavailable; refusing to assume Pro:', subsResponse.status);
  }
  if (subs.some(row => ['active', 'trialing'].includes(row.status))) return { userId: user.id, isPro: true, remaining: null };
  // Follow-ups clarify a completed report, skip web search, and do not reserve another monthly report.
  if (followUp) return { userId: user.id, isPro: false, remaining: null, isFollowUp: true };
  const reserveResponse = await fetch(base + '/rest/v1/rpc/reserve_research_usage', {
    method: 'POST',
    headers: { apikey: service, authorization: 'Bearer ' + service, 'content-type': 'application/json' },
    body: JSON.stringify({ p_user_id: user.id, p_monthly_limit: 3 }),
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
  const base = supabaseBase(); const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const response = await fetch(base + '/rest/v1/rpc/release_research_usage', {
    method: 'POST',
    headers: { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ p_user_id: userId, p_usage_id: usageId }),
  });
  if (!response.ok) throw new Error('Usage reservation release failed');
}

async function lookupReviewedFitment(partNumber) {
  const cleanPart = clean(partNumber, 100);
  if (!cleanPart) return [];
  const base = supabaseBase();
  const anon = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUNISHABLE_KEY || "").trim();
  if (!base || !anon) return [];
  const params = new URLSearchParams({
    select: "id,part_number,brand,part_name,vehicle_year_start,vehicle_year_end,make,model,trim,engine,drive_type,axle_position,abs_type,market,status,evidence,fitment_notes,reviewed_at,source_checked_at",
    part_number: "ilike." + cleanPart.replace(/[%,]/g, ""),
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
    return rows.map(row => ({
      ...row,
      confidence: row.status === "verified" ? "VERIFIED MATCH" : "HIGH-CONFIDENCE CROSS-REFERENCE",
    }));
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
  for (const item of response.output || []) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        for (const a of part.annotations || []) {
          if (a.type === "url_citation" && a.url) sources.set(a.url, { url: a.url, title: a.title || a.url });
        }
      }
    }
    if (item.type === "web_search_call") {
      const found = item.action?.sources || item.sources || [];
      for (const s of found) {
        const url = s.url || s.uri;
        if (url && /^https?:\/\//i.test(url)) sources.set(url, { url, title: s.title || url });
      }
    }
  }
  return [...sources.values()].slice(0, 12);
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST to submit a research question." }, 405);
  if (!process.env.OPENAI_API_KEY) return json({ error: "The server is missing OPENAI_API_KEY. Add it in Netlify environment variables and redeploy." }, 503);
  let body;
  try { body = await req.json(); } catch { return json({ error: "The request body must be valid JSON." }, 400); }
  const asset = clean(body.asset, 240);
  const serial = clean(body.serial, 100);
  const topic = clean(body.topic, 40) || "general";
  const question = clean(body.question, MAX_FIELD);
  const symptoms = clean(body.symptoms, 1200);
  const dtcs = clean(body.dtcs || body.faultCodes, 800);
  const freezeFrame = clean(body.freezeFrame, 1200);
  const liveData = clean(body.liveData, 1800);
  const testsPerformed = clean(body.testsPerformed, 1200);
  const repairsAttempted = clean(body.repairsAttempted, 800);
  const followUp = body.followUp === true;
  const previousAnswer = clean(body.previousAnswer, 8000);
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
    ? [`Asset / vehicle / equipment: ${asset || "Not provided"}`, `VIN / serial / PIN: ${serial || "Not provided"}`, `Research category: ${topicNames[topic] || topicNames.general}`, `Previous TORQWISE report (context only; may contain unverified claims):\n${previousAnswer}`, `Technician follow-up question: ${question}`].join("\n\n")
    : [
        `Asset / vehicle / equipment: ${asset || "Not provided"}`,
        `VIN / serial / PIN: ${serial || "Not provided"}`,
        `Research category: ${topicNames[topic] || topicNames.general}`,
        `Question / symptoms / code / part: ${question || "Please provide an initial research overview based on the available context."}`,
        ...(symptoms ? [`Technician-observed symptoms: ${symptoms}`] : []),
        ...(dtcs ? [`Diagnostic trouble codes (preserve exact codes and status): ${dtcs}`] : []),
        ...(freezeFrame ? [`Freeze-frame / snapshot data: ${freezeFrame}`] : []),
        ...(liveData ? [`Scan-tool live data and units: ${liveData}`] : []),
        ...(testsPerformed ? [`Tests already performed and measured results: ${testsPerformed}`] : []),
        ...(repairsAttempted ? [`Repairs or parts already tried: ${repairsAttempted}`] : []),
        ...(fitmentMatches.length ? [`TORQWISE reviewed first-party fitment catalog records (use exact status and restrictions; do not overstate):\n${JSON.stringify(fitmentMatches)}`] : []),
      ].join("\n");
  const instructions = `You are TORQWISE, a careful automotive and heavy-equipment research assistant for technicians. Use web search to research the exact machine or vehicle and prioritize OEM/manufacturer sources, government recall databases, reputable technical sources, and clearly identified parts catalogs. Do not claim access to paid OEM service databases, proprietary wiring diagrams, or complete catalogs unless a source genuinely provides them. Never invent torque values, capacities, pinouts, wire colours, part numbers, bulletins, procedures, or citations. If exact year/model/engine/serial applicability cannot be confirmed, clearly say what remains unverified, but do not stop at asking for details: always give useful general first steps that are safe without the missing details, then ask only the most important follow-up questions. For vague symptom descriptions, infer likely systems from plain language and state that this is a preliminary interpretation. Give a short decision tree starting with simple observations before specialized testing. If the wording could describe multiple systems, briefly list the likely interpretations and ask which matches. Distinguish verified facts, likely causes, and hypotheses. For diagnosis, give a safe, evidence-led sequence: preserve codes/freeze-frame, check basics, test before replacing parts, and state what each test proves. Flag hazards and when the correct OEM procedure or professional equipment is required. For parts and fitment, lead with one explicit status: VERIFIED MATCH, HIGH-CONFIDENCE CROSS-REFERENCE, or NOT YET VERIFIED. Use VERIFIED MATCH only when credible source evidence explicitly supports the exact supplied year/make/model/engine/drive/axle/ABS/options. Use HIGH-CONFIDENCE CROSS-REFERENCE only when multiple credible independent catalog listings agree, and disclose that this is not OEM-confirmed. Never imply guaranteed fitment from a part-number search, broad model family, or seller snippet alone. If the evidence is incomplete, perform as much comparison as available sources allow and give the best supported candidate(s) directly in TORQWISE; do not merely tell the technician to go search another website or contact a dealer. Links support our answer, they do not replace it. State the exact missing detail that prevents a stronger fitment status. For specifications, state applicability and uncertainty clearly. Explain in practical language with a concise report: Summary; What sources indicate; Recommended checks or research steps; What remains unverified. Cite sources in the answer where possible and return source links. No source means no claim of verification. This is research support, not a confirmed diagnosis.`;

  const requestInstructions = followUp
    ? "You are TORQWISE answering a follow-up about a previous automotive or heavy-equipment report. Treat the prior report as context, not proof. Answer directly in practical language. Correct or qualify unsupported prior claims, especially part fitment. Never say a part fits a specific year/model unless supplied context verifies it. State what details or checks are missing. Do not invent specifications, procedures, or source links."
    : instructions + " For parts questions, never infer fitment from a part number alone. Identify what source supports each claimed application, distinguish seller cross-reference listings from OEM-confirmed fitment, and explicitly say when reliable fitment evidence is unavailable.";
  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions: requestInstructions,
        input,
        ...(followUp ? {} : { tools: [{ type: "web_search", search_context_size: "medium" }] }),
        max_output_tokens: followUp ? 900 : 1800,
        store: false,
      }),
      signal: AbortSignal.timeout(38000),
    });
  } catch (err) {
    console.error("TORQWISE OpenAI request failed:", err?.name || "network error");
    try { if (!followUp) await releaseResearchUsage(access.userId, access.usageId); } catch (releaseError) { console.error("Research quota release failed:", releaseError?.message || "unknown"); }
    return json({ error: err?.name === "TimeoutError" ? "AI research timed out while waiting for the research provider. Please retry with a narrower question." : "Could not reach the AI research service. Please retry shortly." }, err?.name === "TimeoutError" ? 504 : 502);
  }
  let payload;
  try { payload = await upstream.json(); } catch {
    try { await releaseResearchUsage(access.userId, access.usageId); } catch (releaseError) { console.error("Research quota release failed:", releaseError?.message || "unknown"); }
    return json({ error: "The AI service returned an unreadable response." }, 502);
  }
  if (!upstream.ok) {
    try { await releaseResearchUsage(access.userId, access.usageId); } catch (releaseError) { console.error("Research quota release failed:", releaseError?.message || "unknown"); }
    console.error("TORQWISE OpenAI API error:", upstream.status, payload?.error?.code || "unknown");
    if (upstream.status === 401) return json({ error: "The server rejected the API key. Check OPENAI_API_KEY in Netlify; never paste it into the website." }, 502);
    if (upstream.status === 429) return json({ error: "The AI service is rate-limited or out of available API credit. Check API billing and usage." }, 429);
    return json({ error: "The AI service returned an error. Check API usage and Netlify function logs." }, 502);
  }
  const answer = extractText(payload);
  if (!answer) {
    try { await releaseResearchUsage(access.userId, access.usageId); } catch (releaseError) { console.error("Research quota release failed:", releaseError?.message || "unknown"); }
    return json({ error: "The AI service did not return a usable answer. Please retry with a more specific question." }, 502);
  }
  return json({ answer, sources: followUp ? [] : extractSources(payload), fitmentMatches, model: payload.model || process.env.OPENAI_MODEL || "gpt-5-mini", isPro: access.isPro, followUp, remaining: access.isPro ? null : access.remaining });
};
