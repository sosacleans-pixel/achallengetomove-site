import { generateStrengthWorkouts, defaultStrengthDays } from "./strength.js";

const STORAGE_KEY = "doing-a-5k-v2";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));

    const legacy = localStorage.getItem("doing-a-5k-v1");
    if (legacy) {
      const parsed = migrate(JSON.parse(legacy));
      saveState(parsed);
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function migrate(state) {
  if (!state?.meta) return state;
  if (!state.strengthWorkouts?.length) {
    const weeks = state.meta.weeks;
    const spd = state.meta.strengthDaysPerWeek ?? 1;
    const runDays = state.meta.preferredDays || [];
    const strengthDays =
      state.meta.strengthPreferredDays?.length
        ? state.meta.strengthPreferredDays
        : defaultStrengthDays(runDays, spd);
    state.meta.strengthDaysPerWeek = spd;
    state.meta.strengthPreferredDays = strengthDays.slice(0, spd);
    state.strengthWorkouts = generateStrengthWorkouts({
      weeks,
      strengthDaysPerWeek: state.meta.strengthDaysPerWeek,
      strengthPreferredDays: state.meta.strengthPreferredDays,
    });
  }
  if (!state.strengthCompleted) state.strengthCompleted = [];
  for (const w of state.workouts || []) {
    if (!w.kind) w.kind = "run";
  }
  return state;
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem("doing-a-5k-v1");
}

export function exportState() {
  const state = loadState();
  return JSON.stringify(state ?? {}, null, 2);
}

export function getSettings(state) {
  return state?.settings ?? { voice: true };
}

export function updateSettings(state, patch) {
  return {
    ...state,
    settings: { ...getSettings(state), ...patch },
  };
}

export function markWorkoutComplete(state, workoutId, entry) {
  const completed = [...(state.completed || [])];
  const existing = completed.findIndex((c) => c.workoutId === workoutId);
  const record = {
    workoutId,
    completedAt: new Date().toISOString(),
    notes: entry.notes || "",
    feel: entry.feel || "ok",
  };
  if (existing >= 0) completed[existing] = record;
  else completed.push(record);
  return { ...state, completed };
}

export function markStrengthComplete(state, workoutId, entry = {}) {
  const completed = [...(state.strengthCompleted || [])];
  const existing = completed.findIndex((c) => c.workoutId === workoutId);
  const record = {
    workoutId,
    completedAt: new Date().toISOString(),
    notes: entry.notes || "",
    feel: entry.feel || "ok",
  };
  if (existing >= 0) completed[existing] = record;
  else completed.push(record);
  return { ...state, strengthCompleted: completed };
}

export function isWorkoutComplete(state, workoutId) {
  return (state.completed || []).some((c) => c.workoutId === workoutId);
}

export function isStrengthComplete(state, workoutId) {
  return (state.strengthCompleted || []).some((c) => c.workoutId === workoutId);
}

export function repeatWeek(state, weekIndex) {
  const weekWorkouts = state.workouts.filter((w) => w.weekIndex === weekIndex);
  const ids = new Set(weekWorkouts.map((w) => w.id));
  return {
    ...state,
    completed: (state.completed || []).filter((c) => !ids.has(c.workoutId)),
    repeatWeekBanner: weekIndex,
  };
}

export function nextWorkout(state) {
  const done = new Set((state.completed || []).map((c) => c.workoutId));
  const ordered = [...state.workouts].sort((a, b) => a.sessionIndex - b.sessionIndex);
  return ordered.find((w) => !done.has(w.id)) ?? null;
}

export function strengthForWeek(state, weekIndex) {
  return (state.strengthWorkouts || [])
    .filter((w) => w.weekIndex === weekIndex)
    .sort((a, b) => a.strengthSlot - b.strengthSlot);
}

export function stats(state) {
  const completed = state.completed || [];
  const strengthDone = state.strengthCompleted || [];
  const ordered = [...state.workouts].sort((a, b) => a.sessionIndex - b.sessionIndex);
  const doneSet = new Set(completed.map((c) => c.workoutId));
  let totalMinutes = 0;
  for (const w of ordered) {
    if (!doneSet.has(w.id)) continue;
    totalMinutes += Math.round(w.steps.reduce((a, s) => a + s.durationSeconds, 0) / 60);
  }
  let strengthMinutes = 0;
  for (const c of strengthDone) {
    strengthMinutes += 18;
  }

  const allActivityDates = [
    ...completed.map((c) => c.completedAt.slice(0, 10)),
    ...strengthDone.map((c) => c.completedAt.slice(0, 10)),
  ].sort();
  let streak = 0;
  if (allActivityDates.length) {
    const today = new Date().toISOString().slice(0, 10);
    let cursor = today;
    const set = new Set(allActivityDates);
    while (set.has(cursor)) {
      streak++;
      const d = new Date(cursor);
      d.setDate(d.getDate() - 1);
      cursor = d.toISOString().slice(0, 10);
    }
  }

  const allDone = ordered.every((w) => doneSet.has(w.id));
  return {
    workoutsDone: completed.length,
    strengthDone: strengthDone.length,
    totalStrength: (state.strengthWorkouts || []).length,
    totalMinutes,
    strengthMinutes,
    streak,
    allDone,
    totalWorkouts: ordered.length,
  };
}
