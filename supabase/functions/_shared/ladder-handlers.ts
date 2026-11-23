// Request handlers for the ladder edge functions, with I/O injected so they can be tested without Supabase or Stripe.
import { LADDER } from "./ladder-config.ts";
import { accessEnd, checkoutParams, codeHash, giftCodeFor, normalizeCode, parseCheckoutRequest, todayIn } from "./ladder-core.ts";

export interface User { id: string; email: string | null; emailConfirmed: boolean }
export interface Res { status: number; body: Record<string, unknown> }

/* POST ladder-checkout. Sign-in is optional for a new purchase or a gift (Stripe collects the email; the buyer
 * claims it later by signing in with that email) and required for a restart or repeat, which must follow an
 * earlier entitlement for the same level. */
export async function handleCheckout(body: unknown, user: User | null, d: {
  siteUrl: string;
  hasEntitlement(userId: string, levelId: string): Promise<boolean>;
  createSession(params: Record<string, string>): Promise<{ id: string; url: string }>;
}): Promise<Res> {
  const p = parseCheckoutRequest(body);
  if (!p.ok) return { status: 400, body: { ok: false, error: p.error } };
  const r = p.req;
  if (r.kind === "restart" || r.kind === "repeat") {
    if (!user) return { status: 401, body: { ok: false, error: "sign in to restart or repeat" } };
    if (!(await d.hasEntitlement(user.id, r.levelId))) return { status: 403, body: { ok: false, error: "no earlier purchase of this level" } };
  }
  const params = checkoutParams(r, { siteUrl: d.siteUrl, email: user?.emailConfirmed ? user.email : null, userId: user?.id ?? null });
  const s = await d.createSession(params);
  return { status: 200, body: { ok: true, id: s.id, url: s.url } };
}

/* POST ladder-redeem-gift (sign-in required). The recipient picks the level (gifts are the same price for every
 * level), days a week and training days; access starts today (America/Denver). */
export async function handleRedeem(body: any, user: User | null, d: {
  giftSecret: string; now?: Date;
  redeem(args: { codeHash: string; userId: string; email: string; levelId: string; days: number; trainDays: number[] | null; startCoreIndex: number; today: string; accessEnd: string }): Promise<Record<string, unknown>>;
  lookup?(codeHash: string): Promise<Record<string, any> | null>;
}): Promise<Res> {
  if (!user || !user.email || !user.emailConfirmed) return { status: 401, body: { ok: false, error: "sign in to redeem" } };
  const code = normalizeCode(body?.code);
  if (!/^5K-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) return { status: 400, body: { ok: false, error: "check the gift code" } };
  if (body?.lookup === true) {
    // Only what the recipient needs to see; never the buyer's email or the recipient's email.
    const g = d.lookup ? await d.lookup(await codeHash(d.giftSecret, code)) : null;
    if (!g) return { status: 404, body: { ok: false, error: "That code wasn't found." } };
    return { status: 200, body: { ok: true, gift: { level_id: g.level_id, buyer_name: g.buyer_name, message: g.message, redeem_by: g.redeem_by, deliver_on: g.deliver_on, redeemed: !!g.redeemed_at, refunded: !!g.refunded_at } } };
  }
  const levelId = body?.level_id;
  if (!(LADDER.levels as readonly string[]).includes(levelId)) return { status: 400, body: { ok: false, error: "unknown level" } };
  const days = Number(body?.days_per_week);
  if (![2, 3, 4, 5].includes(days)) return { status: 400, body: { ok: false, error: "days_per_week must be 2 to 5" } };
  let trainDays: number[] | null = null;
  if (body?.train_days != null) {
    const t = body.train_days;
    if (!Array.isArray(t) || t.length !== days || new Set(t).size !== days || !t.every((x: any) => Number.isInteger(x) && x >= 0 && x <= 6))
      return { status: 400, body: { ok: false, error: "train_days must list days_per_week distinct weekdays 0 to 6" } };
    trainDays = [...t].sort((a, b) => a - b);
  }
  if (body?.adult !== true || body?.accepted_terms !== true) return { status: 400, body: { ok: false, error: "confirm you are 18 or older and accept the terms" } };
  const startCoreIndex = levelId === "walk-to-5k" && Number(body?.start_core_index) === LADDER.headStartCoreIndex ? LADDER.headStartCoreIndex : 1;
  const today = todayIn(LADDER.timeZone, d.now ?? new Date());
  try {
    const ent = await d.redeem({ codeHash: await codeHash(d.giftSecret, code), userId: user.id, email: user.email, levelId, days, trainDays, startCoreIndex, today, accessEnd: accessEnd(today, days) });
    return { status: 200, body: { ok: true, entitlement: ent } };
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    const known = ["gift code not found", "gift code was refunded", "gift code already redeemed", "gift code expired", "gift code not available yet", "gift code is for a lower level"].find((k) => msg.includes(k));
    return known ? { status: 409, body: { ok: false, error: known } } : { status: 500, body: { ok: false, error: "could not redeem" } };
  }
}

/* POST ladder-gift-code (sign-in required): the buyer gets the code for their gift after checkout, on any device.
 * The code is derived from the Checkout Session id with GIFT_CODE_SECRET; only its keyed hash is stored. */
export async function handleGiftCode(body: any, user: User | null, d: {
  giftSecret: string;
  giftBySession(sessionId: string): Promise<{ buyer_email: string; buyer_user_id: string | null; code_hash: string; level_id: string; redeem_by: string } | null>;
}): Promise<Res> {
  if (!user || !user.email || !user.emailConfirmed) return { status: 401, body: { ok: false, error: "sign in with the email you used at checkout" } };
  const sid = String(body?.session_id || "");
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sid)) return { status: 400, body: { ok: false, error: "bad session id" } };
  const g = await d.giftBySession(sid);
  if (!g) return { status: 404, body: { ok: false, error: "gift not found yet (payment may still be processing)" } };
  if (g.buyer_user_id !== user.id && g.buyer_email !== user.email.toLowerCase()) return { status: 403, body: { ok: false, error: "not your gift" } };
  const code = await giftCodeFor(d.giftSecret, sid);
  if ((await codeHash(d.giftSecret, code)) !== g.code_hash) return { status: 500, body: { ok: false, error: "code mismatch" } };
  return { status: 200, body: { ok: true, code, level_id: g.level_id, redeem_by: g.redeem_by } };
}
