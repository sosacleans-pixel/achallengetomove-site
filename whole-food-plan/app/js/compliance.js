import { tagToReason, suggestSwap, normalizeList } from "./foodList.js";

const KEYWORD_TAGS = [
  { words: ["cheese", "milk", "yogurt", "butter", "cream", "whey", "ghee"], tag: "dairy" },
  { words: ["wheat", "bread", "pasta", "flour", "gluten", "barley", "rye"], tag: "gluten" },
  { words: ["soy", "tofu", "tempeh", "edamame"], tag: "soy" },
  { words: ["corn", "tortilla chip"], tag: "corn" },
  { words: ["egg"], tag: "eggs" },
  { words: ["peanut"], tag: "peanuts" },
  { words: ["almond", "walnut", "cashew", "pecan", "pistachio", "hazelnut", "macadamia"], tag: "tree_nuts" },
  { words: ["wine", "beer", "vodka", "whiskey", "alcohol"], tag: "alcohol" },
  { words: ["soda", "candy", "cookie", "sugar", "syrup", "sweetened"], tag: "added_sugar" },
];

function detectTagsFromName(name) {
  const n = name.toLowerCase();
  const tags = new Set();
  for (const { words, tag } of KEYWORD_TAGS) {
    if (words.some((w) => n.includes(w))) tags.add(tag);
  }
  return [...tags];
}

function matchesExtra(name, extraAvoids) {
  const n = name.toLowerCase();
  for (const e of extraAvoids || []) {
    const t = (e.text || e).toLowerCase();
    if (n.includes(t) || t.includes(n)) return e.reason || e.text || e;
  }
  return null;
}

/**
 * @returns {{ status: 'on'|'off'|'check', reason?: string, swaps?: string[] }}
 */
export function checkFoodItem(food, profile, foodList) {
  const name = food.name || "";
  const tags = [...(food.tags || []), ...detectTagsFromName(name)];
  const uniqueTags = [...new Set(tags)];

  const extra = matchesExtra(name, foodList?.extraAvoids);
  if (extra) {
    return {
      status: "off",
      reason: `On your extra avoid list: ${typeof extra === "string" ? extra : extra}`,
      swaps: ["Choose something from your Enjoy list instead"],
    };
  }

  if (food.packaged || food.customPackaged) {
    const blocked = uniqueTags.find((t) => foodList?.activeTags?.includes(t));
    if (blocked) {
      return {
        status: "off",
        reason: `Contains ${tagToReason(blocked).toLowerCase()}`,
        swaps: suggestSwap(blocked, profile?.dietStyle),
      };
    }
    return {
      status: "check",
      reason: "Packaged or custom item — check the label (5 ingredients or fewer).",
      swaps: [],
    };
  }

  const active = new Set(foodList?.activeTags || []);
  for (const t of uniqueTags) {
    if (active.has(t)) {
      return {
        status: "off",
        reason: `Contains ${tagToReason(t).toLowerCase()}`,
        swaps: suggestSwap(t, profile?.dietStyle),
      };
    }
  }

  // User-listed allergies as keywords
  const allergyHits = normalizeList(profile?.allergies).filter((a) =>
    name.toLowerCase().includes(a)
  );
  if (allergyHits.length) {
    return {
      status: "off",
      reason: `Matches your allergy: ${allergyHits[0]}`,
      swaps: ["Skip this and pick from Enjoy"],
    };
  }

  return { status: "on", reason: "On plan" };
}
