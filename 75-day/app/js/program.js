import { addDays, daysBetween, dateKey, getClockNow } from "./dates.js";
import { dayCompletionRatio, dayFullyComplete, taskListForMode, taskCompletion } from "./tasks.js";
import { MILESTONE_DAYS } from "./rules.js";

export function programDayIndex(startKey, workKey) {
  if (!startKey || !workKey || workKey < startKey) return 0;
  return Math.min(75, daysBetween(startKey, workKey) + 1);
}

export function day0Key(startKey) {
  return addDays(startKey, -1);
}

export function isProgramActive(state, now = getClockNow()) {
  if (!state?.startDate) return false;
  const today = dateKey(now);
  return today >= state.startDate;
}

export function isPrepDay(state, now = getClockNow()) {
  if (!state?.startDate) return false;
  const today = dateKey(now);
  return today < state.startDate;
}

export function pendingMilestone(state, dayIndex) {
  if (!dayIndex || !MILESTONE_DAYS.includes(dayIndex)) return null;
  const seen = state.journey?.milestonesSeen || [];
  if (seen.includes(dayIndex)) return null;
  const titles = {
    7: "One week in",
    25: "Quarter mark",
    50: "Halfway hero",
    75: "You did it",
  };
  return { day: dayIndex, title: titles[dayIndex] };
}

export function shouldShowWeeklyRecap(state, dayIndex) {
  if (!dayIndex || dayIndex % 7 !== 0) return false;
  const id = `week-${dayIndex}`;
  return !(state.journey?.weeklyRecapsSeen || []).includes(id);
}

export function weekRecapStats(state, throughDayIndex) {
  const start = state.startDate;
  const from = Math.max(1, throughDayIndex - 6);
  let taskTotal = 0;
  let taskDone = 0;
  let workouts = 0;
  let minutes = 0;
  let waterSum = 0;
  let waterDays = 0;
  let pages = 0;

  for (let d = from; d <= throughDayIndex; d++) {
    const k = addDays(start, d - 1);
    const day = state.days?.[k];
    const tasks = taskListForMode(state.mode);
    for (const t of tasks) {
      taskTotal++;
      if (taskCompletion(state, k, t.id)) taskDone++;
    }
    if (day?.workouts?.length) {
      workouts += day.workouts.length;
      minutes += day.workouts.reduce((s, w) => s + (w.minutes || 0), 0);
    }
    if (day?.waterMl) {
      waterSum += day.waterMl;
      waterDays++;
    }
    pages += day?.reading?.pages || 0;
  }

  return {
    taskPct: taskTotal ? Math.round((taskDone / taskTotal) * 100) : 0,
    workouts,
    minutes,
    waterAvgMl: waterDays ? Math.round(waterSum / waterDays) : 0,
    pages,
    fromDay: from,
    toDay: throughDayIndex,
  };
}

export function computeProgramStats(state) {
  let workouts = 0;
  let minutes = 0;
  let pages = 0;
  let waterTotal = 0;
  let daysLogged = 0;
  let daysComplete = 0;

  for (let i = 1; i <= 75; i++) {
    const k = addDays(state.startDate, i - 1);
    const day = state.days?.[k];
    if (!day) continue;
    daysLogged++;
    if (dayFullyComplete(state, k)) daysComplete++;
    if (day.workouts?.length) {
      workouts += day.workouts.length;
      minutes += day.workouts.reduce((s, w) => s + (w.minutes || 0), 0);
    }
    pages += day.reading?.pages || 0;
    waterTotal += day.waterMl || 0;
  }

  return {
    workouts,
    minutes,
    pages,
    waterTotal,
    daysLogged,
    daysComplete,
    attempts: state.attempts?.length || 0,
    attemptNumber: state.attemptNumber || 1,
    bestStreak: state.bestStreak || 0,
  };
}

export function dateForProgramDay(startKey, dayIndex) {
  return addDays(startKey, dayIndex - 1);
}

export function allTasksCompleteForDay(state, key) {
  return dayFullyComplete(state, key);
}

export function dayClosed(state, key) {
  return !!state.days?.[key]?.dayClosed;
}
