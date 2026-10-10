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
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.OPENAI_API_KEY;
  globalThis.fetch=async()=>{throw new Error("fetch should not be called")};
  const response=await handler();
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.configured,false);
  assert.equal(data.environment.openaiApiKey,false);
  assert.equal(data.environment.supabaseServiceRoleKey,false);
  assert.equal(JSON.stringify(data).includes("secret"),false);
});

test("health endpoint verifies usage table and reports whether quota function is reachable",async()=>{
  Object.assign(process.env,{
    SUPABASE_URL:"https://supabase.example",
    SUPABASE_ANON_KEY:"public-test-key",
    SUPABASE_SERVICE_ROLE_KEY:"server-test-secret",
    OPENAI_API_KEY:"openai-test-secret",
  });
  const calls=[];
  globalThis.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes("/rest/v1/research_usage?"))return new Response("[]",{status:200});
    if(String(url).endsWith("/rest/v1/rpc/reserve_research_usage"))return new Response("",{status:204});
    throw new Error("Unexpected URL "+url);
  };
  const response=await handler();
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.environment.openaiApiKey,true);
  assert.equal(data.checks.usageTable,"ready");
  assert.equal(data.checks.quotaFunction,"reachable");
  assert.equal(JSON.stringify(data).includes("server-test-secret"),false);
  assert.equal(JSON.stringify(data).includes("openai-test-secret"),false);
  assert.equal(calls.length,2);
});
