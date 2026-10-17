/** Master eat/skip list helpers */

export const BULK_TOGGLES = [
  { id: "vegetarian", label: "I'm vegetarian" },
  { id: "vegan", label: "I'm vegan" },
  { id: "no_pork", label: "No pork" },
  { id: "no_shellfish", label: "No shellfish" },
  { id: "no_fish", label: "No fish" },
];

export const REASONS = [
  { id: "allergy", label: "Allergy" },
  { id: "dont_eat", label: "Don't eat" },
  { id: "dislike", label: "Dislike" },
];

export function defaultEatSelections(masterList) {
  const sel = {};
  for (const item of masterList.eat || []) {
    sel[item.id] = { allowed: true, reason: null };
  }
  return sel;
}

export function applyDietStyle(selections, masterList, dietStyle) {
  if (!dietStyle || dietStyle === "omnivore") return selections;
  if (dietStyle === "vegan") return applyBulkToggle(selections, masterList, "vegan", false);
  if (dietStyle === "vegetarian") return applyBulkToggle(selections, masterList, "vegetarian", false);
  if (dietStyle === "pescatarian") {
    const next = { ...selections };
    for (const item of masterList.eat || []) {
      if (["meat", "poultry", "pork"].some((t) => item.tags?.includes(t))) {
        next[item.id] = { allowed: false, reason: "dont_eat" };
      }
    }
    return next;
  }
  return selections;
}

export function applyBulkToggle(selections, masterList, toggleId, allowed) {
  const eat = masterList.eat || [];
  const next = { ...selections };
  for (const item of eat) {
    let hit = false;
    if (toggleId === "vegan" && (item.tags?.includes("animal") || item.tags?.includes("honey"))) hit = true;
    if (toggleId === "vegetarian" && ["meat", "poultry", "fish", "shellfish"].some((t) => item.tags?.includes(t)))
      hit = true;
    if (toggleId === "no_pork" && item.tags?.includes("pork")) hit = true;
    if (toggleId === "no_shellfish" && item.tags?.includes("shellfish")) hit = true;
    if (toggleId === "no_fish" && item.tags?.includes("fish")) hit = true;
    if (hit) {
      next[item.id] = {
        allowed,
        reason: allowed ? null : toggleId === "vegan" || toggleId === "vegetarian" ? "dont_eat" : "dont_eat",
      };
    }
  }
  return next;
}

export function getAllowedEatIds(profile, masterList) {
  const sel = profile?.eatSelections || defaultEatSelections(masterList);
  return (masterList.eat || []).filter((e) => sel[e.id]?.allowed !== false).map((e) => e.id);
}

export function buildFoodListView(profile, masterList) {
  const sel = profile?.eatSelections || defaultEatSelections(masterList);
  const allowed = [];
  const paused = [];
  for (const item of masterList.eat || []) {
    const s = sel[item.id] || { allowed: true };
    if (s.allowed) allowed.push({ ...item, categoryLabel: item.category });
    else
      paused.push({
        ...item,
        reason: REASONS.find((r) => r.id === s.reason)?.label || "Removed from your list",
      });
  }
  const skip = (masterList.skip || []).map((g) => ({
    id: g.id,
    label: g.label,
    detail: g.why,
  }));
  const extraAvoids = (profile?.allergies || []).map((a) => ({
    text: a,
    reason: "Allergy you reported — always avoid",
  }));
  return { allowed, paused, skip, extraAvoids };
}

export function mealUsesOnlyAllowed(meal, allowedSet) {
  const ids = meal.ingredientIds || [];
  return ids.length > 0 && ids.every((id) => allowedSet.has(id));
}
