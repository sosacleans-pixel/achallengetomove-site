/* Doing a 5K ladder scheduler (spec v5 §1 and §10.3).
 * - Weekly order comes from the level file (template S1, S2, S5, S4, S3; S3 always last).
 * - One new session per calendar day.
 * - Walk-to-Run and 5K: no more than 3 running days in a row ("Easy movement" sessions are not running days).
 * - Faster 5K: key (⚡) sessions are never on back-to-back days, at any frequency.
 * - Days a week changes apply at a week boundary (engine.requestDaysPerWeek).
 * Runs on the user's own log, so repeats count for spacing too. */
import { addDays, weekday, todayISO } from "./dates.js";
import { DEFAULT_TRAIN_DAYS, currentRun, slotDoneToday, dpw } from "./engine.js";

export function levelData(s, levelId, LEVELS, daysPerWeek = dpw(s)) {
  return LEVELS[`${levelId}-${daysPerWeek}x`];
}

export function isRunning(slotDef) {
  return !!slotDef && slotDef.kind !== "Easy movement";
}

function runDates(s) {
  return new Set(s.log.filter((e) => e.kind !== "repair" && e.running !== false).map((e) => e.date));
}

function qDates(s) {
  return new Set(s.log.filter((e) => e.kind !== "repair" && e.q).map((e) => e.date));
}

function trainDays(s) {
  return s.settings?.trainDays || DEFAULT_TRAIN_DAYS[dpw(s)];
}

function spacingBlock(level, slotDef, date, ran, qs) {
  if (level.spacing === "max3RunDaysInARow" && isRunning(slotDef)) {
    if (ran.has(addDays(date, -1)) && ran.has(addDays(date, -2)) && ran.has(addDays(date, -3))) return "rest-after-3";
  }
  if (level.spacing === "noBackToBackQ" && slotDef?.q && qs.has(addDays(date, -1))) return "q-spacing";
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
    if (slotDef.q) qs.add(d);
    idx++;
  }
  return out;
}

/* Count must match; at 5 a week no 4 picked days in a row (the week wraps). */
export function validTrainDays(daysArr, perWeek) {
  if (daysArr.length !== perWeek) return false;
  if (perWeek === 5) {
    const set = new Set(daysArr);
    for (let i = 0; i < 7; i++) if ([0, 1, 2, 3].every((k) => set.has((i + k) % 7))) return false;
  }
  return true;
}
