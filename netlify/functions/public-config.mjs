export default async () => {
  const rawUrl = (process.env.SUPABASE_URL || "").trim();
  // Always return a URL, never a bare project ref. Normalize common Netlify
  // env formats: full URL, project.supabase.co host, or project ref.
  const normalizedInput = rawUrl.replace(/\/+$/, "").trim();
  let url = normalizedInput;
  if (normalizedInput && !/^https?:\/\//i.test(normalizedInput)) {
    const host = normalizedInput.match(/^([a-z0-9-]+\.supabase\.co)\/?$/i);
    const ref = normalizedInput.match(/^([a-z0-9-]{15,40})$/i);
    if (host) url = "https://" + host[1];
    else if (ref) url = "https://" + ref[1] + ".supabase.co";
  }
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