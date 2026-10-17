import { getAllowedEatIds } from "./masterFood.js";

const SLOT_ORDER = ["breakfast", "lunch", "snack", "dinner"];
const THEME_NOTES = {
  1: "Keep it simple — pantry basics and easy prep.",
  2: "Build your plate: protein, veggies, smart carbs.",
  3: "Batch-friendly: cook once, eat twice.",
  4: "Real-life meals you can pack or share.",
  5: "Celebrate with balanced, flexible plates.",
};

function scaleMeal(meal, factor) {
  const m = JSON.parse(JSON.stringify(meal));
  if (Math.abs(factor - 1) < 0.05) return m;
  m.calories = Math.round(m.calories * factor);
  m.protein = Math.round(m.protein * factor * 10) / 10;
  for (const item of m.logItems || []) {
    item.calories = Math.round(item.calories * factor);
    item.protein = Math.round(item.protein * factor * 10) / 10;
  }
  return m;
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return Math.abs(h);
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildFallbackMeal(slot, allowedIds, masterById, rng, week) {
  const allowed = allowedIds.filter((id) => masterById[id]);
  const pick = (pred) => {
    const pool = allowed.filter(pred);
    return pool[Math.floor(rng() * pool.length)];
  };
  const protein = pick((id) => masterById[id].tags?.some((t) => ["meat", "poultry", "fish", "shellfish", "legume"].includes(t)));
  const veg = pick((id) => masterById[id].tags?.includes("vegetable"));
  const fat = pick((id) => masterById[id].tags?.includes("fat"));
  const starch = pick((id) => masterById[id].tags?.includes("starch"));
  const ids = [protein, veg, fat, starch].filter(Boolean);
  const names = ids.map((id) => masterById[id].label);
  return {
    id: `fallback_${slot}_${week}_${Math.floor(rng() * 9999)}`,
    name: `Build-a-plate ${slot}`,
    slot,
    ingredientIds: ids,
    ingredients: names.map((n) => `1 serving ${n}`),
    steps: ["Cook protein and veggies simply.", "Add fat and starch.", "Season with herbs from your list."],
    calories: slot === "snack" ? 180 : slot === "breakfast" ? 350 : 430,
    protein: slot === "snack" ? 8 : 28,
    weekTags: [week],
    isFallback: true,
    logItems: [
      {
        name: `Build-a-plate ${slot}`,
        serving: "1 serving",
        calories: slot === "snack" ? 180 : 400,
        protein: slot === "snack" ? 8 : 28,
        carbs: 35,
        fat: 12,
        tags: [],
      },
    ],
  };
}

export function generateMealPlan(profile, mealsData, masterList, options = {}) {
  const allowedArr = getAllowedEatIds(profile, masterList);
  const allowed = new Set(allowedArr);
  const masterById = Object.fromEntries((masterList.eat || []).map((e) => [e.id, e]));
  const templates = (mealsData.templates || []).filter((t) =>
    (t.ingredientIds || []).every((id) => allowed.has(id))
  );
  const seed = options.seed || hashSeed(JSON.stringify(allowedArr.sort()) + (profile.startDate || ""));
  const rng = mulberry32(seed);
  const factor = (profile.calorieTarget || 2000) / 2000;
  const recent = [];
  const days = [];

  function pickForSlot(slot, day, week) {
    const recentIds = new Set(recent.slice(-9));
    let pool = templates.filter(
      (t) =>
        t.slot === slot &&
        (t.weekTags || [1, 2, 3, 4, 5]).includes(week) &&
        !recentIds.has(t.id)
    );
    if (!pool.length) pool = templates.filter((t) => t.slot === slot);
    if (!pool.length) {
      return scaleMeal(buildFallbackMeal(slot, allowedArr, masterById, rng, week), factor);
    }
    const t = pool[Math.floor(rng() * pool.length)];
    recent.push(t.id);
    return scaleMeal(t, factor);
  }

  for (let day = 1; day <= 30; day++) {
    const week = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : day <= 28 ? 4 : 5;
    const meals = {};
    for (const slot of SLOT_ORDER) {
      if (slot === "snack" && day % 2 === 0) {
        meals[slot] = null;
        continue;
      }
      meals[slot] = pickForSlot(slot, day, week <= 4 ? week : 4);
    }
    days.push({
      day,
      week,
      themeNote: THEME_NOTES[week] || THEME_NOTES[4],
      meals,
    });
  }
  return { version: 2, seed, generatedAt: new Date().toISOString(), days };
}

export function getDayFromPlan(plan, dayNum) {
  return plan?.days?.find((d) => d.day === dayNum) || null;
}

export function shuffleMealInPlan(plan, dayNum, slot, profile, mealsData, masterList) {
  const day = getDayFromPlan(plan, dayNum);
  if (!day) return plan;
  const allowedArr = getAllowedEatIds(profile, masterList);
  const allowed = new Set(allowedArr);
  const masterById = Object.fromEntries((masterList.eat || []).map((e) => [e.id, e]));
  const templates = (mealsData.templates || []).filter(
    (t) => t.slot === slot && (t.ingredientIds || []).every((id) => allowed.has(id))
  );
  const rng = mulberry32(hashSeed(`${plan.seed}-${dayNum}-${slot}-${Date.now()}`));
  const factor = (profile.calorieTarget || 2000) / 2000;
  const currentId = day.meals[slot]?.id;
  let pool = templates.filter((t) => t.id !== currentId);
  if (!pool.length) pool = templates;
  let meal;
  if (pool.length) meal = scaleMeal(pool[Math.floor(rng() * pool.length)], factor);
  else meal = scaleMeal(buildFallbackMeal(slot, allowedArr, masterById, rng, day.week), factor);
  day.meals[slot] = meal;
  return { ...plan, days: plan.days.map((d) => (d.day === dayNum ? day : d)) };
}

export function mealLogEntries(meal) {
  if (!meal) return [];
  return (meal.logItems || []).map((item) => ({
    id: item.foodId,
    name: item.name,
    serving: item.serving || "1 serving",
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs || 0,
    fat: item.fat || 0,
    tags: item.tags || [],
    packaged: false,
  }));
}
