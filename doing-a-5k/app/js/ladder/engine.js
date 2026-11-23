/* Doing a 5K ladder: shared Follow-Up Engine (in-app, offline, preview build). Spec v5.
 * Each level is a 12-week program paced by 3, 4 or 5 days a week (36, 48 or 60 sessions), with a
 * 14-week (98-day) Access Period from the purchase date (gift: from redemption).
 * The session pointer (progress) is stored apart from the activity log, so repeats, repairs and
 * bonus sessions keep the streak alive but never move the pointer. */
import { todayISO, addDays, daysBetween, weekday } from "./dates.js";

export const STORAGE_KEY = "doing-a-5k-ladder";
export const LEVEL_IDS = ["walk-to-run", "5k", "faster-5k"];
export const DISPLAY_NAMES = {
  "walk-to-run": "Doing a 5K: Walk-to-Run",
  "5k": "Doing a 5K: 5K",
  "faster-5k": "Doing a 5K: Faster 5K",
};

/* Defaults mirror data/ladder/index.json; loadIndex() overwrites them from the file. */
export const CONFIG = {
  app_id: "doing-a-5k",
  ladder: LEVEL_IDS,
  weeks: 12,
  access_days: 98,
  warnings_days_left: [28, 14, 5],
  restart_offer_days: 30,
  restart_reminder_day: 25,
  gift_code_years: 5,
  streak_saves: { earn_every: 7, bank_max: 3 },
  repair: { window_hours: 48, max_per_7_days: 1 },
  reminder_stop_after_inactive_days: 7,
  milestones: [3, 7, 14, 21, 30],
  days_per_week_options: [3, 4, 5],
};

export function applyIndex(index) {
  if (!index) return;
  CONFIG.access_days = index.accessDays ?? CONFIG.access_days;
  CONFIG.warnings_days_left = index.warningsDaysLeft ?? CONFIG.warnings_days_left;
  CONFIG.restart_offer_days = index.restart?.offerDaysAfterExpiry ?? CONFIG.restart_offer_days;
  CONFIG.gift_code_years = index.giftCodeRedeemableYears ?? CONFIG.gift_code_years;
  for (const f of index.files || []) if (f.id && f.displayName) DISPLAY_NAMES[f.id] = f.displayName;
}

export const DEFAULT_TRAIN_DAYS = { 3: [1, 3, 5], 4: [1, 2, 4, 6], 5: [1, 2, 3, 5, 6] };

export function emptyState() {
  return { version: 2, placement: null, settings: null, levels: {}, log: [], flags: {}, activeLevel: null, restWeek: null, previewOffsetDays: 0 };
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

export function dpw(s) {
  return s.settings?.daysPerWeek || 3;
}

export function totalSessions(s) {
  return CONFIG.weeks * dpw(s);
}

/* Week of a 1-based session number at the current days a week. */
export function weekOf(s, sessionNo) {
  return Math.ceil(sessionNo / dpw(s));
}

/* ---------- purchases and runs (a run = one 14-week Access Period) ---------- */

export function currentRun(s, levelId) {
  const ls = s.levels[levelId];
  return ls?.runs?.length ? ls.runs[ls.runs.length - 1] : null;
}

export function accessEnd(startISO) {
  return addDays(startISO, CONFIG.access_days - 1);
}

/* kind: "new" | "restart" | "repeat" | "gift". startFrom: "resume" | "start" (restart only). */
export function grantPurchase(s, { levelId, kind, price, startFrom = "resume", mode = "preview", today = todayISO(), giftCode = null }) {
  const prevLs = s.levels[levelId];
  const ls = prevLs ? { ...prevLs, runs: [...prevLs.runs] } : { runs: [], checkins: {} };
  const prev = ls.runs[ls.runs.length - 1];
  let pointer = 0;
  if (kind === "restart" && prev && startFrom === "resume") pointer = prev.pointer;
  const run = {
    runId: `${levelId}-${ls.runs.length + 1}`,
    kind,
    price,
    mode,
    giftCode,
    purchasedAt: today,
    windowStart: today,
    windowEnd: accessEnd(today),
    pointer,
    startedFrom: pointer,
    finishedAt: null,
  };
  ls.runs.push(run);
  return { ...s, levels: { ...s.levels, [levelId]: ls }, activeLevel: levelId, restWeek: null };
}

export function windowStatus(s, levelId, today = todayISO()) {
  const run = currentRun(s, levelId);
  if (!run) return { status: "none" };
  const day = daysBetween(run.windowStart, today) + 1;
  const daysLeft = Math.max(0, daysBetween(today, run.windowEnd) + 1); // includes today
  if (run.finishedAt || run.pointer >= totalSessions(s)) return { status: "finished", run, day, daysLeft };
  if (today > run.windowEnd) {
    const offerDay = daysBetween(run.windowEnd, today); // 1 on the first day after the window
    return { status: "expired", run, day, daysLeft: 0, offerDay, restartOpen: offerDay >= 1 && offerDay <= CONFIG.restart_offer_days };
  }
  return { status: "active", run, day, daysLeft };
}

/* ---------- days a week change (only at a week boundary) ---------- */
/* Switches to the matching file at the same week and starts at that week's session 1.
 * Mid-week, the change is stored and applied when the current week is complete. */
export function requestDaysPerWeek(s, newDpw, newTrainDays) {
  const levelId = s.activeLevel;
  const run = levelId ? currentRun(s, levelId) : null;
  const old = dpw(s);
  if (!run || newDpw === old) {
    return { ...s, settings: { ...s.settings, daysPerWeek: newDpw, trainDays: newTrainDays, pendingDpw: null } };
  }
  if (run.pointer % old === 0) return switchDpw(s, levelId, newDpw, newTrainDays);
  return { ...s, settings: { ...s.settings, pendingDpw: { daysPerWeek: newDpw, trainDays: newTrainDays } } };
}

function switchDpw(s, levelId, newDpw, newTrainDays) {
  const run = currentRun(s, levelId);
  const old = dpw(s);
  const weeksDone = Math.floor(run.pointer / old);
  const ls = s.levels[levelId];
  const runs = ls.runs.map((r) => (r.runId === run.runId ? { ...r, pointer: weeksDone * newDpw } : r));
  return {
    ...s,
    levels: { ...s.levels, [levelId]: { ...ls, runs } },
    settings: { ...s.settings, daysPerWeek: newDpw, trainDays: newTrainDays, pendingDpw: null },
  };
}

/* ---------- log ---------- */
/* entry: { date, levelId, runId, slot, kind: "slot"|"manual"|"repeat"|"repair", running, q, seconds, fiveK, partial } */
export function addLog(s, entry) {
  return { ...s, log: [...s.log, { at: new Date().toISOString(), ...entry }] };
}

export function slotDoneToday(s, levelId, today = todayISO()) {
  return s.log.some((e) => e.levelId === levelId && e.date === today && (e.kind === "slot" || e.kind === "manual"));
}

/* Complete the next new session. Moves the pointer by exactly one. */
export function completeSlot(s, levelId, entry, today = todayISO()) {
  const ws = windowStatus(s, levelId, today);
  if (ws.status !== "active") return { state: s, ok: false, reason: ws.status };
  if (slotDoneToday(s, levelId, today)) return { state: s, ok: false, reason: "one-per-day" };
  const run = ws.run;
  const slot = run.pointer + 1;
  const total = totalSessions(s);
  let next = addLog(s, { ...entry, date: today, levelId, runId: run.runId, slot, kind: entry.kind || "slot" });
  const ls = next.levels[levelId];
  const runs = ls.runs.map((r) => (r.runId === run.runId ? { ...r, pointer: slot, finishedAt: slot >= total ? today : null } : r));
  next = { ...next, levels: { ...next.levels, [levelId]: { ...ls, runs } } };
  const pend = next.settings?.pendingDpw;
  if (pend && slot < total && slot % dpw(next) === 0) next = switchDpw(next, levelId, pend.daysPerWeek, pend.trainDays);
  return { state: next, ok: true, slot, finished: slot >= total };
}

export function logRepeat(s, levelId, slot, entry = {}, today = todayISO()) {
  const run = currentRun(s, levelId);
  return addLog(s, { ...entry, date: today, levelId, runId: run?.runId, slot, kind: "repeat" });
}

/* which: "first" | "final" (first and last session of a level) */
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

/* Turning the CHD consent off stops storage and removes stored energy ratings from this device. */
export function setChdConsent(s, on) {
  const settings = { ...s.settings, chdConsent: !!on, chdConsentAt: on ? s.settings?.chdConsentAt || new Date().toISOString() : null };
  if (on) return { ...s, settings };
  const levels = {};
  for (const [id, ls] of Object.entries(s.levels)) {
    const checkins = {};
    for (const [k, v] of Object.entries(ls.checkins || {})) {
      const { energyBefore, energyAfter, ...rest } = v;
      checkins[k] = rest;
    }
    levels[id] = { ...ls, checkins };
  }
  return { ...s, settings, levels };
}

/* ---------- streak, saves, repair ---------- */

function trainDays(s) {
  return s.settings?.trainDays || DEFAULT_TRAIN_DAYS[dpw(s)];
}

export function isTrainingDay(s, dateISO) {
  return trainDays(s).includes(weekday(dateISO));
}

export function computeStreak(s, today = todayISO()) {
  const active = new Set(s.log.filter((e) => e.kind !== "repair").map((e) => e.date));
  const repairFor = new Map(s.log.filter((e) => e.kind === "repair").map((r) => [r.repairFor, r.date]));
  const dates = s.log.map((e) => e.date).sort();
  const out = { current: 0, longest: 0, savesBanked: 0, savesUsed: 0, repairsUsed: 0, brokenOn: null, prevStreak: 0, events: [], milestones: [], lastActive: null, savedYesterday: false, lastRepairDate: null };
  if (!dates.length) return out;
  let streak = 0;
  let sinceSaveEarn = 0;
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
    if (d === today || !isTrainingDay(s, d)) continue; // today still open; rest days neutral
    if (out.savesBanked > 0) {
      out.savesBanked--;
      out.savesUsed++;
      out.events.push({ date: d, type: "streak_save_used" });
      if (d === addDays(today, -1)) out.savedYesterday = true;
      continue;
    }
    const rDate = repairFor.get(d);
    const allowed = rDate && (!out.lastRepairDate || daysBetween(out.lastRepairDate, rDate) >= 7);
    if (allowed && daysBetween(d, rDate) <= 2) {
      out.lastRepairDate = rDate;
      out.repairsUsed++;
      out.events.push({ date: d, type: "repair_completed" });
      continue;
    }
    if (streak > 0) {
      out.prevStreak = streak;
      out.brokenOn = d;
    }
    streak = 0;
    sinceSaveEarn = 0;
  }
  out.current = streak;
  return out;
}

export function repairOffer(s, today = todayISO()) {
  const st = computeStreak(s, today);
  if (!st.brokenOn || st.prevStreak < 1) return null;
  if (daysBetween(st.brokenOn, today) > 2) return null;
  if (s.log.some((e) => e.kind === "repair" && e.repairFor === st.brokenOn)) return null;
  if (st.lastRepairDate && daysBetween(st.lastRepairDate, today) < 7) return null;
  return { brokenOn: st.brokenOn, prevStreak: st.prevStreak };
}

export function inactiveDays(s, today = todayISO()) {
  const st = computeStreak(s, today);
  return st.lastActive ? daysBetween(st.lastActive, today) : 0;
}

/* ---------- warnings, can't-finish, restart offers, reminders ---------- */

export function cantFinish(s, levelId, today = todayISO()) {
  const ws = windowStatus(s, levelId, today);
  if (ws.status !== "active") return false;
  const left = totalSessions(s) - ws.run.pointer;
  const daysAvail = ws.daysLeft - (slotDoneToday(s, levelId, today) ? 1 : 0);
  return left > daysAvail;
}

/* The latest warning threshold reached (28, 14 or 5 days left), from the actual end date. */
export function windowWarning(s, levelId, today = todayISO()) {
  const ws = windowStatus(s, levelId, today);
  if (ws.status !== "active") return null;
  const hits = CONFIG.warnings_days_left.filter((d) => ws.daysLeft <= d);
  return hits.length ? Math.min(...hits) : null;
}

export function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

/* Copy: Coach Fit §8 (streak, save, back on pace, pause) and the Attorney's §7.3 text, word for word
 * (warnings, can't-finish, restart offers). {level} is filled with the displayName. */
export const REMINDERS = {
  streak: "🔥 {streak}-day streak, {name}! Today's session is {minutes} minutes. Lace up and keep that energy going.",
  save_used: "Life got busy? Your streak save has you covered. Your {streak}-day streak is safe. One easy session today keeps it rolling.",
  back_on_pace: "Week {w}, session {n}. You're right on pace. Keep the rhythm going.",
  paused: "Looks like these reminders aren't helping right now, so we'll pause them. Your plan is ready whenever you are. Welcome back anytime.",
  warn_28: "You're on session {n} of your {level} program, with 4 weeks left in this access window. Steady sessions get you there.",
  warn_14: "2 weeks left in your {level} window, and you're on session {n}. A few sessions a week gets you to the finish. Today's is {minutes} minutes.",
  warn_5: "5 days left in your {level} window. Every session you log counts. Let's go.",
  cant_finish: "Heads up: there aren't enough days left to finish this level in this window. Keep moving while it's open. Your progress and badges stay visible if the window closes.",
  restart_day0: "Your {level} window closed at session {n}. Your progress and badges stay. Want a fresh 14-week window? Restart {level} for $2.99 and pick up right where you left off.",
  restart_day25: "Last few days to restart {level} for $2.99. Your legs remember more than you think.",
};

/* On pace = the scheduled finish (12 weeks from the window start) is still reachable at the user's days a week. */
export function onPace(s, levelId, today = todayISO()) {
  const run = currentRun(s, levelId);
  if (!run) return false;
  const weeksElapsed = Math.floor(daysBetween(run.windowStart, today) / 7);
  return run.pointer >= weeksElapsed * dpw(s);
}

/* Which ONE message would go out today (max 1 a day across channels). */
export function pickReminder(s, levelId, { minutes = 30, today = todayISO() } = {}) {
  if (!levelId || !currentRun(s, levelId)) return null;
  const ws = windowStatus(s, levelId, today);
  const st = computeStreak(s, today);
  const n = ws.run.pointer;
  const v = { level: DISPLAY_NAMES[levelId], n, streak: st.current, name: s.settings?.name || "friend", minutes, w: weekOf(s, n + 1) };
  if (ws.status === "expired") {
    if (ws.offerDay === 1) return { id: "restart_day0", text: fill(REMINDERS.restart_day0, v), offer: true };
    if (ws.offerDay === CONFIG.restart_reminder_day) return { id: "restart_day25", text: fill(REMINDERS.restart_day25, v), offer: true };
    return null;
  }
  if (ws.status !== "active") return null;
  for (const d of CONFIG.warnings_days_left) {
    if (ws.daysLeft === d) return { id: `warn_${d}`, text: fill(REMINDERS[`warn_${d}`], v), transactional: true };
  }
  if (cantFinish(s, levelId, today) && !s.flags?.[`cantFinishSent:${ws.run.runId}`]) {
    return { id: "cant_finish", text: REMINDERS.cant_finish, transactional: true, once: `cantFinishSent:${ws.run.runId}` };
  }
  const inactive = inactiveDays(s, today);
  if (inactive >= CONFIG.reminder_stop_after_inactive_days) {
    return inactive === CONFIG.reminder_stop_after_inactive_days ? { id: "paused", text: REMINDERS.paused } : null;
  }
  if (s.log.some((e) => e.date === today)) return null;
  if (st.savedYesterday) return { id: "save_used", text: fill(REMINDERS.save_used, v) };
  // Back on pace: at most weekly, at the start of a new program week.
  if (n > 0 && n % dpw(s) === 0 && onPace(s, levelId, today) && s.flags?.lastPaceWeek !== v.w) {
    return { id: "back_on_pace", text: fill(REMINDERS.back_on_pace, { ...v, n: n + 1 }), weekly: v.w };
  }
  return { id: "streak", text: fill(REMINDERS.streak, v) };
}

/* ---------- badges + recap ---------- */
export function badges(s, levelId) {
  const out = [];
  const run = currentRun(s, levelId);
  if (!run) return out;
  const total = totalSessions(s);
  if (run.pointer >= 1) out.push("First Step");
  if (run.pointer >= total / 2) out.push("Halfway");
  if (run.finishedAt) out.push(`${DISPLAY_NAMES[levelId]} Finisher`);
  const st = computeStreak(s);
  if (st.longest >= 7) out.push("Week Strong");
  if (st.repairsUsed > 0) out.push("Comeback");
  return out;
}

export function recap(s, levelId, level) {
  const run = currentRun(s, levelId);
  const entries = s.log.filter((e) => e.runId === run.runId);
  const slotEntries = entries.filter((e) => e.kind === "slot" || e.kind === "manual");
  const dates = slotEntries.map((e) => e.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const counts = {};
  entries.forEach((e) => { if (e.slot) counts[e.slot] = (counts[e.slot] || 0) + 1; });
  const fav = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const st = computeStreak(s);
  return {
    sessions: run.pointer,
    total: totalSessions(s),
    calendarDays: first && last ? daysBetween(first, last) + 1 : 0,
    longestStreak: st.longest,
    totalMinutes: entries.reduce((a, e) => a + Math.round((e.seconds || 0) / 60), 0),
    savesUsed: st.savesUsed,
    favorite: fav && level ? `${level.slots[Number(fav[0]) - 1]?.title} (session ${fav[0]})` : "",
    first: getCheckin(s, levelId, "first"),
    final: getCheckin(s, levelId, "final"),
  };
}
