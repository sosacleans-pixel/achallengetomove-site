import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, "..", "data", "meals.json");

const slots = ["breakfast", "lunch", "dinner", "snack"];
const themes = [1, 2, 3, 4, 5];

function tpl(id, name, slot, ingredientIds, ingredients, steps, calories, protein, weekTags = [1, 2, 3, 4, 5]) {
  return {
    id,
    name,
    slot,
    ingredientIds,
    ingredients,
    steps,
    calories,
    protein,
    weekTags,
    logItems: [
      {
        name,
        serving: "1 serving",
        calories,
        protein,
        carbs: Math.round((calories - protein * 4) * 0.45 / 4),
        fat: Math.round((calories - protein * 4) * 0.35 / 9),
        tags: [],
      },
    ],
  };
}

const templates = [];
let n = 0;

const proteins = [
  ["poultry_0", "chicken breast"],
  ["poultry_1", "chicken thigh"],
  ["poultry_2", "turkey breast"],
  ["fish_0", "salmon"],
  ["fish_1", "cod"],
  ["fish_2", "tuna"],
  ["meat_0", "beef"],
  ["meat_2", "ground beef"],
  ["shell_0", "shrimp"],
  ["legume_0", "black beans"],
  ["legume_2", "chickpeas"],
  ["legume_3", "lentils"],
];

const vegPairs = [
  ["veg_0", "spinach"],
  ["veg_5", "broccoli"],
  ["veg_8", "bell peppers"],
  ["veg_15", "sweet potato"],
  ["veg_16", "potato"],
  ["veg_1", "kale"],
];

const starches = ["rice", "quinoa", "gf_oats", "veg_15", "veg_16"];
const fats = ["olive_oil", "avocado", "avocado_oil"];

// Breakfast templates
for (const [sid, starch] of [["gf_oats", "oats"], ["rice", "rice"], ["quinoa", "quinoa"]]) {
  templates.push(
    tpl(
      `b${++n}`,
      `Warm ${starch === "oats" ? "GF oat" : starch} bowl with berries`,
      "breakfast",
      [sid, "fruit_1", "seed_0", "tea"],
      [
        `1/2 cup ${starch === "oats" ? "certified gluten-free rolled oats" : starch}`,
        "1/2 cup berries",
        "1 tbsp sunflower seeds",
        "Herbal tea or coffee",
      ],
      ["Cook grain if needed.", "Top with berries and seeds."],
      340,
      11,
      [1, 2]
    )
  );
}

for (const [pid, pname] of proteins.filter((p) => !p[0].startsWith("shell"))) {
  if (pid.startsWith("legume")) {
    templates.push(
      tpl(
        `b${++n}`,
        `${pname} breakfast bowl`,
        "breakfast",
        [pid, "veg_0", "olive_oil", "herb_0"],
        [`1/2 cup ${pname}`, "Sautéed spinach", "Olive oil", "Herbs"],
        ["Warm beans with spinach.", "Season and serve."],
        320,
        18,
        [1, 3]
      )
    );
  }
}

// Lunch/dinner combos
for (const [pid, pname] of proteins) {
  for (const [vid, vname] of vegPairs.slice(0, 4)) {
    const starch = starches[n % starches.length];
    templates.push(
      tpl(
        `l${++n}`,
        `${pname} with ${vname} & starch`,
        "lunch",
        [pid, vid, starch, "olive_oil", "garlic" in {} ? "veg_20" : "veg_19"],
        [`4 oz ${pname}`, `1 cup ${vname}`, "Cooked starch", "Olive oil", "Garlic"],
        ["Cook protein.", "Roast or sauté vegetables.", "Serve together."],
        420,
        pid.startsWith("legume") ? 22 : 35,
        [2, 3, 4]
      )
    );
    templates.push(
      tpl(
        `d${++n}`,
        `Sheet-pan ${pname} dinner`,
        "dinner",
        [pid, vid, "veg_5", "olive_oil", "herb_1"],
        [`4 oz ${pname}`, vname, "Broccoli", "Olive oil", "Herbs"],
        ["Roast at 400°F until done.", "Season to taste."],
        450,
        pid.startsWith("legume") ? 20 : 38,
        [2, 3, 4]
      )
    );
  }
}

// Salads
for (const [pid, pname] of proteins.slice(0, 8)) {
  templates.push(
    tpl(
      `l${++n}`,
      `${pname} power salad`,
      "lunch",
      [pid, "veg_3", "veg_8", "avocado", "olive_oil", "vinegar"],
      [pname, "Greens", "Peppers", "Avocado", "Dressing"],
      ["Layer salad.", "Top with protein."],
      400,
      32,
      [2, 4]
    )
  );
}

// Snacks
const snacks = [
      ["fruit_0", "apple", "seed_0"],
      ["fruit_1", "berries", "seed_2"],
      ["veg_9", "cucumber", "legume_2"],
      ["veg_8", "peppers", "seed_1"],
    ];
for (const [fid, fname, sid] of snacks) {
  templates.push(
    tpl(
      `s${++n}`,
      `${fname} snack plate`,
      "snack",
      [fid, sid],
      [fname, "Seeds or hummus"],
      ["Prep and enjoy."],
      180,
      6,
      [1, 2, 3, 4, 5]
    )
  );
}

// Fish-focused
for (const f of ["fish_0", "fish_1", "fish_3", "shell_0", "shell_1"]) {
  templates.push(
    tpl(
      `d${++n}`,
      `Lemon ${f} with greens`,
      "dinner",
      [f, "veg_0", "rice", "lemon" in {} ? "fruit_9" : "fruit_9", "olive_oil"],
      ["Fish or seafood", "Greens", "Rice", "Lemon", "Olive oil"],
      ["Bake fish.", "Steam greens.", "Serve with rice."],
      430,
      34,
      [3, 4]
    )
  );
}

// Fix lemon id - use fruit_9 for lemon
templates.forEach((t) => {
  t.ingredientIds = t.ingredientIds.map((id) => (id === "lemon" ? "fruit_9" : id));
  if (!t.ingredientIds.includes("veg_19") && t.ingredients.some((i) => /garlic/i.test(i))) {
    if (!t.ingredientIds.includes("veg_19")) t.ingredientIds.push("veg_19");
  }
});

// More variety bowls
for (let i = 0; i < 15; i++) {
  const p = proteins[i % proteins.length][0];
  const v = vegPairs[i % vegPairs.length][0];
  const s = starches[i % starches.length];
  templates.push(
    tpl(
      `m${++n}`,
      `Week ${(i % 4) + 1} grain bowl ${i + 1}`,
      i % 3 === 0 ? "breakfast" : i % 3 === 1 ? "lunch" : "dinner",
      [p, v, s, fats[i % fats.length], `herb_${i % 5}`],
      ["Protein", "Vegetable", "Starch", "Healthy fat", "Spice"],
      ["Batch cook components.", "Assemble bowl."],
      380 + (i % 5) * 20,
      20 + (i % 8) * 2,
      [(i % 4) + 1]
    )
  );
}

// Deduplicate by id
const byId = new Map();
for (const t of templates) byId.set(t.id, t);
const unique = [...byId.values()];

// Ensure 80+
while (unique.length < 85) {
  const i = unique.length;
  unique.push(
    tpl(
      `x${i}`,
      `Simple plate ${i}`,
      slots[i % 4],
      [proteins[i % proteins.length][0], vegPairs[i % vegPairs.length][0], fats[0]],
      ["Protein portion", "Vegetable", "Olive oil"],
      ["Cook simply.", "Plate and eat."],
      350,
      25,
      themes
    )
  );
}

writeFileSync(
  out,
  JSON.stringify(
    {
      meta: { version: 2, templateCount: unique.length, baselineCalories: 2000 },
      templates: unique,
    },
    null,
    0
  )
);
console.log(`Wrote ${unique.length} templates to ${out}`);
