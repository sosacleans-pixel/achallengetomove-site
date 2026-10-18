// Completion, streak, points and badge rules (holiday-30-day-challenge.md: Daily rules, Grace rule, App tracking).
import { CONFIG } from "./config.js";
import { dateKey, now, dayNumberFor, dateForDay, addDays, phase } from "./dates.js";

export const HABITS = ["steps", "water", "wind_down", "breath_1min"];

export function todayN() {
  return dayNumberFor(dateKey(now()));
}

export function joinDay(s) {
  if (!s || !s.joinedDate) return 1;
  const n = dayNumberFor(s.joinedDate);
  return Math.min(30, Math.max(1, n));
}

export function isComplete(rec) {
  return !!rec && (rec.status === "core" || rec.status === "floor");
}

/** Can the user log day n right now? */
export function editable(s, n) {
  if (!s || !s.setupDone) return false;
  if (n < joinDay(s) || n < 1 || n > 30) return false;
  const t = todayN();
  if (n === t) return true;
  if (n === t - 1 && now().getHours() < CONFIG.backlogUntilHour) return true;
  return false;
}

/** core | floor | protected | missed | open | future | before */
export function statusOf(s, n) {
  const rec = s?.days?.[n];
  if (rec && rec.status) return rec.status;
  if (s && n < joinDay(s)) return "before";
  const t = todayN();
  if (n > t) return "future";
  if (n === t || editable(s, n)) return "open";
  return "missed";
}

export function counts(s) {
  const c = { complete: 0, core: 0, floor: 0, protected: 0, missed: 0 };
  for (let n = 1; n <= 30; n++) {
    const st = statusOf(s, n);
    if (st === "core" || st === "floor") { c.complete++; c[st]++; }
    else if (st === "protected") c.protected++;
    else if (st === "missed") c.missed++;
  }
  c.makeup = (s.makeup || []).length;
  c.complete += c.makeup;
  return c;
}

export function target(s) {
  const j = joinDay(s);
  if (j <= 1 || CONFIG.lateJoinTarget === "fixed") return CONFIG.requiredDays;
  const left = 31 - j;
  return Math.max(1, Math.ceil((left * CONFIG.requiredDays) / 30));
}

/** Last date a make-up day can be logged (Dec 24 + protected days, capped at Dec 31). */
export function deadline(s) {
  const p = counts(s).protected;
  const d = addDays(CONFIG.end, p);
  return d > CONFIG.extendUntil ? CONFIG.extendUntil : d;
}

export function streaks(s) {
  const t = Math.min(todayN(), 30);
  const j = joinDay(s);
  let best = 0, run = 0;
  for (let n = j; n <= t; n++) {
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
  for (let n = 1; n <= 30; n++) p += dayPoints(s, n);
  return p + (s.makeup || []).length * 10;
}

export function badges(s) {
  const c = counts(s);
  const tests = s.tests || {};
  const has = (t) => t && (t.pu != null || t.puSkipped || t.sts != null || t.wall != null);
  let comeback = false;
  for (let n = 2; n <= 30; n++) {
    if (isComplete(s.days[n]) && statusOf(s, n - 1) === "missed") comeback = true;
  }
  const all30 = (() => { for (let n = 1; n <= 30; n++) if (!isComplete(s.days[n])) return false; return true; })();
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

export { phase, dateForDay };
