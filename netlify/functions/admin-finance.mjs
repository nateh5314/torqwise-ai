function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
const env = name => (process.env[name] || "").trim();
const categories = ["Software & AI","Hosting & tools","Marketing","Fees","Equipment","Travel","Professional services","Other"];
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
      const [incomeRes,expenseRes,usageRes]=await Promise.all([
        fetch(base+"/rest/v1/customer_requests?select=request_code,label,quoted_price,paid_at,created_at,payment_status&payment_status=eq.paid&order=paid_at.desc&limit=1000",{headers}),
        fetch(base+"/rest/v1/business_expenses?select=id,description,category,amount,expense_date,notes,created_at&order=expense_date.desc&limit=500",{headers}),
        fetch(base+"/rest/v1/research_usage?select=id,created_at&order=created_at.desc&limit=5000",{headers})
      ]);
      if(!incomeRes.ok) throw new Error("Could not load paid research income");
      if(!expenseRes.ok) throw new Error("Could not load expenses. Apply supabase/business-expenses.sql first.");
      if(!usageRes.ok) throw new Error("Could not load AI research usage. Apply supabase/research-usage.sql first.");
      return json({income:await incomeRes.json(),expenses:await expenseRes.json(),usage:await usageRes.json()});
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