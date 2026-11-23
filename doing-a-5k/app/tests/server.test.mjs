/* Node checks for the browser server client (js/ladder/server.js) with a fake fetch and storage, and for the
 * checkout flag staying OFF in the preview. Run: node doing-a-5k/app/tests/server.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const here = fileURLToPath(new URL(".", import.meta.url));
globalThis.location = { hostname: "localhost" };
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const E = await import("../js/ladder/engine.js");
const dataDir = join(here, "../data/ladder");
const index = JSON.parse(readFileSync(join(dataDir, "index.json")));
E.applyIndex(index);
E.applyLevels(Object.fromEntries(index.files.map((f) => { const j = JSON.parse(readFileSync(join(dataDir, f.file))); return [`${j.id}-${j.daysPerWeek}x`, j]; })));
const C = await import("../js/ladder/config.js");
const S = await import("../js/ladder/server.js");
const { CHECKOUT, isPreviewCheckout } = await import("../js/ladder/checkout.js");

// The flag stays OFF in the preview, so the app keeps the simulated checkout.
assert.equal(C.SERVER.realCheckout, false);
assert.equal(C.SERVER.supabaseAnonKey, "");
assert.equal(S.serverEnabled(), false);
assert.equal(CHECKOUT.mode, "preview");
assert.equal(isPreviewCheckout(), true);
assert.equal(S.serverEnabled({ realCheckout: true, supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "" }), false, "needs the anon key too");
assert.equal(S.serverEnabled({ realCheckout: true, supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "k" }), true);
assert.match(C.SERVER.supabaseUrl, /^https:\/\/olncfwohfpgpmygxjpcm\.supabase\.co$/);
assert.equal(C.SERVER.siteUrl, "https://achallengetomove.com");
// The generated server config (written into the private backend repo) has the fixed return URLs and level names.
const LC = execFileSync(process.execPath, [join(here, "../tools/sync-server-config.mjs"), "--print"], { encoding: "utf8" });
assert.ok(LC.includes('"10k": "A Challenge to Move: 10K"'));
assert.ok(LC.includes('"stopUrl": "https://achallengetomove.com/doing-a-5k/app/#l-stop"'));
assert.ok(LC.includes('"purchase": "https://achallengetomove.com/doing-a-5k/app/#l-paid?session_id={CHECKOUT_SESSION_ID}"'));
assert.ok(LC.includes('"gift": "https://achallengetomove.com/doing-a-5k/app/#l-gift-status?session_id={CHECKOUT_SESSION_ID}&new=1"'));
assert.ok(LC.includes('"cancel": "https://achallengetomove.com/doing-a-5k/"'));
for (const v of Object.values(C.SERVER)) assert.ok(!/service_role|sb_secret_|sk_live|rk_live/.test(String(v)));

// Fake network for the rest (flag forced on inside server.js via its config object).
C.SERVER.realCheckout = true; C.SERVER.supabaseAnonKey = "anon-test";
const calls = [];
let now = 1_800_000_000_000;
S._setIO({
  now: () => now,
  fetch: async (url, init = {}) => {
    calls.push({ url, init });
    const ok = (j) => ({ ok: true, status: 200, json: async () => j });
    if (url.includes("/auth/v1/otp")) return ok({});
    if (url.includes("/auth/v1/token")) return ok({ access_token: "tok2", refresh_token: "ref2", expires_in: 3600 });
    if (url.endsWith("/functions/v1/ladder-checkout")) return ok({ ok: true, id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    if (url.endsWith("/rest/v1/rpc/ladder_claim")) return ok([{ entitlements: 1, gifts: 0 }]);
    if (url.includes("/rest/v1/ladder_entitlements")) return ok([
      { id: "e1", level_id: "10k", kind: "new", days_per_week: 3, train_days: [1, 3, 6], start_date: "2026-11-22", access_end: "2027-02-27", start_from: "resume", start_core_index: 1, amount_cents: 699, refunded_at: null, stripe_session_id: "cs_live_1" },
      { id: "e2", level_id: "5k-faster", kind: "new", days_per_week: 2, train_days: null, start_date: "2026-11-01", access_end: "2027-03-20", start_from: "resume", start_core_index: 1, amount_cents: 699, refunded_at: "2026-11-02T00:00:00Z" },
    ]);
    if (url.endsWith("/functions/v1/ladder-redeem-gift")) return ok({ ok: true, gift: { level_id: "10k", buyer_name: "Gia" } });
    if (url.endsWith("/functions/v1/ladder-gift-recipient")) return ok({ ok: true, recipient_email: JSON.parse(init.body).recipient_email, sending: "off" });
    if (url.endsWith("/functions/v1/ladder-gift-stop")) return JSON.parse(init.body).t === "good" ? ok({ ok: true, stopped: true }) : { ok: false, status: 400, json: async () => ({ ok: false, error: "invalid link" }) };
    return { ok: false, status: 404, json: async () => ({ error: "nope" }) };
  },
});

// signed out: a new purchase can start; a restart asks to sign in first
const url = await S.startCheckout({ levelId: "10k", kind: "new", days: 3, trainDays: [1, 3, 6], startFrom: "resume", startCoreIndex: 1 });
assert.equal(url, "https://checkout.stripe.com/c/pay/cs_test_1");
const sent = JSON.parse(calls.at(-1).init.body);
assert.deepEqual(sent, { level_id: "10k", kind: "new", days_per_week: 3, train_days: [1, 3, 6], start_from: "resume", start_core_index: 1 });
assert.ok(!("price" in sent) && !("amount" in sent), "the browser never sends a price");
assert.equal(calls.at(-1).init.headers.Authorization, "Bearer anon-test");
await assert.rejects(S.startCheckout({ levelId: "10k", kind: "restart", days: 3 }), (e) => e.code === "signin");

// magic link, then the return with tokens in the hash
await S.sendMagicLink(" Ana@Example.com ", "https://achallengetomove.com/doing-a-5k/app/");
assert.match(calls.at(-1).url, /\/auth\/v1\/otp\?redirect_to=https%3A%2F%2Fachallengetomove\.com%2Fdoing-a-5k%2Fapp%2F$/);
assert.equal(JSON.parse(calls.at(-1).init.body).email, "ana@example.com");
assert.equal(S.consumeAuthRedirect("#l-today"), null);
assert.equal(S.consumeAuthRedirect("#access_token=tok1&refresh_token=ref1&expires_in=3600&token_type=bearer"), "l-paid");
assert.equal(await S.signedIn(), true);
now += 3600_000; // expired: refreshes
assert.equal(await S.signedIn(), true);
assert.equal(S.getSession().access_token, "tok2");

// claim + fetch, then add server runs to this device once (refunded rows skipped)
const rows = await S.claimAndFetch();
let L = S.applyEntitlements(E.emptyState(), rows);
assert.equal(E.currentRun(L, "10k").entitlementId, "e1");
assert.equal(E.currentRun(L, "10k").windowEnd, "2027-02-27");
assert.equal(E.currentRun(L, "10k").windowStart, "2026-11-22");
assert.equal(E.currentRun(L, "5k-faster"), null);
L = S.applyEntitlements(L, rows);
assert.equal(L.levels["10k"].runs.length, 1, "applying twice adds nothing");
assert.equal((await S.lookupGift("5K-AAAA-AAAA")).buyer_name, "Gia");

// buyer fixes the recipient's email (signed in), STOP link (no sign-in, no anon key)
const fix = await S.updateGiftRecipient("cs_live_1", " New@Example.com ", "es");
assert.equal(fix.recipient_email, "new@example.com");
assert.deepEqual(JSON.parse(calls.at(-1).init.body), { session_id: "cs_live_1", recipient_email: "new@example.com", lang: "es" });
assert.equal(calls.at(-1).init.headers.Authorization, "Bearer tok2");
assert.equal((await S.stopGiftReminders("22222222-2222-4222-8222-222222222222", "good")).stopped, true);
assert.ok(!("Authorization" in calls.at(-1).init.headers) && !("apikey" in calls.at(-1).init.headers));
await assert.rejects(S.stopGiftReminders("g", "bad"), (e) => e.status === 400);

// server config mirror in sync with config.js
execFileSync(process.execPath, [join(here, "../tools/sync-server-config.mjs"), "--check"], { stdio: "pipe" });
console.log("server client: all checks passed");
