import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/health.mjs";

const originalFetch=globalThis.fetch;
const originalEnv={...process.env};
function restoreEnv(){
  for(const key of Object.keys(process.env)) if(!(key in originalEnv)) delete process.env[key];
  for(const [key,value] of Object.entries(originalEnv)) process.env[key]=value;
}
test.afterEach(()=>{globalThis.fetch=originalFetch;restoreEnv();});

test("health endpoint reports missing server configuration without exposing secrets",async()=>{
  for (const key of ["SUPABASE_URL","SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEY","SUPABASE_SERVICE_ROLE_KEY","OPENAI_API_KEY","STRIPE_SECRET_KEY","STRIPE_PRO_PRICE_ID","STRIPE_PRICE_PRO","STRIPE_WEBHOOK_SECRET"]) delete process.env[key];
  globalThis.fetch=async()=>{throw new Error("fetch should not be called")};
  const response=await handler();
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.configured,false);
  assert.equal(data.environment.openaiApiKey,false);
  assert.equal(data.environment.supabaseServiceRoleKey,false);
  assert.equal(data.billing.stripeSecretKey,false);
  assert.equal(data.billing.stripeProPriceId,false);
  assert.equal(data.billing.stripeWebhookSecret,false);
  assert.equal(data.checks.billingConfiguration,false);
  assert.equal(JSON.stringify(data).includes("secret"),false);
});

test("health endpoint verifies usage table and reports whether quota function is reachable",async()=>{
  Object.assign(process.env,{
    SUPABASE_URL:"https://supabase.example",
    SUPABASE_ANON_KEY:"public-test-key",
    SUPABASE_SERVICE_ROLE_KEY:"server-test-secret",
    OPENAI_API_KEY:"openai-test-secret",
    STRIPE_SECRET_KEY:"sk_test_placeholder",
    STRIPE_PRO_PRICE_ID:"price_test_placeholder",
    STRIPE_WEBHOOK_SECRET:"whsec_test_placeholder",
  });
  const calls=[];
  globalThis.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes("/rest/v1/research_usage?") || String(url).includes("/rest/v1/pro_service_usage?"))return new Response("[]",{status:200});
    if(String(url).endsWith("/rest/v1/rpc/reserve_research_usage") || String(url).endsWith("/rest/v1/rpc/reserve_pro_service_usage"))return new Response(null,{status:204});
    throw new Error("Unexpected URL "+url);
  };
  const response=await handler();
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.environment.openaiApiKey,true);
  assert.equal(data.billing.stripeSecretKey,true);
  assert.equal(data.billing.stripeProPriceId,true);
  assert.equal(data.billing.stripeWebhookSecret,true);
  assert.equal(data.checks.billingConfiguration,true);
  assert.equal(data.checks.usageTable,"ready");
  assert.equal(data.checks.quotaFunction,"reachable");
  assert.equal(JSON.stringify(data).includes("server-test-secret"),false);
  assert.equal(JSON.stringify(data).includes("openai-test-secret"),false);
  assert.equal(JSON.stringify(data).includes("whsec_test_placeholder"),false);
  assert.equal(calls.length,4);
});

test("health endpoint accepts the supported Pro price alias",async()=>{
  Object.assign(process.env,{
    SUPABASE_URL:"https://supabase.example",
    SUPABASE_ANON_KEY:"public-test-key",
    SUPABASE_SERVICE_ROLE_KEY:"server-test-key",
    OPENAI_API_KEY:"openai-test-key",
    STRIPE_SECRET_KEY:"sk_test_placeholder",
    STRIPE_PRICE_PRO:"price_test_alias",
    STRIPE_WEBHOOK_SECRET:"whsec_test_placeholder",
  });
  delete process.env.STRIPE_PRO_PRICE_ID;
  globalThis.fetch=async(url,options={})=>{
    if(String(url).includes("/rest/v1/research_usage?"))return new Response("[]",{status:200});
    if(String(url).endsWith("/rest/v1/rpc/reserve_research_usage"))return new Response(null,{status:204});
    throw new Error("Unexpected URL "+url);
  };
  const data=await (await handler()).json();
  assert.equal(data.billing.stripeProPriceId,true);
  assert.equal(data.checks.billingConfiguration,true);
});
