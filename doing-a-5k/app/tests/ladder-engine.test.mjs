/* Node unit checks for the ladder engine, scheduler, config and copy (spec v6, Attorney memo §11).
 * Run: node doing-a-5k/app/tests/ladder-engine.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { addDays } from "../js/ladder/dates.js";
import * as E from "../js/ladder/engine.js";
import { projectSchedule, todayStatus, validTrainDays, levelData, isRunning, keyDayConflict } from "../js/ladder/scheduler.js";
import { NAME_SCHEMES, NAMES, ACCESS_WEEKS_BY_DAYS, PLAN_WEEKS_BY_DAYS, TIMER_CAPS, PRICES } from "../js/ladder/config.js";
import { COPY, t as tc } from "../js/ladder/copy.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const dataDir = join(here, "../data/ladder");
const index = JSON.parse(readFileSync(join(dataDir, "index.json")));
E.applyIndex(index);
const LEVELS = Object.fromEntries(index.files.map((f) => { const j = JSON.parse(readFileSync(join(dataDir, f.file))); return [`${j.id}-${j.daysPerWeek}x`, j]; }));
E.applyLevels(LEVELS);

// ---- config: names in one place, never "Doing a 5K: 10K"; access = plan + 2 weeks ----
assert.deepEqual(E.LEVEL_IDS, ["walk-to-5k", "5k-faster", "10k"]);
assert.deepEqual(E.DISPLAY_NAMES, NAMES.levels);
assert.deepEqual(E.DISPLAY_NAMES, { "walk-to-5k": "A Challenge to Move: Walk to 5K", "5k-faster": "A Challenge to Move: 5K Faster", "10k": "A Challenge to Move: 10K" });
for (const sch of Object.values(NAME_SCHEMES)) for (const n of Object.values(sch.levels)) assert.ok(!/Doing a 5K: 10K/.test(n));
for (const d of [2, 3, 4, 5]) assert.equal(ACCESS_WEEKS_BY_DAYS[d], PLAN_WEEKS_BY_DAYS[d] + 2);
assert.deepEqual(ACCESS_WEEKS_BY_DAYS, { 2: 20, 3: 14, 4: 12, 5: 11 });
assert.equal(TIMER_CAPS["10k-open"]["10k"], 5400);
assert.equal(PRICES.restart, "2.99"); assert.equal(PRICES.repeat, "2.99");

// ---- copy: Attorney §11 word for word, no banned names, no dashes ----
assert.equal(COPY.en.tagline, "Walk to your first 5K, get faster, then go 10K. Train 2 to 5 days a week, one level at a time.");
assert.equal(COPY.es.tagline, "Camina hasta tu primer 5K, corre más rápido y luego llega a 10K. Entrena de 2 a 5 días a la semana, un nivel a la vez.");
const allCopy = JSON.stringify(COPY);
for (const bad of [/Couch to 5K/i, /C25K/i, /Bridge to 10K/i, /B210K/i, /Ease into 10K/i, /Run Walk Run/i, /Couch-to-5K/i, /Doing a 5K: 10K/, /[\u2013\u2014]/]) assert.ok(!bad.test(allCopy), String(bad));
assert.equal(tc("accessLine", { endDate: "Sat, Mar 13, 2027", accessWeeks: 14, planWeeks: 12 }), "Your access runs through Sat, Mar 13, 2027 (14 weeks from today: your 12-week plan plus 2 extra weeks).");
assert.match(tc("headStart"), /^Suggested starting point: A Challenge to Move: Walk to 5K, beginning at week 6/);
assert.equal(tc("cap90"), "Great work, that's 90 minutes on your feet. Log it as done, or edit your time if you finished.");
assert.equal(tc("repeat", { levelName: "X", accessWeeks: 20 }), "One-time payment of $2.99 to repeat X: a new 20-week access window that starts at session 1.");
assert.equal(COPY.en.tenKSafety.length, 4);
assert.ok(!/chest pain/.test(COPY.en.tagline));

// ---- data: 12 files; 36 core sessions; completion at core 36; extras on 4 and 5 days ----
assert.equal(Object.keys(LEVELS).length, 12);
for (const [key, l] of Object.entries(LEVELS)) {
  assert.equal(l.slots.length, { 2: 36, 3: 36, 4: 40, 5: 45 }[l.daysPerWeek], key);
  assert.equal(l.weeks, PLAN_WEEKS_BY_DAYS[l.daysPerWeek], key);
  const core = l.slots.filter((x) => x.core);
  assert.equal(core.length, 36, key);
  assert.deepEqual(core.map((x) => x.coreIndex).sort((a, b) => a - b), Array.from({ length: 36 }, (_, i) => i + 1), key);
  assert.equal(l.slots[0].checkin, "day1"); assert.equal(l.slots.at(-1).checkin, "final");
}
// 10K check-in only in the 10K level
for (const l of Object.values(LEVELS)) {
  const ten = l.slots.filter((x) => x.steps.some((st) => st.type === "10k-open"));
  assert.equal(ten.length > 0, l.id === "10k", l.id);
}

// ---- access: plan length + 2 weeks from purchase, by days a week ----
const D0 = "2026-12-07"; // a Monday
let s = E.emptyState();
s = E.grantPurchase(s, { levelId: "walk-to-5k", kind: "new", price: "6.99", daysPerWeek: 3, trainDays: [1, 3, 5], today: D0 });
let ws = E.windowStatus(s, "walk-to-5k", D0);
assert.equal(ws.status, "active"); assert.equal(ws.day, 1); assert.equal(ws.daysLeft, 98);
assert.equal(ws.run.windowEnd, addDays(D0, 97)); assert.equal(ws.run.accessWeeks, 14);
assert.equal(E.totalSessions(s), 36);
for (const [d, wk] of [[2, 20], [4, 12], [5, 11]]) {
  const x = E.grantPurchase(E.emptyState(), { levelId: "10k", kind: "new", price: "6.99", daysPerWeek: d, today: D0 });
  assert.equal(E.currentRun(x, "10k").windowEnd, addDays(D0, wk * 7 - 1), String(d));
  assert.equal(E.dpw(x), d); assert.deepEqual(x.settings.trainDays, E.DEFAULT_TRAIN_DAYS[d]);
}
// head start: Walk to 5K from core session 16 (week 6 anchor)
const hs = E.grantPurchase(E.emptyState(), { levelId: "walk-to-5k", kind: "new", price: "6.99", daysPerWeek: 3, startCoreIndex: 16, today: D0 });
assert.equal(E.currentRun(hs, "walk-to-5k").coreDone, 15);
assert.equal(LEVELS["walk-to-5k-3x"].slots[E.currentRun(hs, "walk-to-5k").pointer].coreIndex, 16);

// one new slot per day; pointer moves only on new slots
let r = E.completeSlot(s, "walk-to-5k", { seconds: 1 }, D0); assert.ok(r.ok); s = r.state;
r = E.completeSlot(s, "walk-to-5k", { seconds: 1 }, D0); assert.equal(r.reason, "one-per-day");
s = E.logRepeat(s, "walk-to-5k", 1, {}, D0);
assert.equal(E.currentRun(s, "walk-to-5k").pointer, 1);
s = E.logRepeat(s, "walk-to-5k", 1, {}, addDays(D0, 1));
assert.equal(E.currentRun(s, "walk-to-5k").pointer, 1);
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
assert.equal(E.windowWarning(s, "walk-to-5k", addDays(D0, 69)), null); // 29 left
assert.equal(E.windowWarning(s, "walk-to-5k", addDays(D0, 70)), 28);
assert.equal(E.windowWarning(s, "walk-to-5k", addDays(D0, 84)), 14);
assert.equal(E.windowWarning(s, "walk-to-5k", addDays(D0, 93)), 5);
assert.equal(E.pickReminder(s, "walk-to-5k", { today: addDays(D0, 84) }).id, "warn_14");
assert.match(E.pickReminder(s, "walk-to-5k", { today: addDays(D0, 70) }).text, /A Challenge to Move: Walk to 5K program/);
for (const k of ["warn_28", "warn_14", "warn_5", "cant_finish"]) assert.ok(!/\$|2\.99/.test(E.REMINDERS[k]), k);
assert.ok(E.cantFinish(s, "walk-to-5k", addDays(D0, 70))); // 35 left, 28 days at 3+1 a week = 16
assert.ok(!E.cantFinish(s, "walk-to-5k", addDays(D0, 10)));
assert.equal(E.possibleSessions(14, 3), 8); assert.equal(E.possibleSessions(3, 5), 3);
ws = E.windowStatus(s, "walk-to-5k", addDays(D0, 98));
assert.equal(ws.status, "expired"); assert.equal(ws.offerDay, 1); assert.ok(ws.restartOpen);
const r0 = E.pickReminder(s, "walk-to-5k", { today: addDays(D0, 98) });
assert.equal(r0.id, "restart_day0"); assert.match(r0.text, /fresh 14-week window/);
assert.equal(E.pickReminder(s, "walk-to-5k", { today: addDays(D0, 122) }).id, "restart_day25");
assert.ok(!E.windowStatus(s, "walk-to-5k", addDays(D0, 128)).restartOpen);
const rs = E.grantPurchase(s, { levelId: "walk-to-5k", kind: "restart", price: "2.99", daysPerWeek: 3, startFrom: "resume", today: addDays(D0, 100) });
assert.equal(E.currentRun(rs, "walk-to-5k").pointer, 1); assert.equal(E.currentRun(rs, "walk-to-5k").coreDone, 1);
const rs1 = E.grantPurchase(s, { levelId: "walk-to-5k", kind: "restart", price: "2.99", daysPerWeek: 3, startFrom: "start", today: addDays(D0, 100) });
assert.equal(E.currentRun(rs1, "walk-to-5k").pointer, 0);
assert.equal(E.windowStatus(rs, "walk-to-5k", addDays(D0, 100)).daysLeft, 98);
const rs2 = E.grantPurchase(s, { levelId: "walk-to-5k", kind: "repeat", price: "2.99", daysPerWeek: 2, today: addDays(D0, 100) });
assert.equal(E.windowStatus(rs2, "walk-to-5k", addDays(D0, 100)).daysLeft, 140);
{ const last = E.computeStreak(s, addDays(D0, 5)).lastActive; assert.equal(E.pickReminder(s, "walk-to-5k", { today: addDays(last, 7) }).id, "paused"); assert.equal(E.pickReminder(s, "walk-to-5k", { today: addDays(last, 8) }), null); }

// gift run: window starts at redemption, length from the days chosen at redemption
const g = E.grantPurchase(E.emptyState(), { levelId: "5k-faster", kind: "gift", price: "6.99", daysPerWeek: 2, today: "2027-03-01", giftCode: "5K-TEST-CODE" });
assert.equal(E.currentRun(g, "5k-faster").windowEnd, addDays("2027-03-01", 139));
assert.equal(E.currentRun(g, "5k-faster").kind, "gift");

// ---- days a week change: any time, continue by coreIndex; end date never moves ----
let d = E.grantPurchase(E.emptyState(), { levelId: "10k", kind: "new", price: "6.99", daysPerWeek: 5, today: D0 });
const f5 = LEVELS["10k-5x"];
let i = 0;
while (E.currentRun(d, "10k").coreDone < 5) { d = E.completeSlot(d, "10k", { seconds: 1 }, addDays(D0, i)).state; i++; }
const endBefore = E.currentRun(d, "10k").windowEnd;
d = E.requestDaysPerWeek(d, 3, [1, 3, 6]);
assert.equal(E.dpw(d), 3); { const p = E.currentRun(d, "10k").pointer; const done = new Set(E.currentRun(d, "10k").doneCore);
  assert.ok(!done.has(LEVELS["10k-3x"].slots[p].coreIndex)); assert.ok(LEVELS["10k-3x"].slots.slice(0, p).every((y) => !y.core || done.has(y.coreIndex))); }
assert.equal(E.currentRun(d, "10k").windowEnd, endBefore);
assert.ok(f5.slots.some((x) => !x.core));
// extras count toward progress, not completion
let x = E.grantPurchase(E.emptyState(), { levelId: "walk-to-5k", kind: "new", price: "6.99", daysPerWeek: 5, today: D0 });
const f = LEVELS["walk-to-5k-5x"];
const firstExtra = f.slots.findIndex((y) => !y.core);
for (let k = 0; k <= firstExtra; k++) x = E.completeSlot(x, "walk-to-5k", { seconds: 1 }, addDays(D0, k)).state;
assert.equal(E.currentRun(x, "walk-to-5k").pointer, firstExtra + 1);
assert.equal(E.currentRun(x, "walk-to-5k").coreDone, firstExtra);
assert.ok(E.fitsAfterChange(x, 3, addDays(D0, firstExtra)));

// ---- CHD: turning consent off removes energy ratings ----
let c = E.setChdConsent(E.grantPurchase(E.emptyState(), { levelId: "10k", kind: "new", price: "6.99", daysPerWeek: 3, today: D0 }), true);
c = E.saveCheckin(c, "10k", "first", { effort: "6", energyBefore: "2", energyAfter: "4" });
assert.equal(E.getCheckin(c, "10k", "first").energyAfter, "4");
c = E.setChdConsent(c, false);
assert.equal(E.getCheckin(c, "10k", "first").energyAfter, undefined);
assert.equal(E.getCheckin(c, "10k", "first").effort, "6");

// ---- scheduler: no consecutive key days; Walk to 5K never 3 run days in a row ----
assert.ok(validTrainDays([1, 2, 4, 5, 6], 5)); assert.ok(!validTrainDays([1, 2], 3));
for (const id of E.LEVEL_IDS) for (const n of [2, 3, 4, 5]) {
  const u = E.grantPurchase(E.emptyState(), { levelId: id, kind: "new", price: "6.99", daysPerWeek: n, trainDays: [0, 1, 2, 3, 4, 5, 6].slice(0, 7), today: D0 });
  const uu = { ...u, settings: { ...u.settings, trainDays: [0, 1, 2, 3, 4, 5, 6] } };
  const lv = levelData(uu, id, LEVELS);
  const sched = projectSchedule(uu, id, LEVELS, D0);
  assert.equal(sched.length, lv.slots.length, `${id}-${n}`);
  const keys = new Set(sched.filter((y) => lv.slots[y.slot - 1].key).map((y) => y.date));
  for (const day of keys) assert.ok(!keys.has(addDays(day, 1)), `${id}-${n} key ${day}`);
  if (id === "walk-to-5k") {
    const run = new Set(sched.filter((y) => isRunning(lv.slots[y.slot - 1])).map((y) => y.date));
    for (const day of run) assert.ok(!(run.has(addDays(day, -1)) && run.has(addDays(day, -2))), `${id}-${n} run ${day}`);
  }
  // default days produce no key-day conflict
  assert.ok(!keyDayConflict(lv, E.DEFAULT_TRAIN_DAYS[n]) || n >= 4, `${id}-${n} default days`);
}
let w = E.grantPurchase(E.emptyState(), { levelId: "5k-faster", kind: "new", price: "6.99", daysPerWeek: 3, today: D0 });
w = { ...w, settings: { ...w.settings, trainDays: [0, 1, 2, 3, 4, 5, 6] } };
const L3 = levelData(w, "5k-faster", LEVELS);
w = E.completeSlot(w, "5k-faster", { seconds: 1, key: !!L3.slots[0].key }, D0).state;
if (L3.slots[0].key && L3.slots[1].key) assert.equal(todayStatus(w, "5k-faster", LEVELS, addDays(D0, 1)).reason, "key-spacing");

// finish at core 36 -> recap uses first and final check-ins
let fz = E.grantPurchase(E.emptyState(), { levelId: "5k-faster", kind: "new", price: "6.99", daysPerWeek: 4, today: D0 });
fz = E.saveCheckin(fz, "5k-faster", "first", { fiveK: { seconds: 1900 } });
let res;
for (let k = 0; k < 40; k++) { res = E.completeSlot(fz, "5k-faster", { seconds: 60 }, addDays(D0, k)); fz = res.state; if (k < 39) assert.ok(!res.finished, String(k)); }
assert.ok(res.finished);
fz = E.saveCheckin(fz, "5k-faster", "final", { fiveK: { seconds: 1800 } });
const rc = E.recap(fz, "5k-faster", levelData(fz, "5k-faster", LEVELS));
assert.equal(rc.sessions, 40); assert.equal(rc.coreDone, 36); assert.equal(rc.first.fiveK.seconds, 1900); assert.equal(rc.final.fiveK.seconds, 1800);
assert.ok(E.badges(fz, "5k-faster").includes("A Challenge to Move: 5K Faster Finisher"));
assert.equal(E.windowStatus(fz, "5k-faster", addDays(D0, 45)).status, "finished");


// ---- Attorney memo §12 fixes ----
{
  const memo = readFileSync("/workspace/coach-salim/doing-a-5k-ladder-legal-review.md", "utf8");
  const s12 = memo.slice(memo.indexOf("## 12. Update"));
  for (const k of ["warn28", "warn14", "warn5", "restartDay0", "restartDay25"]) {
    assert.ok(s12.includes(COPY.es[k]), `ES ${k} is §12 text`);
    assert.ok(!/energía/.test(COPY.es[k]), `ES ${k} is not the CHD text`);
  }
  for (const k of ["warn28", "warn14", "warn5", "cantFinish"]) assert.ok(!/\$|2\.99/.test(COPY.es[k]), k);
  assert.ok(!/the the/.test(COPY.en.twoDayGift));
  assert.ok(!JSON.stringify(COPY).includes("You're starting"));
  assert.equal(tc("finish_fasterAsk"), "Want to go longer? A Challenge to Move: 10K builds your long run, step by step, toward 10K, with long easy runs and steady sessions.");
  assert.equal(tc("finish_walkHead"), "From walking to this. Let that sink in.");
  assert.equal(COPY.es.timeOnFeet, "Tiempo en movimiento");
  // ES warnings wired into the engine
  const es = E.pickReminder(s, "walk-to-5k", { today: addDays(D0, 70), lang: "es" });
  assert.equal(es.id, "warn_28"); assert.match(es.text, /^Vas en la sesión \d+ de tu programa A Challenge to Move: Walk to 5K/);
  const es0 = E.pickReminder(s, "walk-to-5k", { today: addDays(D0, 98), lang: "es" });
  assert.match(es0.text, /nuevo periodo de 14 semanas/);
  assert.equal(E.reminderText("cant_finish", "es"), COPY.es.cantFinish);
}
// name scheme: site strings for both options, never the 5K house name on the 10K level
{
  const { SITE_STRINGS } = await import("../js/ladder/config.js");
  assert.deepEqual(Object.keys(SITE_STRINGS).sort(), ["doing", "umbrella"]);
  for (const v of Object.values(SITE_STRINGS)) for (const x of Object.values(v)) assert.ok(!/Doing a 5K: 10K|[\u2013\u2014]/.test(x));
  const ack = readFileSync(join(here, "../../../js/health-ack.js"), "utf8");
  const T = JSON.parse(ack.match(/var T = (\{.*?\});\n/s)[1]);
  const { createHash } = await import("node:crypto");
  for (const lang of ["en", "es"]) {
    const { hash, ...rest } = T[lang];
    assert.equal(createHash("sha256").update(JSON.stringify(rest)).digest("hex"), hash, `ack hash ${lang}`);
    assert.ok(T[lang].sections.some((x) => x[0] === "10k"), `ack 10K ${lang}`);
    assert.ok(!/Doing a 5K, 5K to Half/.test(T[lang].lead));
  }
}

// ---- Attorney memo §13 ----
{
  const memo = readFileSync("/workspace/coach-salim/doing-a-5k-ladder-legal-review.md", "utf8");
  const s13 = memo.slice(memo.indexOf("## 13. Update"));
  const C = await import("../js/ladder/config.js");
  for (const k of ["umbrella", "doing"]) for (const l of ["en", "es"]) {
    const line = C.chd65(k, l);
    const paren = line.slice(line.lastIndexOf(" (") + 1);
    assert.ok(s13.includes(paren), `CHD 65 ${k} ${l} parenthetical is §13.1 text`);
    assert.equal(C.SITE_STRINGS[k][l === "es" ? "chd65Es" : "chd65"], line);
  }
  assert.ok(C.chd65("doing", "en").includes("Doing a 5K and Doing a 10K both starting [RUNNING PLANS LAUNCH DATE], and the 30-Day"));
  const sep = C.chd65("doing", "en", { ...C.LAUNCH_DATES, "10k": "[10K DATE]" });
  assert.ok(sep.includes("Doing a 5K starting [RUNNING PLANS LAUNCH DATE], Doing a 10K starting [10K DATE]"), "one date per plan");
  for (const [k, en, es] of [["umbrella", "Back to the 5K and 10K plans", "Volver a los planes de 5K y 10K"], ["doing", "Back to Doing a 5K and Doing a 10K", "Volver a Doing a 5K y Doing a 10K"]]) {
    assert.equal(C.SITE_STRINGS[k].gearBackEn, en); assert.equal(C.SITE_STRINGS[k].gearBackEs, es);
  }
  assert.ok(readFileSync(join(here, "../../../gear/index.html"), "utf8").includes('<a class="back-link" href="/doing-a-5k/">&larr; Back to the 5K and 10K plans</a>'));
  for (const id of ["streak", "save_used", "easy_day", "on_pace", "paused"]) {
    assert.ok(s13.includes("`" + E.REMINDERS_ES[id] + "`"), `ES ${id} is §13.3 text`);
    assert.equal(E.reminderText(id, "es"), E.REMINDERS_ES[id]);
    assert.equal(E.reminderText(id, "en"), E.REMINDERS[id]);
  }
  for (const k of ["finish_fasterHeadTimed", "finish_fasterHead", "finish_tenAsk"]) assert.ok(s13.includes(COPY.es[k]), `ES ${k}`);
  assert.equal(tc("finish_fasterHeadTimed", { fin: "28:10", base: "33:40" }, "es"), "Tu 5K: 28:10. Primera sesión: 33:40.");
  // ES pickReminder covers the non-warning reminders too
  let hit = 0;
  for (let d = 0; d < 60; d++) {
    const en = E.pickReminder(s, "walk-to-5k", { today: addDays(D0, d) });
    const es = E.pickReminder(s, "walk-to-5k", { today: addDays(D0, d), lang: "es" });
    if (!en) continue;
    assert.equal(en.id, es.id);
    if (["streak", "save_used", "easy_day", "on_pace", "paused"].includes(en.id)) { assert.notEqual(en.text, es.text); hit++; }
  }
  assert.ok(hit > 0, "exercised a non-warning reminder in ES");
}

console.log("ladder engine: all checks passed");
