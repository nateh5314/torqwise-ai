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
async function getResearchAccess(req) {
  const base = (process.env.SUPABASE_URL || '').trim();
  const anon = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
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
  const subsResponse = await fetch(base + '/rest/v1/subscriptions?user_id=eq.' + encodeURIComponent(user.id) + '&select=status&order=updated_at.desc&limit=1', { headers });
  if (!subsResponse.ok) throw new Error('Subscription lookup failed');
  const subs = await subsResponse.json();
  if (subs.some(row => ['active', 'trialing'].includes(row.status))) return { userId: user.id, isPro: true, remaining: null };
  const reserveResponse = await fetch(base + '/rest/v1/rpc/reserve_research_usage', {
    method: 'POST',
    headers: { apikey: service, authorization: 'Bearer ' + service, 'content-type': 'application/json' },
    body: JSON.stringify({ p_user_id: user.id, p_daily_limit: 3 }),
  });
  if (!reserveResponse.ok) throw new Error('Usage reservation failed; apply supabase/research-usage.sql before enabling AI research');
  const reservation = await reserveResponse.json();
  if (!reservation || reservation.allowed !== true || !Number.isSafeInteger(reservation.usage_id)) {
    return { error: 'You have used your 3 free AI research reports for today. Your allowance resets at midnight UTC. Upgrade to Pro Technician for $29.99 CAD/month for continued research.', status: 402, remaining: 0 };
  }
  return { userId: user.id, isPro: false, remaining: Number(reservation.remaining), usageId: reservation.usage_id };
}
async function releaseResearchUsage(userId, usageId) {
  if (!userId || !Number.isSafeInteger(usageId)) return;
  const base = (process.env.SUPABASE_URL || '').trim(); const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const response = await fetch(base + '/rest/v1/rpc/release_research_usage', {
    method: 'POST',
    headers: { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ p_user_id: userId, p_usage_id: usageId }),
  });
  if (!response.ok) throw new Error('Usage reservation release failed');
}
function extractText(response) {
  const parts = [];
  for (const item of response.output || []) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) if (part.type === "output_text" && part.text) parts.push(part.text);
    }
  }
  return parts.join("\n\n").trim();
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
  if (!asset && !question) return json({ error: "Enter a vehicle/equipment name or a question." }, 400);

  if (tooManyRequests(getClientKey(req))) return json({ error: "Too many research requests from this connection. Wait a few minutes and try again." }, 429);
  let access;
  try { access = await getResearchAccess(req); } catch (e) { console.error("Research access lookup failed:", e?.message || "unknown"); return json({ error: "Could not verify your research allowance. Please try again shortly." }, 503); }
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
  const input = [
    `Asset / vehicle / equipment: ${asset || "Not provided"}`,
    `VIN / serial / PIN: ${serial || "Not provided"}`,
    `Research category: ${topicNames[topic] || topicNames.general}`,
    `Question / symptoms / code / part: ${question || "Please provide an initial research overview based on the available context."}`,
  ].join("\n");
  const instructions = `You are TORQWISE, a careful automotive and heavy-equipment research assistant for technicians. Use web search to research the exact machine or vehicle and prioritize OEM/manufacturer sources, government recall databases, reputable technical sources, and clearly identified parts catalogs. Do not claim access to paid OEM service databases, proprietary wiring diagrams, or complete catalogs unless a source genuinely provides them. Never invent torque values, capacities, pinouts, wire colours, part numbers, bulletins, procedures, or citations. If exact year/model/engine/serial applicability cannot be confirmed, say so and ask for the missing identifier. Distinguish verified facts, likely causes, and hypotheses. For diagnosis, give a safe, evidence-led sequence: preserve codes/freeze-frame, check basics, test before replacing parts, and state what each test proves. Flag hazards and when the correct OEM procedure or professional equipment is required. For specs/parts, clearly say when exact fitment or specification needs OEM verification. Explain in practical language with a concise report: Summary; What sources indicate; Recommended checks or research steps; What remains unverified. Cite sources in the answer where possible and return source links. No source means no claim of verification. This is research support, not a confirmed diagnosis.`;

  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions,
        input,
        tools: [{ type: "web_search", search_context_size: "medium" }],
        max_output_tokens: 1800,
        store: false,
      }),
      signal: AbortSignal.timeout(38000),
    });
  } catch (err) {
    console.error("TORQWISE OpenAI request failed:", err?.name || "network error");
    try { await releaseResearchUsage(access.userId, access.usageId); } catch (releaseError) { console.error("Research quota release failed:", releaseError?.message || "unknown"); }
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
  return json({ answer, sources: extractSources(payload), model: payload.model || process.env.OPENAI_MODEL || "gpt-5-mini", isPro: access.isPro, remaining: access.isPro ? null : access.remaining });
};
