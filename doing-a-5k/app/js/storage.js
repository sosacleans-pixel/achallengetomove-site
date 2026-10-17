const STORAGE_KEY = "doing-a-5k-v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
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

export function isWorkoutComplete(state, workoutId) {
  return (state.completed || []).some((c) => c.workoutId === workoutId);
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

export function stats(state) {
  const completed = state.completed || [];
  const ordered = [...state.workouts].sort((a, b) => a.sessionIndex - b.sessionIndex);
  const doneSet = new Set(completed.map((c) => c.workoutId));
  let totalMinutes = 0;
  for (const w of ordered) {
    if (!doneSet.has(w.id)) continue;
    totalMinutes += Math.round(w.steps.reduce((a, s) => a + s.durationSeconds, 0) / 60);
  }

  const dates = completed
    .map((c) => c.completedAt.slice(0, 10))
    .sort();
  let streak = 0;
  if (dates.length) {
    const today = new Date().toISOString().slice(0, 10);
    let cursor = today;
    const set = new Set(dates);
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
    totalMinutes,
    streak,
    allDone,
    totalWorkouts: ordered.length,
  };
}
