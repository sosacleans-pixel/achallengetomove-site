import { getPersonalizedDay } from "./meals.js";
import { dateKey, programDay } from "./storage.js";

export const DEFAULT_MEAL_WINDOWS = {
  breakfastStart: "05:00",
  breakfastEnd: "10:30",
  lunchEnd: "15:00",
  snackEnd: "17:00",
  dinnerEnd: "21:00",
};

const SLOT_ORDER = ["breakfast", "lunch", "snack", "dinner"];

export function getMealWindows(profile) {
  return { ...DEFAULT_MEAL_WINDOWS, ...(profile?.mealWindows || {}) };
}

export function parseTimeToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
}

/** @returns {{ slot: string, mode: "now" | "upnext" }} */
export function getTimeSlot(now, windows) {
  const t = now.getHours() * 60 + now.getMinutes();
  const b0 = parseTimeToMinutes(windows.breakfastStart);
  const b1 = parseTimeToMinutes(windows.breakfastEnd);
  const l1 = parseTimeToMinutes(windows.lunchEnd);
  const s1 = parseTimeToMinutes(windows.snackEnd);
  const d1 = parseTimeToMinutes(windows.dinnerEnd);
  if (t >= b0 && t < b1) return { slot: "breakfast", mode: "now" };
  if (t >= b1 && t < l1) return { slot: "lunch", mode: "now" };
  if (t >= l1 && t < s1) return { slot: "snack", mode: "now" };
  if (t >= s1 && t < d1) return { slot: "dinner", mode: "now" };
  return { slot: "breakfast", mode: "upnext" };
}

function slotsForPlan(plan) {
  return SLOT_ORDER.filter((s) => plan?.meals?.[s]);
}

function isSlotLogged(log, slot) {
  return (log?.meals?.[slot]?.length || 0) > 0;
}

function nextUnloggedSlot(plan, log, fromSlot) {
  const order = slotsForPlan(plan);
  const start = Math.max(0, order.indexOf(fromSlot));
  for (let i = start; i < order.length; i++) {
    if (!isSlotLogged(log, order[i])) return order[i];
  }
  for (let i = 0; i < start; i++) {
    if (!isSlotLogged(log, order[i])) return order[i];
  }
  return fromSlot;
}

/**
 * @param {{ now: Date, profile: object, mealsData: object, logs: object }} ctx
 */
export function resolveSuggestedMeal(ctx) {
  const { now, profile, mealsData, logs } = ctx;
  if (!mealsData || !profile) return null;
  const windows = getMealWindows(profile);
  const timeInfo = getTimeSlot(now, windows);
  let planDay = programDay(profile, now);
  let logKey = dateKey(now);
  let heading = timeInfo.mode === "upnext" ? "Up next" : "Suggested now";

  if (timeInfo.mode === "upnext") {
    planDay = Math.min(30, planDay + 1);
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    logKey = dateKey(tomorrow);
  }

  let plan = getPersonalizedDay(mealsData, planDay, profile);
  let log = logs[logKey] || { meals: { breakfast: [], lunch: [], dinner: [], snack: [] } };
  let slot = timeInfo.slot;

  if (timeInfo.mode === "now") {
    slot = nextUnloggedSlot(plan, log, slot);
  } else {
    slot = nextUnloggedSlot(plan, log, "breakfast");
  }

  let meal = plan?.meals?.[slot];
  if (!meal) {
    const alt = slotsForPlan(plan).find((s) => plan.meals[s]);
    if (alt) {
      slot = alt;
      meal = plan.meals[alt];
    }
  }
  if (!meal) return null;

  return {
    heading,
    slot,
    planDay,
    logKey,
    meal,
    mode: timeInfo.mode,
  };
}

export function mealSlotLabel(slot) {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}
