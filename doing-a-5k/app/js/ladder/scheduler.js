/* Doing a 5K ladder scheduler (spec §1 spacing rules).
 * - One new slot per calendar day.
 * - Levels 1 and 2 at 5 days a week: never more than 3 running days in a row (a rest day is inserted).
 * - Level 3: key (Q) sessions are never on back-to-back days, at any frequency.
 * Runs on the user's own log, so repeats count as running days for spacing. */
import { addDays, weekday, todayISO } from "./dates.js";
import { DEFAULT_TRAIN_DAYS, currentRun, slotDoneToday } from "./engine.js";

function runDates(s) {
  return new Set(s.log.filter((e) => e.kind !== "repair").map((e) => e.date));
}

function qDates(s, levels) {
  const out = new Set();
  for (const e of s.log) {
    const lvl = levels[e.levelId];
    if (lvl && e.slot && lvl.slots[e.slot - 1]?.q && e.kind !== "repair") out.add(e.date);
  }
  return out;
}

function trainDays(s) {
  return s.settings?.trainDays || DEFAULT_TRAIN_DAYS[s.settings?.daysPerWeek || 3];
}

/* Check the spacing rules for doing `slotDef` on `date`, given sets of past running and Q dates. */
function spacingBlock(level, slotDef, date, ran, qs, daysPerWeek) {
  if (level.spacing === "max3InARowAt5" && daysPerWeek === 5) {
    if (ran.has(addDays(date, -1)) && ran.has(addDays(date, -2)) && ran.has(addDays(date, -3))) {
      return "rest-after-3";
    }
  }
  if (level.spacing === "noBackToBackQ" && slotDef?.q && qs.has(addDays(date, -1))) {
    return "q-spacing";
  }
  return null;
}

/* What today looks like for the next new slot. */
export function todayStatus(s, levelId, levels, today = todayISO()) {
  const level = levels[levelId];
  const run = currentRun(s, levelId);
  if (!run) return { state: "none" };
  if (run.pointer >= 30) return { state: "finished" };
  if (slotDoneToday(s, levelId, today)) return { state: "done-today" };
  const slotDef = level.slots[run.pointer];
  const block = spacingBlock(level, slotDef, today, runDates(s), qDates(s, levels), s.settings?.daysPerWeek);
  if (block) return { state: "rest", reason: block, slotDef };
  const planned = trainDays(s).includes(weekday(today));
  return { state: "ready", slotDef, planned };
}

/* Project dates for the remaining slots, from today, on the user's chosen weekdays. */
export function projectSchedule(s, levelId, levels, today = todayISO()) {
  const level = levels[levelId];
  const run = currentRun(s, levelId);
  if (!run) return [];
  const ran = runDates(s);
  const qs = qDates(s, levels);
  const days = trainDays(s);
  const out = [];
  let slotIdx = run.pointer; // 0-based index of next slot
  let d = today;
  if (slotDoneToday(s, levelId, today)) d = addDays(today, 1);
  for (let guard = 0; slotIdx < 30 && guard < 400; guard++, d = addDays(d, 1)) {
    if (!days.includes(weekday(d))) continue;
    const slotDef = level.slots[slotIdx];
    if (spacingBlock(level, slotDef, d, ran, qs, s.settings?.daysPerWeek)) continue;
    out.push({ slot: slotIdx + 1, date: d });
    ran.add(d);
    if (slotDef.q) qs.add(d);
    slotIdx++;
  }
  return out;
}

/* Validate chosen weekdays: count must match, and at 5 a week no 4 days in a row (week wraps). */
export function validTrainDays(daysArr, perWeek) {
  if (daysArr.length !== perWeek) return false;
  if (perWeek === 5) {
    const set = new Set(daysArr);
    for (let i = 0; i < 7; i++) {
      if ([0, 1, 2, 3].every((k) => set.has((i + k) % 7))) return false;
    }
  }
  return true;
}
