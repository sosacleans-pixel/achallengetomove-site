// Running plans (A Challenge to Move): pure server logic shared by the ladder edge functions.
// No I/O and no secrets here: callers pass secrets in. Tested with `deno test supabase/tests/`.
import { LADDER } from "./ladder-config.ts";

export type LevelId = "walk-to-5k" | "5k-faster" | "10k";
export type Kind = "new" | "restart" | "repeat" | "gift";
const KINDS: Kind[] = ["new", "restart", "repeat", "gift"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ---------- dates (America/Denver calendar days, like the app) ---------- */
export function todayIn(tz: string = LADDER.timeZone, now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function accessWeeks(days: number): number {
  const w = (LADDER.accessWeeksByDays as Record<string, number>)[String(days)];
  if (!w) throw new Error("bad days_per_week");
  return w;
}
/* Same as the app's engine.accessEnd: the last day of access, inclusive. */
export function accessEnd(startISO: string, days: number): string {
  return addDays(startISO, accessWeeks(days) * 7 - 1);
}
/* Same as the app's gifts.redeemByDate: purchase date + 5 years (Feb 29 rolls to Mar 1). */
export function redeemBy(purchasedISO: string): string {
  const [y, m, d] = purchasedISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y + LADDER.giftCodeYears, m - 1, d));
  return dt.toISOString().slice(0, 10);
}
/* Same rule as the app's gifts.giftReminderDates (Attorney memo §10.3). */
export function giftReminderDates(g: { recipientEmail: string | null; shareMyself: boolean; deliverOn: string; redeemBy: string }): string[] {
  if (!g.recipientEmail || g.shareMyself) return [];
  const c = [addDays(g.deliverOn, 7), addDays(g.deliverOn, 30), addDays(g.deliverOn, 365), addDays(g.redeemBy, -60)].sort();
  const out: string[] = [];
  for (const d of c) {
    if (d > g.redeemBy) continue;
    if (out.length && (Date.parse(d) - Date.parse(out[out.length - 1])) / 864e5 < 14) continue;
    out.push(d);
  }
  return out;
}

/* ---------- checkout request ---------- */
export interface CheckoutRequest {
  levelId: LevelId; kind: Kind; days: number; trainDays: number[] | null; startFrom: "resume" | "start"; startCoreIndex: number;
  gift: null | { buyerName: string; recipientName: string; recipientEmail: string | null; shareMyself: boolean; message: string; deliverOn: string | null };
}
export function parseCheckoutRequest(b: any): { ok: true; req: CheckoutRequest } | { ok: false; error: string } {
  if (!b || typeof b !== "object") return { ok: false, error: "bad request" };
  const levelId = b.level_id;
  if (!(LADDER.levels as readonly string[]).includes(levelId)) return { ok: false, error: "unknown level" };
  const kind = b.kind ?? "new";
  if (!KINDS.includes(kind)) return { ok: false, error: "unknown kind" };
  let days = 0, trainDays: number[] | null = null;
  if (kind !== "gift") {
    days = Number(b.days_per_week);
    if (![2, 3, 4, 5].includes(days)) return { ok: false, error: "days_per_week must be 2 to 5" };
    if (b.train_days != null) {
      if (!Array.isArray(b.train_days) || b.train_days.length !== days || !b.train_days.every((x: any) => Number.isInteger(x) && x >= 0 && x <= 6) || new Set(b.train_days).size !== days)
        return { ok: false, error: "train_days must list days_per_week distinct weekdays 0 to 6" };
      trainDays = [...b.train_days].sort((a, c) => a - c);
    }
  }
  const startFrom = b.start_from === "start" ? "start" : "resume";
  const startCoreIndex = kind === "new" && levelId === "walk-to-5k" && Number(b.start_core_index) === LADDER.headStartCoreIndex ? LADDER.headStartCoreIndex : 1;
  let gift: CheckoutRequest["gift"] = null;
  if (kind === "gift") {
    const g = b.gift || {};
    const buyerName = String(g.buyer_name || "").trim().slice(0, 60);
    const recipientName = String(g.recipient_name || "").trim().slice(0, 60);
    const shareMyself = !!g.share_myself;
    const recipientEmail = String(g.recipient_email || "").trim().toLowerCase() || null;
    if (!buyerName || !recipientName) return { ok: false, error: "buyer and recipient first names are required" };
    if (!shareMyself && !recipientEmail) return { ok: false, error: "recipient email is required unless you share the code yourself" };
    if (recipientEmail && (!EMAIL_RE.test(recipientEmail) || recipientEmail.length > 200)) return { ok: false, error: "check the recipient email" };
    if (g.recipient_adult !== true) return { ok: false, error: "confirm the recipient is 18 or older" };
    const deliverOn = g.deliver_on && ISO_RE.test(g.deliver_on) ? g.deliver_on : null;
    gift = { buyerName, recipientName, recipientEmail: shareMyself ? null : recipientEmail, shareMyself, message: String(g.message || "").slice(0, 300), deliverOn };
  }
  return { ok: true, req: { levelId, kind, days, trainDays, startFrom, startCoreIndex, gift } };
}

export function priceFor(levelId: LevelId, kind: Kind): { priceId: string; cents: number } {
  const s = (LADDER.stripe as any)[levelId];
  if (kind === "restart" || kind === "repeat") return { priceId: s.restart, cents: (LADDER.priceCents as any)[kind] };
  return { priceId: s.purchase, cents: (LADDER.priceCents as any)[levelId] };
}

/* Stripe Checkout Session form params (one-time payment, no subscription, no saved card). The price comes from
 * config, never from the client. Metadata is set server-side, so the webhook can trust it. */
export function checkoutParams(req: CheckoutRequest, o: { email?: string | null; userId?: string | null } = {}): Record<string, string> {
  const { priceId } = priceFor(req.levelId, req.kind);
  const meta: Record<string, string> = {
    app: LADDER.app, level_id: req.levelId, kind: req.kind, price_id: priceId,
    days_per_week: req.kind === "gift" ? "" : String(req.days),
    train_days: req.trainDays ? req.trainDays.join(",") : "",
    start_from: req.startFrom, start_core_index: String(req.startCoreIndex),
  };
  if (req.gift) {
    Object.assign(meta, {
      gift_buyer_name: req.gift.buyerName, gift_recipient_name: req.gift.recipientName,
      gift_recipient_email: req.gift.recipientEmail || "", gift_share_myself: req.gift.shareMyself ? "1" : "0",
      gift_deliver_on: req.gift.deliverOn || "", gift_message: req.gift.message,
    });
  }
  const p: Record<string, string> = {
    mode: "payment",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    // Purchases, restarts and repeats return to the app, which unlocks the level with the chosen days and end date;
    // gifts return to the gift receipt. Cancel goes back to the product page. Fixed in config, not from the client.
    success_url: req.kind === "gift" ? LADDER.returnUrls.gift : LADDER.returnUrls.purchase,
    cancel_url: LADDER.returnUrls.cancel,
    allow_promotion_codes: "false",
  };
  if (o.email) p.customer_email = o.email;
  if (o.userId) p.client_reference_id = o.userId;
  for (const [k, v] of Object.entries(meta)) {
    p[`metadata[${k}]`] = v;
    if (!k.startsWith("gift_")) p[`payment_intent_data[metadata][${k}]`] = v;
  }
  return p;
}

/* ---------- Stripe webhook signature (Stripe-Signature: t=...,v1=...) ---------- */
const enc = new TextEncoder();
async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export async function verifyStripeSignature(raw: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((x) => x.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const v1s = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !v1s.length) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const want = await hmacHex(secret, `${t}.${raw}`);
  return v1s.some((v) => safeEqual(v, want));
}
export async function signForTest(raw: string, secret: string, t: number): Promise<string> {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${raw}`)}`;
}

/* ---------- gift codes: derived from the session, only a keyed hash is stored ---------- */
const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // same alphabet as the app, 32 symbols (no bias from % 32)
export async function giftCodeFor(secret: string, sessionId: string): Promise<string> {
  const hex = await hmacHex(secret, `gift:${sessionId}`);
  const c = Array.from({ length: 8 }, (_, i) => ABC[parseInt(hex.slice(i * 2, i * 2 + 2), 16) % 32]).join("");
  return `5K-${c.slice(0, 4)}-${c.slice(4)}`;
}
export function normalizeCode(code: string): string {
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
}
export async function codeHash(secret: string, code: string): Promise<string> {
  return hmacHex(secret, `code:${normalizeCode(code)}`);
}

/* ---------- webhook: what to write for a completed Checkout Session ---------- */
export type WebhookPlan =
  | { type: "ignore"; reason: string }
  | { type: "entitlement"; row: Record<string, unknown> }
  | { type: "gift"; row: Record<string, unknown> };

export async function planForSession(s: any, o: { giftSecret: string; today: string }): Promise<WebhookPlan> {
  const m = s?.metadata || {};
  if (m.app !== LADDER.app) return { type: "ignore", reason: "not a running plan session" };
  if (s.mode !== "payment") return { type: "ignore", reason: "not a one-time payment" };
  if (s.payment_status !== "paid") return { type: "ignore", reason: `payment_status ${s.payment_status}` };
  if (!(LADDER.levels as readonly string[]).includes(m.level_id) || !KINDS.includes(m.kind)) return { type: "ignore", reason: "bad metadata" };
  const { priceId, cents } = priceFor(m.level_id, m.kind);
  if (m.price_id !== priceId) return { type: "ignore", reason: "price id mismatch" };
  if (s.currency !== "usd" || s.amount_total !== cents) return { type: "ignore", reason: "amount mismatch" };
  const email = String(s.customer_details?.email || s.customer_email || "").toLowerCase() || null;
  if (!email) return { type: "ignore", reason: "no email on session" };
  const userId = UUID_RE.test(s.client_reference_id || "") ? s.client_reference_id : null;
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  const base = { stripe_session_id: s.id, stripe_payment_intent: pi, amount_cents: s.amount_total, currency: s.currency };
  if (m.kind === "gift") {
    const purchased = o.today;
    const rb = redeemBy(purchased);
    const share = m.gift_share_myself === "1";
    const recipientEmail = share ? null : (m.gift_recipient_email || null);
    const deliverOn = m.gift_deliver_on && m.gift_deliver_on > purchased ? m.gift_deliver_on : purchased;
    const code = await giftCodeFor(o.giftSecret, s.id);
    return {
      type: "gift",
      row: {
        ...base, code_hash: await codeHash(o.giftSecret, code), level_id: m.level_id,
        buyer_email: email, buyer_user_id: userId, buyer_name: m.gift_buyer_name || null,
        recipient_name: m.gift_recipient_name || null, recipient_email: recipientEmail, share_myself: share,
        message: m.gift_message || null, purchased_on: purchased, deliver_on: deliverOn, redeem_by: rb,
        reminder_dates: giftReminderDates({ recipientEmail, shareMyself: share, deliverOn, redeemBy: rb }),
      },
    };
  }
  const days = Number(m.days_per_week);
  if (![2, 3, 4, 5].includes(days)) return { type: "ignore", reason: "bad days_per_week" };
  const trainDays = m.train_days ? m.train_days.split(",").map(Number) : null;
  return {
    type: "entitlement",
    row: {
      ...base, source: "stripe", email, user_id: userId, level_id: m.level_id, kind: m.kind, days_per_week: days,
      train_days: trainDays, start_date: o.today, access_end: accessEnd(o.today, days),
      start_from: m.start_from === "start" ? "start" : "resume", start_core_index: Number(m.start_core_index) || 1,
    },
  };
}

/* charge.refunded: full refunds only deactivate (a partial refund changes nothing). */
export function refundedPaymentIntent(charge: any): string | null {
  if (!charge || charge.object !== "charge" || !charge.refunded) return null;
  if (charge.metadata?.app && charge.metadata.app !== LADDER.app) return null;
  return typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
}

/* ---------- webhook handler, with the database behind an interface (tests use a fake) ---------- */
export interface LadderDb {
  seenEvent(id: string): Promise<boolean>;
  recordEvent(id: string, type: string): Promise<void>;
  insertEntitlement(row: Record<string, unknown>): Promise<void>; // on conflict (stripe_session_id) do nothing
  insertGift(row: Record<string, unknown>): Promise<void>; // on conflict (stripe_session_id) do nothing
  markRefunded(paymentIntent: string, at: string): Promise<void>;
}
export async function handleWebhook(raw: string, sigHeader: string | null, o: { webhookSecret: string; giftSecret: string; db: LadderDb; now?: Date }): Promise<{ status: number; body: Record<string, unknown> }> {
  const now = o.now ?? new Date();
  if (!(await verifyStripeSignature(raw, sigHeader, o.webhookSecret, Math.floor(now.getTime() / 1000)))) return { status: 400, body: { ok: false, error: "bad signature" } };
  let ev: any;
  try { ev = JSON.parse(raw); } catch { return { status: 400, body: { ok: false, error: "bad json" } }; }
  if (!ev?.id || !ev?.type) return { status: 400, body: { ok: false, error: "not an event" } };
  if (await o.db.seenEvent(ev.id)) return { status: 200, body: { ok: true, duplicate: true } };
  let result: Record<string, unknown> = { ok: true, ignored: true };
  if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") {
    const today = todayIn(LADDER.timeZone, new Date((ev.created ?? now.getTime() / 1000) * 1000));
    const plan = await planForSession(ev.data?.object, { giftSecret: o.giftSecret, today });
    if (plan.type === "entitlement") { await o.db.insertEntitlement(plan.row); result = { ok: true, wrote: "entitlement" }; }
    else if (plan.type === "gift") { await o.db.insertGift(plan.row); result = { ok: true, wrote: "gift" }; }
    else result = { ok: true, ignored: plan.reason };
  } else if (ev.type === "charge.refunded") {
    const pi = refundedPaymentIntent(ev.data?.object);
    if (pi) { await o.db.markRefunded(pi, now.toISOString()); result = { ok: true, wrote: "refund" }; }
  }
  await o.db.recordEvent(ev.id, ev.type);
  return { status: 200, body: result };
}
