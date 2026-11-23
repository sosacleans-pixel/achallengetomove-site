/* Server client for the running plans: magic-link sign-in, real Stripe checkout, cross-device entitlements and gift
 * codes (Supabase edge functions ladder-checkout, ladder-redeem-gift, ladder-gift-code; tables ladder_entitlements,
 * ladder_gift_codes; RPC ladder_claim). Everything here is OFF unless config SERVER.realCheckout is true and the
 * public anon key is set, which stays off in the preview. No secrets: only the user's own session tokens are kept,
 * in this browser's storage. fetch and storage are injectable for tests. */
import { SERVER } from "./config.js";
import { grantPurchase } from "./engine.js";

const AUTH_KEY = "actm-ladder-auth";
let io = {
  fetch: (...a) => globalThis.fetch(...a),
  store: () => globalThis.localStorage,
  now: () => Date.now(),
};
export function _setIO(x) { io = { ...io, ...x }; }

export function serverEnabled(cfg = SERVER) {
  return !!(cfg.realCheckout && cfg.supabaseUrl && cfg.supabaseAnonKey);
}
const fnUrl = (name) => `${SERVER.supabaseUrl}/functions/v1/${name}`;

/* ---------- session ---------- */
export function getSession() {
  try { return JSON.parse(io.store().getItem(AUTH_KEY) || "null"); } catch { return null; }
}
function setSession(s) {
  if (s) io.store().setItem(AUTH_KEY, JSON.stringify(s));
  else io.store().removeItem(AUTH_KEY);
}
export function signOut() { setSession(null); }

/* Supabase sends the magic link; the user comes back to redirectTo with #access_token=...&refresh_token=... */
export async function sendMagicLink(email, redirectTo) {
  const r = await io.fetch(`${SERVER.supabaseUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: { apikey: SERVER.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: String(email).trim().toLowerCase(), create_user: true }),
  });
  if (!r.ok) throw new Error("Could not send the sign-in link. Check the email and try again.");
  return true;
}

/* Call once at start-up, before routing: takes the tokens out of the URL hash and returns the route to open. */
export function consumeAuthRedirect(hash) {
  const h = String(hash || "").replace(/^#/, "");
  if (!/(^|&)access_token=/.test(h)) return null;
  const p = new URLSearchParams(h);
  setSession({
    access_token: p.get("access_token"),
    refresh_token: p.get("refresh_token"),
    expires_at: io.now() + Number(p.get("expires_in") || 3600) * 1000,
  });
  return "l-paid";
}

async function token() {
  const s = getSession();
  if (!s?.access_token) return null;
  if (s.expires_at - io.now() > 60_000) return s.access_token;
  const r = await io.fetch(`${SERVER.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SERVER.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!r.ok) { setSession(null); return null; }
  const j = await r.json();
  setSession({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: io.now() + j.expires_in * 1000 });
  return j.access_token;
}
export async function signedIn() { return !!(await token()); }

async function call(url, { method = "POST", body, auth = "optional" } = {}) {
  const t = await token();
  if (auth === "required" && !t) throw Object.assign(new Error("Sign in first."), { code: "signin" });
  const r = await io.fetch(url, {
    method,
    headers: { apikey: SERVER.supabaseAnonKey, Authorization: `Bearer ${t || SERVER.supabaseAnonKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw Object.assign(new Error(j.error || j.message || `Request failed (${r.status})`), { status: r.status });
  return j;
}

/* ---------- checkout ---------- */
/* kind: new | restart | repeat | gift. Returns the Stripe Checkout URL; the caller redirects. */
export async function startCheckout({ levelId, kind, days, trainDays, startFrom, startCoreIndex, gift }) {
  const body = { level_id: levelId, kind, days_per_week: days, train_days: trainDays, start_from: startFrom, start_core_index: startCoreIndex };
  if (kind === "gift") body.gift = gift;
  const j = await call(fnUrl("ladder-checkout"), { body, auth: kind === "restart" || kind === "repeat" ? "required" : "optional" });
  if (!/^https:\/\/checkout\.stripe\.com\//.test(j.url)) throw new Error("Unexpected checkout address.");
  return j.url;
}

/* ---------- entitlements ---------- */
export async function claimAndFetch() {
  await call(`${SERVER.supabaseUrl}/rest/v1/rpc/ladder_claim`, { body: {}, auth: "required" });
  const t = await token();
  const r = await io.fetch(`${SERVER.supabaseUrl}/rest/v1/ladder_entitlements?select=*&order=created_at.asc`, {
    headers: { apikey: SERVER.supabaseAnonKey, Authorization: `Bearer ${t}` },
  });
  if (!r.ok) throw new Error("Could not load your plans.");
  return r.json();
}

/* Adds server entitlements this device has not seen yet as local runs (start date and access end from the server). */
export function applyEntitlements(L, rows) {
  let s = L;
  const seen = new Set(Object.values(s.levels || {}).flatMap((ls) => ls.runs.map((r) => r.entitlementId).filter(Boolean)));
  for (const e of rows) {
    if (seen.has(e.id) || e.refunded_at) continue;
    s = grantPurchase(s, {
      levelId: e.level_id, kind: e.kind, price: e.amount_cents != null ? (e.amount_cents / 100).toFixed(2) : null,
      daysPerWeek: e.days_per_week, trainDays: e.train_days, startFrom: e.start_from, startCoreIndex: e.start_core_index,
      mode: "stripe", today: e.start_date,
    });
    const ls = s.levels[e.level_id];
    const run = { ...ls.runs[ls.runs.length - 1], entitlementId: e.id, windowEnd: e.access_end };
    s = { ...s, levels: { ...s.levels, [e.level_id]: { ...ls, runs: [...ls.runs.slice(0, -1), run] } } };
  }
  return s;
}

/* ---------- gifts ---------- */
export async function fetchGiftCode(sessionId) {
  return call(fnUrl("ladder-gift-code"), { body: { session_id: sessionId }, auth: "required" });
}
/* Signed-in lookup of a code before redeeming: level, buyer's first name, message, dates and status only. */
export async function lookupGift(code) {
  const j = await call(fnUrl("ladder-redeem-gift"), { body: { code, lookup: true }, auth: "required" });
  return j.gift;
}
export async function redeemGiftOnServer({ code, levelId, days, trainDays, startCoreIndex }) {
  const j = await call(fnUrl("ladder-redeem-gift"), {
    body: { code, level_id: levelId, days_per_week: days, train_days: trainDays, start_core_index: startCoreIndex, adult: true, accepted_terms: true },
    auth: "required",
  });
  return j.entitlement;
}
