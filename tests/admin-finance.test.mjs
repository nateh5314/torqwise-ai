import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/admin-finance.mjs";
const originalFetch=globalThis.fetch, originalEnv={...process.env}, base="https://supabase.example";
function restoreEnv(){for(const k of Object.keys(process.env))if(!(k in originalEnv))delete process.env[k];for(const [k,v] of Object.entries(originalEnv))process.env[k]=v;}
function configure(){Object.assign(process.env,{SUPABASE_URL:base,SUPABASE_ANON_KEY:"public-test-key",SUPABASE_SERVICE_ROLE_KEY:"server-test-key",TORQWISE_ADMIN_USER_IDS:"admin-user",STRIPE_PRO_PRICE_ID:"price-pro",TORQWISE_PRO_MONTHLY_PRICE_CAD:"29.99"});}
function req({method="GET",token="valid-token",body}={}){const headers={};if(token)headers.authorization="Bearer "+token;if(body!==undefined)headers["content-type"]="application/json";return new Request("https://torqwise.example/.netlify/functions/admin-finance",{method,headers,body:body===undefined?undefined:JSON.stringify(body)});}
test.afterEach(()=>{globalThis.fetch=originalFetch;restoreEnv();});
test("rejects unsupported methods before Supabase",async()=>{configure();let calls=0;globalThis.fetch=async()=>{calls++;throw Error("unexpected fetch");};const r=await handler(req({method:"PATCH"}));assert.equal(r.status,405);assert.equal(calls,0);});
test("requires bearer token before finance data access",async()=>{configure();let calls=0;globalThis.fetch=async()=>{calls++;throw Error("unexpected fetch");};const r=await handler(req({token:""}));assert.equal(r.status,401);assert.equal(calls,0);});
test("denies non-admin before reading finance data",async()=>{configure();const calls=[];globalThis.fetch=async(url)=>{calls.push(String(url));return new Response(JSON.stringify({id:"not-admin"}),{status:200});};const r=await handler(req());assert.equal(r.status,403);assert.deepEqual(calls,[base+"/auth/v1/user"]);});
test("loads paid income and expenses using server-only key after authorization",async()=>{configure();const calls=[];globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),options});if(String(url)===base+"/auth/v1/user")return new Response(JSON.stringify({id:"admin-user"}),{status:200});if(String(url).includes("customer_requests?")&&String(url).includes("eq.refunded"))return new Response(JSON.stringify([{request_code:"TQ-R",quoted_price:5,payment_status:"refunded"}]),{status:200});if(String(url).includes("customer_requests?"))return new Response(JSON.stringify([{request_code:"TQ-1",quoted_price:15,payment_status:"paid"}]),{status:200});if(String(url).includes("business_expenses?"))return new Response(JSON.stringify([{id:1,amount:5}]),{status:200});if(String(url).includes("research_usage?"))return new Response(JSON.stringify([{id:2,created_at:"2026-10-01T00:00:00Z",model:"gpt-5-mini",input_tokens:100,output_tokens:40,estimated_cost_usd:0.0002,status:"completed"}]),{status:200});if(String(url).includes("subscriptions?"))return new Response(JSON.stringify([{id:3,status:"active",price_id:"price-pro",created_at:"2026-10-01"}]),{status:200});throw Error("unexpected URL");};const r=await handler(req());assert.equal(r.status,200);const data=await r.json();assert.equal(data.income.length,1);assert.equal(data.refunds.length,1);assert.equal(data.refunds[0].payment_status,"refunded");assert.equal(data.expenses.length,1);assert.equal(data.usage.length,1);assert.equal(data.usage[0].input_tokens,100);assert.equal(data.usage[0].estimated_cost_usd,0.0002);assert.equal(data.memberships.active,1);assert.equal(data.memberships.estimatedMrrCad,29.99);assert.equal(calls.length,6);assert.equal(calls[1].options.headers.authorization,"Bearer server-test-key");});
test("validates expense amounts before writing",async()=>{configure();const calls=[];globalThis.fetch=async(url)=>{calls.push(String(url));return new Response(JSON.stringify({id:"admin-user"}),{status:200});};const r=await handler(req({method:"POST",body:{description:"AI",amount:-4,expense_date:"2026-10-10"}}));assert.equal(r.status,400);assert.equal(calls.length,1);});
test("validates expense description and date before writing",async()=>{configure();const calls=[];globalThis.fetch=async(url)=>{calls.push(String(url));return new Response(JSON.stringify({id:"admin-user"}),{status:200});};const r=await handler(req({method:"POST",body:{description:"",amount:10,expense_date:"bad"}}));assert.equal(r.status,400);assert.equal(calls.length,1);});

test("paginates finance history instead of silently truncating after one page",async()=>{
 configure();const calls=[];
 globalThis.fetch=async(url,options={})=>{
  const u=String(url);calls.push({url:u,options});
  if(u===base+"/auth/v1/user")return new Response(JSON.stringify({id:"admin-user"}),{status:200});
  const range=options.headers?.Range;
  if(u.includes("customer_requests?")&&u.includes("eq.refunded"))return new Response("[]",{status:200});if(u.includes("customer_requests?"))return new Response(JSON.stringify(range==="0-999"?Array.from({length:1000},(_,i)=>({request_code:"TQ-"+i,quoted_price:1,paid_at:"2026-10-01",payment_status:"paid"})):[]),{status:200});
  if(u.includes("business_expenses?")||u.includes("research_usage?")||u.includes("subscriptions?"))return new Response("[]",{status:200});
  throw Error("Unexpected URL "+u);
 };
 const result=await handler(req());assert.equal(result.status,200);const data=await result.json();
 assert.equal(data.income.length,1000);
 assert.ok(calls.some(x=>x.options.headers?.Range==="0-999"));
 assert.ok(calls.some(x=>x.options.headers?.Range==="1000-1999"));
});
