const MAX_FIELD = 1800;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 8;
const recentRequests = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
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
async function refundQuota({ supabaseUrl, secretKey, userId, quota }) {
  // Best-effort rollback: a successful quota reservation should not cost a user
  // a question when the upstream research service fails.
  if (!quota?.period_type || !quota?.period_start || !userId) return;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/torqwise_refund_question`, {
      method: "POST",
      headers: {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_period_type: quota.period_type,
        p_period_start: quota.period_start,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.error("TORQWISE quota refund failed:", response.status);
  } catch {
    console.error("TORQWISE quota refund could not reach Supabase.");
  }
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
  if (tooManyRequests(getClientKey(req))) return json({ error: "Too many research requests from this connection. Wait a few minutes and try again." }, 429);
  let body;
  try { body = await req.json(); } catch { return json({ error: "The request body must be valid JSON." }, 400); }
  const asset = clean(body.asset, 240);
  const serial = clean(body.serial, 100);
  const topic = clean(body.topic, 40) || "general";
  const question = clean(body.question, MAX_FIELD);
  if (!asset && !question) return json({ error: "Enter a vehicle/equipment name or a question." }, 400);
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json({ error: "Account and usage-limit services are not fully configured on the server yet." }, 503);
  }
  const authorization = req.headers.get("authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return json({ error: "Sign in to your TORQWISE account before asking a research question." }, 401);
  let userResponse;
  try {
    userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, authorization: `Bearer ${tokenMatch[1]}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return json({ error: "Could not verify your account session. Please try signing in again." }, 502);
  }
  if (!userResponse.ok) return json({ error: "Your sign-in session is invalid or expired. Please sign in again." }, 401);
  let user;
  try { user = await userResponse.json(); } catch { return json({ error: "Could not verify your account session." }, 502); }
  if (!user?.id) return json({ error: "Could not verify your account session." }, 401);
  let quota;
  try {
    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/torqwise_consume_question`, {
      method: "POST",
      headers: {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_user_id: user.id, p_plan: "free" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!rpcResponse.ok) {
      console.error("TORQWISE quota RPC failed:", rpcResponse.status);
      return json({ error: "Could not check your question allowance. Please try again later." }, 503);
    }
    quota = await rpcResponse.json();
  } catch {
    return json({ error: "Could not check your question allowance. Please try again later." }, 503);
  }
  if (Array.isArray(quota)) quota = quota[0];
  if (!quota || typeof quota.allowed !== "boolean") {
    console.error("TORQWISE quota RPC returned an unexpected response.");
    return json({ error: "The question-limit service returned an unexpected response." }, 503);
  }
  if (!quota.allowed) {
    return json({
      error: `You've reached your ${quota.limit}-question ${quota.period_type === "daily" ? "daily" : "monthly"} limit. Please try again when your allowance resets.`,
      quota: { used: quota.used, limit: quota.limit, remaining: quota.remaining, periodType: quota.period_type, periodStart: quota.period_start },
    }, 429);
  }

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
      signal: AbortSignal.timeout(55000),
    });
  } catch (err) {
    console.error("TORQWISE OpenAI request failed:", err?.name || "network error");
    await refundQuota({ supabaseUrl, secretKey, userId: user.id, quota });
    return json({ error: "Could not reach the AI research service. Your question allowance has been restored if the quota service is available. Please retry shortly." }, 502);
  }
  let payload;
  try { payload = await upstream.json(); } catch {
    await refundQuota({ supabaseUrl, secretKey, userId: user.id, quota });
    return json({ error: "The AI service returned an unreadable response. Your question allowance has been restored if the quota service is available." }, 502);
  }
  if (!upstream.ok) {
    await refundQuota({ supabaseUrl, secretKey, userId: user.id, quota });
    console.error("TORQWISE OpenAI API error:", upstream.status, payload?.error?.code || "unknown");
    if (upstream.status === 401) return json({ error: "The server rejected the API key. Check OPENAI_API_KEY in Netlify; never paste it into the website. Your question allowance has been restored if the quota service is available." }, 502);
    if (upstream.status === 429) return json({ error: "The AI service is rate-limited or out of available API credit. Your question allowance has been restored if the quota service is available; check API billing and usage." }, 429);
    return json({ error: "The AI service returned an error. Your question allowance has been restored if the quota service is available. Check API usage and Netlify function logs." }, 502);
  }
  const answer = extractText(payload);
  if (!answer) {
    await refundQuota({ supabaseUrl, secretKey, userId: user.id, quota });
    return json({ error: "The AI service did not return a usable answer. Your question allowance has been restored if the quota service is available. Please retry with a more specific question." }, 502);
  }
  return json({ answer, sources: extractSources(payload), model: payload.model || process.env.OPENAI_MODEL || "gpt-5-mini", quota: { used: quota.used, limit: quota.limit, remaining: quota.remaining, periodType: quota.period_type, periodStart: quota.period_start } });
};
