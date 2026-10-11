function supabaseBase() {
  const raw = (process.env.SUPABASE_URL || "https://wnvmtjimldleqfjuuprl.supabase.co").trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(raw)) return raw;
  const host = raw.match(/^([a-z0-9-]+\.supabase\.co)$/i);
  if (host) return "https://" + host[1];
  const ref = raw.match(/^([a-z0-9-]{15,40})$/i);
  if (ref) return "https://" + ref[1] + ".supabase.co";
  return raw;
}
function json(body, status=200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" } });
}
export default async () => {
  const env = {
    supabaseUrl: Boolean(supabaseBase()),
    supabaseAnonKey: Boolean((process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_PUNISHABLE_KEY||"").trim()),
    supabaseServiceRoleKey: Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim()),
    openaiApiKey: Boolean((process.env.OPENAI_API_KEY||"").trim()),
  };
  // Report only whether billing settings exist; never return key or price values.
  const billing = {
    stripeSecretKey: Boolean((process.env.STRIPE_SECRET_KEY||"").trim()),
    stripeProPriceId: Boolean((process.env.STRIPE_PRO_PRICE_ID||process.env.STRIPE_PRICE_PRO||"").trim()),
    stripeWebhookSecret: Boolean((process.env.STRIPE_WEBHOOK_SECRET||"").trim()),
  };
  const checks = {
    environment: Object.values(env).every(Boolean),
    billingConfiguration: Object.values(billing).every(Boolean),
    usageTable: "not_checked",
    quotaFunction: "not_checked"
  };
  if (env.supabaseUrl && env.supabaseServiceRoleKey) {
    const base=supabaseBase();
    const key=(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
    const headers={apikey:key,authorization:"Bearer "+key};
    try {
      const table=await fetch(base+"/rest/v1/research_usage?select=id&limit=0",{headers});
      checks.usageTable=table.ok ? "ready" : (table.status===404 ? "missing_migration" : "http_"+table.status);
    } catch (e) {
      checks.usageTable="unreachable";
      checks.usageTableError = e instanceof Error ? e.message.slice(0,180) : "Network request failed";
    }
    try {
      const rpc=await fetch(base+"/rest/v1/rpc/reserve_research_usage",{method:"OPTIONS",headers:{...headers,"content-type":"application/json"}});
      checks.quotaFunction=rpc.status===404 ? "missing_migration" : (rpc.status<500 ? "reachable" : "http_"+rpc.status);
    } catch (e) {
      checks.quotaFunction="unreachable";
      checks.quotaFunctionError = e instanceof Error ? e.message.slice(0,180) : "Network request failed";
    }
  }
  return json({
    healthVersion: "2026-10-11-billing-readiness-v1",
    deployContext: process.env.CONTEXT || "unknown",
    branch: process.env.BRANCH || "unknown",
    commitRef: (process.env.COMMIT_REF || "unknown").slice(0, 12),
    configured: env.supabaseUrl && env.supabaseAnonKey,
    environment: env,
    billing,
    checks
  });
}
