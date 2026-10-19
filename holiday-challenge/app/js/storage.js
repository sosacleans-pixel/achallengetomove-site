import { CONFIG } from "./config.js";
import { dateKey, now } from "./dates.js";

export function defaultState() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    setupDone: false,
    // Rolling start: Day 1 = startDate, the local date setup was finished (see config.js). Set once per round.
    startDate: null,
    joinedDate: null, // same as startDate (kept for older saved data and exports)
    history: [], // earlier rounds (a new round starts with Day 1 = that day; past results are kept here)
    setup: { age: false, readiness: [], gentleAck: false, terms: false, termsAt: null },
    level: "b",
    equipment: "none",
    busyDays: [],
    reminderTime: "07:00",
    unbrokenOptIn: false,
    days: {},
    makeup: [],
    tests: {},
    levelLog: [],
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return migrate({ ...defaultState(), ...s });
  } catch (e) {
    return null;
  }
}

/** Saved data from the earlier fixed-calendar preview ("live" mode, Day 1 = Nov 25): keep it, and use its own
 *  date as Day 1 so the user keeps their days. Everyone now runs on their own start date. */
export function migrate(s) {
  if (s.setupDone && !s.startDate) s.startDate = s.joinedDate || dateKey(now());
  if (s.setupDone && !s.joinedDate) s.joinedDate = s.startDate;
  delete s.mode;
  return s;
}

export function saveState(s) {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(s));
  } catch (e) { /* quota or private mode */ }
}

export function clearState() {
  try { localStorage.removeItem(CONFIG.storageKey); } catch (e) { /* ignore */ }
}

export function todayKey() {
  return dateKey(now());
}
