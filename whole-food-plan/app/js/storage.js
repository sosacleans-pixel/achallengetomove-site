/** @typedef {import('./types.js').AppState} AppState */

export const STORAGE_KEY = "wf_plan_v1";

const defaultState = () => ({
  version: 2,
  profile: null,
  foodList: null,
  mealPlan: null,
  logs: {},
  customFoods: [],
  groceryScope: "week",
  groceryWeek: 1,
  groceryChecked: {},
  groceryStore: "instacart",
  kitchenClear: {
    checked: {},
    completed: false,
    skipped: false,
    celebrated: false,
    groupIndex: 0,
  },
  reintro: {
    started: false,
    order: ["eggs", "dairy", "gluten", "soy", "corn", "nuts"],
    tests: {},
    currentGroup: null,
  },
  shoppingLists: {},
});

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      logs: parsed.logs || {},
      customFoods: parsed.customFoods || [],
      shoppingLists: parsed.shoppingLists || {},
      mealPlan: parsed.mealPlan || null,
      groceryScope: parsed.groceryScope || "week",
      groceryWeek: parsed.groceryWeek || 1,
      groceryChecked: parsed.groceryChecked || {},
      groceryStore: parsed.groceryStore || "instacart",
      kitchenClear: {
        checked: {},
        completed: false,
        skipped: false,
        celebrated: false,
        groupIndex: 0,
        ...(parsed.kitchenClear || {}),
      },
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportStateJson(state) {
  return JSON.stringify(state, null, 2);
}

export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function programDay(profile, today = new Date()) {
  if (!profile?.startDate) return 1;
  const start = parseDateKey(profile.startDate);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diff = Math.floor((t - s) / 86400000) + 1;
  return Math.max(1, Math.min(30, diff));
}

export function daysSinceStart(profile, today = new Date()) {
  if (!profile?.startDate) return 0;
  const start = parseDateKey(profile.startDate);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.floor((t - s) / 86400000) + 1;
}

export function reintroUnlocked(profile, today = new Date()) {
  return daysSinceStart(profile, today) > 30;
}

export function ensureDayLog(state, key) {
  if (!state.logs[key]) {
    state.logs[key] = {
      meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
      checkIn: null,
    };
  }
  return state.logs[key];
}
