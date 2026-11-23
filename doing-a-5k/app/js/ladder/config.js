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

/* Site strings that switch with NAME_SCHEME (Attorney memo §12.4 and §12.7), for the static pages and the
 * in-app Health and safety acknowledgment. After changing NAME_SCHEME, run:
 *   node doing-a-5k/app/tools/apply-name-scheme.mjs
 * which rewrites purchase-terms, health-safety, js/health-ack.js (new text hash), the CHD policy, gear and
 * 5K to Half Marathon pages. The /doing-a-5k/ URL stays under both options. */
export const SITE_STRINGS = {
  "umbrella": {
    "termsListEn": "the A Challenge to Move running plans (Walk to 5K, 5K Faster and 10K)",
    "termsListEs": "los planes para correr de A Challenge to Move (Walk to 5K, 5K Faster y 10K)",
    "termsHeadingEn": "A Challenge to Move running plans: Walk to 5K, 5K Faster and 10K",
    "termsHeadingEs": "Planes para correr de A Challenge to Move: Walk to 5K, 5K Faster y 10K",
    "termsNavEn": "Walk to 5K, 5K Faster and 10K",
    "termsNavEs": "Walk to 5K, 5K Faster y 10K",
    "termsLeadEn": "A Challenge to Move running plans are sold as three levels: A Challenge to Move: Walk to 5K, A Challenge to Move: 5K Faster and A Challenge to Move: 10K. Plan length depends on how many days a week you train: 18, 12, 10 or 9 weeks. Your access lasts the length of your plan plus 2 extra weeks. This section applies to these plans in place of the 12-month Access Period and the gift and refund terms above, where they differ.",
    "termsLeadEs": "Los planes para correr de A Challenge to Move se venden en tres niveles: A Challenge to Move: Walk to 5K, A Challenge to Move: 5K Faster y A Challenge to Move: 10K. La duración del plan depende de cuántos días a la semana entrenes: 18, 12, 10 o 9 semanas. Tu acceso dura la duración de tu plan más 2 semanas extra. Esta sección se aplica a estos planes en lugar del Periodo de acceso de 12 meses y de los términos de regalo y reembolso de arriba, cuando sean distintos.",
    "hsListEn": "the A Challenge to Move running plans (Walk to 5K, 5K Faster and 10K)",
    "hsListEs": "los planes para correr de A Challenge to Move (Walk to 5K, 5K Faster y 10K)",
    "chd53": "including A Challenge to Move: 30 Days Before X-mas Challenge, the A Challenge to Move running plans (Walk to 5K, 5K Faster and 10K) and the 30-Day Whole Food Plan.",
    "chd65": "The 30 Days Before X-mas Challenge, the A Challenge to Move running plans (Walk to 5K, 5K Faster and 10K) and the 30-Day Whole Food Plan use email sign-in (the running plans starting [RUNNING PLANS LAUNCH DATE] and the 30-Day Whole Food Plan starting [WHOLE FOOD LAUNCH DATE]):",
    "gearTitle": "Gear for the 5K and 10K plans",
    "gearLede": "the A Challenge to Move running plans (Walk to 5K, 5K Faster and 10K) and 5K to Half Marathon plans.",
    "halfLink": "Not at 5K yet? Start with the A Challenge to Move running plans."
  },
  "doing": {
    "termsListEn": "Doing a 5K (Walk to 5K and 5K Faster), Doing a 10K",
    "termsListEs": "Doing a 5K (Walk to 5K y 5K Faster), Doing a 10K",
    "termsHeadingEn": "Doing a 5K and Doing a 10K",
    "termsHeadingEs": "Doing a 5K y Doing a 10K",
    "termsNavEn": "Doing a 5K and Doing a 10K",
    "termsNavEs": "Doing a 5K y Doing a 10K",
    "termsLeadEn": "Doing a 5K and Doing a 10K are sold as three levels: Doing a 5K: Walk to 5K, Doing a 5K: 5K Faster and Doing a 10K. Plan length depends on how many days a week you train: 18, 12, 10 or 9 weeks. Your access lasts the length of your plan plus 2 extra weeks. This section applies to these plans in place of the 12-month Access Period and the gift and refund terms above, where they differ.",
    "termsLeadEs": "Doing a 5K y Doing a 10K se venden en tres niveles: Doing a 5K: Walk to 5K, Doing a 5K: 5K Faster y Doing a 10K. La duración del plan depende de cuántos días a la semana entrenes: 18, 12, 10 o 9 semanas. Tu acceso dura la duración de tu plan más 2 semanas extra. Esta sección se aplica a estos planes en lugar del Periodo de acceso de 12 meses y de los términos de regalo y reembolso de arriba, cuando sean distintos.",
    "hsListEn": "Doing a 5K (Walk to 5K and 5K Faster), Doing a 10K",
    "hsListEs": "Doing a 5K (Walk to 5K y 5K Faster), Doing a 10K",
    "chd53": "including A Challenge to Move: 30 Days Before X-mas Challenge, Doing a 5K (Walk to 5K and 5K Faster), Doing a 10K and the 30-Day Whole Food Plan.",
    "chd65": "The 30 Days Before X-mas Challenge, Doing a 5K (Walk to 5K and 5K Faster), Doing a 10K and the 30-Day Whole Food Plan use email sign-in (Doing a 5K and Doing a 10K starting [RUNNING PLANS LAUNCH DATE] and the 30-Day Whole Food Plan starting [WHOLE FOOD LAUNCH DATE]):",
    "gearTitle": "Gear for Doing a 5K and Doing a 10K",
    "gearLede": "the Doing a 5K, Doing a 10K and 5K to Half Marathon plans.",
    "halfLink": "Not at 5K yet? Start with Doing a 5K: Walk to 5K."
  }
};
export const SITE = SITE_STRINGS[NAME_SCHEME];


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
