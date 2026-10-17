import { getAllowedEatIds } from "./masterFood.js";
import { macroGroupForItem, getMacroNutrition } from "./macroGroups.js";

const SLOT_ORDER = ["breakfast", "lunch", "snack", "dinner"];
const THEME_NOTES = {
  1: "Keep it simple — pantry basics and easy prep.",
  2: "Build your plate: protein, veggies, smart carbs.",
  3: "Batch-friendly: cook once, eat twice.",
  4: "Real-life meals you can pack or share.",
  5: "Celebrate with balanced, flexible plates.",
};

const MEAL_CAL_SHARE = { breakfast: 0.25, lunch: 0.3, dinner: 0.35, snack: 0.1 };

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

function buildPools(allowedArr, masterById) {
  const pools = { protein: [], carbs: [], fat: [], vegetables: [], flavor: [] };
  for (const id of allowedArr) {
    const item = masterById[id];
    if (!item) continue;
    const g = macroGroupForItem(item);
    if (pools[g]) pools[g].push(id);
  }
  return pools;
}

function pickFrom(pool, rng, exclude = new Set()) {
  const options = pool.filter((id) => !exclude.has(id));
  if (!options.length) return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
  return options[Math.floor(rng() * options.length)];
}

function scaleNutrition(nut, factor) {
  return {
    calories: Math.round(nut.calories * factor),
    protein: Math.round(nut.protein * factor * 10) / 10,
    carbs: Math.round(nut.carbs * factor * 10) / 10,
    fat: Math.round(nut.fat * factor * 10) / 10,
  };
}

function portionFactorForSlot(slot, dailyTarget) {
  const mealCals = dailyTarget * (MEAL_CAL_SHARE[slot] || 0.25);
  return Math.max(0.6, Math.min(1.4, mealCals / 400));
}

function composeMeal(slot, pools, masterById, rng, dailyTarget, day, recentMeals) {
  const factor = portionFactorForSlot(slot, dailyTarget);
  const proteinId = pickFrom(pools.protein, rng);
  const carbId = pickFrom(pools.carbs, rng);
  const fatId = pickFrom(pools.fat, rng);
  const veg1 = pickFrom(pools.vegetables, rng);
  const veg2 = pickFrom(pools.vegetables, rng, new Set([veg1]));
  const flavorId = pools.flavor.length ? pickFrom(pools.flavor, rng) : null;

  const ids = [proteinId, carbId, fatId, veg1, veg2, flavorId].filter(Boolean);
  const labels = ids.map((id) => masterById[id]?.label || id);

  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  const logItems = [];
  const ingredients = [];

  for (const id of ids) {
    const item = masterById[id];
    if (!item) continue;
    const nut = getMacroNutrition(item);
    const scaled = scaleNutrition(nut, factor);
    calories += scaled.calories;
    protein += scaled.protein;
    carbs += scaled.carbs;
    fat += scaled.fat;
    const approx = nut.approximate ? " (approx.)" : "";
    ingredients.push(`${nut.serving}${approx} ${item.label}`);
    logItems.push({
      foodId: id,
      name: item.label,
      serving: nut.serving,
      calories: scaled.calories,
      protein: scaled.protein,
      carbs: scaled.carbs,
      fat: scaled.fat,
      tags: item.tags || [],
    });
  }

  const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
  const name = `${labels[0] || "Plate"} ${slotLabel}`;
  const mealId = `composed_${slot}_d${day}_${hashSeed(ids.join("-"))}`;

  if (recentMeals.includes(mealId)) {
    return composeMeal(slot, pools, masterById, rng, dailyTarget, day, recentMeals);
  }

  const steps =
    slot === "snack"
      ? ["Prep fruit or veg.", "Add seeds or fat for staying power.", "Enjoy."]
      : [
          "Cook protein with a little healthy fat.",
          "Prepare carb (grain or starchy veg) and non-starchy vegetables.",
          "Plate together and season with herbs or extras from your list.",
        ];

  return {
    id: mealId,
    name,
    slot,
    ingredientIds: ids,
    ingredients,
    steps,
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    macrosApproximate: true,
    weekTags: [1, 2, 3, 4, 5],
    isComposed: true,
    logItems: [
      {
        name,
        serving: "1 meal",
        calories: Math.round(calories),
        protein: Math.round(protein * 10) / 10,
        carbs: Math.round(carbs * 10) / 10,
        fat: Math.round(fat * 10) / 10,
        tags: [],
      },
      ...logItems,
    ],
  };
}

export function buildFallbackMeal(slot, allowedIds, masterById, rng, week) {
  const pools = buildPools(allowedIds, masterById);
  return composeMeal(slot, pools, masterById, rng, 2000, week, []);
}

export function generateMealPlan(profile, _mealsData, masterList, options = {}) {
  const allowedArr = getAllowedEatIds(profile, masterList);
  const masterById = Object.fromEntries((masterList.eat || []).map((e) => [e.id, e]));
  const pools = buildPools(allowedArr, masterById);
  const seed = options.seed || hashSeed(JSON.stringify(allowedArr.sort()) + (profile.startDate || ""));
  const rng = mulberry32(seed);
  const dailyTarget = profile.calorieTarget || 2000;
  const recent = [];
  const days = [];

  for (let day = 1; day <= 30; day++) {
    const week = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : day <= 28 ? 4 : 5;
    const meals = {};
    for (const slot of SLOT_ORDER) {
      if (slot === "snack" && day % 2 === 0) {
        meals[slot] = null;
        continue;
      }
      const meal = composeMeal(slot, pools, masterById, rng, dailyTarget, day, recent);
      recent.push(meal.id);
      if (recent.length > 12) recent.shift();
      meals[slot] = meal;
    }
    days.push({
      day,
      week,
      themeNote: THEME_NOTES[week] || THEME_NOTES[4],
      meals,
    });
  }
  return { version: 3, seed, generatedAt: new Date().toISOString(), days };
}

export function getDayFromPlan(plan, dayNum) {
  return plan?.days?.find((d) => d.day === dayNum) || null;
}

export function shuffleMealInPlan(plan, dayNum, slot, profile, _mealsData, masterList) {
  const day = getDayFromPlan(plan, dayNum);
  if (!day) return plan;
  const allowedArr = getAllowedEatIds(profile, masterList);
  const masterById = Object.fromEntries((masterList.eat || []).map((e) => [e.id, e]));
  const pools = buildPools(allowedArr, masterById);
  const rng = mulberry32(hashSeed(`${plan.seed}-${dayNum}-${slot}-${Date.now()}`));
  const dailyTarget = profile.calorieTarget || 2000;
  day.meals[slot] = composeMeal(slot, pools, masterById, rng, dailyTarget, dayNum, []);
  return { ...plan, days: plan.days.map((d) => (d.day === dayNum ? day : d)) };
}

export function mealLogEntries(meal) {
  if (!meal) return [];
  return [
    {
      id: meal.id,
      name: meal.name,
      serving: "1 meal",
      calories: meal.calories || 0,
      protein: meal.protein || 0,
      carbs: meal.carbs || 0,
      fat: meal.fat || 0,
      tags: [],
      packaged: false,
    },
  ];
}
