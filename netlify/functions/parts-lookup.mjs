function env(name) {
  try {
    if (typeof Netlify !== "undefined" && Netlify?.env?.get) {
      const value = Netlify.env.get(name);
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {}
  return (process.env[name] || "").trim();
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function clean(value, max = 180) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function normalizePart(value) { return clean(value, 100).toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function extractText(payload) {
  const parts = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item.type === "message" && Array.isArray(item.content)) for (const part of item.content) {
      if ((part.type === "output_text" || part.type === "text") && typeof part.text === "string") parts.push(part.text);
    }
  }
  return parts.join("\n").trim() || (typeof payload?.output_text === "string" ? payload.output_text.trim() : "");
}
function extractSources(payload) {
  const found = new Map();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item.content) ? item.content : []) for (const annotation of Array.isArray(part.annotations) ? part.annotations : []) {
      if (annotation.type !== "url_citation" || typeof annotation.url !== "string") continue;
      try { const url = new URL(annotation.url); if (["http:", "https:"].includes(url.protocol)) found.set(url.href, { url: url.href, title: String(annotation.title || url.hostname).slice(0, 180) }); } catch {}
    }
    const candidates = item.type === "web_search_call" ? (item.action?.sources || item.sources || []) : [];
    for (const candidate of candidates) try {
      const url = new URL(candidate?.url || candidate?.uri || "");
      if (["http:", "https:"].includes(url.protocol)) found.set(url.href, { url: url.href, title: String(candidate?.title || url.hostname).slice(0, 180) });
    } catch {}
  }
  return [...found.values()].slice(0, 20);
}
function parseOffers(text, sources) {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("unstructured response");
  const data = JSON.parse(text.slice(start, end + 1));
  const allowed = new Set(sources.map(source => source.url));
  const offers = (Array.isArray(data.offers) ? data.offers : []).flatMap(offer => {
    const url = typeof offer.url === "string" ? offer.url.trim() : "";
    let parsed;
    try { parsed = new URL(url); } catch { return []; }
    if (!allowed.has(url) || !["http:", "https:"].includes(parsed.protocol)) return [];
    const price = Number(offer.price), currency = String(offer.currency || "").toUpperCase();
    if (!Number.isFinite(price) || price < 0 || !["CAD", "USD"].includes(currency)) return [];
    return [{
      seller: clean(offer.seller, 100) || parsed.hostname,
      title: clean(offer.title, 220) || "Part listing",
      price, currency,
      condition: ["OEM", "Aftermarket", "Used", "Unknown"].includes(offer.condition) ? offer.condition : "Unknown",
      fitment: ["Confirmed by listing", "Possible match", "Unverified", "Not stated"].includes(offer.fitment) ? offer.fitment : "Unverified",
      url, notes: clean(offer.notes, 240)
    }];
  });
  offers.sort((a, b) => a.currency.localeCompare(b.currency) || a.price - b.price);
  return { identification: clean(data.identification, 240), partNumber: clean(data.partNumber, 100), offers: offers.slice(0, 15), notes: clean(data.notes, 500) };
}
const requestCounts = new Map();
function rateLimited(key) {
  const now = Date.now(), item = requestCounts.get(key);
  if (!item || now - item.start >= 3600000) { requestCounts.set(key, { start: now, count: 1 }); return false; }
  item.count += 1;
  return item.count > 10;
}
export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "Use POST to look up a part." }, 405);
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "Part research is not configured on the server yet." }, 503);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const part = clean(body?.part, 180), vehicle = clean(body?.vehicle, 180), region = clean(body?.region, 100) || "Canada";
  if (!part || part.length < 3) return json({ error: "Enter a part name or OEM part number (at least three characters)." }, 400);
  const base = (env("SUPABASE_URL") || "https://wnvmtjimldleqfjuuprl.supabase.co").replace(/\/+$/, "");
  const anon = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_PUNISHABLE_KEY");
  const token = (req.headers.get("authorization") || "").match(/^Bearer\\s+(.+)$/i)?.[1];
  if (!base || !anon || !token) return json({ error: "Sign in to use live parts research." }, 401);
  let userResponse;
  try { userResponse = await fetch(base + "/auth/v1/user", { headers: { apikey: anon, authorization: "Bearer " + token }, signal: AbortSignal.timeout(5000) }); }
  catch { return json({ error: "Could not verify your session. Please retry." }, 503); }
  if (!userResponse.ok) return json({ error: "Your session expired. Sign in again and retry." }, 401);
  let user;
  try { user = await userResponse.json(); } catch {}
  if (!user?.id) return json({ error: "Your session could not be verified." }, 401);
  if (rateLimited(user.id)) return json({ error: "Parts research limit reached for this hour. Try again later." }, 429);
  const canonical = normalizePart(part);
  const prompt = "Research this automotive/equipment part for a Canadian buyer. Query: " + JSON.stringify(part) +
    ". Normalized part-number candidate: " + JSON.stringify(canonical) + ". Vehicle/equipment: " + JSON.stringify(vehicle || "not supplied") +
    ". Delivery region: " + JSON.stringify(region) + ". Use web search to identify the exact part and collect real supplier listings with visible prices. Search exact OEM number first (including punctuation variants), then genuine OEM catalogs, Canadian retailers, and reputable aftermarket suppliers. Do not invent listings, prices, currencies, stock, fitment, or URLs. Only include offers where a source page actually displays a price and the currency can be determined. Exclude shipping/tax from listed price unless the source explicitly includes it. For fitment, distinguish confirmed listing text from possible or unverified compatibility. If ambiguous, say so and request vehicle details. Return ONLY JSON in this shape: " +
    '{"identification":"short evidence-based part description","partNumber":"canonical part number or empty","offers":[{"seller":"seller name","title":"listing title","price":123.45,"currency":"CAD or USD","condition":"OEM or Aftermarket or Used or Unknown","fitment":"Confirmed by listing or Possible match or Unverified or Not stated","url":"exact source URL","notes":"optional short note"}],"notes":"brief caveat about fitment, shipping/tax, or source limitations"}. Include only offers linked to source URLs from your web research. Aim for up to 10 distinct offers, not duplicates.';
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
      body: JSON.stringify({ model: env("OPENAI_MODEL") || "gpt-5-mini", instructions: "You are TORQWISE Parts Intelligence. Be evidence-led. Never guess a current price or fitment. Use web search and return JSON only.", input: prompt, tools: [{ type: "web_search", search_context_size: "medium" }], max_output_tokens: 2200, reasoning: { effort: "low" }, store: false }),
      signal: AbortSignal.timeout(25000)
    });
  } catch (error) {
    console.error("Parts lookup request failed:", error?.name || "network error");
    return json({ error: "Live supplier research timed out. Try again or use the supplier search links." }, 504);
  }
  let payload;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    console.error("Parts lookup upstream error:", response.status, payload?.error?.code || "unknown");
    return json({ error: response.status === 429 ? "Live research is temporarily rate-limited. Try again shortly." : "Live supplier research is temporarily unavailable." }, response.status === 429 ? 429 : 502);
  }
  const answer = extractText(payload);
  if (!answer) return json({ error: "No readable supplier research was returned. Please retry." }, 502);
  const sources = extractSources(payload);
  try {
    const result = parseOffers(answer, sources);
    result.sources = sources;
    result.checkedAt = new Date().toISOString();
    result.sorting = "Lowest listed price first within each currency. CAD and USD are kept separate; shipping/tax may not be included.";
    result.normalizedPartNumber = canonical;
    return json(result);
  } catch (error) {
    console.error("Parts lookup response could not be parsed:", error?.message || "unknown");
    return json({ error: "Supplier research returned an unreadable result. Please retry; no prices have been displayed." }, 502);
  }
}
