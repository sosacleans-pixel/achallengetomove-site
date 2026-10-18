// Completion, streak, points and badge rules (holiday-30-day-challenge.md: Daily rules, Grace rule, App tracking).
// Two modes: "live" (Nov 25 - Dec 24, 2026 for everyone) and "self" (self-paced: Day 1 = the user's own start date).
import { CONFIG } from "./config.js";
import { dateKey, now, addDays, diffDays } from "./dates.js";

export const HABITS = ["steps", "water", "wind_down", "breath_1min"];
export const DAYS = 30;

const todayKey = () => dateKey(now());

/** True once the live window is over: new visitors can only start the self-paced edition. */
export function selfOnlyNow(k = todayKey()) {
  return !!(CONFIG.selfPaced && CONFIG.selfPaced.enabled && k > CONFIG.selfPaced.after);
}

/** "live" | "self". A set-up user keeps their mode; a visitor before setup is "self" only after Dec 24. */
export function modeOf(s) {
  if (s && s.setupDone) return s.mode === "self" ? "self" : "live";
  return selfOnlyNow() ? "self" : "live";
}

/** Date key of Day 1 for this user (self-paced: their start date; a visitor previewing self-paced: today). */
export function startOf(s) {
  if (modeOf(s) === "self") return (s && s.setupDone && s.startDate) || todayKey();
  return CONFIG.start;
}
/** Date key of Day 30. */
export function endOf(s) {
  return modeOf(s) === "self" ? addDays(startOf(s), DAYS - 1) : CONFIG.end;
}
export function dayNum(s, k) { return diffDays(startOf(s), k) + 1; }
export function dateFor(s, n) { return addDays(startOf(s), n - 1); }

/** "pre" | "live" | "post" for this user's window. */
export function phaseOf(s, k = todayKey()) {
  if (k < startOf(s)) return "pre";
  if (k > endOf(s)) return "post";
  return "live";
}

export function todayN(s) {
  return dayNum(s, todayKey());
}

export function joinDay(s) {
  if (!s || !s.joinedDate) return 1;
  const n = dayNum(s, s.joinedDate);
  return Math.min(DAYS, Math.max(1, n));
}

export function isComplete(rec) {
  return !!rec && (rec.status === "core" || rec.status === "floor");
}

/** Can the user log day n right now? */
export function editable(s, n) {
  if (!s || !s.setupDone) return false;
  if (n < joinDay(s) || n < 1 || n > DAYS) return false;
  const t = todayN(s);
  if (n === t) return true;
  if (n === t - 1 && now().getHours() < CONFIG.backlogUntilHour) return true;
  return false;
}

/** core | floor | protected | missed | open | future | before */
export function statusOf(s, n) {
  const rec = s?.days?.[n];
  if (rec && rec.status) return rec.status;
  if (s && n < joinDay(s)) return "before";
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

/** Late-join goal: ceil(22/30 x days remaining, counting the join day). A Day 1 start (and every self-paced run) = 22. */
export function lateJoinTarget(joinDayN) {
  if (joinDayN <= 1 || CONFIG.lateJoinTarget === "fixed") return CONFIG.requiredDays;
  const left = DAYS + 1 - joinDayN;
  return Math.max(1, Math.ceil((left * CONFIG.requiredDays) / DAYS));
}
export function target(s) {
  return lateJoinTarget(joinDay(s));
}

/** Last date a make-up day can be logged. Live: Dec 24 + protected days, capped at Dec 31.
 *  Self-paced: Day 30 + protected days, capped at CONFIG.selfPaced.extendDays extra days. */
export function deadline(s) {
  const p = counts(s).protected;
  if (modeOf(s) === "self") return addDays(endOf(s), Math.min(p, CONFIG.selfPaced.extendDays));
  const d = addDays(CONFIG.end, p);
  return d > CONFIG.extendUntil ? CONFIG.extendUntil : d;
}

export function streaks(s) {
  const t = Math.min(todayN(s), DAYS);
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

/** Archive the current run and start a self-paced run with Day 1 = today. Setup answers and terms are kept. */
export function startSelfRound(s, today = todayKey()) {
  const prev = { mode: modeOf(s), startDate: startOf(s), joinedDate: s.joinedDate, days: s.days, makeup: s.makeup || [], tests: s.tests || {}, endedAt: today };
  return { ...s, history: [...(s.history || []), prev], mode: "self", startDate: today, joinedDate: today, days: {}, makeup: [], tests: {}, unbrokenOptIn: s.unbrokenOptIn, levelLog: [...(s.levelLog || []), { at: today, level: s.level, from: "self-paced-start" }] };
}
