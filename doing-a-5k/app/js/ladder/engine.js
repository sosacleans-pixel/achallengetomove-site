/* Doing a 5K ladder: shared Follow-Up Engine (in-app, offline, preview build).
 * Pure functions over the ladder state. The slot pointer (progress) is stored separately
 * from the activity log, so repeats, repairs and bonus sessions keep the streak alive
 * but never move the pointer or count toward the 30. */
import { todayISO, addDays, daysBetween, weekday } from "./dates.js";

export const STORAGE_KEY = "doing-a-5k-ladder-v1";
export const LEVEL_IDS = ["walk-to-run-30", "5k-30", "faster-5k-30"];
export const CONFIG = {
  app_id: "doing-a-5k",
  focus: "walk / run",
  ladder: LEVEL_IDS,
  workout_days_required: 30,
  access_window_days: 90,
  window_warnings_days: [60, 75, 85],
  max_one_workout_day_per_calendar_day: true,
  streak_saves: { earn_every: 7, bank_max: 3 },
  repair: { window_hours: 48, max_per_7_days: 1 },
  reminder_stop_after_inactive_days: 7,
  restart_offer_days: 30,
  restart_reminder_day: 25,
  milestones: [3, 7, 14, 21, 30],
  days_per_week_options: [3, 4, 5],
};

export const DEFAULT_TRAIN_DAYS = { 3: [1, 3, 5], 4: [1, 2, 4, 6], 5: [1, 2, 3, 5, 6] };

export function emptyState() {
  return {
    version: 1,
    placement: null,
    settings: null,
    levels: {},
    log: [],
    flags: {},
    activeLevel: null,
    restWeek: null,
    previewOffsetDays: 0,
  };
}

export function loadLadder() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...emptyState(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export function saveLadder(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function resetLadder() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ---------- purchases and runs (a run = one 90-day window) ---------- */

export function levelState(s, levelId) {
  return s.levels[levelId] || null;
}

export function currentRun(s, levelId) {
  const ls = levelState(s, levelId);
  return ls?.runs?.length ? ls.runs[ls.runs.length - 1] : null;
}

/* kind: "new" | "restart" | "repeat". startFrom: "resume" | "start" (restart only). */
export function grantPurchase(s, { levelId, kind, price, startFrom = "resume", mode = "preview", today = todayISO() }) {
  const ls = s.levels[levelId] ? { ...s.levels[levelId], runs: [...s.levels[levelId].runs] } : { runs: [], checkins: {} };
  const prev = ls.runs[ls.runs.length - 1];
  let pointer = 0;
  if (kind === "restart" && prev && startFrom === "resume") pointer = prev.pointer;
  const run = {
    runId: `${levelId}-${ls.runs.length + 1}`,
    kind,
    price,
    mode,
    purchasedAt: today,
    windowStart: today,
    windowEnd: addDays(today, CONFIG.access_window_days - 1),
    pointer,
    startedFrom: pointer,
    finishedAt: null,
    receipt: {
      level: levelId,
      amount: price,
      accessEnds: addDays(today, CONFIG.access_window_days - 1),
      autoRenew: false,
    },
  };
  ls.runs.push(run);
  return {
    ...s,
    levels: { ...s.levels, [levelId]: ls },
    activeLevel: levelId,
    restWeek: null,
    flags: { ...s.flags, [`cantFinish:${run.runId}`]: false },
  };
}

/* Window status for the current run of a level. */
export function windowStatus(s, levelId, today = todayISO()) {
  const run = currentRun(s, levelId);
  if (!run) return { status: "none" };
  const day = daysBetween(run.windowStart, today) + 1;
  const daysLeft = Math.max(0, CONFIG.access_window_days - day + 1);
  if (run.pointer >= CONFIG.workout_days_required) {
    return { status: "finished", run, day, daysLeft };
  }
  if (day > CONFIG.access_window_days) {
    const daysSinceExpiry = daysBetween(run.windowEnd, today); // 1 on the first expired day
    const offerDay = daysSinceExpiry; // day 1..30 of the restart offer
    const restartOpen = offerDay >= 1 && offerDay <= CONFIG.restart_offer_days;
    return { status: "expired", run, day, daysLeft: 0, offerDay, restartOpen };
  }
  return { status: "active", run, day, daysLeft };
}

/* ---------- log ---------- */
/* entry: { date, levelId, runId, slot, kind: "slot"|"repeat"|"repair"|"manual", q, seconds, fiveK, partial } */
export function addLog(s, entry) {
  return { ...s, log: [...s.log, { at: new Date().toISOString(), ...entry }] };
}

export function slotDoneToday(s, levelId, today = todayISO()) {
  return s.log.some((e) => e.levelId === levelId && e.date === today && (e.kind === "slot" || e.kind === "manual"));
}

/* Complete the next new slot. Moves the pointer by exactly one. */
export function completeSlot(s, levelId, entry, today = todayISO()) {
  const ws = windowStatus(s, levelId, today);
  if (ws.status !== "active") return { state: s, ok: false, reason: ws.status };
  if (slotDoneToday(s, levelId, today)) return { state: s, ok: false, reason: "one-per-day" };
  const run = ws.run;
  const slot = run.pointer + 1;
  let next = addLog(s, { ...entry, date: today, levelId, runId: run.runId, slot, kind: entry.kind || "slot" });
  const ls = next.levels[levelId];
  const runs = ls.runs.map((r) => (r.runId === run.runId ? { ...r, pointer: slot, finishedAt: slot >= 30 ? today : null } : r));
  next = { ...next, levels: { ...next.levels, [levelId]: { ...ls, runs } } };
  return { state: next, ok: true, slot };
}

export function logRepeat(s, levelId, slot, entry = {}, today = todayISO()) {
  const run = currentRun(s, levelId);
  return addLog(s, { ...entry, date: today, levelId, runId: run?.runId, slot, kind: "repeat" });
}

export function saveCheckin(s, levelId, which, data) {
  const ls = s.levels[levelId];
  const run = currentRun(s, levelId);
  const checkins = { ...(ls.checkins || {}) };
  checkins[`${run.runId}:${which}`] = { ...data, date: todayISO() };
  return { ...s, levels: { ...s.levels, [levelId]: { ...ls, checkins } } };
}

export function getCheckin(s, levelId, which) {
  const ls = s.levels[levelId];
  const run = currentRun(s, levelId);
  return ls?.checkins?.[`${run?.runId}:${which}`] || null;
}

/* ---------- streak, saves, repair (Conventions §6, design §2.2) ---------- */

function trainDays(s) {
  return s.settings?.trainDays || DEFAULT_TRAIN_DAYS[s.settings?.daysPerWeek || 3];
}

export function isTrainingDay(s, dateISO) {
  return trainDays(s).includes(weekday(dateISO));
}

export function computeStreak(s, today = todayISO()) {
  const active = new Set(s.log.filter((e) => e.kind !== "repair").map((e) => e.date));
  const repairs = s.log.filter((e) => e.kind === "repair");
  const repairFor = new Map(repairs.map((r) => [r.repairFor, r.date]));
  const dates = s.log.map((e) => e.date).sort();
  const out = {
    current: 0, longest: 0, savesBanked: 0, savesUsed: 0, repairsUsed: 0,
    brokenOn: null, prevStreak: 0, events: [], milestones: [], lastActive: null, savedYesterday: false,
  };
  if (!dates.length) return out;
  let streak = 0;
  let sinceSaveEarn = 0;
  let lastRepairDate = null;
  for (let d = dates[0]; d <= today; d = addDays(d, 1)) {
    if (active.has(d)) {
      streak++;
      sinceSaveEarn++;
      out.lastActive = d;
      if (sinceSaveEarn >= CONFIG.streak_saves.earn_every) {
        sinceSaveEarn = 0;
        if (out.savesBanked < CONFIG.streak_saves.bank_max) {
          out.savesBanked++;
          out.events.push({ date: d, type: "streak_save_earned" });
        }
      }
      if (CONFIG.milestones.includes(streak)) out.milestones.push({ date: d, days: streak });
      out.longest = Math.max(out.longest, streak);
      continue;
    }
    if (d === today) continue; // today is still open
    if (!isTrainingDay(s, d)) continue; // rest day: neutral
    // missed training day
    if (out.savesBanked > 0) {
      out.savesBanked--;
      out.savesUsed++;
      out.events.push({ date: d, type: "streak_save_used" });
      if (d === addDays(today, -1)) out.savedYesterday = true;
      continue;
    }
    const rDate = repairFor.get(d);
    const repairAllowed = rDate && (!lastRepairDate || daysBetween(lastRepairDate, rDate) >= 7);
    if (repairAllowed && daysBetween(d, rDate) <= 2) {
      lastRepairDate = rDate;
      out.repairsUsed++;
      out.events.push({ date: d, type: "repair_completed" });
      continue;
    }
    if (streak > 0) {
      out.prevStreak = streak;
      out.brokenOn = d;
      out.events.push({ date: d, type: "streak_broken" });
    }
    streak = 0;
    sinceSaveEarn = 0;
  }
  out.current = streak;
  out.lastRepairDate = lastRepairDate;
  return out;
}

/* Repair offer: within 48 hours of a broken day, max 1 per rolling 7 days. */
export function repairOffer(s, today = todayISO()) {
  const st = computeStreak(s, today);
  if (!st.brokenOn || st.prevStreak < 1) return null;
  if (daysBetween(st.brokenOn, today) > 2) return null;
  if (s.log.some((e) => e.kind === "repair" && e.repairFor === st.brokenOn)) return null;
  if (st.lastRepairDate && daysBetween(st.lastRepairDate, today) < 7) return null;
  if (st.current > 0 && s.log.some((e) => e.date > st.brokenOn && e.kind !== "repair")) {
    // they already started a new streak after the break; repair still restores the old one
  }
  return { brokenOn: st.brokenOn, prevStreak: st.prevStreak };
}

export function inactiveDays(s, today = todayISO()) {
  const st = computeStreak(s, today);
  if (!st.lastActive) return 0;
  return daysBetween(st.lastActive, today);
}

/* ---------- window warnings, can't-finish, restart offers, reminders ---------- */

export function cantFinish(s, levelId, today = todayISO()) {
  const ws = windowStatus(s, levelId, today);
  if (ws.status !== "active") return false;
  const left = CONFIG.workout_days_required - ws.run.pointer;
  const daysAvail = ws.daysLeft - (slotDoneToday(s, levelId, today) ? 1 : 0);
  return left > daysAvail;
}

export function windowWarning(s, levelId, today = todayISO()) {
  const ws = windowStatus(s, levelId, today);
  if (ws.status !== "active") return null;
  const hits = CONFIG.window_warnings_days.filter((d) => ws.day >= d);
  return hits.length ? hits[hits.length - 1] : null;
}

/* Copy pack (Coach Fit §7 reminders; reminder 6 replaced by Attorney §4.8, no offers in transactional messages). */
export const LEVEL_NAMES = { "walk-to-run-30": "Walk-to-Run 30", "5k-30": "5K 30", "faster-5k-30": "Faster 5K 30" };

export function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

export const REMINDERS = {
  streak: "🔥 {streak}-day streak, {name}! Today's session is {minutes} minutes. Lace up and keep that energy going.",
  save_used: "Life got busy? Your streak save has you covered. Your {streak}-day streak is safe. One easy session today keeps it rolling.",
  window_60: "You're at session {n} of 30 with 30 days left in your {level} challenge. Steady sessions get you there.",
  window_75: "{days_left} days left, session {n} of 30. A few sessions a week gets you to the finish. Today's is {minutes} minutes.",
  window_85: "5 days left in your {level} window. Every session you log counts. Let's go.",
  cant_finish: "Heads up: there aren't enough days left to reach session 30 in this window. Keep moving while it's open. Your progress and badges stay visible if the window closes.",
  restart_day0: "Your {level} window closed at session {n} of 30. Your progress and badges stay. Want a fresh 90 days? Restart {level} for $2.99 and pick up right where you left off.",
  restart_day25: "Last few days to restart {level} for $2.99. Your legs remember more than you think.",
  paused: "Looks like these reminders aren't helping right now, so we'll pause them. Your plan is ready whenever you are. Welcome back anytime.",
};

/* Which ONE reminder would go out today (max 1 a day across channels). Returns { id, text, transactional, offer }.
 * offer = true messages (restart) go in-app always, by email only with the marketing opt-in. */
export function pickReminder(s, levelId, { minutes = 30, today = todayISO() } = {}) {
  if (!levelId || !currentRun(s, levelId)) return null;
  const ws = windowStatus(s, levelId, today);
  const level = LEVEL_NAMES[levelId];
  const st = computeStreak(s, today);
  const name = s.settings?.name || "friend";
  const n = ws.run.pointer;
  const v = { level, n, streak: st.current, name, minutes, days_left: ws.daysLeft };
  const doneToday = s.log.some((e) => e.date === today);
  const inactive = inactiveDays(s, today);
  const paused = inactive >= CONFIG.reminder_stop_after_inactive_days;

  if (ws.status === "expired") {
    if (ws.offerDay === 1) return { id: "restart_day0", text: fill(REMINDERS.restart_day0, v), offer: true };
    if (ws.offerDay === CONFIG.restart_reminder_day) return { id: "restart_day25", text: fill(REMINDERS.restart_day25, v), offer: true };
    return null;
  }
  if (ws.status !== "active") return null;
  // Window warnings send even when daily reminders are paused (transactional, no offer).
  for (const d of [85, 75, 60]) {
    if (ws.day === d) return { id: `window_${d}`, text: fill(REMINDERS[`window_${d}`], v), transactional: true };
  }
  if (cantFinish(s, levelId, today) && !s.flags?.[`cantFinishSent:${ws.run.runId}`]) {
    return { id: "cant_finish", text: REMINDERS.cant_finish, transactional: true, once: `cantFinishSent:${ws.run.runId}` };
  }
  if (paused) {
    if (inactive === CONFIG.reminder_stop_after_inactive_days) return { id: "paused", text: REMINDERS.paused };
    return null;
  }
  if (doneToday) return null;
  if (st.savedYesterday) return { id: "save_used", text: fill(REMINDERS.save_used, v) };
  return { id: "streak", text: fill(REMINDERS.streak, v) };
}

/* ---------- badges + recap ---------- */
export function badges(s, levelId) {
  const out = [];
  const run = currentRun(s, levelId);
  if (!run) return out;
  if (run.pointer >= 1) out.push("First Step");
  if (run.pointer >= 15) out.push("Halfway");
  if (run.pointer >= 30) out.push(`${LEVEL_NAMES[levelId]} Finisher`);
  const st = computeStreak(s);
  if (st.longest >= 7) out.push("Week Strong");
  if (st.repairsUsed > 0) out.push("Comeback");
  return out;
}

export function recap(s, levelId, levels) {
  const run = currentRun(s, levelId);
  const lvl = levels[levelId];
  const entries = s.log.filter((e) => e.runId === run.runId);
  const slotEntries = entries.filter((e) => e.kind === "slot" || e.kind === "manual");
  const first = slotEntries[0]?.date;
  const last = slotEntries[slotEntries.length - 1]?.date;
  const minutes = entries.reduce((a, e) => a + Math.round((e.seconds || 0) / 60), 0);
  const counts = {};
  entries.forEach((e) => { counts[e.slot] = (counts[e.slot] || 0) + 1; });
  const fav = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const st = computeStreak(s);
  return {
    sessions: run.pointer,
    calendarDays: first && last ? daysBetween(first, last) + 1 : 0,
    longestStreak: st.longest,
    totalMinutes: minutes,
    savesUsed: st.savesUsed,
    favorite: fav ? lvl.slots[Number(fav[0]) - 1]?.title + ` (session ${fav[0]})` : "",
    day1: getCheckin(s, levelId, "day1"),
    day30: getCheckin(s, levelId, "day30"),
  };
}
