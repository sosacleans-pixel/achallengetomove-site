/* Node unit checks for the ladder engine and scheduler. Run: node doing-a-5k/app/tests/ladder-engine.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { addDays } from "../js/ladder/dates.js";
import * as E from "../js/ladder/engine.js";
import { projectSchedule, todayStatus, validTrainDays } from "../js/ladder/scheduler.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const LEVELS = Object.fromEntries(E.LEVEL_IDS.map((id) => [id, JSON.parse(readFileSync(join(here, "../data/ladder", id + ".json")))]));

// data: 30 slots each, 5k-open only on L2 s24/s30, L3 s1/s30, capped at 45:00
for (const id of E.LEVEL_IDS) assert.equal(LEVELS[id].slots.length, 30);
const opens = [];
for (const id of E.LEVEL_IDS) for (const s of LEVELS[id].slots) for (const st of s.steps) if (st.type === "5k-open") { opens.push(`${id}:${s.slot}`); assert.equal(st.durationSeconds, 2700); }
assert.deepEqual(opens, ["5k-30:24", "5k-30:30", "faster-5k-30:1", "faster-5k-30:30"]);
// L1 jog total never drops more than one lighter day from slot 12 on (spot check: s30 is 12:00 continuous)
assert.equal(LEVELS["walk-to-run-30"].slots[29].mainSeconds, 720);

const D0 = "2026-12-07"; // a Monday
let s = { ...E.emptyState(), settings: { daysPerWeek: 3, trainDays: [1, 3, 5] } };
s = E.grantPurchase(s, { levelId: "walk-to-run-30", kind: "new", price: "4.99", today: D0 });
let ws = E.windowStatus(s, "walk-to-run-30", D0);
assert.equal(ws.status, "active"); assert.equal(ws.day, 1); assert.equal(ws.daysLeft, 90);
assert.equal(ws.run.windowEnd, addDays(D0, 89));

// one new slot per day; pointer moves only on new slots
let r = E.completeSlot(s, "walk-to-run-30", { seconds: 1 }, D0); assert.ok(r.ok); s = r.state;
r = E.completeSlot(s, "walk-to-run-30", { seconds: 1 }, D0); assert.equal(r.reason, "one-per-day");
s = E.logRepeat(s, "walk-to-run-30", 1, {}, D0);
assert.equal(E.currentRun(s, "walk-to-run-30").pointer, 1);
// a repeat on a rest day keeps the streak, pointer unchanged
s = E.logRepeat(s, "walk-to-run-30", 1, {}, addDays(D0, 1));
assert.equal(E.currentRun(s, "walk-to-run-30").pointer, 1);
assert.equal(E.computeStreak(s, addDays(D0, 1)).current, 2);
// rest day (Tue->Wed gap not a training day) is neutral; a missed training day breaks
let st = E.computeStreak(s, addDays(D0, 3)); // Thu; Wed missed (training day)
assert.equal(st.current, 0); assert.equal(st.brokenOn, addDays(D0, 2));
assert.ok(E.repairOffer(s, addDays(D0, 3)));
s = E.addLog(s, { date: addDays(D0, 3), kind: "repair", repairFor: addDays(D0, 2) });
st = E.computeStreak(s, addDays(D0, 3));
assert.equal(st.current, 2); assert.equal(st.repairsUsed, 1);

// saves: 7 straight days earns a save that covers the next miss
let t = { ...E.emptyState(), settings: { daysPerWeek: 5, trainDays: [0, 1, 2, 3, 4, 5, 6].slice(0, 7) } };
t.settings.trainDays = [0, 1, 2, 3, 4, 5, 6];
for (let i = 0; i < 7; i++) t = E.addLog(t, { date: addDays(D0, i), kind: "repeat" });
st = E.computeStreak(t, addDays(D0, 8)); // day 7 missed
assert.equal(st.savesUsed, 1); assert.equal(st.current, 7);

// window warnings, cant-finish (no $2.99 in it), expiry and restart
assert.equal(E.windowWarning(s, "walk-to-run-30", addDays(D0, 59)), 60);
assert.ok(E.cantFinish(s, "walk-to-run-30", addDays(D0, 70)));
const rem = E.pickReminder(s, "walk-to-run-30", { today: addDays(D0, 74) });
assert.equal(rem.id, "window_75"); assert.ok(!/2\.99/.test(rem.text));
assert.ok(!/2\.99/.test(E.REMINDERS.cant_finish));
for (const k of ["window_60", "window_75", "window_85"]) assert.ok(!/2\.99/.test(E.REMINDERS[k]));
ws = E.windowStatus(s, "walk-to-run-30", addDays(D0, 90));
assert.equal(ws.status, "expired"); assert.equal(ws.offerDay, 1); assert.ok(ws.restartOpen);
assert.equal(E.pickReminder(s, "walk-to-run-30", { today: addDays(D0, 90) }).id, "restart_day0");
assert.equal(E.pickReminder(s, "walk-to-run-30", { today: addDays(D0, 114) }).id, "restart_day25");
assert.ok(!E.windowStatus(s, "walk-to-run-30", addDays(D0, 120)).restartOpen);
// restart resumes at n, or starts over
const rs = E.grantPurchase(s, { levelId: "walk-to-run-30", kind: "restart", price: "2.99", startFrom: "resume", today: addDays(D0, 95) });
assert.equal(E.currentRun(rs, "walk-to-run-30").pointer, 1);
const rs1 = E.grantPurchase(s, { levelId: "walk-to-run-30", kind: "restart", price: "2.99", startFrom: "start", today: addDays(D0, 95) });
assert.equal(E.currentRun(rs1, "walk-to-run-30").pointer, 0);
assert.equal(E.windowStatus(rs, "walk-to-run-30", addDays(D0, 95)).daysLeft, 90);
// 7 inactive days -> pause message
assert.equal(E.pickReminder(s, "walk-to-run-30", { today: addDays(D0, 8) }).id, "paused");

// scheduler: 5/wk L1 never more than 3 running days in a row; L3 no back-to-back Q
assert.ok(!validTrainDays([1, 2, 3, 4, 6], 5));
assert.ok(validTrainDays([1, 2, 3, 5, 6], 5));
let u = { ...E.emptyState(), settings: { daysPerWeek: 5, trainDays: [1, 2, 3, 5, 6] } };
u = E.grantPurchase(u, { levelId: "5k-30", kind: "new", price: "6.99", today: D0 });
const sched = projectSchedule(u, "5k-30", LEVELS, D0);
assert.equal(sched.length, 30);
const set = new Set(sched.map((x) => x.date));
for (const x of sched) assert.ok(!(set.has(addDays(x.date, -1)) && set.has(addDays(x.date, -2)) && set.has(addDays(x.date, -3))));
// 3 running days logged -> rest day
let v = u;
for (let i = 0; i < 3; i++) v = E.completeSlot(v, "5k-30", { seconds: 1 }, addDays(D0, i)).state;
assert.equal(todayStatus(v, "5k-30", LEVELS, addDays(D0, 3)).reason, "rest-after-3");
let w = { ...E.emptyState(), settings: { daysPerWeek: 5, trainDays: [0, 1, 2, 3, 4, 5, 6] } };
w = E.grantPurchase(w, { levelId: "faster-5k-30", kind: "new", price: "6.99", today: D0 });
const s3 = projectSchedule(w, "faster-5k-30", LEVELS, D0);
const qd = new Set(s3.filter((x) => LEVELS["faster-5k-30"].slots[x.slot - 1].q).map((x) => x.date));
for (const d of qd) assert.ok(!qd.has(addDays(d, 1)));
// repeat of a Q session yesterday blocks today's Q
w = E.completeSlot(w, "faster-5k-30", { seconds: 1 }, D0).state; // s1 Q
w = E.completeSlot(w, "faster-5k-30", { seconds: 1 }, addDays(D0, 1)).state; // s2
w = E.completeSlot(w, "faster-5k-30", { seconds: 1 }, addDays(D0, 2)).state; // s3
w = E.logRepeat(w, "faster-5k-30", 1, {}, addDays(D0, 3)); // repeat Q
assert.equal(todayStatus(w, "faster-5k-30", LEVELS, addDays(D0, 4)).reason, "q-spacing");

console.log("ladder engine: all checks passed");
