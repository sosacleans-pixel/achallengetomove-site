import { buildFoodListView } from "./masterFood.js";

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

export function buildPersonalFoodList(profile, masterList) {
  const view = buildFoodListView(profile, masterList);
  const enjoy = view.allowed.map((a) => ({
    id: a.id,
    name: a.label,
    serving: a.category,
    category: a.category,
    note: a.id === "gf_oats"
      ? "Use certified gluten-free oats during the gluten pause; regular oats are often cross-contaminated."
      : null,
  }));
  return {
    enjoy,
    enjoyNotes: [],
    avoid: view.skip.map((s) => ({ id: s.id, label: s.label, detail: s.detail })),
    extraAvoids: view.extraAvoids,
    paused: view.paused,
    tagLabels: TAG_LABEL,
    activeTags: ELIMINATION_GROUPS.map((g) => g.tag),
  };
}

export function tagToReason(tag) {
  return TAG_LABEL[tag] || tag;
}

const SWAPS = {
  dairy: ["Coconut milk (unsweetened)", "Olive oil instead of butter"],
  gluten: ["Brown rice", "Quinoa", "Certified gluten-free rolled oats"],
  soy: ["Lentils", "Chickpeas", "Chicken or fish (if on your Eat list)"],
  corn: ["Brown rice", "Quinoa", "Potatoes"],
  eggs: ["Chia pudding", "Legume-based breakfast"],
  peanuts: ["Sunflower seeds", "Pumpkin seeds"],
  tree_nuts: ["Sunflower seeds", "Pumpkin seeds", "Avocado (if on your list)"],
  added_sugar: ["Fresh fruit", "Cinnamon in coffee"],
  alcohol: ["Herbal tea", "Sparkling water with lime"],
  processed: ["Simple whole-food version you cook at home"],
};

export function suggestSwap(tag) {
  return (SWAPS[tag] || ["Choose from your Eat list"]).slice(0, 2);
}
