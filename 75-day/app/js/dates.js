const GRACE_HOUR = 10;

export function getClockNow() {
  if (typeof window !== "undefined" && window.__75_MOCK_NOW) {
    return new Date(window.__75_MOCK_NOW);
  }
  return new Date();
}

export function dateKey(d = getClockNow()) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Calendar day the user is actively working on (grace until 10 AM). */
export function activeWorkDate(now = getClockNow()) {
  const today = dateKey(now);
  if (now.getHours() < GRACE_HOUR) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return dateKey(y);
  }
  return today;
}

/** Whether a given date key can still be edited. */
export function isDateEditable(key, now = getClockNow()) {
  const active = activeWorkDate(now);
  if (key === active) return true;
  const next = addDays(key, 1);
  const lockAt = parseDateKey(next);
  lockAt.setHours(GRACE_HOUR, 0, 0, 0);
  return now < lockAt;
}

export function daysBetween(startKey, endKey) {
  const a = parseDateKey(startKey);
  const b = parseDateKey(endKey);
  return Math.round((b - a) / 86400000);
}

export function programDayNumber(startKey, workKey) {
  if (!startKey || !workKey || workKey < startKey) return 0;
  const diff = daysBetween(startKey, workKey);
  return Math.max(1, Math.min(75, diff + 1));
}

/** Dates from start through workKey inclusive that should be evaluated for lock. */
export function datesToEvaluate(state, now = getClockNow()) {
  if (!state?.startDate) return [];
  const active = activeWorkDate(now);
  const keys = [];
  let k = state.startDate;
  while (k <= active) {
    keys.push(k);
    if (k === active) break;
    k = addDays(k, 1);
  }
  return keys;
}

export function formatShortDate(key) {
  const d = parseDateKey(key);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
