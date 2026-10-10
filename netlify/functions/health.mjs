function json(body, status=200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" } });
}
export default async () => {
  const env = {
    supabaseUrl: Boolean((process.env.SUPABASE_URL||"").trim()),
    supabaseAnonKey: Boolean((process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||"").trim()),
    supabaseServiceRoleKey: Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim()),
    openaiApiKey: Boolean((process.env.OPENAI_API_KEY||"").trim()),
  };
  const checks = { environment: Object.values(env).every(Boolean), database: "not_checked" };
  if (env.supabaseUrl && env.supabaseServiceRoleKey) {
    const base=(process.env.SUPABASE_URL||"").trim();
    const key=(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
    try {
      const r=await fetch(base+"/rest/v1/rpc/reserve_research_usage", {
        method:"OPTIONS",
        headers:{apikey:key,authorization:"Bearer "+key,"content-type":"application/json"},
      });
      // OPTIONS only tests route reachability, not whether SQL privileges/function args work.
      checks.database = r.status < 500 ? "reachable_check_migration" : "unreachable";
    } catch { checks.database="unreachable"; }
  }
  return json({ configured: env.supabaseUrl && env.supabaseAnonKey, environment: env, checks }, 200);
};
