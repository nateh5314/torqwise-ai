import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const fail = (message) => { console.error("FAIL:", message); process.exitCode = 1; };
const read = (path) => {
  try { return readFileSync(new URL("../" + path, import.meta.url), "utf8"); }
  catch { fail("Missing required file: " + path); return ""; }
};

const html = read("index.html");
const research = read("netlify/functions/research.mjs");
const config = read("netlify/functions/config.mjs");
const quotaCore = read("supabase/migrations/20261010050000_torqwise_core_usage.sql");
const quotaRefund = read("supabase/migrations/20261010060000_torqwise_refund_question.sql");
const quotaReservations = read("supabase/migrations/20261010070000_torqwise_quota_reservations.sql");
const netlify = read("netlify.toml");
const pkgText = read("package.json");
let pkg = {};
try { pkg = JSON.parse(pkgText); } catch { fail("package.json is not valid JSON."); }

const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/\bsrc\s*=/.test(match[1]));
if (inlineScripts.length === 0) fail("No inline JavaScript was found in index.html.");
for (let i = 0; i < inlineScripts.length; i++) {
  try { new vm.Script(inlineScripts[i][2], { filename: "index.html:inline-script-" + (i + 1) }); }
  catch (error) { fail("Inline script " + (i + 1) + " has a syntax error: " + error.message); }
}

for (const [path, source] of [
  ["netlify/functions/research.mjs", research],
  ["netlify/functions/config.mjs", config],
]) {
  const checked = spawnSync(process.execPath, ["--check", new URL("../" + path, import.meta.url).pathname], { encoding: "utf8" });
  if (checked.status !== 0) fail(path + " syntax check failed: " + (checked.stderr || checked.stdout || "unknown error"));
}

const required = [
  [html, "Supabase sign-up", "torqSupabase.auth.signUp"],
  [html, "Supabase password sign-in", "torqSupabase.auth.signInWithPassword"],
  [html, "Bearer session header", "headers['Authorization']='Bearer '+session['access_token']"],
  [research, "server-side user verification", "/auth/v1/user"],
  [research, "reservation-based quota consume RPC", "torqwise_consume_question_v2"],
  [research, "reservation-based quota refund RPC", "torqwise_refund_question_v2"],
  [research, "reservation ID passed to refund", "p_reservation_id: quota.reservation_id"],
  [quotaCore, "usage table migration", "create table if not exists public.torqwise_usage"],
  [quotaCore, "subscription table migration", "create table if not exists public.torqwise_subscriptions"],
  [quotaCore, "free tier quota", "v_limit := 3"],
  [quotaCore, "Driver tier quota", "then 100"],
  [quotaCore, "Pro tier quota", "then 400"],
  [quotaCore, "server-only quota consume RPC", "grant execute on function public.torqwise_consume_question(uuid, text) to service_role"],
  [quotaRefund, "legacy server-only quota refund RPC", "grant execute on function public.torqwise_refund_question(uuid, text, date) to service_role"],
  [quotaReservations, "reservation table migration", "create table if not exists public.torqwise_quota_reservations"],
  [quotaReservations, "server-only v2 quota consume RPC", "grant execute on function public.torqwise_consume_question_v2(uuid, text) to service_role"],
  [quotaReservations, "server-only v2 quota refund RPC", "grant execute on function public.torqwise_refund_question_v2(uuid) to service_role"],
  [quotaReservations, "idempotent refund guard", "and refunded_at is null"],
  [quotaReservations, "reservation refund updates matching usage period", "where user_id = v_user_id"],
  [research, "question-limit rejection", "if (!quota.allowed)"],
  [research, "fail-closed reservation ID validation", "The question-limit service could not safely reserve your allowance."],
  [config, "public Supabase config", "SUPABASE_PUBLISHABLE_KEY"],
  [netlify, "Netlify function directory", 'functions = "netlify/functions"'],
];
for (const [source, label, needle] of required) if (!source.includes(needle)) fail("Missing " + label + ".");

const upstreamErrorBlock = research.slice(research.indexOf("if (!upstream.ok)"), research.indexOf("const answer = extractText(payload)"));
if (!upstreamErrorBlock.includes("await refundQuota")) fail("Upstream HTTP errors must attempt to restore the consumed question allowance.");
if (!research.includes("await refundQuota({ supabaseUrl, secretKey, quota });")) fail("Research transport/parse failures must attempt quota restoration.");
if (config.includes("SUPABASE_SECRET_KEY")) fail("Public config endpoint must not expose the Supabase secret key.");
if (!/id="authPassword"[^>]*minlength="8"/.test(html)) fail("Account password field should require at least 8 characters.");
if (!pkg.scripts || pkg.scripts.test !== "node scripts/validate.mjs") fail("package.json test script is not configured.");

if (process.exitCode) process.exit(process.exitCode);
console.log("TORQWISE static checks passed.");
console.log("- Inline JavaScript syntax checked");
console.log("- Netlify function syntax checked");
console.log("- Account, session, and quota wiring checked");
console.log("- Reservation-specific, idempotent quota rollback checked");
console.log("- Public config secret exposure checked");
console.log("- Failed-research quota rollback wiring checked");
