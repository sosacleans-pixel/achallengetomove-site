/* Running plan gifts (PREVIEW). Rules: Attorney memo §7.6 and §11.2, spec v6 §8.
 * - The code is redeemable for at least 5 years from the purchase date (printed on email, receipt and code record).
 * - The Access Period (plan length + 2 weeks, by the days a week chosen at redemption) starts at redemption.
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

/* Transactional reminders to the recipient of an unredeemed code (Attorney memo §10.3), only if the buyer gave
 * the recipient's email: 7 and 30 days after delivery, 1 year after delivery, and 60 days before the redeem-by
 * date. Skip any date after the redeem-by date, after redemption or refund, or within 14 days of a kept reminder.
 * Then none. The delivery email itself is the first notice, not a reminder. */
export function giftReminderDates(gift) {
  if (!gift.recipientEmail || gift.shareMyself || gift.refunded) return [];
  const candidates = [addDays(gift.deliverOn, 7), addDays(gift.deliverOn, 30), addDays(gift.deliverOn, 365), addDays(gift.redeemBy, -60)].sort();
  const out = [];
  for (const d of candidates) {
    if (d > gift.redeemBy) continue;
    if (gift.redeemedAt && d >= gift.redeemedAt) continue;
    if (out.length && daysBetween(out[out.length - 1], d) < 14) continue;
    out.push(d);
  }
  return out;
}

/* Gift reminder email (Attorney memo §10.3, word for word, except the access sentence: PENDING ATTORNEY REVIEW,
 * the "14 weeks" sentence was swapped mechanically to the §11.2 plan-length wording), same body at every reminder point,
 * plus the STOP footer (gift and privacy copy, item 4). */
export const GIFT_REMINDER_EMAIL = {
  en: {
    subject: "Your gift of {levelName}",
    body: "Hello {recipientName},\n\nThis is a reminder from Coach Salim Heyaime LLC about a gift of {levelName} from {buyerName}.\n\nYou can redeem your gift code until {redeemByDate}. That date is 5 years from the purchase date. When you redeem it, you choose how many days a week to train, and you get access for the length of that plan plus 2 extra weeks, starting on the day you redeem.\n\nYour code: {code}\nRedeem here: {link}\n\nIf you have questions, email coachsalimheyaime@gmail.com.\n\nThank you,\nCoach Salim Heyaime LLC",
    footer: "Don't want these reminders? Reply STOP or email coachsalimheyaime@gmail.com.",
  },
  es: {
    subject: "Tu regalo de {levelName}",
    body: "Hola {recipientName}:\n\nEste es un recordatorio de Coach Salim Heyaime LLC sobre un regalo de {levelName} de parte de {buyerName}.\n\nPuedes canjear tu código de regalo hasta el {redeemByDate}. Esa fecha es 5 años a partir de la fecha de compra. Cuando lo canjees, eliges cuántos días a la semana entrenar y obtienes acceso durante la duración de ese plan más 2 semanas extra, a partir del día en que lo canjees.\n\nTu código: {code}\nCanjéalo aquí: {link}\n\nSi tienes preguntas, escribe a coachsalimheyaime@gmail.com.\n\nGracias,\nCoach Salim Heyaime LLC",
    footer: "¿No quieres estos recordatorios? Responde STOP o escribe a coachsalimheyaime@gmail.com.",
  },
};

/* {redeemByDate} is printed as a full date (weekday, month, day, year), matching the receipt. */
export function fullDate(iso, lang = "en") {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function giftReminderEmail(gift, { lang = "en", levelName, link }) {
  const t = GIFT_REMINDER_EMAIL[lang];
  const v = { recipientName: gift.recipientName, levelName, buyerName: gift.buyerName, redeemByDate: fullDate(gift.redeemBy, lang), code: gift.code, link };
  const fillT = (x) => x.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? `{${k}}`);
  return { to: gift.recipientEmail, subject: fillT(t.subject), text: `${fillT(t.body)}\n\n${t.footer}` };
}
