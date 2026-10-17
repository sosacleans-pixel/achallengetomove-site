/** Activity multipliers (standard TDEE factors) */
const ACTIVITY = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJ = {
  lose: -400,
  maintain: 0,
  gain: 300,
};

/**
 * Mifflin-St Jeor BMR, then activity + goal adjustment with calorie floor.
 * @param {{ sex: string, age: number, heightCm: number, weightKg: number, activity: string, goal: string }} p
 */
export function estimateCalorieTarget(p) {
  const { sex, age, heightCm, weightKg, activity, goal } = p;
  let bmr;
  if (sex === "male") {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }
  const mult = ACTIVITY[activity] || ACTIVITY.moderate;
  let tdee = bmr * mult;
  tdee += GOAL_ADJ[goal] ?? 0;
  const floor = sex === "male" ? 1500 : 1200;
  return Math.round(Math.max(floor, tdee));
}

export function macroTargets(calories) {
  const protein = Math.round((calories * 0.3) / 4);
  const fat = Math.round((calories * 0.3) / 9);
  const carbs = Math.round((calories * 0.4) / 4);
  return { calories, protein, carbs, fat };
}

export function sumLogMacros(entries) {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}
