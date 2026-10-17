/** Meal plan accessors — plan is generated in planGenerator.js and stored in state. */
import { getDayFromPlan, mealLogEntries, shuffleMealInPlan, generateMealPlan } from "./planGenerator.js";
import { buildGroceryFromPlan, programWeekForDay } from "./grocery.js";

export { mealLogEntries, shuffleMealInPlan, generateMealPlan, getDayFromPlan, buildGroceryFromPlan, programWeekForDay };

export function getPersonalizedDay(plan, dayNum) {
  return getDayFromPlan(plan, dayNum);
}

export function weekForDay(dayNum) {
  return programWeekForDay(dayNum);
}

export function buildShoppingList() {
  return [];
}
