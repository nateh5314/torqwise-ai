export default async (req) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Use GET." }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return new Response(JSON.stringify({ error: "Supabase public configuration is missing." }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return new Response(JSON.stringify({ url, publishableKey: key }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
};
