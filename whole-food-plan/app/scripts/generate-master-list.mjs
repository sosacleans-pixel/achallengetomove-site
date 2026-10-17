import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, "..", "data", "master-list.json");

function eat(id, label, category, grocerySection, tags = []) {
  return { id, label, category, grocerySection, tags };
}

const eatList = [
  ...["Beef", "Sirloin", "Ground beef (lean)", "Bison", "Lamb", "Venison"].map((l, i) =>
    eat(`meat_${i}`, l, "Meats", "meat_seafood", ["animal", "meat"])
  ),
  eat("pork", "Pork", "Meats", "meat_seafood", ["animal", "meat", "pork"]),
  ...["Chicken breast", "Chicken thigh", "Turkey breast", "Ground turkey", "Duck"].map((l, i) =>
    eat(`poultry_${i}`, l, "Poultry", "meat_seafood", ["animal", "poultry"])
  ),
  ...["Salmon", "Cod", "Tuna", "Trout", "Halibut", "Sardines", "Mackerel"].map((l, i) =>
    eat(`fish_${i}`, l, "Fish", "meat_seafood", ["animal", "fish"])
  ),
  ...["Shrimp", "Scallops", "Crab", "Mussels", "Clams", "Lobster"].map((l, i) =>
    eat(`shell_${i}`, l, "Seafood", "meat_seafood", ["animal", "shellfish"])
  ),
  ...[
    "Spinach",
    "Kale",
    "Arugula",
    "Romaine lettuce",
    "Mixed greens",
    "Broccoli",
    "Cauliflower",
    "Brussels sprouts",
    "Zucchini",
    "Bell peppers",
    "Tomatoes",
    "Cucumber",
    "Carrots",
    "Celery",
    "Mushrooms",
    "Asparagus",
    "Green beans",
    "Sweet potato",
    "Potato",
    "Onion",
    "Garlic",
    "Butternut squash",
    "Cabbage",
    "Bok choy",
  ].map((l, i) => eat(`veg_${i}`, l, "Vegetables", "produce", ["plant", "vegetable"])),
  ...[
    "Apples",
    "Berries",
    "Bananas",
    "Oranges",
    "Grapes",
    "Melon",
    "Pears",
    "Mango",
    "Pineapple",
    "Lemon",
    "Lime",
  ].map((l, i) => eat(`fruit_${i}`, l, "Fruits", "produce", ["plant", "fruit"])),
  eat("avocado", "Avocado", "Healthy fats", "produce", ["plant", "fruit", "fat"]),
  eat("olives", "Olives", "Healthy fats", "pantry", ["plant", "fat"]),
  eat("coconut", "Coconut (fresh)", "Healthy fats", "produce", ["plant", "fat"]),
  eat("olive_oil", "Olive oil", "Healthy fats", "pantry", ["plant", "fat"]),
  eat("avocado_oil", "Avocado oil", "Healthy fats", "pantry", ["plant", "fat"]),
  eat("coconut_oil", "Coconut oil", "Healthy fats", "pantry", ["plant", "fat"]),
  ...["Sunflower seeds", "Pumpkin seeds", "Chia seeds", "Flaxseed", "Hemp hearts", "Sesame seeds"].map((l, i) =>
    eat(`seed_${i}`, l, "Seeds", "pantry", ["plant", "seed"])
  ),
  ...["Black beans", "Kidney beans", "Chickpeas", "Lentils", "Pinto beans", "Green peas"].map((l, i) =>
    eat(`legume_${i}`, l, "Legumes", "pantry", ["plant", "legume"])
  ),
  eat("rice", "Brown rice", "Starches", "pantry", ["plant", "starch"]),
  eat("quinoa", "Quinoa", "Starches", "pantry", ["plant", "starch"]),
  eat(
    "gf_oats",
    "Certified gluten-free rolled oats",
    "Starches",
    "pantry",
    ["plant", "starch"]
  ),
  ...["Basil", "Cilantro", "Parsley", "Rosemary", "Thyme", "Cumin", "Paprika", "Turmeric", "Ginger", "Black pepper"].map(
    (l, i) => eat(`herb_${i}`, l, "Herbs & spices", "spices", ["plant", "spice"])
  ),
  eat("vinegar", "Apple cider or wine vinegar", "Pantry", "pantry", ["plant"]),
  eat("coffee", "Coffee", "Drinks", "pantry", ["plant", "drink"]),
  eat("tea", "Tea (unsweetened)", "Drinks", "pantry", ["plant", "drink"]),
  eat("broth_veg", "Vegetable broth", "Pantry", "pantry", ["plant"]),
  eat("broth_chicken", "Chicken broth", "Pantry", "pantry", ["animal", "poultry"]),
  eat("coconut_milk", "Coconut milk (unsweetened)", "Pantry", "pantry", ["plant", "fat"]),
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

writeFileSync(out, JSON.stringify({ version: 1, eat: eatList, skip: skipList }, null, 2));
console.log(`Wrote ${eatList.length} eat items to ${out}`);
