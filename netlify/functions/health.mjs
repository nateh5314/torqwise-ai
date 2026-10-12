function env(name) {
  // Netlify's runtime env API is the supported path for function-scoped variables.
  // Keep process.env as a compatibility fallback for local development.
  try {
    if (typeof Netlify !== "undefined" && Netlify?.env?.get) {
      const value = Netlify.env.get(name);
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {}
  return (process.env[name] || "").trim();
}
function supabaseBase() {
  const raw = (env("SUPABASE_URL") || "https://wnvmtjimldleqfjuuprl.supabase.co").replace(/\/+$/, "");
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
  const envStatus = {
    supabaseUrl: Boolean(supabaseBase()),
    supabaseAnonKey: Boolean(env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_PUNISHABLE_KEY")),
    supabaseServiceRoleKey: Boolean(env("SUPABASE_SERVICE_ROLE_KEY")),
    openaiApiKey: Boolean(env("OPENAI_API_KEY")),
  };
  const billing = {
    stripeSecretKey: Boolean(env("STRIPE_SECRET_KEY")),
    stripeProPriceId: Boolean(env("STRIPE_PRICE_PRO") || env("STRIPE_PRO_PRICE_ID")),
    stripeWebhookSecret: Boolean(env("STRIPE_WEBHOOK_SECRET")),
    siteUrl: Boolean(env("SITE_URL") || "https://torqwiseauto.netlify.app"),
  };
  const checks = {
    environment: Object.values(envStatus).every(Boolean),
    billingConfiguration: Boolean(billing.stripeSecretKey && billing.stripeProPriceId && billing.siteUrl),
    usageTable: "not_checked",
    quotaFunction: "not_checked",
    proServiceUsageTable: "not_checked",
    proServiceQuotaFunction: "not_checked"
  };
  if (envStatus.supabaseUrl && envStatus.supabaseServiceRoleKey) {
    const base=supabaseBase();
    const key=env("SUPABASE_SERVICE_ROLE_KEY");
    const headers={apikey:key,authorization:"Bearer "+key};
    const tableChecks = [
      ["usageTable", "/rest/v1/research_usage?select=id&limit=0"],
      ["proServiceUsageTable", "/rest/v1/pro_service_usage?select=id&limit=0"]
    ];
    for (const [name, path] of tableChecks) {
      try {
        const table=await fetch(base+path,{headers,signal:AbortSignal.timeout(5000)});
        checks[name]=table.ok ? "ready" : (table.status===404 ? "missing_migration" : "http_"+table.status);
      } catch (e) {
        checks[name]="unreachable";
        checks[name+"Error"] = e instanceof Error ? e.message.slice(0,180) : "Network request failed";
      }
    }
    const rpcChecks = [
      ["quotaFunction", "/rest/v1/rpc/reserve_research_usage"],
      ["proServiceQuotaFunction", "/rest/v1/rpc/reserve_pro_service_usage"]
    ];
    for (const [name, path] of rpcChecks) {
      try {
        const rpc=await fetch(base+path,{method:"OPTIONS",headers:{...headers,"content-type":"application/json"},signal:AbortSignal.timeout(5000)});
        checks[name]=rpc.status===404 ? "missing_migration" : (rpc.status<500 ? "reachable" : "http_"+rpc.status);
      } catch (e) {
        checks[name]="unreachable";
        checks[name+"Error"] = e instanceof Error ? e.message.slice(0,180) : "Network request failed";
      }
    }
  }
  return json({
    healthVersion: "2026-10-12-pro-bundle-readiness-v3",
    deployContext: env("CONTEXT") || "unknown",
    branch: env("BRANCH") || "unknown",
    commitRef: (env("COMMIT_REF") || "unknown").slice(0, 12),
    configured: envStatus.supabaseUrl && envStatus.supabaseAnonKey,
    environment: envStatus,
    billing,
    checks
  });
};