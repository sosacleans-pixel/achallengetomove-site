/**
 * 5K to Half Marathon: day and date helpers (same logic as the Doing a 5K app's plan.js and strength.js).
 */

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function defaultStrengthDays(runDays, count) {
  const run = new Set(runDays);
  const anchor = runDays.length ? Math.min(...runDays) : 0;
  const candidates = [];
  for (let i = 1; i <= 7; i++) {
    const d = (anchor + i) % 7;
    if (!run.has(d)) candidates.push(d);
  }
  if (candidates.length < count) {
    for (let d = 0; d < 7 && candidates.length < count; d++) {
      if (!run.has(d) && !candidates.includes(d)) candidates.push(d);
    }
  }
  return candidates.slice(0, count);
}

export function strengthDaysValid(runDays, strengthDays) {
  const run = new Set(runDays);
  return strengthDays.every((d) => !run.has(d));
}

function parseDateOnly(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function nextDayOnOrAfter(from, weekday) {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d;
}

export function scheduledDateForWorkout(startDateISO, workout, allWorkouts) {
  const start = parseDateOnly(startDateISO);
  const ordered = [...allWorkouts].sort((a, b) => a.sessionIndex - b.sessionIndex);
  const idx = ordered.findIndex((w) => w.id === workout.id);
  if (idx < 0) return start;
  // Day 1 is the first chosen run day on or after the start date.
  let cursor = new Date(start);
  while (cursor.getDay() !== ordered[0].weekday) cursor.setDate(cursor.getDate() + 1);
  for (let i = 1; i <= idx; i++) cursor = nextDayOnOrAfter(cursor, ordered[i].weekday);
  return cursor;
}

export function formatDate(d, lang = "en") {
  return d.toLocaleDateString(lang === "es" ? "es" : "en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function workoutTotalSeconds(workout) {
  return workout.steps.reduce((a, s) => a + (s.durationSeconds || 0), 0);
}
