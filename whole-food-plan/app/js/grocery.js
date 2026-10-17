const SECTION_LABELS = {
  produce: "Produce",
  meat_seafood: "Meat & seafood",
  pantry: "Pantry",
  spices: "Spices",
  frozen: "Frozen",
};

export function programWeekForDay(day) {
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

export function daysForGroceryScope(scope, week) {
  if (scope === "month") return Array.from({ length: 30 }, (_, i) => i + 1);
  const start = (week - 1) * 7 + 1;
  const end = week === 4 ? 30 : week * 7;
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/** @returns {{ items: Array<{key,label,section,count}>, totalLines: number }} */
export function buildGroceryFromPlan(plan, masterList, scope, week = 1) {
  const masterById = Object.fromEntries((masterList.eat || []).map((e) => [e.id, e]));
  const dayNums = daysForGroceryScope(scope, week);
  const counts = new Map();

  for (const dayNum of dayNums) {
    const day = plan?.days?.find((d) => d.day === dayNum);
    if (!day) continue;
    for (const slot of Object.keys(day.meals || {})) {
      const meal = day.meals[slot];
      if (!meal) continue;
      for (const id of meal.ingredientIds || []) {
        const m = masterById[id];
        const label = m?.label || id;
        const section = m?.grocerySection || "pantry";
        const key = `${section}::${label}`;
        counts.set(key, { label, section, count: (counts.get(key)?.count || 0) + 1 });
      }
    }
  }

  const items = [...counts.values()]
    .map((v) => ({ ...v, key: `${v.section}::${v.label}` }))
    .sort((a, b) => a.section.localeCompare(b.section) || a.label.localeCompare(b.label));

  const totalLines = items.reduce((s, i) => s + i.count, 0);
  return { items, totalLines, sectionLabels: SECTION_LABELS };
}

/** Grocery items for one planned meal. */
export function buildGroceryFromMeal(meal, masterList) {
  const masterById = Object.fromEntries((masterList.eat || []).map((e) => [e.id, e]));
  const counts = new Map();
  for (const id of meal?.ingredientIds || []) {
    const m = masterById[id];
    const label = m?.label || id;
    const section = m?.grocerySection || "pantry";
    const key = `${section}::${label}`;
    counts.set(key, { label, section, count: (counts.get(key)?.count || 0) + 1 });
  }
  const items = [...counts.values()]
    .map((v) => ({ ...v, key: `${v.section}::${v.label}` }))
    .sort((a, b) => a.section.localeCompare(b.section) || a.label.localeCompare(b.label));
  const totalLines = items.reduce((s, i) => s + i.count, 0);
  return { items, totalLines, sectionLabels: SECTION_LABELS };
}

export function groceryListPlainText(grouped) {
  const lines = [];
  const bySection = {};
  for (const item of grouped.items) {
    if (!bySection[item.section]) bySection[item.section] = [];
    bySection[item.section].push(item);
  }
  for (const [sec, items] of Object.entries(bySection)) {
    lines.push(SECTION_LABELS[sec] || sec);
    for (const it of items) {
      lines.push(`  • ${it.label}${it.count > 1 ? ` (×${it.count})` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function groceryListText(grouped, checkedMap) {
  const lines = [];
  const bySection = {};
  for (const item of grouped.items) {
    if (!bySection[item.section]) bySection[item.section] = [];
    bySection[item.section].push(item);
  }
  for (const [sec, items] of Object.entries(bySection)) {
    lines.push(SECTION_LABELS[sec] || sec);
    for (const it of items) {
      const mark = checkedMap?.[it.key] ? "[x]" : "[ ]";
      lines.push(`  ${mark} ${it.label}${it.count > 1 ? ` (×${it.count})` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
