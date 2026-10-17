import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, "..", "data", "master-list.json");

function eat(id, label, category, grocerySection, tags, macroGroup, nutrition = {}) {
  const base = {
    serving: "1 serving",
    calories: 100,
    protein: 8,
    carbs: 8,
    fat: 3,
    macrosApproximate: true,
  };
  return {
    id,
    label,
    category,
    grocerySection,
    tags,
    macroGroup,
    ...base,
    ...nutrition,
  };
}

const eatList = [
  ...["Beef", "Sirloin", "Ground beef (lean)", "Bison", "Lamb", "Venison"].map((l, i) =>
    eat(`meat_${i}`, l, "Meats", "meat_seafood", ["animal", "meat"], "protein", {
      serving: "4 oz cooked",
      calories: 180,
      protein: 26,
      carbs: 0,
      fat: 8,
    })
  ),
  eat("pork", "Pork", "Meats", "meat_seafood", ["animal", "meat", "pork"], "protein", {
    serving: "4 oz cooked",
    calories: 165,
    protein: 24,
    carbs: 0,
    fat: 7,
  }),
  ...["Chicken breast", "Chicken thigh", "Turkey breast", "Ground turkey", "Duck"].map((l, i) =>
    eat(`poultry_${i}`, l, "Poultry", "meat_seafood", ["animal", "poultry"], "protein", {
      serving: "4 oz cooked",
      calories: 165,
      protein: 28,
      carbs: 0,
      fat: 5,
    })
  ),
  ...["Salmon", "Cod", "Tuna", "Trout", "Halibut", "Sardines", "Mackerel"].map((l, i) =>
    eat(`fish_${i}`, l, "Fish", "meat_seafood", ["animal", "fish"], "protein", {
      serving: "4 oz cooked",
      calories: 175,
      protein: 24,
      carbs: 0,
      fat: 8,
    })
  ),
  ...["Shrimp", "Scallops", "Crab", "Mussels", "Clams", "Lobster"].map((l, i) =>
    eat(`shell_${i}`, l, "Seafood", "meat_seafood", ["animal", "shellfish"], "protein", {
      serving: "4 oz cooked",
      calories: 120,
      protein: 22,
      carbs: 2,
      fat: 2,
    })
  ),
  ...[
    ["Spinach", 20, 3, 3, 0],
    ["Kale", 15, 2, 2, 0],
    ["Arugula", 10, 1, 2, 0],
    ["Romaine lettuce", 15, 1, 3, 0],
    ["Mixed greens", 15, 1, 3, 0],
    ["Broccoli", 55, 4, 11, 1],
    ["Cauliflower", 30, 2, 5, 0],
    ["Brussels sprouts", 80, 4, 12, 3],
    ["Zucchini", 30, 2, 5, 0],
    ["Bell peppers", 35, 1, 7, 0],
    ["Tomatoes", 25, 1, 5, 0],
    ["Cucumber", 15, 1, 4, 0],
    ["Carrots", 50, 1, 12, 0],
    ["Celery", 15, 1, 3, 0],
    ["Mushrooms", 20, 2, 3, 0],
    ["Asparagus", 40, 4, 8, 0],
    ["Green beans", 45, 2, 10, 0],
    ["Onion", 30, 1, 7, 0],
    ["Garlic", 15, 1, 3, 0],
    ["Cabbage", 25, 1, 5, 0],
    ["Bok choy", 20, 3, 3, 0],
  ].map(([l, cal, p, c, f], i) =>
    eat(`veg_${i}`, l, "Vegetables", "produce", ["plant", "vegetable"], "vegetables", {
      serving: "1 cup",
      calories: cal,
      protein: p,
      carbs: c,
      fat: f,
    })
  ),
  eat("veg_17", "Sweet potato", "Vegetables", "produce", ["plant", "vegetable", "starch"], "carbs", {
    serving: "1 medium",
    calories: 115,
    protein: 2,
    carbs: 27,
    fat: 0,
  }),
  eat("veg_18", "Potato", "Vegetables", "produce", ["plant", "vegetable", "starch"], "carbs", {
    serving: "1 medium",
    calories: 165,
    protein: 4,
    carbs: 37,
    fat: 0,
  }),
  eat("veg_19", "Butternut squash", "Vegetables", "produce", ["plant", "vegetable", "starch"], "carbs", {
    serving: "1 cup",
    calories: 80,
    protein: 2,
    carbs: 21,
    fat: 0,
  }),
  ...[
    ["Apples", 95, 0, 25],
    ["Berries", 85, 1, 21],
    ["Bananas", 105, 1, 27],
    ["Oranges", 65, 1, 16],
    ["Grapes", 105, 1, 27],
    ["Melon", 50, 1, 12],
    ["Pears", 100, 1, 27],
    ["Mango", 100, 1, 25],
    ["Pineapple", 85, 1, 22],
    ["Lemon", 10, 0, 3],
    ["Lime", 10, 0, 3],
  ].map(([l, cal, p, c], i) =>
    eat(`fruit_${i}`, l, "Fruits", "produce", ["plant", "fruit"], "carbs", {
      serving: "1 serving",
      calories: cal,
      protein: p,
      carbs: c,
      fat: 0,
    })
  ),
  eat("avocado", "Avocado", "Healthy fats", "produce", ["plant", "fruit", "fat"], "fat", {
    serving: "1/2 medium",
    calories: 120,
    protein: 1,
    carbs: 6,
    fat: 11,
  }),
  eat("olives", "Olives", "Healthy fats", "pantry", ["plant", "fat"], "fat", {
    serving: "10 olives",
    calories: 50,
    protein: 0,
    carbs: 2,
    fat: 5,
  }),
  eat("coconut", "Coconut (fresh)", "Healthy fats", "produce", ["plant", "fat"], "fat", {
    serving: "1/4 cup",
    calories: 90,
    protein: 1,
    carbs: 4,
    fat: 8,
  }),
  eat("olive_oil", "Olive oil", "Healthy fats", "pantry", ["plant", "fat"], "fat", {
    serving: "1 tbsp",
    calories: 120,
    protein: 0,
    carbs: 0,
    fat: 14,
  }),
  eat("avocado_oil", "Avocado oil", "Healthy fats", "pantry", ["plant", "fat"], "fat", {
    serving: "1 tbsp",
    calories: 120,
    protein: 0,
    carbs: 0,
    fat: 14,
  }),
  eat("coconut_oil", "Coconut oil", "Healthy fats", "pantry", ["plant", "fat"], "fat", {
    serving: "1 tbsp",
    calories: 120,
    protein: 0,
    carbs: 0,
    fat: 14,
  }),
  ...["Sunflower seeds", "Pumpkin seeds", "Chia seeds", "Flaxseed", "Hemp hearts", "Sesame seeds"].map((l, i) =>
    eat(`seed_${i}`, l, "Seeds", "pantry", ["plant", "seed", "fat"], "fat", {
      serving: "1 oz",
      calories: 160,
      protein: 6,
      carbs: 6,
      fat: 14,
    })
  ),
  ...["Black beans", "Kidney beans", "Chickpeas", "Lentils", "Pinto beans", "Green peas"].map((l, i) =>
    eat(`legume_${i}`, l, "Legumes", "pantry", ["plant", "legume"], "protein", {
      serving: "1/2 cup cooked",
      calories: 120,
      protein: 8,
      carbs: 20,
      fat: 1,
    })
  ),
  eat("rice", "Brown rice", "Starches", "pantry", ["plant", "starch"], "carbs", {
    serving: "1/2 cup cooked",
    calories: 110,
    protein: 3,
    carbs: 23,
    fat: 1,
  }),
  eat("quinoa", "Quinoa", "Starches", "pantry", ["plant", "starch"], "carbs", {
    serving: "1/2 cup cooked",
    calories: 110,
    protein: 4,
    carbs: 20,
    fat: 2,
  }),
  eat("gf_oats", "Certified gluten-free rolled oats", "Starches", "pantry", ["plant", "starch"], "carbs", {
    serving: "1/2 cup dry",
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
  }),
  ...["Basil", "Cilantro", "Parsley", "Rosemary", "Thyme", "Cumin", "Paprika", "Turmeric", "Ginger", "Black pepper"].map(
    (l, i) =>
      eat(`herb_${i}`, l, "Herbs & spices", "spices", ["plant", "spice"], "flavor", {
        serving: "1 tsp",
        calories: 5,
        protein: 0,
        carbs: 1,
        fat: 0,
      })
  ),
  eat("vinegar", "Apple cider or wine vinegar", "Pantry", "pantry", ["plant"], "flavor", {
    serving: "1 tbsp",
    calories: 3,
    protein: 0,
    carbs: 0,
    fat: 0,
  }),
  eat("coffee", "Coffee", "Drinks", "pantry", ["plant", "drink"], "flavor", {
    serving: "8 fl oz",
    calories: 2,
    protein: 0,
    carbs: 0,
    fat: 0,
  }),
  eat("tea", "Tea (unsweetened)", "Drinks", "pantry", ["plant", "drink"], "flavor", {
    serving: "8 fl oz",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  }),
  eat("broth_veg", "Vegetable broth", "Pantry", "pantry", ["plant"], "flavor", {
    serving: "1 cup",
    calories: 15,
    protein: 0,
    carbs: 2,
    fat: 0,
  }),
  eat("broth_chicken", "Chicken broth", "Pantry", "pantry", ["animal", "poultry"], "flavor", {
    serving: "1 cup",
    calories: 15,
    protein: 2,
    carbs: 1,
    fat: 0,
  }),
  eat("coconut_milk", "Coconut milk (unsweetened)", "Pantry", "pantry", ["plant", "fat"], "fat", {
    serving: "1/4 cup",
    calories: 110,
    protein: 1,
    carbs: 2,
    fat: 11,
  }),
];

const skipList = [
  {
    id: "dairy",
    label: "Dairy",
    why: "Paused to notice how you feel without milk-based foods. Reintroduce slowly after Day 30 if you choose.",
    examples: "milk, cheese, yogurt, butter, whey",
  },
  {
    id: "gluten",
    label: "Gluten / wheat",
    why: "Paused while you focus on whole foods; many people use this break to spot sensitivity. Use certified GF grains when oats or grains are on your Eat list.",
    examples: "wheat bread, pasta, most flour (except GF labeled)",
  },
  {
    id: "soy",
    label: "Soy",
    why: "Removed for 30 days as a common sensitivity; legumes like lentils and chickpeas stay if they are on your Eat list.",
    examples: "tofu, tempeh, soy sauce, edamame",
  },
  {
    id: "corn",
    label: "Corn",
    why: "Paused as a frequent additive and sensitivity; choose other starches from your Eat list.",
    examples: "corn, corn tortillas, corn starch in packaged foods",
  },
  {
    id: "eggs",
    label: "Eggs",
    why: "Paused for the reset period; plant proteins and meats (if you eat them) cover protein needs.",
    examples: "whole eggs and dishes made with egg",
  },
  {
    id: "peanuts",
    label: "Peanuts",
    why: "Paused with other common triggers; seeds like sunflower or pumpkin can replace crunch and fat.",
    examples: "peanuts and peanut butter",
  },
  {
    id: "tree_nuts",
    label: "Tree nuts",
    why: "Paused for 30 days; seeds and avocado can fill healthy-fat slots if they are on your Eat list.",
    examples: "almonds, walnuts, cashews, and other tree nuts",
  },
  {
    id: "added_sugar",
    label: "Added sugar & sweeteners",
    why: "Helps reset taste buds and steady energy; fruit on your Eat list is still welcome.",
    examples: "soda, candy, sweeteners, sweetened drinks",
  },
  {
    id: "alcohol",
    label: "Alcohol",
    why: "Less is better for sleep and cravings during the reset.",
    examples: "wine, beer, spirits",
  },
  {
    id: "processed",
    label: "Processed foods & additives",
    why: "Keeps meals close to real ingredients you could cook at home.",
    examples: "long ingredient lists, artificial additives, ultra-processed snacks",
  },
];

writeFileSync(out, JSON.stringify({ version: 2, eat: eatList, skip: skipList }, null, 2));
console.log(`Wrote ${eatList.length} eat items to ${out}`);
