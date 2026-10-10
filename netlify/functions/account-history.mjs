const env = (name) => (process.env[name] || "").trim();
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const clean = (v, max = 12000) => typeof v === "string" ? v.trim().slice(0, max) : "";
const kinds = new Set(["research", "diagnostic", "parts", "job"]);
const dbHeaders = (key, extra = {}) => ({ apikey: key, authorization: "Bearer " + key, ...extra });
async function auth(req) {
  const base = env("SUPABASE_URL"), anon = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY"), key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !anon || !key) return { error: "Account history storage is not configured yet.", status: 503 };
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: "Sign in to access your saved history.", status: 401 };
  const r = await fetch(base + "/auth/v1/user", { headers: { apikey: anon, authorization: "Bearer " + token } });
  if (!r.ok) return { error: "Your session expired. Please sign in again.", status: 401 };
  let user;
  try { user = await r.json(); } catch { return { error: "Your session could not be verified. Please sign in again.", status: 401 }; }
  if (!user || typeof user.id !== "string" || !user.id) return { error: "Your session could not be verified. Please sign in again.", status: 401 };
  return { base, key, user };
}
export default async (req) => {
  if (!["GET", "POST", "DELETE"].includes(req.method)) return json({ error: "Use GET, POST, or DELETE." }, 405);
  let a;
  try { a = await auth(req); } catch { return json({ error: "Could not verify your account right now." }, 503); }
  if (a.error) return json({ error: a.error }, a.status);
  const { base, key, user } = a, scope = "user_id=eq." + encodeURIComponent(user.id);
  try {
    if (req.method === "GET") {
      const u = new URL(req.url), limit = Math.max(1, Math.min(100, Number(u.searchParams.get("limit")) || 50)), kind = u.searchParams.get("kind");
      let url = base + "/rest/v1/account_history?" + scope + "&select=id,kind,title,asset,serial,topic,prompt,result,sources,metadata,created_at&order=created_at.desc&limit=" + limit;
      if (kinds.has(kind)) url += "&kind=eq." + encodeURIComponent(kind);
      const r = await fetch(url, { headers: dbHeaders(key) });
      if (!r.ok) throw new Error("history read failed");
      return json({ entries: await r.json() });
    }
    if (req.method === "DELETE") {
      let b; try { b = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
      const filter = b.clearAll === true ? scope : (Number.isSafeInteger(Number(b.id)) && Number(b.id) > 0 ? "id=eq." + Number(b.id) + "&" + scope : "");
      if (!filter) return json({ error: "A valid history entry ID is required." }, 400);
      const r = await fetch(base + "/rest/v1/account_history?" + filter, { method: "DELETE", headers: dbHeaders(key, { Prefer: "return=minimal" }) });
      if (!r.ok) throw new Error("history delete failed");
      return json({ deleted: b.clearAll ? "all" : Number(b.id) });
    }
    let b; try { b = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
    const kind = clean(b.kind, 20), title = clean(b.title, 240);
    if (!kinds.has(kind) || !title) return json({ error: "A valid history type and title are required." }, 400);
    const sources = Array.isArray(b.sources) ? b.sources.slice(0, 20).map(s => ({ title: clean(s?.title, 240), url: /^https?:\/\//i.test(clean(s?.url, 1200)) ? clean(s.url, 1200) : "" })).filter(s => s.url) : [];
    let metadata = b.metadata && typeof b.metadata === "object" && !Array.isArray(b.metadata) ? b.metadata : {};
    // Keep arbitrary client metadata bounded so saved history cannot become an
    // unbounded storage payload. Core fields are normalized separately above.
    try {
      if (JSON.stringify(metadata).length > 4000) metadata = { note: "Extra metadata omitted because it exceeded the storage limit." };
    } catch { metadata = {}; }
    const row = { user_id: user.id, kind, title, asset: clean(b.asset, 240) || null, serial: clean(b.serial, 100) || null, topic: clean(b.topic, 40) || null, prompt: clean(b.prompt, 6000) || null, result: clean(b.result, 18000) || null, sources, metadata };
    const r = await fetch(base + "/rest/v1/account_history", { method: "POST", headers: dbHeaders(key, { "content-type": "application/json", Prefer: "return=representation" }), body: JSON.stringify(row) });
    if (!r.ok) throw new Error("history save failed");
    return json({ entry: (await r.json())[0] }, 201);
  } catch (e) {
    console.error("TORQWISE account history:", e?.message || "unknown");
    return json({ error: "Could not update account history. Existing local saves remain on this device." }, 503);
  }
};
