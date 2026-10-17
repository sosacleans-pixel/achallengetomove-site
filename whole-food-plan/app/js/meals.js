/** Personalize suggested meals from data/meals.json */

const ANIMAL = {
  fish: ["salmon", "tuna", "cod", "fish", "shrimp", "seafood", "sardine", "anchov"],
  poultry: ["chicken", "turkey", "duck"],
  beef: ["beef", "sirloin", "bison", "steak"],
  pork: ["pork", "bacon"],
  dairy: ["milk", "cheese", "yogurt", "butter", "cream", "ghee", "whey"],
  eggs: ["egg"],
};

function textHasAny(text, words) {
  const n = text.toLowerCase();
  return words.some((w) => n.includes(w));
}

function profileAvoids(profile) {
  const list = [
    ...(profile.allergies || []),
    ...(profile.intolerances || []),
    ...(profile.avoidFoods || []),
  ].map((s) => s.toLowerCase());
  return list;
}

function conflictsMeal(meal, profile) {
  const blob = [meal.name, ...(meal.ingredients || []), ...(meal.logItems || []).map((i) => i.name)].join(" ");
  const avoids = profileAvoids(profile);
  for (const a of avoids) {
    if (blob.toLowerCase().includes(a)) return a;
  }
  if (profile.dietStyle === "vegan") {
    if (meal.proteinType && meal.proteinType !== "none" && meal.proteinType !== "legume") return "vegan";
    if (textHasAny(blob, ANIMAL.poultry.concat(ANIMAL.beef, ANIMAL.fish, ANIMAL.pork, ANIMAL.dairy, ANIMAL.eggs)))
      return "vegan";
  }
  if (profile.dietStyle === "vegetarian") {
    if (["poultry", "beef", "fish", "pork"].includes(meal.proteinType)) return "vegetarian";
  }
  if (profile.dietStyle === "pescatarian") {
    if (["poultry", "beef", "pork"].includes(meal.proteinType)) return "pescatarian";
  }
  for (const a of avoids) {
    if (a.includes("fish") && meal.proteinType === "fish") return "fish dislike";
    if (a.includes("dairy") && textHasAny(blob, ANIMAL.dairy)) return "dairy";
  }
  return null;
}

function cloneMeal(m) {
  return JSON.parse(JSON.stringify(m));
}

function scaleMeal(meal, factor) {
  const m = cloneMeal(meal);
  if (factor <= 0 || Math.abs(factor - 1) < 0.05) return m;
  m.calories = Math.round(m.calories * factor);
  m.protein = Math.round(m.protein * factor * 10) / 10;
  m.portionNote = factor > 1.05
    ? `Generous portions for your ~${Math.round(factor * 2000)} kcal target.`
    : factor < 0.95
      ? `Smaller portions for your calorie target.`
      : null;
  for (const item of m.logItems || []) {
    item.calories = Math.round(item.calories * factor);
    item.protein = Math.round(item.protein * factor * 10) / 10;
    item.carbs = Math.round((item.carbs || 0) * factor * 10) / 10;
    item.fat = Math.round((item.fat || 0) * factor * 10) / 10;
  }
  return m;
}

function resolveMealId(id, catalog, dayRow, slot, profile, dayNum = 1) {
  if (!id) return null;
  let meal = catalog[id];
  if (!meal) return null;

  const swaps = dayRow[`${slot}Swaps`] || dayRow.lunchSwaps || {};
  const diet = profile.dietStyle || "omnivore";
  const dietMap = swaps[diet];
  if (dietMap && dietMap[id]) {
    meal = catalog[dietMap[id]] || meal;
  }

  if (slot === "breakfast" && dayRow.meals.breakfastProtein) {
    const bp = dayRow.meals.breakfastProtein;
    if (diet === "vegan" && dayNum % 2 === 1) {
      meal = cloneMeal(bp.vegan || catalog[dayRow.meals.breakfast]);
    } else if (diet !== "vegan") {
      const extra = bp[diet] || bp.omnivore;
      if (extra) {
        const base = cloneMeal(catalog[dayRow.meals.breakfast] || meal);
        const addProtein = cloneMeal(extra);
        meal = {
          ...base,
          name: `${base.name} + ${addProtein.name}`,
          ingredients: [...base.ingredients, "---", ...addProtein.ingredients],
          steps: [...base.steps, ...addProtein.steps],
          calories: base.calories + addProtein.calories,
          protein: base.protein + addProtein.protein,
          logItems: [...(base.logItems || []), ...(addProtein.logItems || [])],
          proteinType: addProtein.proteinType || base.proteinType,
        };
      }
    }
  }

  let conflict = conflictsMeal(meal, profile);
  let guard = 0;
  while (conflict && guard < 4) {
    guard++;
    if (conflict === "fish dislike" || meal.proteinType === "fish") {
      meal = catalog["l-chicken-salad"] || catalog["d-sheet-chicken"] || catalog["l-lentil-soup"];
    } else if (conflict === "dairy" || textHasAny(conflict, ANIMAL.dairy)) {
      meal = catalog["b-chia"] || catalog["l-lentil-soup"];
    } else if (conflict === "vegan" || conflict === "vegetarian" || conflict === "pescatarian") {
      meal = catalog["d-chickpea-curry"] || catalog["l-lentil-soup"];
    } else {
      meal = catalog["l-lentil-soup"] || meal;
    }
    conflict = conflictsMeal(meal, profile);
  }

  const factor = (profile.calorieTarget || 2000) / 2000;
  return scaleMeal(meal, factor);
}

export function getPersonalizedDay(mealsData, dayNum, profile) {
  const row = mealsData.days.find((d) => d.day === dayNum);
  if (!row) return null;
  const { catalog } = mealsData;
  const slots = ["breakfast", "lunch", "dinner", "snack"];
  const meals = {};
  for (const slot of slots) {
    const id = row.meals[slot];
    meals[slot] = resolveMealId(id, catalog, row, slot, profile, dayNum);
  }
  return { day: dayNum, week: row.week, themeNote: row.themeNote, meals };
}

export function weekForDay(dayNum) {
  return Math.ceil(dayNum / 7);
}

export function buildShoppingList(mealsData, week, profile) {
  const items = new Map();
  const start = (week - 1) * 7 + 1;
  const end = Math.min(week * 7, 30);
  for (let d = start; d <= end; d++) {
    const day = getPersonalizedDay(mealsData, d, profile);
    if (!day) continue;
    for (const slot of Object.keys(day.meals)) {
      const m = day.meals[slot];
      if (!m) continue;
      for (const ing of m.ingredients || []) {
        if (ing === "---") continue;
        const key = ing.toLowerCase();
        if (!items.has(key)) items.set(key, ing);
      }
    }
  }
  return [...items.values()].sort((a, b) => a.localeCompare(b));
}

export function mealLogEntries(meal) {
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
