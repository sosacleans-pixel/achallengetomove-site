/* Running plan settings, all in one place. Decided by Salim on Nov 22, 2026, 8:38 PM MT: the
 * A Challenge to Move umbrella names, $6.99 per level, $2.99 restart and repeat, access = plan length + 2 weeks,
 * Walk to 5K 5K-session cap 60:00, 10K check-in cap 90:00. Launch dates are still placeholders (below).
 *
 * Names: umbrella (decided). The "doing" scheme is kept as the Attorney-approved fallback: "Doing a 5K" for the
 * first two levels and "Doing a 10K" for the third. Never "Doing a 5K: 10K" (Attorney §11.1). */
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
    "gearTitle": "Gear for the 5K and 10K plans",
    "gearLede": "the A Challenge to Move running plans (Walk to 5K, 5K Faster and 10K) and 5K to Half Marathon plans.",
    "halfLink": "Not at 5K yet? Start with the A Challenge to Move running plans.",
    "gearBackEn": "Back to the 5K and 10K plans",
    "gearBackEs": "Volver a los planes de 5K y 10K"
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
    "gearTitle": "Gear for Doing a 5K and Doing a 10K",
    "gearLede": "the Doing a 5K, Doing a 10K and 5K to Half Marathon plans.",
    "halfLink": "Not at 5K yet? Start with Doing a 5K: Walk to 5K.",
    "gearBackEn": "Back to Doing a 5K and Doing a 10K",
    "gearBackEs": "Volver a Doing a 5K y Doing a 10K"
  }
};

/* Email sign-in start dates for the CHD policy (Attorney memo §13.1). Placeholders until Salim supplies the
 * facts. One date per running plan level, so the plans can start on different days; when they share a date
 * the approved shared-date wording is used. */
export const LAUNCH_DATES = {
  // Go-live day (Salim, Nov 22, 2026 10:50 PM MT: launch as soon as ready). The 30-Day Whole Food Plan is left out of
  // the sign-in line for now (Salim, 10:53 PM MT): it has no email sign-in yet.
  "walk-to-5k": "2026-11-22",
  "5k-faster": "2026-11-22",
  "10k": "2026-11-22",
};

/* CHD policy line 65 (email sign-in), EN and ES, for either name scheme. Running plans only: the 30-Day Whole Food
 * Plan is left out until it actually uses email sign-in (Salim, Nov 22, 2026 10:53 PM MT). Otherwise the Attorney's
 * §13.1 wording, PENDING ATTORNEY OK of the Whole Food removal. When the running-plan dates differ (§14.7), levels that
 * share a date are grouped and each date (YYYY-MM-DD) is written in the page's language; placeholders pass through. */
export function fmtLaunchDate(x, lang = "en") {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(x));
  if (!m) return x;
  return new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
}
function groupByDate(items, lang) {
  const and = lang === "es" ? " y " : " and ";
  const groups = [];
  for (const [name, date] of items) {
    const g = groups.find((x) => x.date === date);
    if (g) g.names.push(name); else groups.push({ date, names: [name] });
  }
  const parts = groups.map((g) => `${g.names.join(and)} ${lang === "es" ? "a partir del" : "starting"} ${fmtLaunchDate(g.date, lang)}`);
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")}, ${lang === "es" ? "y" : "and"} ${parts[parts.length - 1]}`;
}
export function chd65(scheme = NAME_SCHEME, lang = "en", d = LAUNCH_DATES) {
  const es = lang === "es";
  const on = (x) => (es ? `a partir del ${fmtLaunchDate(x, lang)}` : `starting ${fmtLaunchDate(x, lang)}`);
  const allSame = d["walk-to-5k"] === d["5k-faster"] && d["5k-faster"] === d["10k"];
  if (scheme === "umbrella") {
    const head = es
      ? "El Reto 30 Días Antes de X-mas y los planes para correr de A Challenge to Move (Walk to 5K, 5K Faster y 10K) usan inicio de sesión por correo"
      : "The 30 Days Before X-mas Challenge and the A Challenge to Move running plans (Walk to 5K, 5K Faster and 10K) use email sign-in";
    const runs = allSame
      ? `${es ? "los planes para correr" : "the running plans"} ${on(d["10k"])}`
      : groupByDate([["Walk to 5K", d["walk-to-5k"]], ["5K Faster", d["5k-faster"]], ["10K", d["10k"]]], lang);
    return `${head} (${runs}):`;
  }
  const head = es
    ? "El Reto 30 Días Antes de X-mas, Doing a 5K (Walk to 5K y 5K Faster) y Doing a 10K usan inicio de sesión por correo"
    : "The 30 Days Before X-mas Challenge, Doing a 5K (Walk to 5K and 5K Faster) and Doing a 10K use email sign-in";
  const fiveSame = d["walk-to-5k"] === d["5k-faster"];
  const runs = allSame
    ? (es ? `Doing a 5K y Doing a 10K, ambos ${on(d["10k"])}` : `Doing a 5K and Doing a 10K both ${on(d["10k"])}`)
    : groupByDate(fiveSame
      ? [["Doing a 5K", d["walk-to-5k"]], ["Doing a 10K", d["10k"]]]
      : [["Doing a 5K: Walk to 5K", d["walk-to-5k"]], ["Doing a 5K: 5K Faster", d["5k-faster"]], ["Doing a 10K", d["10k"]]], lang);
  return `${head} (${runs}):`;
}
for (const k of Object.keys(SITE_STRINGS)) {
  SITE_STRINGS[k].chd65 = chd65(k, "en");
  SITE_STRINGS[k].chd65Es = chd65(k, "es");
}
export const SITE = SITE_STRINGS[NAME_SCHEME];


/* Access: plan length + 2 weeks (decided; Attorney §11.2). The exact end date is shown before purchase. */
export const PLAN_WEEKS_BY_DAYS = { 2: 18, 3: 12, 4: 10, 5: 9 };
export const ACCESS_WEEKS_BY_DAYS = { 2: 20, 3: 14, 4: 12, 5: 11 };

/* Prices (decided): $6.99 per level. Restart and repeat $2.99. */
export const PRICES = { "walk-to-5k": "6.99", "5k-faster": "6.99", "10k": "6.99", restart: "2.99", repeat: "2.99" };

/* Stripe (live mode, account "Coach Salim Heyaime"), created Nov 22, 2026 with Salim's approval. IDs only, never
 * keys. One product per level, each with a one-time $6.99 purchase price and its own one-time $2.99 "Restart or
 * repeat" price (per-level, so every charge carries metadata level_id + kind). No payment links yet: the preview
 * checkout stays simulated, and the old Doing a 5K $6.99 link is turned off only at launch, on Salim's yes. */
export const STRIPE_IDS = {
  "walk-to-5k": { product: "prod_VgActk1X2saGJP", purchase: "price_1UeoHaHF4792IyqdRM6GR7VK", restart: "price_1UeoHbHF4792IyqdhEeCFjbk" },
  "5k-faster": { product: "prod_VgAc55HHxAjh9A", purchase: "price_1UeoHdHF4792IyqdghdBzMB8", restart: "price_1UeoHeHF4792IyqdCeaNKDys" },
  "10k": { product: "prod_VgAcMkEb8uu2Ls", purchase: "price_1UeoHhHF4792IyqdJG67kNxP", restart: "price_1UeoHhHF4792IyqduId5nVAF" },
};

/* Server checkout and cross-device access (Supabase project olncfwohfpgpmygxjpcm, the same project as the
 * 22-Day app's magic-link sign-in). realCheckout stays OFF in the preview: the app keeps its simulated checkout and
 * device-only access. Turn it on only at launch, on Salim's yes, after the migration is applied, the edge functions
 * are deployed and the Stripe webhook exists. supabaseAnonKey is the project's PUBLIC anon key (the same one the
 * 22-Day app ships); it is not a secret, but it stays empty until launch. Never put a secret or service key here. */
export const SERVER = {
  realCheckout: false,
  supabaseUrl: "https://olncfwohfpgpmygxjpcm.supabase.co",
  supabaseAnonKey: "",
  /* Stripe returns buyers here: purchases, restarts and repeats to the app (level unlocks with the chosen days and
   * end date), gifts to the gift receipt; Cancel goes back to the product page. */
  siteUrl: "https://achallengetomove.com",
};

/* Count-up timer caps, seconds (decided). 10K check-in 90:00. Walk to 5K 5K sessions 60:00.
 * 5K Faster time trials 45:00. Auto-stop lines are the Attorney's §11.5 copy (cap90, cap60, cap45). */
export const TIMER_CAPS = {
  "10k-open": { "10k": 5400 },
  "5k-open": { "walk-to-5k": 3600, "5k-faster": 2700 },
};

/* Launch dates are filled with the go-live day (Nov 22, 2026); see LAUNCH_DATES above. */
