/* PREVIEW PLACEHOLDERS, all in one place, pending Salim's decisions (Attorney memo §11.10, Coach Fit v6 §0).
 * Nothing here is final. Change a single line to switch.
 *
 * Names: the Attorney's recommended umbrella is the preview default. The fallback keeps "Doing a 5K" for the
 * first two levels and uses "Doing a 10K" for the third. Never "Doing a 5K: 10K" (Attorney §11.1). */
export const NAME_SCHEME = "umbrella"; // "umbrella" | "doing"

export const NAME_SCHEMES = {
  umbrella: {
    house: "A Challenge to Move",
    group: "5K and 10K plans",
    levels: {
      "walk-to-5k": "A Challenge to Move: Walk to 5K",
      "5k-faster": "A Challenge to Move: 5K Faster",
      "10k": "A Challenge to Move: 10K",
    },
  },
  doing: {
    house: "Doing a 5K",
    group: "5K and 10K plans",
    levels: {
      "walk-to-5k": "Doing a 5K: Walk to 5K",
      "5k-faster": "Doing a 5K: 5K Faster",
      "10k": "Doing a 10K",
    },
  },
};

export const NAMES = NAME_SCHEMES[NAME_SCHEME];

/* Access placeholder: plan length + 2 weeks (Attorney §11.2). Exact end date is shown before purchase. */
export const PLAN_WEEKS_BY_DAYS = { 2: 18, 3: 12, 4: 10, 5: 9 };
export const ACCESS_WEEKS_BY_DAYS = { 2: 20, 3: 14, 4: 12, 5: 11 };

/* Prices placeholder (Coach Fit Q1 recommendation). Restart and repeat stay $2.99. */
export const PRICES = { "walk-to-5k": "6.99", "5k-faster": "6.99", "10k": "6.99", restart: "2.99", repeat: "2.99" };

/* Count-up timer caps, seconds (placeholders: Coach Fit Q3 and Q4). 10K check-in 90:00 (proposal).
 * Walk to 5K 5K sessions: 45:00 decided, 60:00 proposed (set 3600 to switch). 5K Faster trials: 45:00. */
export const TIMER_CAPS = {
  "10k-open": { "10k": 5400 },
  "5k-open": { "walk-to-5k": 2700, "5k-faster": 2700 },
};

export const PREVIEW_PLACEHOLDER_NOTE =
  "Preview placeholders: level names, prices, access lengths and timer caps are not decided yet.";
