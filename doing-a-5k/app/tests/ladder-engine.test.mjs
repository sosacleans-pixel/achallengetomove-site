/* Node unit checks for the ladder engine, scheduler and gift rules (spec v5).
 * Run: node doing-a-5k/app/tests/ladder-engine.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { addDays } from "../js/ladder/dates.js";
import * as E from "../js/ladder/engine.js";
import { projectSchedule, todayStatus, validTrainDays, levelData, isRunning } from "../js/ladder/scheduler.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const dataDir = join(here, "../data/ladder");
const index = JSON.parse(readFileSync(join(dataDir, "index.json")));
E.applyIndex(index);
const LEVELS = Object.fromEntries(index.files.map((f) => { const j = JSON.parse(readFileSync(join(dataDir, f.file))); return [`${j.id}-${j.daysPerWeek}x`, j]; }));

// ---- data: 9 files, ids, displayName, 12 weeks x days a week, no "30" names ----
assert.deepEqual(E.LEVEL_IDS, ["walk-to-run", "5k", "faster-5k"]);
assert.equal(Object.keys(LEVELS).length, 9);
assert.deepEqual(E.DISPLAY_NAMES, { "walk-to-run": "Doing a 5K: Walk-to-Run", "5k": "Doing a 5K: 5K", "faster-5k": "Doing a 5K: Faster 5K" });
for (const [key, l] of Object.entries(LEVELS)) {
  assert.equal(l.slots.length, 12 * l.daysPerWeek, key);
  assert.equal(l.displayName, E.DISPLAY_NAMES[l.id]);
  assert.ok(!/30/.test(l.displayName));
  assert.equal(l.slots[0].checkin, "day1"); assert.equal(l.slots.at(-1).checkin, "final");
  assert.equal(l.slots.at(-1).week, 12);
}
// 5k-open count-up only on L2 week 10 S3, L2 week 12 S3, L3 week 1 S1, L3 week 12 S3; capped at 45:00
for (const [key, l] of Object.entries(LEVELS)) {
  const opens = l.slots.filter((s) => s.steps.some((st) => st.type === "5k-open"));
  for (const s of opens) assert.equal(s.steps.find((st) => st.type === "5k-open").durationSeconds, 2700);
  const where = opens.map((s) => `${s.week}:${s.weekSession === l.daysPerWeek ? "last" : s.weekSession}`);
  if (l.id === "walk-to-run") assert.deepEqual(where, [], key);
  if (l.id === "5k") assert.deepEqual(where, ["10:last", "12:last"], key);
  if (l.id === "faster-5k") assert.deepEqual(where, ["1:1", "12:last"], key);
}

// ---- access: 98 days (14 weeks) from purchase ----
const D0 = "2026-12-07"; // a Monday
let s = { ...E.emptyState(), settings: { daysPerWeek: 3, trainDays: [1, 3, 5] } };
s = E.grantPurchase(s, { levelId: "walk-to-run", kind: "new", price: "4.99", today: D0 });
let ws = E.windowStatus(s, "walk-to-run", D0);
assert.equal(ws.status, "active"); assert.equal(ws.day, 1); assert.equal(ws.daysLeft, 98);
assert.equal(ws.run.windowEnd, addDays(D0, 97));
assert.equal(E.totalSessions(s), 36);

// one new slot per day; pointer moves only on new slots
let r = E.completeSlot(s, "walk-to-run", { seconds: 1 }, D0); assert.ok(r.ok); s = r.state;
r = E.completeSlot(s, "walk-to-run", { seconds: 1 }, D0); assert.equal(r.reason, "one-per-day");
s = E.logRepeat(s, "walk-to-run", 1, {}, D0);
assert.equal(E.currentRun(s, "walk-to-run").pointer, 1);
s = E.logRepeat(s, "walk-to-run", 1, {}, addDays(D0, 1));
assert.equal(E.currentRun(s, "walk-to-run").pointer, 1);
assert.equal(E.computeStreak(s, addDays(D0, 1)).current, 2);
let st = E.computeStreak(s, addDays(D0, 3)); // Thu; Wed (training day) missed
assert.equal(st.current, 0); assert.equal(st.brokenOn, addDays(D0, 2));
assert.ok(E.repairOffer(s, addDays(D0, 3)));
s = E.addLog(s, { date: addDays(D0, 3), kind: "repair", repairFor: addDays(D0, 2) });
st = E.computeStreak(s, addDays(D0, 3));
assert.equal(st.current, 2); assert.equal(st.repairsUsed, 1);

// saves: 7 straight days earns a save that covers the next miss
let t = { ...E.emptyState(), settings: { daysPerWeek: 5, trainDays: [0, 1, 2, 3, 4, 5, 6] } };
for (let i = 0; i < 7; i++) t = E.addLog(t, { date: addDays(D0, i), kind: "repeat" });
st = E.computeStreak(t, addDays(D0, 8));
assert.equal(st.savesUsed, 1); assert.equal(st.current, 7);

// ---- warnings at 28, 14 and 5 days left (Attorney text, no price), can't-finish, expiry, restart ----
assert.equal(E.windowWarning(s, "walk-to-run", addDays(D0, 69)), null); // 29 left
assert.equal(E.windowWarning(s, "walk-to-run", addDays(D0, 70)), 28);
assert.equal(E.windowWarning(s, "walk-to-run", addDays(D0, 84)), 14);
assert.equal(E.windowWarning(s, "walk-to-run", addDays(D0, 93)), 5);
assert.equal(E.pickReminder(s, "walk-to-run", { today: addDays(D0, 84) }).id, "warn_14");
assert.match(E.pickReminder(s, "walk-to-run", { today: addDays(D0, 70) }).text, /Doing a 5K: Walk-to-Run program/);
for (const k of ["warn_28", "warn_14", "warn_5", "cant_finish"]) assert.ok(!/\$|2\.99/.test(E.REMINDERS[k]), k);
assert.ok(E.cantFinish(s, "walk-to-run", addDays(D0, 70))); // 35 left, 28 days
assert.ok(!E.cantFinish(s, "walk-to-run", addDays(D0, 10)));
ws = E.windowStatus(s, "walk-to-run", addDays(D0, 98));
assert.equal(ws.status, "expired"); assert.equal(ws.offerDay, 1); assert.ok(ws.restartOpen);
assert.equal(E.pickReminder(s, "walk-to-run", { today: addDays(D0, 98) }).id, "restart_day0");
assert.equal(E.pickReminder(s, "walk-to-run", { today: addDays(D0, 122) }).id, "restart_day25");
assert.ok(!E.windowStatus(s, "walk-to-run", addDays(D0, 128)).restartOpen);
const rs = E.grantPurchase(s, { levelId: "walk-to-run", kind: "restart", price: "2.99", startFrom: "resume", today: addDays(D0, 100) });
assert.equal(E.currentRun(rs, "walk-to-run").pointer, 1);
const rs1 = E.grantPurchase(s, { levelId: "walk-to-run", kind: "restart", price: "2.99", startFrom: "start", today: addDays(D0, 100) });
assert.equal(E.currentRun(rs1, "walk-to-run").pointer, 0);
assert.equal(E.windowStatus(rs, "walk-to-run", addDays(D0, 100)).daysLeft, 98);
{ const last = E.computeStreak(s, addDays(D0, 5)).lastActive; assert.equal(E.pickReminder(s, "walk-to-run", { today: addDays(last, 7) }).id, "paused"); assert.equal(E.pickReminder(s, "walk-to-run", { today: addDays(last, 8) }), null); } // pause after 7 inactive days

// gift run: window starts at redemption
const g = E.grantPurchase(E.emptyState(), { levelId: "5k", kind: "gift", price: "6.99", today: "2027-03-01", giftCode: "5K-TEST-CODE" });
assert.equal(E.currentRun(g, "5k").windowEnd, addDays("2027-03-01", 97));
assert.equal(E.currentRun(g, "5k").kind, "gift");

// ---- days a week change: at a week boundary switch files at that week's session 1; mid-week it waits ----
let d = { ...E.emptyState(), settings: { daysPerWeek: 3, trainDays: [1, 3, 5] } };
d = E.grantPurchase(d, { levelId: "5k", kind: "new", price: "6.99", today: D0 });
for (let i = 0; i < 4; i++) d = E.completeSlot(d, "5k", { seconds: 1 }, addDays(D0, i * 2)).state; // week 1 done + 1 of week 2
d = E.requestDaysPerWeek(d, 4, [1, 2, 4, 6]);
assert.equal(E.dpw(d), 3); assert.equal(d.settings.pendingDpw.daysPerWeek, 4);
d = E.completeSlot(d, "5k", { seconds: 1 }, addDays(D0, 8)).state;
d = E.completeSlot(d, "5k", { seconds: 1 }, addDays(D0, 10)).state; // finishes week 2 (pointer 6)
assert.equal(E.dpw(d), 4); assert.equal(E.currentRun(d, "5k").pointer, 8); // week 3 session 1 in the 4x file
assert.equal(levelData(d, "5k", LEVELS).slots[8].week, 3); assert.equal(levelData(d, "5k", LEVELS).slots[8].weekSession, 1);
assert.equal(E.weekOf(d, 9), 3); assert.equal(E.totalSessions(d), 48);
let d2 = E.requestDaysPerWeek(d, 5, [1, 2, 3, 5, 6]); // at a boundary: immediate
assert.equal(E.dpw(d2), 5); assert.equal(E.currentRun(d2, "5k").pointer, 10);

// ---- CHD: turning consent off removes energy ratings ----
let c = E.setChdConsent(E.grantPurchase({ ...E.emptyState(), settings: { daysPerWeek: 3, trainDays: [1, 3, 5] } }, { levelId: "5k", kind: "new", price: "6.99", today: D0 }), true);
c = E.saveCheckin(c, "5k", "first", { effort: "6", energyBefore: "2", energyAfter: "4" });
assert.equal(E.getCheckin(c, "5k", "first").energyAfter, "4");
c = E.setChdConsent(c, false);
assert.equal(E.getCheckin(c, "5k", "first").energyAfter, undefined);
assert.equal(E.getCheckin(c, "5k", "first").effort, "6");

// ---- scheduler ----
assert.ok(!validTrainDays([1, 2, 3, 4, 6], 5));
assert.ok(validTrainDays([1, 2, 3, 5, 6], 5));
let u = { ...E.emptyState(), settings: { daysPerWeek: 5, trainDays: [1, 2, 3, 5, 6] } };
u = E.grantPurchase(u, { levelId: "5k", kind: "new", price: "6.99", today: D0 });
const sched = projectSchedule(u, "5k", LEVELS, D0);
assert.equal(sched.length, 60);
const L2 = levelData(u, "5k", LEVELS);
const runSet = new Set(sched.filter((x) => isRunning(L2.slots[x.slot - 1])).map((x) => x.date));
for (const x of runSet) assert.ok(!(runSet.has(addDays(x, -1)) && runSet.has(addDays(x, -2)) && runSet.has(addDays(x, -3))));
let v = u;
for (let i = 0; i < 3; i++) v = E.completeSlot(v, "5k", { seconds: 1, running: true }, addDays(D0, i)).state;
const next = L2.slots[3];
if (isRunning(next)) assert.equal(todayStatus(v, "5k", LEVELS, addDays(D0, 3)).reason, "rest-after-3");
let w = { ...E.emptyState(), settings: { daysPerWeek: 5, trainDays: [0, 1, 2, 3, 4, 5, 6] } };
w = E.grantPurchase(w, { levelId: "faster-5k", kind: "new", price: "6.99", today: D0 });
const L3 = levelData(w, "faster-5k", LEVELS);
const s3 = projectSchedule(w, "faster-5k", LEVELS, D0);
const qd = new Set(s3.filter((x) => L3.slots[x.slot - 1].q).map((x) => x.date));
for (const day of qd) assert.ok(!qd.has(addDays(day, 1)));
w = E.completeSlot(w, "faster-5k", { seconds: 1, q: true }, D0).state; // s1 key + 5K
w = E.completeSlot(w, "faster-5k", { seconds: 1 }, addDays(D0, 1)).state;
w = E.logRepeat(w, "faster-5k", 1, { q: true }, addDays(D0, 2)); // repeat a key session
const nextQ = L3.slots.findIndex((x, i) => i >= 2 && x.q);
if (nextQ === 2) assert.equal(todayStatus(w, "faster-5k", LEVELS, addDays(D0, 3)).reason, "q-spacing");

// finish -> recap uses first and final check-ins
let f = { ...E.emptyState(), settings: { daysPerWeek: 3, trainDays: [0, 1, 2, 3, 4, 5, 6] } };
f = E.grantPurchase(f, { levelId: "faster-5k", kind: "new", price: "6.99", today: D0 });
f = E.saveCheckin(f, "faster-5k", "first", { fiveK: { seconds: 1900 } });
let res;
for (let i = 0; i < 36; i++) { res = E.completeSlot(f, "faster-5k", { seconds: 60 }, addDays(D0, i)); f = res.state; }
assert.ok(res.finished);
f = E.saveCheckin(f, "faster-5k", "final", { fiveK: { seconds: 1800 } });
const rc = E.recap(f, "faster-5k", levelData(f, "faster-5k", LEVELS));
assert.equal(rc.sessions, 36); assert.equal(rc.first.fiveK.seconds, 1900); assert.equal(rc.final.fiveK.seconds, 1800);
assert.ok(E.badges(f, "faster-5k").includes("Doing a 5K: Faster 5K Finisher"));
assert.equal(E.windowStatus(f, "faster-5k", addDays(D0, 40)).status, "finished");

console.log("ladder engine: all checks passed");
