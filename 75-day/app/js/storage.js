import { dateKey, getClockNow, datesToEvaluate, isDateEditable, activeWorkDate, addDays } from "./dates.js";
import { dayFullyComplete, currentStreak } from "./tasks.js";
import { programDayIndex } from "./program.js";

export const STORAGE_KEY = "seventy-five-v1";

export function defaultSettings(mode = "all-in") {
  return {
    units: "imperial",
    waterTargetMl: mode === "adaptive" ? 3000 : 3785,
    reminderTime: "07:00",
    bodyWeightLb: null,
    bodyWeightKg: null,
  };
}

export function defaultJourney() {
  return {
    onboardingStep: "intro",
    onboardingComplete: false,
    myWhy: "",
    committedAt: null,
    prepChecklist: {},
    day0: null,
    milestonesSeen: [],
    weeklyRecapsSeen: [],
    keepGoing: null,
    finishSeen: false,
  };
}

export function defaultAdaptive() {
  return {
    workoutDaysPerWeek: 6,
    workoutMinutes: 45,
    fitnessLevel: "moderate",
    weeklyRestDay: true,
    flexibleMealsUsed: {},
  };
}

export function createState(mode, extra = {}) {
  const today = dateKey(getClockNow());
  return {
    version: 2,
    mode,
    startDate: today,
    currentAttemptStart: today,
    attemptNumber: 1,
    attempts: [],
    bestStreak: 0,
    bestAllInDay: 0,
    settings: defaultSettings(mode),
    adaptive: mode === "adaptive" ? defaultAdaptive() : null,
    days: {},
    pendingRestart: null,
    journey: defaultJourney(),
    ...extra,
  };
}

function migrate(state) {
  if (!state) return state;
  if (!state.journey) {
    state.journey = defaultJourney();
    state.journey.onboardingComplete = true;
  }
  if (!state.attemptNumber) state.attemptNumber = 1;
  if (state.mode === "adaptive" && state.adaptive) {
    if (state.adaptive.workoutMinutes === 30 && !state.journey.onboardingComplete) {
      Object.assign(state.adaptive, defaultAdaptive());
    }
  }
  return state;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportStateJson() {
  return JSON.stringify(loadState() ?? {}, null, 2);
}

export function ensureDay(state, key) {
  if (!state.days[key]) {
    state.days[key] = {
      tasks: {},
      waterMl: 0,
      workouts: [],
      reading: {},
      alcoholDrinks: 0,
      checkin: {},
      recovery: {},
    };
  }
  return state.days[key];
}

function recordAttemptEnd(state, endKey, daysReached) {
  const attempts = [...(state.attempts || [])];
  attempts.push({
    mode: state.mode,
    attemptNumber: state.attemptNumber || 1,
    startDate: state.currentAttemptStart || state.startDate,
    endDate: endKey,
    daysReached,
    endedAt: getClockNow().toISOString(),
  });
  state.attempts = attempts;
  if (daysReached > (state.bestAllInDay || 0)) state.bestAllInDay = daysReached;
}

export function triggerRestart(state, failedDate, reason) {
  const daysReached = programDayIndex(state.currentAttemptStart || state.startDate, failedDate);
  recordAttemptEnd(state, failedDate, daysReached);
  const streak = currentStreak(state, addDays(failedDate, -1));
  if (streak > (state.bestStreak || 0)) state.bestStreak = streak;
  return {
    ...state,
    pendingRestart: {
      failedDate,
      daysReached,
      reason,
      message:
        reason === "honesty"
          ? "Honesty matters in All-In. Today counts as incomplete — restart at Day 1 when you are ready."
          : "A missed day means a fresh start — you have learned something. Ready when you are.",
    },
  };
}

/** Process locked days for All-In restarts. */
export function processDayLocks(state, now = getClockNow()) {
  if (!state || state.mode !== "all-in" || state.pendingRestart) return state;
  if (!state.journey?.onboardingComplete) return state;

  const keys = datesToEvaluate(state, now);
  const locked = keys.filter((k) => !isDateEditable(k, now) && k !== activeWorkDate(now));
  if (!locked.length) return state;

  let next = { ...state, days: { ...state.days } };
  for (const k of locked) {
    if (next.days[k]?.evaluated) continue;
    ensureDay(next, k);
    const tasksOk = dayFullyComplete(next, k);
    const closed = !!next.days[k].dayClosed;
    const complete = tasksOk && closed;
    next.days[k] = { ...next.days[k], evaluated: true, complete };
    if (!complete) {
      return triggerRestart(next, k, tasksOk && !closed ? "honesty" : "missed");
    }
  }
  const streak = currentStreak(next, activeWorkDate(now));
  if (streak > (next.bestStreak || 0)) next.bestStreak = streak;
  return next;
}

export function confirmRestart(state) {
  const today = dateKey(getClockNow());
  const next = {
    ...state,
    pendingRestart: null,
    attemptNumber: (state.attemptNumber || 1) + 1,
    startDate: today,
    currentAttemptStart: today,
    days: {},
    journey: {
      ...state.journey,
      milestonesSeen: [],
      weeklyRecapsSeen: [],
      finishSeen: false,
    },
  };
  return next;
}

export function switchToAllIn(state) {
  const today = dateKey(getClockNow());
  return createState("all-in", {
    settings: state.settings,
    attempts: state.attempts || [],
    bestStreak: state.bestStreak || 0,
    bestAllInDay: state.bestAllInDay || 0,
    attemptNumber: (state.attemptNumber || 1),
    startDate: today,
    currentAttemptStart: today,
    journey: {
      ...defaultJourney(),
      onboardingComplete: true,
      myWhy: state.journey?.myWhy || "",
      committedAt: getClockNow().toISOString(),
    },
  });
}

export function updateJourney(state, patch) {
  return { ...state, journey: { ...state.journey, ...patch } };
}

export function setStartDate(state, startKey) {
  return { ...state, startDate: startKey, currentAttemptStart: startKey };
}

export function markDayClosed(state, key, { honesty = true } = {}) {
  const next = { ...state, days: { ...state.days } };
  const day = ensureDay(next, key);
  next.days[key] = {
    ...day,
    dayClosed: true,
    honestyConfirmed: honesty,
    closedAt: getClockNow().toISOString(),
  };
  return next;
}

export function honestyRestart(state, key) {
  let next = markDayClosed(state, key, { honesty: false });
  next = triggerRestart(next, key, "honesty");
  return next;
}

export function toggleTask(state, key, taskId) {
  const next = { ...state, days: { ...state.days } };
  const day = ensureDay(next, key);
  const tasks = { ...day.tasks };
  tasks[taskId] = !tasks[taskId];
  next.days[key] = { ...day, tasks };
  return next;
}

export function addWater(state, key, ml) {
  const next = { ...state, days: { ...state.days } };
  const day = ensureDay(next, key);
  next.days[key] = { ...day, waterMl: Math.max(0, (day.waterMl || 0) + ml) };
  return next;
}

export function logWorkout(state, key, entry) {
  const next = { ...state, days: { ...state.days } };
  const day = ensureDay(next, key);
  const workouts = [...(day.workouts || []), entry];
  next.days[key] = { ...day, workouts };
  return next;
}

export function updateReading(state, key, patch) {
  const next = { ...state, days: { ...state.days } };
  const day = ensureDay(next, key);
  next.days[key] = { ...day, reading: { ...day.reading, ...patch } };
  return next;
}

export function updateCheckin(state, key, patch) {
  const next = { ...state, days: { ...state.days } };
  const day = ensureDay(next, key);
  next.days[key] = { ...day, checkin: { ...day.checkin, ...patch } };
  return next;
}

export function setPhotoRef(state, key, thumbId) {
  const next = { ...state, days: { ...state.days } };
  const day = ensureDay(next, key);
  next.days[key] = { ...day, photoThumbId: thumbId, tasks: { ...day.tasks, photo: true } };
  return next;
}

export function setDay0Photo(state, angle, thumbId) {
  const j = state.journey || defaultJourney();
  const day0 = { ...(j.day0 || {}), photos: { ...(j.day0?.photos || {}), [angle]: thumbId } };
  return updateJourney(state, { day0 });
}

export function updateDay0(state, patch) {
  const j = state.journey || defaultJourney();
  return updateJourney(state, { day0: { ...(j.day0 || {}), ...patch } });
}

export function setRecoveryDone(state, key, done) {
  const next = { ...state, days: { ...state.days } };
  const day = ensureDay(next, key);
  next.days[key] = { ...day, recovery: { done } };
  return next;
}

export function setAlcoholDrinks(state, key, n) {
  const next = { ...state, days: { ...state.days } };
  const day = ensureDay(next, key);
  next.days[key] = { ...day, alcoholDrinks: Math.max(0, n) };
  return next;
}

export function updateSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...patch } };
}

export function updateAdaptive(state, patch) {
  return { ...state, adaptive: { ...state.adaptive, ...patch } };
}

export function setWeatherException(state, key, enabled) {
  const next = { ...state, days: { ...state.days } };
  const day = ensureDay(next, key);
  next.days[key] = {
    ...day,
    weatherException: !!enabled,
    weatherExceptionAt: enabled ? getClockNow().toISOString() : null,
  };
  return next;
}

export function startKeepGoing(state) {
  const today = dateKey(getClockNow());
  return updateJourney(state, {
    keepGoing: { active: true, startDate: today, days: {}, duration: 30 },
    finishSeen: true,
  });
}
