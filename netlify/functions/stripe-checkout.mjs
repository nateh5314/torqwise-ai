function resolveSiteUrl(){
 const candidates=[process.env.DEPLOY_PRIME_URL,process.env.SITE_URL,process.env.URL,"https://torqwiseauto.netlify.app"];
 for(const value of candidates){try{const u=new URL(value);if(u.protocol==="https:"&&(u.hostname==="torqwiseauto.netlify.app"||u.hostname.endsWith("--torqwiseauto.netlify.app")))return u.origin;}catch{}}
 return "https://torqwiseauto.netlify.app";
}
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
async function userFromRequest(req,url,key){
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)return null;
 const r=await fetch(url+"/auth/v1/user",{headers:{apikey:key,authorization:"Bearer "+token}});
 if(!r.ok)return null; const u=await r.json(); return u?.id?u:null;
}
export default async function handler(req){
 if(req.method!=="POST")return reply({error:"Use POST."},405);
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY,service=process.env.SUPABASE_SECRET_KEY;
 const stripe=process.env.STRIPE_SECRET_KEY,price=process.env.STRIPE_PRICE_PRO,site=resolveSiteUrl();
 if(!url||!key||!service||!stripe||!price)return reply({error:"Subscription checkout is not configured yet."},503);
 let user; try{user=await userFromRequest(req,url,key)}catch{return reply({error:"Could not verify your session."},503)}
 if(!user)return reply({error:"Sign in before starting a subscription."},401);
 try{
  const form=new URLSearchParams();
  form.set("mode","subscription");form.set("line_items[0][price]",price);form.set("line_items[0][quantity]","1");
  form.set("success_url",site+"/?subscription=success");form.set("cancel_url",site+"/?subscription=cancelled");
  form.set("client_reference_id",user.id);form.set("metadata[supabase_user_id]",user.id);
  form.set("subscription_data[metadata][supabase_user_id]",user.id);
  form.set("allow_promotion_codes","false");
  const r=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{authorization:"Bearer "+stripe,"content-type":"application/x-www-form-urlencoded"},body:form,signal:AbortSignal.timeout(12000)});
  const data=await r.json();if(!r.ok||!data.url){console.error("Stripe checkout creation failed:",r.status,data.error?.type||"unknown");return reply({error:"Could not start checkout. Please try again later."},502)}
  return reply({url:data.url});
 }catch{ return reply({error:"Could not reach the checkout service."},502)}
}