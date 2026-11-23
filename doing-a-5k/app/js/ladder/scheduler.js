/* Ladder scheduler (Coach Fit spec v6 §2 and §13.3).
 * - Weekly order comes from the level file. One new session per calendar day.
 * - Every level: key sessions (data flag `key`) are never on consecutive days (noBackToBackKey).
 * - Walk to 5K: never 3 run days in a row (max2RunDaysInARow); its easy extras are not running days.
 * - Days a week can change at any time; the engine continues by coreIndex.
 * - Preview limit: a blocked key session moves to the next free day; it does not swap with a later
 *   session in the same week yet.
 * Runs on the user's own log, so repeats count for spacing too. */
import { addDays, weekday, todayISO } from "./dates.js";
import { DEFAULT_TRAIN_DAYS, currentRun, slotDoneToday, dpw } from "./engine.js";

export function levelData(s, levelId, LEVELS, daysPerWeek = dpw(s)) {
  return LEVELS[`${levelId}-${daysPerWeek}x`];
}

export function isRunning(slotDef) {
  return !!slotDef && slotDef.kind !== "Easy extra";
}

function runDates(s) {
  return new Set(s.log.filter((e) => e.kind !== "repair" && e.running !== false).map((e) => e.date));
}

function qDates(s) {
  return new Set(s.log.filter((e) => e.kind !== "repair" && e.key).map((e) => e.date));
}

function trainDays(s) {
  return s.settings?.trainDays || DEFAULT_TRAIN_DAYS[dpw(s)];
}

function spacingBlock(level, slotDef, date, ran, qs) {
  if (level.spacing === "max2RunDaysInARow" && isRunning(slotDef)) {
    if (ran.has(addDays(date, -1)) && ran.has(addDays(date, -2))) return "rest-after-2";
  }
  if (slotDef?.key && qs.has(addDays(date, -1))) return "key-spacing";
  return null;
}

export function todayStatus(s, levelId, LEVELS, today = todayISO()) {
  const level = levelData(s, levelId, LEVELS);
  const run = currentRun(s, levelId);
  if (!run) return { state: "none" };
  if (run.pointer >= level.slots.length) return { state: "finished" };
  if (slotDoneToday(s, levelId, today)) return { state: "done-today" };
  const slotDef = level.slots[run.pointer];
  const block = spacingBlock(level, slotDef, today, runDates(s), qDates(s));
  if (block) return { state: "rest", reason: block, slotDef };
  return { state: "ready", slotDef, planned: trainDays(s).includes(weekday(today)) };
}

/* Project dates for the remaining sessions, from today, on the chosen weekdays. */
export function projectSchedule(s, levelId, LEVELS, today = todayISO()) {
  const level = levelData(s, levelId, LEVELS);
  const run = currentRun(s, levelId);
  if (!run) return [];
  const ran = runDates(s);
  const qs = qDates(s);
  const days = trainDays(s);
  const out = [];
  let idx = run.pointer;
  let d = slotDoneToday(s, levelId, today) ? addDays(today, 1) : today;
  for (let guard = 0; idx < level.slots.length && guard < 500; guard++, d = addDays(d, 1)) {
    if (!days.includes(weekday(d))) continue;
    const slotDef = level.slots[idx];
    if (spacingBlock(level, slotDef, d, ran, qs)) continue;
    out.push({ slot: idx + 1, date: d });
    if (isRunning(slotDef)) ran.add(d);
    if (slotDef.key) qs.add(d);
    idx++;
  }
  return out;
}

/* Count must match. */
export function validTrainDays(daysArr, perWeek) {
  return daysArr.length === perWeek;
}

/* Key-day conflict for the "Which days?" step: with this many key sessions a week, would two land on
 * consecutive picked days? Keys per week come from the file's first full week. */
export function keyDayConflict(level, daysArr) {
  const wk = level.slots.filter((x) => x.week === 2);
  const keys = wk.map((x) => !!x.key);
  const days = [...daysArr].sort((a, b) => a - b);
  if (!keys.length || days.length !== keys.length) return false;
  for (let i = 0; i < days.length; i++) {
    const j = (i + 1) % days.length;
    const gap = (days[j] - days[i] + 7) % 7;
    if (gap === 1 && keys[i] && keys[j]) return true;
  }
  return false;
}
