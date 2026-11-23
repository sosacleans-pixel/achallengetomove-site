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
const now = G.createGift({ levelId: "walk-to-run", price: "4.99", buyerName: "Ana", recipientName: "Mo", shareMyself: true });
assert.equal(now.recipientEmail, "");
assert.equal(G.giftReminderDates(now).length, 0);
assert.ok(G.redeemable(now, now.purchasedAt));
const red = G.markRedeemed(now.code, "walk-to-run");
assert.equal(G.giftStatus(red), "Redeemed");
assert.ok(!G.canRefund(red, red.purchasedAt));
assert.equal(G.updateGift(now.code, { recipientEmail: "x@y.z" }), null); // locked once redeemed
assert.equal(G.giftReminderDates(g).length, 3);
console.log("gifts: all checks passed");
