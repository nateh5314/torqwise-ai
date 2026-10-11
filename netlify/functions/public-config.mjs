export default async () => {
  const rawUrl = (process.env.SUPABASE_URL || "").trim();
  // Accept either the full Supabase project URL or a bare project reference.
  const normalizedInput = rawUrl.replace(/\/+$/, "");
  const url = /^[a-z0-9]{20}$/i.test(normalizedInput)
    ? `https://${normalizedInput}.supabase.co`
    : /^[a-z0-9-]+\.supabase\.co$/i.test(normalizedInput)
      ? `https://${normalizedInput}`
      : normalizedInput;
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUNISHABLE_KEY || "").trim();
  let validUrl = false;
  try {
    const parsed = new URL(url);
    validUrl = (parsed.protocol === "https:" || parsed.protocol === "http:") && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    validUrl = false;
  }
  if (!url || !validUrl || !anonKey) {
    return new Response(JSON.stringify({
      configured: false,
      error: !url ? "SUPABASE_URL is missing in Netlify environment variables." :
        !validUrl ? "SUPABASE_URL must be the full project URL, including https:// (for example, https://your-project-ref.supabase.co). Do not enter an API key here." :
        "The Supabase publishable/anon key is missing in Netlify environment variables."
    }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return new Response(JSON.stringify({ configured: true, url, anonKey, supportEmail: (process.env.SUPPORT_EMAIL || "").trim() }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
};