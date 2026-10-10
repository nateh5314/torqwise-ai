function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
export default async function handler(req){
 if(req.method!=="POST")return reply({error:"Use POST."},405);
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY,service=process.env.SUPABASE_SECRET_KEY,stripe=process.env.STRIPE_SECRET_KEY,site=process.env.URL||"https://torqwiseauto.netlify.app";
 if(!url||!key||!service||!stripe)return reply({error:"Subscription management is not configured yet."},503);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return reply({error:"Sign in first."},401);
 try{
  const ur=await fetch(url+"/auth/v1/user",{headers:{apikey:key,authorization:"Bearer "+token}});if(!ur.ok)return reply({error:"Sign in first."},401);const user=await ur.json();
  const sr=await fetch(url+"/rest/v1/torqwise_subscriptions?select=stripe_customer_id&user_id=eq."+encodeURIComponent(user.id)+"&limit=1",{headers:{apikey:service,authorization:"Bearer "+service}});
  if(!sr.ok)return reply({error:"Could not load subscription details."},503);const rows=await sr.json();const customer=rows[0]?.stripe_customer_id;if(!customer)return reply({error:"No Stripe customer is linked to this account yet."},404);
  const form=new URLSearchParams({customer,return_url:site+"/?subscription=manage"});const pr=await fetch("https://api.stripe.com/v1/billing_portal/sessions",{method:"POST",headers:{authorization:"Bearer "+stripe,"content-type":"application/x-www-form-urlencoded"},body:form});const data=await pr.json();if(!pr.ok||!data.url)return reply({error:"Could not open subscription management."},502);return reply({url:data.url});
 }catch{return reply({error:"Could not reach subscription management."},502)}
}