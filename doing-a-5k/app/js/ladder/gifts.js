/* Doing a 5K gifts (PREVIEW). Rules: Attorney memo §7.6 and spec v5 §6.
 * - The code is redeemable for at least 5 years from the purchase date (printed on email, receipt and code record).
 * - The 14-week Access Period starts at redemption.
 * - Refund only within 3 days (72 hours) of purchase and only while unredeemed; a refund deactivates the code.
 * - Recipient 18+, accepts the App Terms and Health and safety personally.
 * In the live build, gift records live on the server (Stripe webhook + Supabase), and the buyer only ever
 * sees Scheduled / Sent / Redeemed, never the recipient's progress. This preview keeps them on this device. */
import { todayISO, addDays, daysBetween } from "./dates.js";
import { CONFIG } from "./engine.js";

const KEY = "doing-a-5k-gifts-preview";

export function loadGifts() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function saveGifts(g) {
  localStorage.setItem(KEY, JSON.stringify(g));
}

function makeCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => abc[b % abc.length]).join("");
  return `5K-${pick()}-${pick()}`;
}

export function redeemByDate(purchasedISO) {
  const [y, m, d] = purchasedISO.split("-").map(Number);
  const dt = new Date(y + CONFIG.gift_code_years, m - 1, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function createGift({ levelId, price, buyerName, recipientName, recipientEmail, shareMyself, message, deliverOn, mode = "preview" }) {
  const g = loadGifts();
  const code = makeCode();
  const purchasedAt = todayISO();
  const deliver = deliverOn && deliverOn > purchasedAt ? deliverOn : purchasedAt;
  g[code] = {
    code, levelId, price, mode, buyerName, recipientName,
    recipientEmail: shareMyself ? "" : recipientEmail,
    shareMyself: !!shareMyself,
    message: (message || "").slice(0, 300),
    purchasedAt, deliverOn: deliver, redeemBy: redeemByDate(purchasedAt),
    redeemedAt: null, redeemedLevel: null, refunded: false,
  };
  saveGifts(g);
  return g[code];
}

export function getGift(code) {
  return loadGifts()[String(code || "").trim().toUpperCase()] || null;
}

export function updateGift(code, patch) {
  const g = loadGifts();
  if (!g[code] || g[code].redeemedAt) return null;
  g[code] = { ...g[code], ...patch };
  saveGifts(g);
  return g[code];
}

/* Scheduled / Sent / Redeemed only (plus Refunded). Never the recipient's progress. */
export function giftStatus(gift, today = todayISO()) {
  if (gift.refunded) return "Refunded";
  if (gift.redeemedAt) return "Redeemed";
  if (gift.shareMyself) return "Sent";
  return gift.deliverOn > today ? "Scheduled" : "Sent";
}

export function canRefund(gift, today = todayISO()) {
  return !gift.redeemedAt && !gift.refunded && daysBetween(gift.purchasedAt, today) <= 3;
}

export function redeemable(gift, today = todayISO()) {
  return gift && !gift.redeemedAt && !gift.refunded && today <= gift.redeemBy && today >= gift.deliverOn;
}

export function markRedeemed(code, levelId) {
  const g = loadGifts();
  g[code] = { ...g[code], redeemedAt: todayISO(), redeemedLevel: levelId };
  saveGifts(g);
  return g[code];
}

/* Transactional reminders to the recipient before redemption (only if the buyer gave an email):
 * 7 days and 30 days after delivery, and 60 days before the redeem-by date. Then none. */
export function giftReminderDates(gift) {
  if (!gift.recipientEmail) return [];
  return [addDays(gift.deliverOn, 7), addDays(gift.deliverOn, 30), addDays(gift.redeemBy, -60)];
}
