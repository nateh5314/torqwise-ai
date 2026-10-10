function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
const env = name => (process.env[name] || "").trim();
const categories = ["Software & AI","Hosting & tools","Marketing","Fees","Equipment","Travel","Professional services","Other"];
async function fetchAllRows(base,path,headers){
  const rows=[],pageSize=1000,maxPages=100;
  for(let page=0;page<maxPages;page++){
    const response=await fetch(base+path,{headers:{...headers,Range:(page*pageSize)+"-"+(page*pageSize+pageSize-1)}});
    if(!response.ok) return {ok:false,status:response.status};
    const batch=await response.json();
    if(!Array.isArray(batch)) return {ok:false,status:502};
    rows.push(...batch);
    if(batch.length<pageSize)return {ok:true,rows};
  }
  return {ok:false,status:413};
}
export default async req => {
  if (!["GET","POST","DELETE"].includes(req.method)) return json({ error: "Use GET, POST, or DELETE." }, 405);
  const base=env("SUPABASE_URL"), anon=env("SUPABASE_ANON_KEY"), service=env("SUPABASE_SERVICE_ROLE_KEY");
  const admins=env("TORQWISE_ADMIN_USER_IDS").split(",").map(x=>x.trim()).filter(Boolean);
  if(!base||!anon||!service||!admins.length) return json({error:"Finance panel is not configured."},503);
  const token=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token) return json({error:"Sign in with an authorized operator account."},401);
  try {
    const auth=await fetch(base+"/auth/v1/user",{headers:{apikey:anon,authorization:"Bearer "+token}});
    if(!auth.ok) return json({error:"Your session is invalid or expired."},401);
    const user=await auth.json();
    if(!user||!admins.includes(user.id)) return json({error:"You are not authorized to access finance records."},403);
    const headers={apikey:service,authorization:"Bearer "+service,"content-type":"application/json"};
    if(req.method==="GET"){
      const [income,refunds,expenses,usage,subscriptions]=await Promise.all([
        fetchAllRows(base,"/rest/v1/customer_requests?select=request_code,label,quoted_price,paid_at,created_at,payment_status&payment_status=eq.paid&order=paid_at.desc",headers),
        fetchAllRows(base,"/rest/v1/customer_requests?select=request_code,label,quoted_price,paid_at,created_at,payment_status&payment_status=eq.refunded&order=created_at.desc",headers),
        fetchAllRows(base,"/rest/v1/business_expenses?select=id,description,category,amount,expense_date,notes,created_at&order=expense_date.desc",headers),
        fetchAllRows(base,"/rest/v1/research_usage?select=id,created_at,model,input_tokens,output_tokens,estimated_cost_usd,completed_at,status&order=created_at.desc",headers),
        fetchAllRows(base,"/rest/v1/subscriptions?select=id,status,price_id,current_period_end,cancel_at_period_end,created_at&order=created_at.desc",headers)
      ]);
      if(!income.ok) throw new Error("Could not load all paid research income");
      if(!refunds.ok) throw new Error("Could not load refunded research requests");
      if(!expenses.ok) throw new Error("Could not load all expenses. Apply supabase/business-expenses.sql first.");
      if(!usage.ok) throw new Error("Could not load all AI research usage. Apply supabase/research-usage.sql first.");
      if(!subscriptions.ok) throw new Error("Could not load memberships. Apply supabase/subscriptions.sql first.");
      const proPriceId=env("STRIPE_PRO_PRICE_ID"),monthlyCad=Number(env("TORQWISE_PRO_MONTHLY_PRICE_CAD"));
      const memberships=subscriptions.rows.filter(x=>x.price_id===proPriceId&&["active","trialing"].includes(x.status));
      return json({income:income.rows,refunds:refunds.rows,expenses:expenses.rows,usage:usage.rows,memberships:{active:memberships.length,estimatedMrrCad:Number.isFinite(monthlyCad)&&monthlyCad>0?memberships.length*monthlyCad:null}});
    }
    let body; try{body=await req.json()}catch{return json({error:"Request body must be valid JSON."},400);}
    if(req.method==="POST"){
      const description=typeof body.description==="string"?body.description.trim().slice(0,180):"";
      const category=categories.includes(body.category)?body.category:"Other";
      const amount=Number(body.amount);
      const date=typeof body.expense_date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(body.expense_date)?body.expense_date:"";
      if(!description||!Number.isFinite(amount)||amount<=0||amount>10000000||!date) return json({error:"Enter a description, valid positive amount, and expense date."},400);
      const result=await fetch(base+"/rest/v1/business_expenses",{method:"POST",headers:{...headers,Prefer:"return=representation"},body:JSON.stringify({description,category,amount,expense_date:date,notes:typeof body.notes==="string"?body.notes.trim().slice(0,1000):null})});
      if(!result.ok) throw new Error("Could not save expense");
      return json({expense:(await result.json())[0]},201);
    }
    const id=Number(body.id);
    if(!Number.isSafeInteger(id)||id<=0) return json({error:"Choose a valid expense."},400);
    const result=await fetch(base+"/rest/v1/business_expenses?id=eq."+id,{method:"DELETE",headers:{...headers,Prefer:"return=representation"}});
    if(!result.ok) throw new Error("Could not delete expense");
    const rows=await result.json(); if(!rows.length)return json({error:"Expense not found."},404);
    return json({deleted:true});
  }catch(e){console.error("TORQWISE finance error:",e?.message||"unknown");return json({error:"Finance data could not be loaded or saved. Check the finance migration and Supabase configuration."},503);}
};