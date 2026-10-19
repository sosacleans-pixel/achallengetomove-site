// Completion, streak, points and badge rules (holiday-30-day-challenge.md: Daily rules, Grace rule, App tracking).
// Rolling start (config.js): every user's Day 1 is their own start date; there is no shared calendar.
import { CONFIG } from "./config.js";
import { dateKey, now, addDays, diffDays } from "./dates.js";

export const HABITS = ["steps", "water", "wind_down", "breath_1min"];
export const DAYS = CONFIG.programDays;

const todayKey = () => dateKey(now());

/** Date key of Day 1 for this user: their start date, or today for a visitor (a preview of "if you start today"). */
export function startOf(s) {
  return (s && s.setupDone && s.startDate) || todayKey();
}
/** Date key of Day 30. */
export function endOf(s) {
  return addDays(startOf(s), DAYS - 1);
}
export function dayNum(s, k) { return diffDays(startOf(s), k) + 1; }
export function dateFor(s, n) { return addDays(startOf(s), n - 1); }

/** "pre" | "live" | "post" for this user's own 30 days ("pre" only if a saved start date is in the future). */
export function phaseOf(s, k = todayKey()) {
  if (k < startOf(s)) return "pre";
  if (k > endOf(s)) return "post";
  return "live";
}

export function todayN(s) {
  return dayNum(s, todayKey());
}

export function isComplete(rec) {
  return !!rec && (rec.status === "core" || rec.status === "floor");
}

/** Can the user log day n right now? */
export function editable(s, n) {
  if (!s || !s.setupDone) return false;
  if (n < 1 || n > DAYS) return false;
  const t = todayN(s);
  if (n === t) return true;
  if (n === t - 1 && now().getHours() < CONFIG.backlogUntilHour) return true;
  return false;
}

/** core | floor | protected | missed | open | future */
export function statusOf(s, n) {
  const rec = s?.days?.[n];
  if (rec && rec.status) return rec.status;
  const t = todayN(s);
  if (n > t) return "future";
  if (n === t || editable(s, n)) return "open";
  return "missed";
}

export function counts(s) {
  const c = { complete: 0, core: 0, floor: 0, protected: 0, missed: 0 };
  for (let n = 1; n <= DAYS; n++) {
    const st = statusOf(s, n);
    if (st === "core" || st === "floor") { c.complete++; c[st]++; }
    else if (st === "protected") c.protected++;
    else if (st === "missed") c.missed++;
  }
  c.makeup = (s.makeup || []).length;
  c.complete += c.makeup;
  return c;
}

/** Finisher goal: 22 complete days out of 30 (book rule), the same for everyone. */
export function target() {
  return CONFIG.requiredDays;
}

/** Last date a make-up day can be logged. Each protected day adds one make-up day after Day 30 (nothing pauses),
 *  capped at CONFIG.extendDays extra days. */
export function deadline(s) {
  const p = counts(s).protected;
  return addDays(endOf(s), Math.min(p, CONFIG.extendDays));
}

export function streaks(s) {
  const t = Math.min(todayN(s), DAYS);
  let best = 0, run = 0;
  for (let n = 1; n <= t; n++) {
    const st = statusOf(s, n);
    if (st === "core" || st === "floor") { run++; best = Math.max(best, run); }
    else if (st === "protected" || st === "open") { /* pauses, doesn't break */ }
    else run = 0;
  }
  return { current: run, best };
}

export function dayPoints(s, n) {
  const rec = s.days[n];
  if (!rec) return 0;
  const P = { day: 10, bonus: 5, habit: 5, checkin: 10, cap: 40 };
  let p = 0;
  const habits = HABITS.filter((h) => rec.habits?.[h]).length;
  if (isComplete(rec)) p += P.day;
  if (isComplete(rec) && habits === HABITS.length) p += P.bonus;
  p += habits * P.habit;
  if (CONFIG.checkinDays.includes(n) && rec.checkin && (rec.checkin.q1 || rec.checkin.q2)) p += P.checkin;
  return Math.min(P.cap, p);
}

export function totalPoints(s) {
  let p = 0;
  for (let n = 1; n <= DAYS; n++) p += dayPoints(s, n);
  return p + (s.makeup || []).length * 10;
}

export function badges(s) {
  const c = counts(s);
  const tests = s.tests || {};
  const has = (t) => t && (t.pu != null || t.puSkipped || t.sts != null || t.wall != null);
  let comeback = false;
  for (let n = 2; n <= DAYS; n++) {
    if (isComplete(s.days[n]) && statusOf(s, n - 1) === "missed") comeback = true;
  }
  const all30 = (() => { for (let n = 1; n <= DAYS; n++) if (!isComplete(s.days[n])) return false; return true; })();
  return [
    ["baseline", has(tests[1])],
    ["holidayFloor", isComplete(s.days[2])],
    ["week", c.complete >= 7],
    ["halfway", c.complete >= 11],
    ["three", c.complete >= 21],
    ["seal", c.complete >= 22],
    ["retest", has(tests[30])],
    ["comeback", comeback],
    ["finisher", c.complete >= target(s)],
    ...(s.unbrokenOptIn ? [["unbroken", all30]] : []),
  ];
}

/** Archive the current round and start a new one with Day 1 = today. Setup answers and terms are kept. */
export function startNewRound(s, today = todayKey()) {
  const prev = { startDate: startOf(s), days: s.days, makeup: s.makeup || [], tests: s.tests || {}, endedAt: today };
  return { ...s, history: [...(s.history || []), prev], startDate: today, joinedDate: today, days: {}, makeup: [], tests: {}, unbrokenOptIn: s.unbrokenOptIn, levelLog: [...(s.levelLog || []), { at: today, level: s.level, from: "new-round" }] };
}
