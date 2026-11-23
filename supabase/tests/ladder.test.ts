// deno test supabase/tests/   (no network, no Supabase, no Stripe: fake DB and fake Stripe)
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  accessEnd, checkoutParams, codeHash, giftCodeFor, giftReminderDates, handleWebhook, parseCheckoutRequest, redeemBy,
  signForTest, todayIn, verifyStripeSignature, type LadderDb,
} from "../functions/_shared/ladder-core.ts";
import { handleCheckout, handleGiftCode, handleRedeem, type User } from "../functions/_shared/ladder-handlers.ts";
import { LADDER } from "../functions/_shared/ladder-config.ts";

const WH = "whsec_test_fixture_only";
const GS = "gift_secret_fixture_only";
const fx = (n: string) => Deno.readTextFileSync(new URL(`./fixtures/${n}.json`, import.meta.url));
const NOW = new Date(1795413600 * 1000 + 30_000); // 30 s after the fixture events

function fakeDb() {
  const s = { events: new Map<string, string>(), ents: new Map<string, any>(), gifts: new Map<string, any>(), refunds: [] as string[] };
  const db: LadderDb = {
    seenEvent: async (id) => s.events.has(id),
    recordEvent: async (id, t) => void s.events.set(id, t),
    insertEntitlement: async (r) => { if (!s.ents.has(r.stripe_session_id as string)) s.ents.set(r.stripe_session_id as string, r); },
    insertGift: async (r) => { if (!s.gifts.has(r.stripe_session_id as string)) s.gifts.set(r.stripe_session_id as string, r); },
    markRefunded: async (pi) => void s.refunds.push(pi),
  };
  return { s, db };
}
async function deliver(name: string, db: LadderDb, o: { secret?: string; t?: number; tamper?: boolean } = {}) {
  const raw = fx(name);
  const t = o.t ?? Math.floor(NOW.getTime() / 1000);
  const sig = await signForTest(raw, o.secret ?? WH, t);
  return handleWebhook(o.tamper ? raw.replace("699", "1") : raw, sig, { webhookSecret: WH, giftSecret: GS, db, now: NOW });
}

Deno.test("dates match the app (Denver calendar day, access inclusive, 5-year redeem-by)", () => {
  assertEquals(todayIn("America/Denver", new Date(1795413600 * 1000)), "2026-11-22"); // 11 PM MT, already Nov 23 UTC
  assertEquals(accessEnd("2026-11-22", 3), "2027-02-27"); // 14 weeks - 1 day
  assertEquals(accessEnd("2026-11-22", 2), "2027-04-10"); // 20 weeks
  assertEquals(accessEnd("2026-11-22", 5), "2027-02-06"); // 11 weeks
  assertEquals(redeemBy("2026-11-22"), "2031-11-22");
  assertEquals(redeemBy("2028-02-29"), "2033-03-01");
  assertEquals(giftReminderDates({ recipientEmail: "b@x.com", shareMyself: false, deliverOn: "2026-12-25", redeemBy: "2031-11-22" }), ["2027-01-01", "2027-01-24", "2027-12-25", "2031-09-23"]);
  assertEquals(giftReminderDates({ recipientEmail: null, shareMyself: true, deliverOn: "2026-12-25", redeemBy: "2031-11-22" }), []);
});

Deno.test("signature: valid passes; wrong secret, tampered body, stale or missing header fail", async () => {
  const raw = fx("purchase"); const t = 1795413600;
  assert(await verifyStripeSignature(raw, await signForTest(raw, WH, t), WH, t + 10));
  assert(!(await verifyStripeSignature(raw, await signForTest(raw, "whsec_other", t), WH, t + 10)));
  assert(!(await verifyStripeSignature(raw + " ", await signForTest(raw, WH, t), WH, t + 10)));
  assert(!(await verifyStripeSignature(raw, await signForTest(raw, WH, t), WH, t + 301)));
  assert(!(await verifyStripeSignature(raw, null, WH, t)));
  assert(!(await verifyStripeSignature(raw, `t=${t},v0=abc`, WH, t)));
  // Stripe may send several v1 values during secret rotation
  const good = (await signForTest(raw, WH, t)).split("v1=")[1];
  assert(await verifyStripeSignature(raw, `t=${t},v1=deadbeef,v1=${good}`, WH, t));
});

Deno.test("webhook: purchase writes one entitlement; duplicates and retries are no-ops", async () => {
  const { s, db } = fakeDb();
  const r = await deliver("purchase", db);
  assertEquals(r.status, 200); assertEquals(r.body.wrote, "entitlement");
  const e = s.ents.get("cs_live_a1WalkTo5KPurchase");
  assertEquals(e, {
    stripe_session_id: "cs_live_a1WalkTo5KPurchase", stripe_payment_intent: "pi_3WalkTo5KPurchase", amount_cents: 699, currency: "usd",
    source: "stripe", email: "runner@example.com", user_id: "aaaaaaaa-0000-0000-0000-000000000001", level_id: "walk-to-5k", kind: "new",
    days_per_week: 3, train_days: [1, 3, 6], start_date: "2026-11-22", access_end: "2027-02-27", start_from: "resume", start_core_index: 16,
  });
  const again = await deliver("purchase", db);
  assertEquals(again.body.duplicate, true);
  assertEquals(s.ents.size, 1);
});

Deno.test("webhook: restart uses the $2.99 price and the plan's access length", async () => {
  const { s, db } = fakeDb();
  assertEquals((await deliver("restart", db)).body.wrote, "entitlement");
  const e = s.ents.get("cs_live_b2TenKRestart");
  assertEquals([e.kind, e.level_id, e.days_per_week, e.access_end, e.start_from, e.amount_cents, e.train_days], ["restart", "10k", 2, "2027-04-10", "start", 299, null]);
});

Deno.test("webhook: gift stores only a keyed hash of the code, 5-year redeem-by and reminder dates", async () => {
  const { s, db } = fakeDb();
  assertEquals((await deliver("gift", db)).body.wrote, "gift");
  const g = s.gifts.get("cs_live_c3GiftFaster");
  const code = await giftCodeFor(GS, "cs_live_c3GiftFaster");
  assertMatch(code, /^5K-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assertEquals(g.code_hash, await codeHash(GS, code));
  assert(!JSON.stringify(g).includes(code), "plain code never stored");
  assertEquals([g.level_id, g.buyer_email, g.buyer_user_id, g.recipient_email, g.purchased_on, g.deliver_on, g.redeem_by], ["5k-faster", "giver@example.com", null, "bo@example.com", "2026-11-22", "2026-12-25", "2031-11-22"]);
  assertEquals(g.reminder_dates, ["2027-01-01", "2027-01-24", "2027-12-25", "2031-09-23"]);
  assertEquals(s.ents.size, 0, "a gift grants nothing until it is redeemed");
});

Deno.test("webhook: other products, unpaid, wrong amount and wrong price are ignored (200, nothing written)", async () => {
  for (const n of ["other_product", "unpaid", "amount_mismatch", "price_mismatch"]) {
    const { s, db } = fakeDb();
    const r = await deliver(n, db);
    assertEquals(r.status, 200, n); assert(r.body.ignored, n);
    assertEquals(s.ents.size + s.gifts.size, 0, n);
  }
});

Deno.test("webhook: bad signature is 400 and writes nothing", async () => {
  for (const o of [{ secret: "whsec_wrong" }, { tamper: true }, { t: Math.floor(NOW.getTime() / 1000) - 3600 }]) {
    const { s, db } = fakeDb();
    const r = await deliver("purchase", db, o);
    assertEquals(r.status, 400); assertEquals(s.ents.size + s.events.size, 0);
  }
});

Deno.test("webhook: full refund marks the payment refunded; partial refund does nothing", async () => {
  const { s, db } = fakeDb();
  assertEquals((await deliver("refund", db)).body.wrote, "refund");
  assertEquals(s.refunds, ["pi_3Gift"]);
  await deliver("partial_refund", db);
  assertEquals(s.refunds, ["pi_3Gift"]);
});

Deno.test("checkout request validation and Stripe params come from config, not the client", async () => {
  const ok = parseCheckoutRequest({ level_id: "walk-to-5k", kind: "new", days_per_week: 3, train_days: [6, 1, 3], start_core_index: 16, price: 1 });
  assert(ok.ok);
  if (!ok.ok) return;
  const p = checkoutParams(ok.req, { email: "a@x.com", userId: "u1" });
  assertEquals(p["line_items[0][price]"], LADDER.stripe["walk-to-5k"].purchase);
  assertEquals(p.mode, "payment");
  assertEquals(p["metadata[train_days]"], "1,3,6");
  assertEquals(p["metadata[start_core_index]"], "16");
  assertEquals(p["payment_intent_data[metadata][level_id]"], "walk-to-5k");
  assertEquals(p.success_url, "https://achallengetomove.com/doing-a-5k/app/#l-paid?session_id={CHECKOUT_SESSION_ID}");
  assertEquals(p.cancel_url, "https://achallengetomove.com/doing-a-5k/");
  assertEquals(p.customer_email, "a@x.com"); assertEquals(p.client_reference_id, "u1");
  assert(!Object.keys(p).some((k) => k.includes("subscription") || k.includes("setup_future_usage")));
  const rs = parseCheckoutRequest({ level_id: "10k", kind: "repeat", days_per_week: 4 });
  assert(rs.ok && checkoutParams(rs.req)["line_items[0][price]"] === LADDER.stripe["10k"].restart);
  assert(rs.ok && checkoutParams(rs.req).success_url === "https://achallengetomove.com/doing-a-5k/app/#l-paid?session_id={CHECKOUT_SESSION_ID}");
  // head start only for a new Walk to 5K purchase
  const hs = parseCheckoutRequest({ level_id: "10k", kind: "new", days_per_week: 3, start_core_index: 16 });
  assert(hs.ok && hs.req.startCoreIndex === 1);
  for (const bad of [{ level_id: "half" }, { level_id: "10k", days_per_week: 6 }, { level_id: "10k", days_per_week: 3, train_days: [1, 1, 2] },
    { level_id: "10k", kind: "gift", gift: { buyer_name: "A", recipient_name: "B", recipient_adult: true } },
    { level_id: "10k", kind: "gift", gift: { buyer_name: "A", recipient_name: "B", share_myself: true } }]) {
    assert(!parseCheckoutRequest(bad).ok, JSON.stringify(bad));
  }
  const g = parseCheckoutRequest({ level_id: "10k", kind: "gift", gift: { buyer_name: "A", recipient_name: "B", share_myself: true, recipient_adult: true, recipient_email: "ignored@x.com" } });
  assert(g.ok && g.req.gift?.recipientEmail === null);
  if (g.ok) {
    const gp = checkoutParams(g.req);
    assertEquals(gp.success_url, "https://achallengetomove.com/doing-a-5k/app/#l-gift-status?session_id={CHECKOUT_SESSION_ID}&new=1");
    assertEquals(gp.cancel_url, "https://achallengetomove.com/doing-a-5k/");
    assertEquals(gp["line_items[0][price]"], LADDER.stripe["10k"].purchase);
  }
});

const ANA: User = { id: "aaaaaaaa-0000-0000-0000-000000000001", email: "ana@example.com", emailConfirmed: true };
Deno.test("handleCheckout: restart needs sign-in and an earlier purchase; new purchase may be signed out", async () => {
  const calls: Record<string, string>[] = [];
  const d = { hasEntitlement: async (_u: string, l: string) => l === "walk-to-5k", createSession: async (p: Record<string, string>) => (calls.push(p), { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }) };
  assertEquals((await handleCheckout({ level_id: "10k", kind: "restart", days_per_week: 3 }, null, d)).status, 401);
  assertEquals((await handleCheckout({ level_id: "10k", kind: "restart", days_per_week: 3 }, ANA, d)).status, 403);
  const r = await handleCheckout({ level_id: "walk-to-5k", kind: "restart", days_per_week: 3 }, ANA, d);
  assertEquals(r.status, 200); assertEquals(calls[0]["line_items[0][price]"], LADDER.stripe["walk-to-5k"].restart);
  const n = await handleCheckout({ level_id: "5k-faster", kind: "new", days_per_week: 2 }, null, d);
  assertEquals(n.status, 200); assert(!("customer_email" in calls[1]) && !("client_reference_id" in calls[1]));
});

Deno.test("handleRedeem and handleGiftCode", async () => {
  const code = await giftCodeFor(GS, "cs_live_c3GiftFaster");
  const seen: any[] = [];
  const red = { giftSecret: GS, now: NOW, redeem: async (a: any) => (seen.push(a), { id: "e1", kind: "gift" }) };
  assertEquals((await handleRedeem({ code }, null, red)).status, 401);
  const body = { code: code.toLowerCase(), level_id: "10k", days_per_week: 3, train_days: [5, 1, 3], adult: true, accepted_terms: true };
  const r = await handleRedeem(body, ANA, red);
  assertEquals(r.status, 200);
  assertEquals(seen[0].codeHash, await codeHash(GS, code));
  assertEquals([seen[0].today, seen[0].accessEnd, seen[0].trainDays], ["2026-11-22", "2027-02-27", [1, 3, 5]]);
  assertEquals((await handleRedeem({ ...body, adult: false }, ANA, red)).status, 400);
  const used = { giftSecret: GS, redeem: async () => { throw new Error("gift code already redeemed"); } };
  assertEquals((await handleRedeem(body, ANA, used)).body.error, "gift code already redeemed");
  const look = { ...red, lookup: async (h: string) => (h === seen[0].codeHash ? { level_id: "5k-faster", buyer_name: "Gia", message: "Hi", redeem_by: "2031-11-22", deliver_on: "2026-12-25", redeemed_at: null, refunded_at: null, buyer_email: "giver@example.com", recipient_email: "bo@example.com" } : null) };
  const lk = await handleRedeem({ code, lookup: true }, ANA, look);
  assertEquals(lk.body.gift, { level_id: "5k-faster", buyer_name: "Gia", message: "Hi", redeem_by: "2031-11-22", deliver_on: "2026-12-25", redeemed: false, refunded: false });
  assert(!JSON.stringify(lk.body).includes("@"), "lookup never returns emails");
  assertEquals((await handleRedeem({ code: "5K-AAAA-AAAA", lookup: true }, ANA, look)).status, 404);
  assertEquals((await handleRedeem({ code, lookup: true }, null, look)).status, 401);

  const row = { buyer_email: "giver@example.com", buyer_user_id: null, code_hash: await codeHash(GS, code), level_id: "5k-faster", redeem_by: "2031-11-22" };
  const gc = { giftSecret: GS, giftBySession: async (sid: string) => (sid === "cs_live_c3GiftFaster" ? row : null) };
  const giver: User = { id: "99999999-0000-0000-0000-000000000009", email: "giver@example.com", emailConfirmed: true };
  const gr = await handleGiftCode({ session_id: "cs_live_c3GiftFaster" }, giver, gc);
  assertEquals(gr.body.code, code); assertEquals(gr.body.redeemed, false);
  assert(!("redeemed_by_user_id" in gr.body) && !("code_hash" in gr.body));
  assertEquals((await handleGiftCode({ session_id: "cs_live_c3GiftFaster" }, ANA, gc)).status, 403);
  assertEquals((await handleGiftCode({ session_id: "cs_live_c3GiftFaster" }, { ...giver, emailConfirmed: false }, gc)).status, 401);
  assertEquals((await handleGiftCode({ session_id: "cs_live_zzz" }, giver, gc)).status, 404);
});

Deno.test("config mirror matches the app config (prices, access, IDs)", async () => {
  assertEquals(LADDER.priceCents["walk-to-5k"], 699); assertEquals(LADDER.priceCents.restart, 299);
  assertEquals(LADDER.accessWeeksByDays, { "2": 20, "3": 14, "4": 12, "5": 11 });
  for (const l of LADDER.levels) { assertMatch(LADDER.stripe[l].purchase, /^price_/); assertMatch(LADDER.stripe[l].restart, /^price_/); }
});
