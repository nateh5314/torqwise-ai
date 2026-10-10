import { createHmac, timingSafeEqual } from "node:crypto";
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
function validSignature(raw,header,secret){
 const parts=(header||"").split(",").map(s=>s.split("="));const ts=parts.find(p=>p[0]==="t")?.[1];const signatures=parts.filter(p=>p[0]==="v1").map(p=>p[1]);
 if(!ts||!signatures.length||Math.abs(Date.now()/1000-Number(ts))>300)return false;
 const expected=createHmac("sha256",secret).update(ts+"."+raw).digest();
 return signatures.some(s=>{try{const got=Buffer.from(s,"hex");return got.length===expected.length&&timingSafeEqual(got,expected)}catch{return false}});
}
async function dbUpsert(url,service,row){
 const r=await fetch(url+"/rest/v1/torqwise_subscriptions?on_conflict=user_id",{method:"POST",headers:{apikey:service,authorization:"Bearer "+service,"content-type":"application/json",prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(row),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error("Subscription database upsert failed: "+r.status);
}
export default async function handler(req){
 if(req.method!=="POST")return reply({error:"Use POST."},405);
 const secret=process.env.STRIPE_WEBHOOK_SECRET,url=process.env.SUPABASE_URL,service=process.env.SUPABASE_SECRET_KEY;
 if(!secret||!url||!service||!process.env.STRIPE_SECRET_KEY||!configuredPrice)return reply({error:"Webhook is not configured."},503);
 let raw;try{raw=await req.text()}catch{return reply({error:"Invalid request body."},400)}
 if(!validSignature(raw,req.headers.get("stripe-signature"),secret))return reply({error:"Invalid Stripe signature."},400);
 let event;try{event=JSON.parse(raw)}catch{return reply({error:"Invalid event JSON."},400)}
 const obj=event.data?.object||{};
 const configuredPrice=process.env.STRIPE_PRICE_PRO;
 try{
  if(event.type==="checkout.session.completed"){
   if(obj.mode!=="subscription")return reply({received:true});
   // Checkout metadata carries the Supabase account identity; verify the subscription itself before granting access.
   const subId=obj.subscription;if(!subId)return reply({error:"Subscription ID missing."},400);
   const sr=await fetch("https://api.stripe.com/v1/subscriptions/"+encodeURIComponent(subId),{headers:{authorization:"Bearer "+process.env.STRIPE_SECRET_KEY}});
   if(!sr.ok)throw new Error("Could not retrieve Stripe subscription");const sub=await sr.json();
   const uid=sub.metadata?.supabase_user_id||obj.metadata?.supabase_user_id;
   if(!uid||!/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(uid))return reply({error:"Subscription account metadata missing."},400);
   const matchingPrice=(sub.items?.data||[]).some(item=>item.price?.id===configuredPrice);
   const active=matchingPrice&&(sub.status==="active"||sub.status==="trialing");
   await dbUpsert(url,service,{user_id:uid,plan:active?"pro":"free",status:active?"active":sub.status==="past_due"?"past_due":"free",current_period_end:sub.current_period_end?new Date(sub.current_period_end*1000).toISOString():null,stripe_customer_id:typeof sub.customer==="string"?sub.customer:sub.customer?.id,stripe_subscription_id:sub.id,stripe_price_id:sub.items?.data?.[0]?.price?.id||null,cancel_at_period_end:!!sub.cancel_at_period_end,updated_at:new Date().toISOString()});
  }else if(["customer.subscription.updated","customer.subscription.deleted"].includes(event.type)){
   const uid=obj.metadata?.supabase_user_id;if(!uid)return reply({received:true});
   const matchingPrice=(obj.items?.data||[]).some(item=>item.price?.id===configuredPrice);
   const active=matchingPrice&&event.type!=="customer.subscription.deleted"&&(obj.status==="active"||obj.status==="trialing");
   await dbUpsert(url,service,{user_id:uid,plan:active?"pro":"free",status:active?"active":obj.status==="past_due"?"past_due":"cancelled",current_period_end:obj.current_period_end?new Date(obj.current_period_end*1000).toISOString():null,stripe_customer_id:typeof obj.customer==="string"?obj.customer:obj.customer?.id,stripe_subscription_id:obj.id,stripe_price_id:obj.items?.data?.[0]?.price?.id||null,cancel_at_period_end:!!obj.cancel_at_period_end,updated_at:new Date().toISOString()});
  }else if(event.type==="invoice.payment_failed"){
   const subId=typeof obj.subscription==="string"?obj.subscription:obj.subscription?.id;
   if(subId){const sr=await fetch("https://api.stripe.com/v1/subscriptions/"+encodeURIComponent(subId),{headers:{authorization:"Bearer "+process.env.STRIPE_SECRET_KEY}});if(sr.ok){const sub=await sr.json(),uid=sub.metadata?.supabase_user_id;if(uid && (sub.items?.data||[]).some(item=>item.price?.id===configuredPrice))await dbUpsert(url,service,{user_id:uid,plan:"free",status:"past_due",current_period_end:sub.current_period_end?new Date(sub.current_period_end*1000).toISOString():null,stripe_customer_id:typeof sub.customer==="string"?sub.customer:sub.customer?.id,stripe_subscription_id:sub.id,stripe_price_id:sub.items?.data?.[0]?.price?.id||null,cancel_at_period_end:!!sub.cancel_at_period_end,updated_at:new Date().toISOString()})}}
  }
  return reply({received:true});
 }catch(error){console.error("TORQWISE Stripe webhook processing failed:",error.message);return reply({error:"Webhook processing failed; Stripe should retry."},500)}
}