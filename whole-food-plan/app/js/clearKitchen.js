/**
 * "Clear your kitchen" prep — by food group, with items to clear + label "learned" checks.
 */

import { getAllowedEatIds } from "./masterFood.js";

const TIPS = [
  "Read labels for hidden sugar, soy, corn, and wheat — they show up in surprising places.",
  "Donate unopened items if you can, or box them up and store them out of sight for 30 days.",
  "If you share a kitchen, carve out a \"my shelf\" zone for your reset-friendly foods.",
];

const GROUP_DEFS = [
  {
    id: "grains",
    title: "Grains & breads",
    clearItems: [
      { id: "grains_bread", label: "Bread, buns, tortillas, and crackers" },
      { id: "grains_pasta", label: "Pasta, noodles, and wheat-based cereals" },
      { id: "grains_baking", label: "Flour mixes, baking mixes, and breadcrumbs" },
    ],
    labelChecks: [
      { id: "grains_l_wheat", label: "Wheat" },
      { id: "grains_l_barley", label: "Barley" },
      { id: "grains_l_rye", label: "Rye" },
      { id: "grains_l_malt", label: "Malt" },
      { id: "grains_l_enriched", label: "\"Enriched flour\"" },
      { id: "grains_l_corn", label: "Cornstarch or corn syrup" },
    ],
  },
  {
    id: "sauces",
    title: "Sauces, dressings & condiments",
    clearItems: [
      { id: "sauces_bottles", label: "Bottled dressings, BBQ sauce, and ketchup" },
      { id: "sauces_soy", label: "Soy sauce and teriyaki-style sauces" },
      { id: "sauces_spreads", label: "Sweet or savory spreads with long ingredient lists" },
    ],
    labelChecks: [
      { id: "sauces_l_sugar", label: "Added sugars (sugar, cane juice, honey, agave, syrups)" },
      { id: "sauces_l_dextrose", label: "Dextrose and words ending in -ose" },
      { id: "sauces_l_soy", label: "Soy sauce, soybean oil" },
      { id: "sauces_l_msg", label: "MSG" },
      { id: "sauces_l_carrageenan", label: "Carrageenan" },
    ],
  },
  {
    id: "snacks",
    title: "Snacks & sweets",
    clearItems: [
      { id: "snacks_chips", label: "Chips, pretzels, and snack mixes" },
      { id: "snacks_candy", label: "Candy, cookies, and pastries" },
      { id: "snacks_bars", label: "Granola bars and protein bars with sweeteners" },
    ],
    labelChecks: [
      { id: "snacks_l_sugar", label: "Added sugars" },
      { id: "snacks_l_sweeteners", label: "Artificial sweeteners (sucralose, aspartame, stevia blends, sugar alcohols)" },
      { id: "snacks_l_trans", label: "Trans fats or \"partially hydrogenated oil\"" },
      { id: "snacks_l_corn", label: "Corn syrup" },
    ],
  },
  {
    id: "oils",
    title: "Oils & fats",
    clearItems: [
      { id: "oils_margarine", label: "Margarine, shortening, and vegetable oil blends" },
      { id: "oils_bottles", label: "Bottled oils you will not use on this plan (soy, corn, canola)" },
    ],
    labelChecks: [
      { id: "oils_l_trans", label: "Trans fats" },
      { id: "oils_l_hydro", label: "Partially hydrogenated oils" },
      { id: "oils_l_margarine", label: "Margarine and shortening" },
      { id: "oils_l_soycorn", label: "Soybean, corn, canola, and generic \"vegetable oil\"" },
    ],
    keepNote:
      "Keep olive, avocado, and coconut oils if they are on your Eat list. Skip ghee unless dairy fits your plan.",
  },
  {
    id: "dairy",
    title: "Dairy",
    clearItems: [
      { id: "dairy_milk", label: "Milk, cream, and coffee creamers with dairy" },
      { id: "dairy_cheese", label: "Cheese, yogurt, and butter" },
      { id: "dairy_hidden", label: "Foods with whey, casein, or lactose" },
    ],
    labelChecks: [
      { id: "dairy_l_milk", label: "Milk" },
      { id: "dairy_l_cheese", label: "Cheese" },
      { id: "dairy_l_butter", label: "Butter" },
      { id: "dairy_l_cream", label: "Cream" },
      { id: "dairy_l_whey", label: "Whey" },
      { id: "dairy_l_casein", label: "Casein" },
      { id: "dairy_l_lactose", label: "Lactose" },
    ],
  },
  {
    id: "meats",
    title: "Meats & deli",
    clearItems: [
      { id: "meats_deli", label: "Deli meats and cured meats" },
      { id: "meats_breaded", label: "Breaded frozen meats and nuggets" },
      { id: "meats_processed", label: "Sausages and patties with fillers" },
    ],
    labelChecks: [
      { id: "meats_l_sugar", label: "Added sugar" },
      { id: "meats_l_nitrites", label: "Nitrates and nitrites" },
      { id: "meats_l_fillers", label: "Fillers" },
      { id: "meats_l_soyprot", label: "Soy protein" },
      { id: "meats_l_breading", label: "Breading" },
    ],
  },
  {
    id: "drinks",
    title: "Drinks",
    clearItems: [
      { id: "drinks_soda", label: "Sodas and sweetened drinks" },
      { id: "drinks_juice", label: "Juice with added sugar" },
      { id: "drinks_alcohol", label: "Beer, wine, and spirits" },
      { id: "drinks_creamer", label: "Flavored creamers and sweet coffee drinks" },
    ],
    labelChecks: [
      { id: "drinks_l_soda", label: "Sodas" },
      { id: "drinks_l_juice", label: "Juice with added sugar" },
      { id: "drinks_l_alcohol", label: "Alcohol" },
      { id: "drinks_l_creamer", label: "Sweet or dairy creamers" },
    ],
  },
  {
    id: "canned",
    title: "Canned & packaged",
    clearItems: [
      { id: "canned_soups", label: "Canned soups and sauces with additives" },
      { id: "canned_meals", label: "Boxed meals and instant sides" },
      { id: "canned_snacks", label: "Packaged snacks with long ingredient lists" },
    ],
    labelChecks: [
      { id: "canned_l_sugar", label: "Added sugar" },
      { id: "canned_l_sulfites", label: "Sulfites" },
      { id: "canned_l_bpa", label: "BPA-lined cans (optional — choose glass or BPA-free when you can)" },
      { id: "canned_l_sodium", label: "Very high sodium" },
      { id: "canned_l_cornsoy", label: "Corn and soy derivatives" },
    ],
  },
];

function slug(s) {
  return `extra_${String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 40)}`;
}

function gheeAllowed(profile, masterList) {
  const allowed = new Set(getAllowedEatIds(profile, masterList));
  const dairyIds = (masterList?.eat || []).filter((e) => e.tags?.includes("dairy")).map((e) => e.id);
  return dairyIds.some((id) => allowed.has(id));
}

/**
 * @param {object} masterList
 * @param {{ allergies?: string[], intolerances?: string[] }} profile
 */
export function buildKitchenChecklist(masterList, profile = {}) {
  const groups = GROUP_DEFS.map((g) => ({
    ...g,
    clearItems: [...g.clearItems],
    labelChecks: [...g.labelChecks],
  }));

  const oils = groups.find((g) => g.id === "oils");
  if (oils && !gheeAllowed(profile, masterList)) {
    oils.clearItems.push({ id: "oils_ghee", label: "Ghee (dairy — set aside for this reset)" });
  }

  const canned = groups.find((g) => g.id === "canned");
  for (const text of [...(profile.allergies || []), ...(profile.intolerances || [])]) {
    const t = text.trim();
    if (!t || !canned) continue;
    canned.clearItems.push({
      id: slug(t),
      label: `${t} — items you flagged (allergy or intolerance)`,
      isExtra: true,
    });
  }

  for (const skip of masterList?.skip || []) {
    const ex = skip.examples ? ` (${skip.examples})` : "";
    const line = { id: `skip_${skip.id}`, label: `${skip.label}${ex}` };
    if (skip.id === "dairy") groups.find((g) => g.id === "dairy")?.clearItems.push(line);
    else if (skip.id === "gluten") groups.find((g) => g.id === "grains")?.clearItems.push(line);
    else if (skip.id === "added_sugar" || skip.id === "soy")
      groups.find((g) => g.id === "sauces")?.clearItems.push(line);
    else if (skip.id === "alcohol") groups.find((g) => g.id === "drinks")?.clearItems.push(line);
    else if (skip.id === "processed") groups.find((g) => g.id === "canned")?.clearItems.push(line);
    else if (skip.id === "eggs") groups.find((g) => g.id === "meats")?.clearItems.push(line);
    else groups.find((g) => g.id === "snacks")?.clearItems.push(line);
  }

  const allItems = [];
  for (const g of groups) {
    for (const it of g.clearItems) allItems.push({ ...it, groupId: g.id, kind: "clear" });
    for (const it of g.labelChecks) allItems.push({ ...it, groupId: g.id, kind: "label" });
  }

  return { groups, allItems, tips: TIPS };
}

export function kitchenProgress(kitchenClear, checklist) {
  const items = checklist.allItems;
  if (!items.length) return { done: 0, total: 0, pct: 100 };
  const checked = kitchenClear?.checked || {};
  const done = items.filter((it) => checked[it.id]).length;
  const total = items.length;
  const pct = Math.round((done / total) * 100);
  return { done, total, pct };
}

export function groupProgress(kitchenClear, group) {
  const ids = [...group.clearItems, ...group.labelChecks].map((i) => i.id);
  const checked = kitchenClear?.checked || {};
  const done = ids.filter((id) => checked[id]).length;
  return { done, total: ids.length };
}

export function isKitchenClearComplete(kitchenClear, checklist) {
  if (kitchenClear?.completed) return true;
  const { done, total } = kitchenProgress(kitchenClear, checklist);
  return total > 0 && done >= total;
}

export function shouldShowKitchenReminder(kitchenClear) {
  if (kitchenClear?.completed) return false;
  return true;
}

export function defaultKitchenClear() {
  return { checked: {}, completed: false, skipped: false, celebrated: false, groupIndex: 0 };
}

export function clampGroupIndex(index, groupCount) {
  return Math.max(0, Math.min(groupCount - 1, index || 0));
}
