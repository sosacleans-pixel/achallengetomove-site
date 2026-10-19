/**
 * 5K to Half Marathon: on-device storage (localStorage only; nothing leaves the device).
 */

const STORAGE_KEY = "5k-to-half-marathon-v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function migrate(state) {
  if (!state?.meta) return null;
  if (!state.settings) state.settings = { voice: true, units: state.meta.units || "mi" };
  if (!state.completed) state.completed = [];
  if (!state.strengthCompleted) state.strengthCompleted = [];
  return state;
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportState() {
  return JSON.stringify(loadState() ?? {}, null, 2);
}

export function getSettings(state) {
  return { voice: true, units: "mi", ...(state?.settings ?? {}) };
}

export function updateSettings(state, patch) {
  const settings = { ...getSettings(state), ...patch };
  return { ...state, settings, meta: { ...state.meta, units: settings.units ?? state.meta.units } };
}

function upsert(list, workoutId, entry) {
  const out = [...(list || [])];
  const record = { workoutId, completedAt: new Date().toISOString(), notes: entry.notes || "", feel: entry.feel || "ok" };
  const i = out.findIndex((c) => c.workoutId === workoutId);
  if (i >= 0) out[i] = record;
  else out.push(record);
  return out;
}

export function markWorkoutComplete(state, workoutId, entry = {}) {
  return { ...state, completed: upsert(state.completed, workoutId, entry) };
}

export function markStrengthComplete(state, workoutId, entry = {}) {
  return { ...state, strengthCompleted: upsert(state.strengthCompleted, workoutId, entry) };
}

export function unmarkWorkout(state, workoutId) {
  return { ...state, completed: (state.completed || []).filter((c) => c.workoutId !== workoutId) };
}

export function unmarkStrength(state, workoutId) {
  return { ...state, strengthCompleted: (state.strengthCompleted || []).filter((c) => c.workoutId !== workoutId) };
}

export function isWorkoutComplete(state, workoutId) {
  return (state.completed || []).some((c) => c.workoutId === workoutId);
}

export function isStrengthComplete(state, workoutId) {
  return (state.strengthCompleted || []).some((c) => c.workoutId === workoutId);
}

export function repeatWeek(state, weekIndex) {
  const ids = new Set(state.workouts.filter((w) => w.weekIndex === weekIndex).map((w) => w.id));
  return { ...state, completed: (state.completed || []).filter((c) => !ids.has(c.workoutId)), repeatWeekBanner: weekIndex };
}

export function nextWorkout(state) {
  const done = new Set((state.completed || []).map((c) => c.workoutId));
  return [...state.workouts].sort((a, b) => a.sessionIndex - b.sessionIndex).find((w) => !done.has(w.id)) ?? null;
}

export function strengthForWeek(state, weekIndex) {
  return (state.strengthWorkouts || []).filter((w) => w.weekIndex === weekIndex).sort((a, b) => a.strengthSlot - b.strengthSlot);
}

export function stats(state) {
  const completed = state.completed || [];
  const strengthDone = state.strengthCompleted || [];
  const ordered = [...state.workouts].sort((a, b) => a.sessionIndex - b.sessionIndex);
  const doneSet = new Set(completed.map((c) => c.workoutId));
  let totalMinutes = 0;
  for (const w of ordered) {
    if (doneSet.has(w.id)) totalMinutes += Math.round(w.steps.reduce((a, s) => a + s.durationSeconds, 0) / 60);
  }
  const dates = new Set([...completed, ...strengthDone].map((c) => c.completedAt.slice(0, 10)));
  let streak = 0;
  const d = new Date();
  while (dates.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return {
    workoutsDone: completed.length,
    strengthDone: strengthDone.length,
    totalStrength: (state.strengthWorkouts || []).length,
    totalMinutes,
    strengthMinutes: strengthDone.length * 25,
    streak,
    allDone: ordered.every((w) => doneSet.has(w.id)),
    totalWorkouts: ordered.length,
  };
}
