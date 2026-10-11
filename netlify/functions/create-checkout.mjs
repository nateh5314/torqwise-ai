function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function env(name) {
  try {
    if (typeof Netlify !== "undefined" && Netlify?.env?.get) {
      const value = Netlify.env.get(name);
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {}
  return (process.env[name] || "").trim();
}
async function getUser(accessToken) {
  const url = env("SUPABASE_URL") || "https://wnvmtjimldleqfjuuprl.supabase.co", key = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_PUNISHABLE_KEY");
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  const r = await fetch(url + "/auth/v1/user", { headers: { apikey: key, authorization: "Bearer " + accessToken } });
  if (!r.ok) return null;
  return await r.json();
}
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const stripeKey = env("STRIPE_SECRET_KEY"), price = env("STRIPE_PRICE_PRO") || env("STRIPE_PRO_PRICE_ID");
  const requestOrigin = req.headers.get("origin") || "";
  const site = /^https:\/\/(?:deploy-preview-[0-9]+--torqwiseauto\.netlify\.app|torqwiseauto\.netlify\.app)$/i.test(requestOrigin) ? requestOrigin : (env("SITE_URL") || "https://torqwiseauto.netlify.app");
  if (!stripeKey || !price || !site) return json({ error: "Billing is not configured yet. Confirm STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, and SITE_URL in this deploy context." }, 503);
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "Sign in before starting a subscription." }, 401);
  let user;
  try { user = await getUser(match[1]); } catch (e) {
    console.error("Supabase auth verification failed:", e?.message || "unknown");
    return json({ error: "Account verification is temporarily unavailable." }, 503);
  }
  if (!user?.id || !user?.email) return json({ error: "Your session is invalid or expired. Sign in again." }, 401);

  // Prevent accidental duplicate Pro subscriptions for the same signed-in account.
  // If we cannot verify the current subscription state, fail closed instead of risking a second charge.
  const supabaseUrl = env("SUPABASE_URL") || "https://wnvmtjimldleqfjuuprl.supabase.co";
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return json({ error: "Subscription verification is not configured yet. Please try again later." }, 503);
  try {
    const existingResponse = await fetch(
      supabaseUrl.replace(/\/+$/, "") + "/rest/v1/subscriptions?user_id=eq." + encodeURIComponent(user.id) +
      "&status=in.(active,trialing)&price_id=eq." + encodeURIComponent(price) + "&select=stripe_subscription_id&limit=1",
      { headers: { apikey: serviceKey, authorization: "Bearer " + serviceKey }, signal: AbortSignal.timeout(5000) }
    );
    if (!existingResponse.ok) {
      console.error("Existing subscription check failed:", existingResponse.status);
      return json({ error: "Could not verify your current subscription. No new checkout was started; please retry shortly." }, 503);
    }
    const existing = await existingResponse.json();
    if (!Array.isArray(existing)) {
      console.error("Existing subscription check returned an unexpected response shape.");
      return json({ error: "Could not verify your current subscription. No new checkout was started; please retry shortly." }, 503);
    }
    if (existing.length) {
      return json({ error: "Your Pro Technician subscription is already active. Use Manage subscription in your account to update or cancel it." }, 409);
    }
  } catch (e) {
    console.error("Existing subscription check unavailable:", e?.name || "network error");
    return json({ error: "Could not verify your current subscription. No new checkout was started; please retry shortly." }, 503);
  }

  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    customer_email: user.email,
    client_reference_id: user.id,
    "metadata[supabase_user_id]": user.id,
    "subscription_data[metadata][supabase_user_id]": user.id,
    success_url: site.replace(/\/$/, "") + "/?billing=success&session_id={CHECKOUT_SESSION_ID}#account",
    cancel_url: site.replace(/\/$/, "") + "/?billing=cancelled#services",
    allow_promotion_codes: "true",
  });
  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: "Bearer " + stripeKey, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = await r.json();
    if (!r.ok || !data.url) {
      const stripeErrorCode = typeof data?.error?.code === "string" ? data.error.code : "unknown";
      const stripeErrorParam = typeof data?.error?.param === "string" ? data.error.param : "none";
      console.error("Stripe checkout creation failed:", JSON.stringify({ status: r.status, type: data?.error?.type || "unknown", code: stripeErrorCode, param: stripeErrorParam }));
      // Return only safe, actionable diagnostics; never return the Stripe message, request body, key, or customer data.
      let message = "Checkout could not be started. Please retry shortly.";
      if (stripeErrorCode === "resource_missing" || stripeErrorCode === "price_not_found") {
        message = "Stripe could not find the configured Pro price. Confirm STRIPE_SECRET_KEY and STRIPE_PRICE_PRO belong to the same Stripe account and mode.";
      } else if (stripeErrorCode === "api_key_expired" || stripeErrorCode === "invalid_api_key") {
        message = "The Stripe secret key configured in Netlify is invalid or expired. Update it with a valid key for the intended Stripe account and mode, then redeploy.";
      } else if (stripeErrorCode === "account_invalid") {
        message = "Stripe rejected the configured account. Check that Netlify uses the intended Stripe secret key for this deploy context.";
      } else if (stripeErrorCode === "parameter_invalid_empty" || stripeErrorCode === "parameter_invalid_string_empty") {
        message = "Stripe rejected a required checkout setting. Verify the Pro price and checkout configuration.";
      }
      // Identify which Stripe account this exact runtime key belongs to, without exposing the key.
      // This distinguishes a mismatched key from a stale/wrong price environment variable.
      let stripeAccountId = "unavailable";
      if (stripeErrorCode === "resource_missing" || stripeErrorCode === "price_not_found") {
        try {
          const accountResponse = await fetch("https://api.stripe.com/v1/account", {
            headers: { authorization: "Bearer " + stripeKey },
            signal: AbortSignal.timeout(4000),
          });
          const accountData = await accountResponse.json();
          if (accountResponse.ok && typeof accountData?.id === "string") stripeAccountId = accountData.id;
        } catch {}
      }
      const priceSource = "STRIPE_PRICE_PRO environment variable";
      return json({ error: message, diagnostic: {
        stripeErrorCode, stripeErrorParam, stripeStatus: r.status,
        stripeAccountId, priceSource, priceIdSuffix: price.slice(-6),
      } }, 502);
    }
    return json({ url: data.url });
  } catch (e) {
    console.error("Stripe checkout network failure:", e?.name || "unknown");
    return json({ error: "Payment service is temporarily unreachable." }, 502);
  }
};