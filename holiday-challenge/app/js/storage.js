import { CONFIG } from "./config.js";
import { dateKey, now } from "./dates.js";

export function defaultState() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    setupDone: false,
    joinedDate: null,
    mode: "live", // "live" (Nov 25 - Dec 24) or "self" (self-paced: Day 1 = startDate)
    startDate: null,
    history: [], // earlier runs (e.g. the live challenge before keeping going self-paced)
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
    return { ...defaultState(), ...s };
  } catch (e) {
    return null;
  }
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
