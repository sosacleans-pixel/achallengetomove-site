export const ELIMINATION_GROUPS = [
  { id: "dairy", label: "Dairy", tag: "dairy", examples: "milk, cheese, yogurt, butter" },
  { id: "gluten", label: "Gluten / wheat", tag: "gluten", examples: "wheat bread, pasta, most flour" },
  { id: "soy", label: "Soy", tag: "soy", examples: "tofu, tempeh, edamame, soy sauce" },
  { id: "corn", label: "Corn", tag: "corn", examples: "corn, corn tortillas, corn chips" },
  { id: "eggs", label: "Eggs", tag: "eggs", examples: "whole eggs and egg-based dishes" },
  { id: "peanuts", label: "Peanuts", tag: "peanuts", examples: "peanuts and peanut butter" },
  { id: "tree_nuts", label: "Tree nuts", tag: "tree_nuts", examples: "almonds, walnuts, cashews, etc." },
  { id: "added_sugar", label: "Added sugar & sweeteners", tag: "added_sugar", examples: "soda, candy, sweetened yogurt" },
  { id: "alcohol", label: "Alcohol", tag: "alcohol", examples: "wine, beer, spirits" },
  { id: "processed", label: "Ultra-processed foods", tag: "processed", examples: "long ingredient lists, additives" },
];

const TAG_LABEL = Object.fromEntries(ELIMINATION_GROUPS.map((g) => [g.tag, g.label]));

export function normalizeList(items) {
  return (items || [])
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {object} profile
 * @param {Array} foodsDb
 */
export function buildPersonalFoodList(profile, foodsDb) {
  const allergies = normalizeList(profile.allergies);
  const intolerances = normalizeList(profile.intolerances);
  const bothers = normalizeList(profile.bothersome);
  const dislikes = normalizeList(profile.avoidFoods);

  const extraAvoids = [
    ...allergies.map((a) => ({ text: a, reason: "Allergy or sensitivity you reported" })),
    ...intolerances.map((a) => ({ text: a, reason: "Intolerance you reported" })),
    ...bothers.map((a) => ({ text: a, reason: "Food that bothers you" })),
  ];

  const avoid = ELIMINATION_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    detail: `Paused for 30 days: ${g.examples}`,
  }));

  const activeTags = new Set(ELIMINATION_GROUPS.map((g) => g.tag));

  const diet = profile.dietStyle || "omnivore";

  function dietAllowed(food) {
    if (diet === "vegan") {
      if (food.category === "dairy") return false;
      if (food.tags?.includes("eggs")) return false;
      if (food.category === "protein" && !food.vegan) return false;
      return true;
    }
    if (diet === "vegetarian") {
      if (food.category === "protein" && !food.vegetarian && !food.vegan) return false;
      return true;
    }
    if (diet === "pescatarian") {
      if (food.category === "protein") {
        const name = food.name.toLowerCase();
        const isFish = /salmon|tuna|cod|shrimp|fish|sardine|trout|halibut|scallop|crab|lobster|clam|mussel|anchov|herring|sole|tilapia|catfish|octopus|squid/.test(name);
        const isMeat = /beef|pork|lamb|bison|venison|chicken|turkey|duck|bacon|hot dog|sausage|liver/.test(name);
        if (isMeat && !isFish) return false;
      }
      return true;
    }
    return true;
  }

  function matchesExtraAvoid(name) {
    const n = name.toLowerCase();
    return extraAvoids.some((e) => n.includes(e.text) || e.text.includes(n));
  }

  function matchesDislike(name) {
    const n = name.toLowerCase();
    return dislikes.some((d) => n.includes(d) || d.includes(n));
  }

  function tagBlocked(food) {
    for (const t of food.tags || []) {
      if (activeTags.has(t)) return t;
    }
    return null;
  }

  const enjoy = [];
  const seen = new Set();

  for (const food of foodsDb) {
    if (!dietAllowed(food)) continue;
    if (matchesExtraAvoid(food.name)) continue;
    if (matchesDislike(food.name)) continue;
    const blocked = tagBlocked(food);
    if (blocked) continue;
    if (seen.has(food.name)) continue;
    seen.add(food.name);
    enjoy.push({
      id: food.id,
      name: food.name,
      serving: food.serving,
      category: food.category,
      note: food.note || null,
    });
  }

  enjoy.sort((a, b) => a.name.localeCompare(b.name));

  // Diet-specific notes for enjoy section
  const enjoyNotes = [];
  if (diet === "vegan") {
    enjoyNotes.push(
      "Plant-based plan: legumes and seeds are your main proteins while soy and eggs stay paused."
    );
  }

  return {
    enjoy,
    enjoyNotes,
    avoid,
    extraAvoids,
    tagLabels: TAG_LABEL,
    activeTags: [...activeTags],
  };
}

export function tagToReason(tag) {
  return TAG_LABEL[tag] || tag;
}

const SWAPS = {
  dairy: ["Coconut yogurt (unsweetened)", "Olive oil instead of butter", "Nutritional yeast for savory flavor"],
  gluten: ["Brown rice", "Quinoa", "Rice noodles", "Potatoes or sweet potatoes"],
  soy: ["Lentils", "Chickpeas", "Chicken or fish (if you eat them)"],
  corn: ["Brown rice tortillas (check label)", "Leafy wraps", "Quinoa"],
  eggs: ["Chia pudding", "Tofu scramble (after soy reintro)", "Legume-based breakfast"],
  peanuts: ["Sunflower seed butter", "Pumpkin seeds"],
  tree_nuts: ["Sunflower seeds", "Pumpkin seeds", "Avocado for healthy fat"],
  added_sugar: ["Fresh fruit", "Cinnamon in coffee", "Sparkling water with lemon"],
  alcohol: ["Herbal tea", "Sparkling water with lime"],
  processed: ["Whole-food version you cook at home", "Simple 5-ingredient label picks"],
};

export function suggestSwap(tag, dietStyle) {
  const list = SWAPS[tag] || ["A whole-food option from your Enjoy list"];
  if (dietStyle === "vegan" && tag === "soy") {
    return ["Lentils", "Chickpeas", "Hemp hearts"];
  }
  return list.slice(0, 2);
}
