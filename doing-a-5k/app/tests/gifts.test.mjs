/* Gift rules (Attorney §7.6): redeem-by = purchase + 5 years, refund only within 3 days and only unredeemed,
 * buyer sees Scheduled / Sent / Redeemed only. Run: node doing-a-5k/app/tests/gifts.test.mjs */
import assert from "node:assert/strict";
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] };
const G = await import("../js/ladder/gifts.js");
assert.equal(G.redeemByDate("2026-11-22"), "2031-11-22");
const g = G.createGift({ levelId: "5k", price: "6.99", buyerName: "Ana", recipientName: "Leo", recipientEmail: "leo@example.com", deliverOn: "2099-01-01" });
assert.match(g.code, /^5K-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
assert.equal(G.giftStatus(g, g.purchasedAt), "Scheduled");
assert.equal(G.giftStatus(g, "2099-01-02"), "Sent");
assert.ok(!G.redeemable(g, g.purchasedAt)); // before delivery
assert.ok(G.redeemable(g, "2099-01-02") === false); // after redeem-by
assert.ok(G.canRefund(g, g.purchasedAt));
const now = G.createGift({ levelId: "walk-to-5k", price: "4.99", buyerName: "Ana", recipientName: "Mo", shareMyself: true });
assert.equal(now.recipientEmail, "");
assert.equal(G.giftReminderDates(now).length, 0);
assert.ok(G.redeemable(now, now.purchasedAt));
const red = G.markRedeemed(now.code, "walk-to-5k");
assert.equal(G.giftStatus(red), "Redeemed");
assert.ok(!G.canRefund(red, red.purchasedAt));
assert.equal(G.updateGift(now.code, { recipientEmail: "x@y.z" }), null); // locked once redeemed
// schedule: 7 and 30 days after delivery, 1 year after, 60 days before redeem-by (Attorney §10.3)
const fresh = G.createGift({ levelId: "5k", price: "6.99", buyerName: "Ana", recipientName: "Ivy", recipientEmail: "ivy@example.com" });
const dates = G.giftReminderDates(fresh);
assert.equal(dates.length, 4);
assert.ok(dates.every((d) => d <= fresh.redeemBy));
const em = G.giftReminderEmail(fresh, { lang: "en", levelName: "Doing a 5K: 5K", link: "https://example.test/r" });
assert.equal(em.subject, "Your gift of Doing a 5K: 5K");
assert.match(em.text, /^Hello Ivy,/);
assert.match(em.text, /until \w+day, \w+ \d+, 20\d\d\./);
assert.ok(em.text.endsWith("Don't want these reminders? Reply STOP or email coachsalimheyaime@gmail.com."));
const es = G.giftReminderEmail(fresh, { lang: "es", levelName: "Doing a 5K: 5K", link: "https://example.test/r" });
assert.equal(es.subject, "Tu regalo de Doing a 5K: 5K");
assert.ok(es.text.endsWith("¿No quieres estos recordatorios? Responde STOP o escribe a coachsalimheyaime@gmail.com."));
assert.ok(!/[\u2013\u2014]/.test(em.text + es.text));
// share-it-myself or refunded: no reminders
assert.equal(G.giftReminderDates({ ...fresh, shareMyself: true }).length, 0);
assert.equal(G.giftReminderDates({ ...fresh, refunded: true }).length, 0);
// Spanish checkout disclosures (Attorney §10.1)
const C = await import("../js/ladder/checkout.js");
assert.match(C.disclosureFor({ kind: "new", price: "4.99", levelName: "Doing a 5K: Walk-to-Run", lang: "es" }), /^Pago único de \$4\.99\. Esto no es una suscripción/);
assert.match(C.disclosureFor({ kind: "restart", price: "2.99", levelName: "Doing a 5K: 5K", resumeAt: 7, lang: "es" }), /retoma en la sesión 7 .* Esto no es una suscripción/);
assert.match(C.disclosureFor({ kind: "gift", price: "6.99", levelName: "Doing a 5K: 5K", lang: "es" }), /para un regalo de Doing a 5K: 5K\./);
console.log("gifts: all checks passed");
