import { dateKey, parseDateKey, addDays } from "./dates.js";

const ALL_IN_TASKS = [
  {
    id: "workouts",
    label: "Two 45+ min workouts, 3+ hours apart (only one is normally outdoors)",
    group: "movement",
  },
  { id: "nutrition", label: "Structured whole-food eating (no off-plan meals)", group: "fuel" },
  { id: "alcohol", label: "No alcohol", group: "fuel" },
  { id: "water", label: "Hit your water target", group: "fuel" },
  { id: "reading", label: "10 pages or 15 min learning", group: "mind" },
  { id: "photo", label: "Progress photo (on-device only)", group: "mind" },
  { id: "sleep", label: "7+ hours sleep last night", group: "recovery" },
];

const ADAPTIVE_TASKS = [
  { id: "movement", label: "Workout or active recovery", group: "movement" },
  { id: "nutrition", label: "Mostly whole foods (1 flexible meal/week)", group: "fuel" },
  { id: "alcohol", label: "Limit alcohol — social occasions only", group: "fuel" },
  { id: "water", label: "Water target", group: "fuel" },
  { id: "reading", label: "10 min reading, learning, or mindfulness", group: "mind" },
  { id: "checkin", label: "Daily check-in", group: "mind" },
];

export function taskListForMode(mode) {
  return mode === "adaptive" ? ADAPTIVE_TASKS : ALL_IN_TASKS;
}

export function waterTargetMl(state) {
  const s = state.settings || {};
  if (s.waterTargetMl) return s.waterTargetMl;
  if (state.mode === "adaptive") return 3000;
  if (s.units === "imperial") return 3785;
  return 3700;
}

export function minWaterFromWeight(state) {
  const lb = state.settings?.bodyWeightLb;
  if (!lb || lb <= 0) return null;
  const oz = lb * 0.5;
  if (state.settings?.units === "imperial") return Math.round(oz * 29.5735);
  const kg = state.settings?.bodyWeightKg || lb * 0.453592;
  return Math.round(kg * 33);
}

export function defaultWaterTarget(state) {
  const min = minWaterFromWeight(state);
  const def = waterTargetMl(state);
  if (min && def < min) return min;
  return def;
}

export function dayHasWeatherException(day) {
  return !!day?.weatherException;
}

function workoutsMeetAllIn(day) {
  const list = day.workouts || [];
  const long = list.filter((w) => (w.minutes || 0) >= 45);
  if (long.length < 2) return false;
  if (!day.weatherException) {
    const outdoor = list.some((w) => w.outdoor && (w.minutes || 0) >= 45);
    if (!outdoor) return false;
  }
  const times = long.map((w) => w.loggedAt || 0).sort((a, b) => a - b);
  if (times.length >= 2 && times[1] - times[0] < 3 * 3600000) return false;
  return true;
}

function readingDoneAllIn(day) {
  const r = day.reading || {};
  return (r.pages || 0) >= 10 || (r.minutes || 0) >= 15;
}

function readingDoneAdaptive(day) {
  const r = day.reading || {};
  return (r.pages || 0) > 0 || (r.minutes || 0) >= 10;
}

function waterDone(day, targetMl) {
  return (day.waterMl || 0) >= targetMl;
}

function checkinDone(day) {
  const c = day.checkin || {};
  return c.energy != null && c.mood != null;
}

export function isWorkoutDay(state, key) {
  const ad = state.adaptive || {};
  const perWeek = ad.workoutDaysPerWeek || 4;
  const restWeekly = ad.weeklyRestDay !== false;
  const start = parseDateKey(state.startDate);
  const d = parseDateKey(key);
  const dayOfWeek = d.getDay();
  if (restWeekly && dayOfWeek === 0) return false;
  const weekIndex = Math.floor(daysBetweenKeys(state.startDate, key) / 7);
  const pattern = workoutPattern(perWeek);
  const slot = daysBetweenKeys(state.startDate, key) % 7;
  return pattern[slot % 7];
}

function daysBetweenKeys(a, b) {
  return Math.round((parseDateKey(b) - parseDateKey(a)) / 86400000);
}

function workoutPattern(perWeek) {
  const patterns = {
    3: [true, false, true, false, true, false, false],
    4: [true, false, true, false, true, false, true],
    5: [true, true, false, true, true, false, true],
    6: [true, true, true, false, true, true, true],
    7: [true, true, true, true, true, true, true],
  };
  return patterns[perWeek] || patterns[4];
}

function movementDoneAdaptive(state, day, key) {
  const targetMin = state.adaptive?.workoutMinutes || 30;
  if (!isWorkoutDay(state, key)) {
    const rec = day.recovery || {};
    return !!rec.done;
  }
  const list = day.workouts || [];
  const total = list.reduce((s, w) => s + (w.minutes || 0), 0);
  return total >= targetMin;
}

export function taskCompletion(state, key, taskId) {
  const day = state.days?.[key] || {};
  const target = defaultWaterTarget(state);
  const manual = day.tasks || {};

  if (state.mode === "all-in") {
    switch (taskId) {
      case "workouts":
        return workoutsMeetAllIn(day) || !!manual.workouts;
      case "nutrition":
        return !!manual.nutrition;
      case "alcohol":
        return !!manual.alcohol;
      case "water":
        return waterDone(day, target) || !!manual.water;
      case "reading":
        return readingDoneAllIn(day) || !!manual.reading;
      case "photo":
        return !!day.photoThumbId || !!manual.photo;
      case "sleep":
        return !!manual.sleep;
      default:
        return false;
    }
  }

  switch (taskId) {
    case "movement":
      return movementDoneAdaptive(state, day, key) || !!manual.movement;
    case "nutrition":
      return !!manual.nutrition;
    case "alcohol":
      return manual.alcohol !== undefined ? !!manual.alcohol : (day.alcoholDrinks || 0) === 0;
    case "water":
      return waterDone(day, target) || !!manual.water;
    case "reading":
      return readingDoneAdaptive(day) || !!manual.reading;
    case "checkin":
      return checkinDone(day) || !!manual.checkin;
    default:
      return false;
  }
}

export function dayFullyComplete(state, key) {
  const tasks = taskListForMode(state.mode);
  return tasks.every((t) => taskCompletion(state, key, t.id));
}

export function dayCompletionRatio(state, key) {
  const tasks = taskListForMode(state.mode);
  if (!tasks.length) return 0;
  const done = tasks.filter((t) => taskCompletion(state, key, t.id)).length;
  return done / tasks.length;
}

export function weekConsistency(state, endKey) {
  const end = parseDateKey(endKey);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  let total = 0;
  let done = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = dateKey(d);
    if (k < state.startDate) continue;
    const tasks = taskListForMode(state.mode);
    for (const t of tasks) {
      total++;
      if (taskCompletion(state, k, t.id)) done++;
    }
  }
  return total ? Math.round((done / total) * 100) : 0;
}

export function currentStreak(state, throughKey) {
  let streak = 0;
  let k = throughKey;
  while (k >= state.startDate) {
    if (!dayFullyComplete(state, k)) break;
    streak++;
    k = addDays(k, -1);
  }
  return streak;
}
