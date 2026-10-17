/**
 * Generates data/meals.json — 30 days of elimination-friendly suggested meals.
 */
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, "..", "data", "meals.json");

function meal(id, name, ingredients, steps, calories, protein, opts = {}) {
  return {
    id,
    name,
    ingredients,
    steps,
    calories,
    protein,
    proteinType: opts.proteinType || "none",
    tags: opts.tags || [],
    logItems: opts.logItems || [
      {
        name,
        serving: "1 serving",
        calories,
        protein,
        carbs: opts.carbs ?? Math.round((calories - protein * 4) * 0.5 / 4),
        fat: opts.fat ?? Math.round((calories - protein * 4) * 0.35 / 9),
        tags: opts.tags || [],
      },
    ],
    swaps: opts.swaps || {},
  };
}

const breakfasts = [
  meal(
    "b-oats-berry",
    "Warm Berry Oats",
    [
      "1/2 cup certified gluten-free rolled oats",
      "1 cup water",
      "1/2 cup blueberries",
      "1 tbsp sunflower seeds",
    ],
    [
      "Simmer certified gluten-free rolled oats in water 5 min.",
      "Top with berries and seeds.",
    ],
    340,
    11,
    {
      tags: [],
      proteinType: "none",
      logItems: [
        {
          name: "Certified gluten-free rolled oats, dry",
          serving: "1/2 cup",
          calories: 150,
          protein: 5,
          carbs: 27,
          fat: 3,
          tags: [],
        },
        {
          name: "Warm berry oat bowl (berries & seeds)",
          serving: "1 serving",
          calories: 190,
          protein: 6,
          carbs: 28,
          fat: 9,
          tags: [],
        },
      ],
    }
  ),
  meal("b-sweet-hash", "Sweet Potato Hash", ["1 medium sweet potato, diced", "1/2 bell pepper", "1 tsp olive oil", "Fresh parsley"], ["Sauté potato in oil until tender.", "Add pepper; season with salt and pepper."], 280, 4, { proteinType: "none" }),
  meal("b-chia", "Chia Pudding Cup", ["3 tbsp chia seeds", "1 cup unsweetened coconut milk", "1/2 cup strawberries"], ["Stir chia and milk; chill overnight.", "Top with sliced strawberries."], 310, 10, { proteinType: "none" }),
  meal("b-rice-bowl", "Savory Rice Bowl", ["1/2 cup cooked brown rice", "1/2 avocado", "1 cup spinach", "Lemon juice"], ["Warm rice with spinach.", "Top with avocado and lemon."], 360, 7, { proteinType: "none" }),
  meal("b-fruit-yogurt-alt", "Coconut Fruit Bowl", ["3/4 cup coconut yogurt (dairy-free)", "1/2 cup mixed berries", "1 tbsp hemp hearts"], ["Spoon yogurt into a bowl.", "Add berries and hemp hearts."], 290, 12, { proteinType: "none", tags: [] }),
];

const breakfastProtein = {
  omnivore: meal("b-chicken-breakfast", "Chicken & Veggie Breakfast Plate", ["3 oz leftover chicken", "1 cup sautéed spinach", "1/2 cup cherry tomatoes", "1 tsp olive oil"], ["Warm chicken with sautéed veggies."], 300, 28, { proteinType: "poultry" }),
  pescatarian: meal("b-salmon-toast-alt", "Salmon & Greens Plate", ["3 oz smoked salmon", "2 cups arugula", "1/2 avocado", "Lemon"], ["Plate greens and salmon.", "Add avocado and lemon."], 320, 26, { proteinType: "fish", tags: [] }),
  vegetarian: meal("b-bean-tacos-brk", "Black Bean Breakfast Bowl", ["1/2 cup black beans", "1/2 cup brown rice", "Salsa", "Cilantro"], ["Warm beans and rice.", "Top with salsa and cilantro."], 350, 14, { proteinType: "legume" }),
  vegan: meal("b-tofu-skip", "Turmeric Lentil Bowl", ["1/2 cup cooked lentils", "1 cup kale", "1 tsp olive oil", "Turmeric, garlic"], ["Sauté kale; stir in lentils and spices."], 330, 18, { proteinType: "legume" }),
};

const lunches = [
  meal("l-chicken-salad", "Chicken & Greens Salad", ["3 oz grilled chicken", "2 cups mixed greens", "Cucumber", "Olive oil + lemon dressing"], ["Slice chicken over greens.", "Drizzle dressing."], 380, 32, { proteinType: "poultry" }),
  meal("l-salmon-bowl", "Salmon Grain Bowl", ["3 oz baked salmon", "1/2 cup quinoa", "Roasted broccoli", "Olive oil"], ["Flake salmon over quinoa and broccoli."], 420, 30, { proteinType: "fish" }),
  meal("l-turkey-wrap-alt", "Turkey Lettuce Cups", ["3 oz sliced turkey", "Butter lettuce leaves", "Tomato", "Mustard"], ["Fill lettuce cups with turkey and veggies."], 300, 28, { proteinType: "poultry" }),
  meal("l-chili", "Turkey & Bean Chili", ["3 oz ground turkey", "1/2 cup kidney beans", "Tomato, onion, chili spice"], ["Simmer 20 minutes until thick."], 400, 32, { proteinType: "poultry" }),
  meal("l-tuna-salad", "Tuna & Avocado Plate", ["3 oz tuna", "1/2 avocado", "2 cups greens", "Lemon"], ["Mix tuna with lemon; serve with avocado."], 350, 34, { proteinType: "fish" }),
  meal("l-lentil-soup", "Hearty Lentil Soup", ["1/2 cup lentils", "Carrot, celery, onion", "Vegetable broth", "Bay leaf"], ["Simmer until lentils are soft."], 360, 20, { proteinType: "legume" }),
  meal("l-beef-bowl", "Beef & Veggie Bowl", ["3 oz lean beef", "1/2 cup brown rice", "Green beans", "Garlic"], ["Stir-fry beef with veggies; serve over rice."], 430, 30, { proteinType: "beef" }),
];

const lunchSwaps = {
  vegan: {
    "l-chicken-salad": "l-lentil-soup",
    "l-salmon-bowl": "l-lentil-soup",
    "l-turkey-wrap-alt": "l-lentil-soup",
    "l-chili": "l-lentil-soup",
    "l-tuna-salad": "l-lentil-soup",
    "l-beef-bowl": "l-lentil-soup",
  },
  vegetarian: {
    "l-chicken-salad": "l-lentil-soup",
    "l-salmon-bowl": "l-lentil-soup",
    "l-turkey-wrap-alt": "l-lentil-soup",
    "l-chili": "l-lentil-soup",
    "l-tuna-salad": "l-lentil-soup",
    "l-beef-bowl": "l-lentil-soup",
  },
  pescatarian: {
    "l-chicken-salad": "l-salmon-bowl",
    "l-turkey-wrap-alt": "l-tuna-salad",
    "l-chili": "l-salmon-bowl",
    "l-beef-bowl": "l-salmon-bowl",
  },
};

const dinners = [
  meal("d-sheet-chicken", "Sheet-Pan Chicken & Veggies", ["4 oz chicken breast", "Zucchini, bell pepper", "Olive oil", "Rosemary"], ["Roast at 400°F 25 min."], 420, 38, { proteinType: "poultry" }),
  meal("d-salmon-rice", "Salmon, Rice & Greens", ["4 oz salmon", "1/2 cup brown rice", "Bok choy", "Ginger"], ["Bake salmon; steam greens; serve with rice."], 450, 34, { proteinType: "fish" }),
  meal("d-turkey-meatballs", "Turkey Meatballs & Zoodles", ["4 oz ground turkey", "Zucchini noodles", "Marinara (no sugar)", "Basil"], ["Bake meatballs; warm sauce with zoodles."], 400, 36, { proteinType: "poultry" }),
  meal("d-stir-fry", "Chicken Stir-Fry", ["4 oz chicken", "Broccoli, snap peas", "Coconut aminos", "Brown rice"], ["Stir-fry chicken and veggies; serve over rice."], 430, 35, { proteinType: "poultry" }),
  meal("d-beef-skillet", "Beef & Potato Skillet", ["4 oz sirloin strips", "1 medium potato", "Onion, peppers"], ["Sauté beef and veggies until done."], 460, 32, { proteinType: "beef" }),
  meal("d-cod-tray", "Lemon Cod Tray Bake", ["4 oz cod", "Asparagus", "Cherry tomatoes", "Lemon"], ["Bake 15 min until fish flakes."], 380, 32, { proteinType: "fish" }),
  meal("d-chickpea-curry", "Chickpea Coconut Curry", ["1 cup chickpeas", "Cauliflower", "Coconut milk", "Curry spice"], ["Simmer 15 minutes."], 410, 18, { proteinType: "legume" }),
];

const dinnerSwaps = { ...lunchSwaps };

const snacks = [
  meal("s-apple", "Apple & Sunflower Butter", ["1 medium apple", "1 tbsp sunflower seed butter"], ["Slice apple; dip in seed butter."], 180, 4, { proteinType: "none" }),
  meal("s-veg-hummus", "Veggies & Hummus", ["1 cup carrot sticks", "3 tbsp hummus"], ["Prep and snack."], 140, 4, { proteinType: "none" }),
  meal("s-hardboiled-skip", "Pumpkin Seed & Fruit", ["1/4 cup pumpkin seeds", "1/2 cup grapes"], ["Combine for a quick snack."], 200, 8, { proteinType: "none" }),
  null,
];

const catalog = {};
[...breakfasts, breakfastProtein.omnivore, breakfastProtein.pescatarian, breakfastProtein.vegetarian, breakfastProtein.vegan, ...lunches, ...dinners, ...snacks.filter(Boolean)].forEach((m) => {
  catalog[m.id] = m;
});

function pick(arr, day) {
  return arr[(day - 1) % arr.length];
}

const days = [];
for (let day = 1; day <= 30; day++) {
  const week = Math.ceil(day / 7);
  const bBase = pick(breakfasts, day);
  const lunch = pick(lunches, day + week);
  const dinner = pick(dinners, day + week * 2);
  const snack = snacks[(day - 1) % snacks.length];
  days.push({
    day,
    week,
    themeNote:
      week === 1
        ? "Keep it simple — pantry basics and easy prep."
        : week === 2
          ? "Build your plate: protein, veggies, smart carbs."
          : week === 3
            ? "Batch-friendly: cook once, eat twice."
            : week === 4
              ? "Real-life meals you can pack or share."
              : "Celebrate with balanced, flexible plates.",
    meals: {
      breakfast: bBase.id,
      breakfastProtein: breakfastProtein,
      lunch: lunch.id,
      dinner: dinner.id,
      snack: snack ? snack.id : null,
    },
    lunchSwaps,
    dinnerSwaps,
  });
}

writeFileSync(
  out,
  JSON.stringify(
    {
      meta: { version: 1, baselineCalories: 2000 },
      catalog,
      days,
    },
    null,
    0
  )
);
console.log(`Wrote ${days.length} days to ${out}`);
