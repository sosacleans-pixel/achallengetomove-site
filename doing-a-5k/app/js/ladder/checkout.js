/* Ladder checkout (PREVIEW).
 * Live plan: Stripe Checkout in one-time payment mode (mode: "payment"), one fresh checkout for every
 * purchase, restart and repeat. No subscription, no saved card, no automatic charge. Web/Stripe only.
 * Nothing here holds a key. The live Stripe price IDs are in config.js (STRIPE_IDS); the server picks the price,
 * never the browser. While SERVER.realCheckout is off (the preview), the app shows a clearly labeled preview
 * checkout that grants local access only. */

import { PRICES, NAMES, SERVER, STRIPE_IDS } from "./config.js";
import { serverEnabled } from "./server.js";
import { t } from "./copy.js";

export const CHECKOUT = {
  /* "stripe" only when config SERVER.realCheckout is on and the anon key is set (OFF in the preview). */
  mode: serverEnabled() ? "stripe" : "preview",
  sessionEndpoint: serverEnabled() ? `${SERVER.supabaseUrl}/functions/v1/ladder-checkout` : null,
  /* Amounts come from config.js (decided by Salim). Gifts use the level prices. */
  prices: Object.fromEntries(Object.entries(PRICES).map(([k, amount]) => [k, { amount, stripePriceId: STRIPE_IDS[k]?.purchase ?? null }])),
};

const STRIPE_BADGE_HTML =
  '<p class="stripe-badge"><a href="https://stripe.com" target="_blank" rel="noopener noreferrer">' +
  '<img src="../../img/stripe/powered-by-stripe-blurple.svg" width="124" height="28" alt="Powered by Stripe" loading="lazy" decoding="async">' +
  "</a></p>";

const LEGAL_LINKS_HTML =
  '<p class="buy-legal"><small><a class="text-link" href="../../purchase-terms/#app-5k-ladder" target="_blank" rel="noopener">Purchase terms</a> · ' +
  '<a class="text-link" href="../../health-safety/" target="_blank" rel="noopener">Health and safety</a></small></p>';

/* Attorney memo §11.2 (checkout and gift) and §11.8 (restart and repeat leads), word for word, EN and ES.
 * vars: days, planWeeks, accessWeeks, endDate (already formatted). */
function rest(full) {
  const i = full.search(/This is not a subscription|Esto no es una suscripción/);
  return full.slice(i);
}

export function disclosureFor({ kind, price, levelId, levelName, resumeAt = 1, days, planWeeks, accessWeeks, endDate, lang = "en" }) {
  const level = levelName || NAMES.levels[levelId];
  const vars = { price, days, planWeeks, accessWeeks, endDate, levelName: level, n: resumeAt, level };
  if (kind === "gift") return t("gift", vars, lang);
  const main = t("checkout", { ...vars, price: kind === "restart" || kind === "repeat" ? PRICES[kind] : price }, lang);
  if (kind === "restart") return `${t(resumeAt > 1 ? "restartResume" : "restartStart", vars, lang)} ${rest(main)}`;
  if (kind === "repeat") return `${t("repeat", vars, lang)} ${rest(main)}`;
  return main;
}

export function disclosureText(price, vars = {}) {
  return disclosureFor({ kind: "new", price, ...vars });
}

export function giftDisclosure({ price, levelName, lang = "en" }) {
  return t("gift", { price, level: levelName }, lang);
}

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Under every buy, restart and repeat button: Stripe badge, then the §4.1 disclosure, then the legal links. */
export function buyTrustHtml(opts) {
  const text = esc(disclosureFor(opts)).replace(
    "coachsalimheyaime@gmail.com",
    '<a class="text-link" href="mailto:coachsalimheyaime@gmail.com?subject=Refund+request">coachsalimheyaime@gmail.com</a>'
  );
  return `${STRIPE_BADGE_HTML}<p class="buy-refund buy-disclosure"><small>${text}</small></p>${LEGAL_LINKS_HTML}`;
}

export function isPreviewCheckout() {
  return CHECKOUT.mode !== "stripe" || !CHECKOUT.sessionEndpoint;
}

/* Preview checkout is only offered off the live domain. On the live domain without Stripe configured,
 * buy buttons show "Checkout coming soon" and grant nothing. */
export function previewAllowed() {
  const host = location.hostname;
  return host !== "achallengetomove.com" && host !== "www.achallengetomove.com";
}
