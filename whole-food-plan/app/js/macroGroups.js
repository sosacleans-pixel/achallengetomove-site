/** Macro groups for meal building and onboarding picker */

export const MACRO_PICKER_VERSION = 1;

export const MACRO_GROUPS = [
  {
    id: "protein",
    label: "Proteins",
    shortLabel: "Protein",
    min: 3,
    hint: "Pick at least 3 proteins so lunches and dinners stay varied.",
  },
  {
    id: "carbs",
    label: "Carbs",
    shortLabel: "Carbs",
    min: 3,
    hint: "Starches, fruit, and gluten-free grains (rice, quinoa, certified GF oats).",
  },
  {
    id: "fat",
    label: "Healthy fats",
    shortLabel: "Fats",
    min: 2,
    hint: "Pick at least 2 fat sources for cooking and fullness.",
  },
  {
    id: "vegetables",
    label: "Vegetables",
    shortLabel: "Veggies",
    min: 4,
    hint: "Pick at least 4 vegetables for color and fiber on your plate.",
  },
  {
    id: "flavor",
    label: "Flavor & extras",
    shortLabel: "Extras",
    min: 0,
    hint: "Herbs, spices, broth, and drinks — optional but helpful.",
  },
];

const STARCHY_VEG_LABELS = new Set([
  "Sweet potato",
  "Potato",
  "Butternut squash",
]);

export function macroGroupForItem(item) {
  if (item.macroGroup) return item.macroGroup;
  const tags = item.tags || [];
  if (tags.some((t) => ["meat", "poultry", "fish", "shellfish", "legume"].includes(t))) return "protein";
  if (tags.includes("starch")) return "carbs";
  if (tags.includes("fruit") && !tags.includes("fat")) return "carbs";
  if (STARCHY_VEG_LABELS.has(item.label)) return "carbs";
  if (tags.includes("vegetable")) return "vegetables";
  if (tags.includes("fat") || tags.includes("seed")) return "fat";
  if (tags.includes("spice") || tags.includes("drink")) return "flavor";
  return "flavor";
}

export function itemsInMacroGroup(masterList, groupId) {
  return (masterList.eat || []).filter((item) => macroGroupForItem(item) === groupId);
}

export function countSelectedInGroup(masterList, selections, groupId) {
  const ids = itemsInMacroGroup(masterList, groupId).map((i) => i.id);
  return ids.filter((id) => selections[id]?.allowed !== false).length;
}

export function validateMacroGroup(masterList, selections, groupId) {
  const group = MACRO_GROUPS.find((g) => g.id === groupId);
  if (!group || group.min === 0) return { ok: true };
  const count = countSelectedInGroup(masterList, selections, groupId);
  if (count >= group.min) return { ok: true };
  return {
    ok: false,
    message: `Choose at least ${group.min} ${group.label.toLowerCase()} — you have ${count} selected. ${group.hint}`,
  };
}

export function validateAllMacroMinimums(masterList, selections) {
  for (const g of MACRO_GROUPS) {
    const r = validateMacroGroup(masterList, selections, g.id);
    if (!r.ok) return r;
  }
  return { ok: true };
}

export function getMacroNutrition(item) {
  return {
    serving: item.serving || "1 serving",
    calories: item.calories ?? 100,
    protein: item.protein ?? 5,
    carbs: item.carbs ?? 10,
    fat: item.fat ?? 3,
    approximate: item.macrosApproximate !== false,
  };
}
