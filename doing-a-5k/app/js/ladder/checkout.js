/* Doing a 5K ladder checkout (PREVIEW).
 * Live plan: Stripe Checkout in one-time payment mode (mode: "payment"), one fresh checkout for every
 * purchase, restart and repeat. No subscription, no saved card, no automatic charge. Web/Stripe only.
 * Nothing here holds a key. Price IDs stay null until Salim approves and the Stripe test prices exist;
 * while they are null the app only shows a clearly labeled preview checkout that grants local access. */

export const CHECKOUT = {
  mode: "preview", // "preview" | "stripe" (stripe needs a server endpoint that creates the Checkout Session)
  sessionEndpoint: null, // e.g. a Supabase Edge Function URL, set after approval
  prices: {
    "walk-to-run": { amount: "4.99", stripePriceId: null },
    "5k": { amount: "6.99", stripePriceId: null },
    "faster-5k": { amount: "6.99", stripePriceId: null },
    restart: { amount: "2.99", stripePriceId: null },
    // Gifts use the level prices above (a separate Stripe price per gift level is optional).
    repeat: { amount: "2.99", stripePriceId: null },
  },
};

const STRIPE_BADGE_HTML =
  '<p class="stripe-badge"><a href="https://stripe.com" target="_blank" rel="noopener noreferrer">' +
  '<img src="../../img/stripe/powered-by-stripe-blurple.svg" width="124" height="28" alt="Powered by Stripe" loading="lazy" decoding="async">' +
  "</a></p>";

const LEGAL_LINKS_HTML =
  '<p class="buy-legal"><small><a class="text-link" href="../../purchase-terms/#app-5k-ladder" target="_blank" rel="noopener">Purchase terms</a> · ' +
  '<a class="text-link" href="../../health-safety/" target="_blank" rel="noopener">Health and safety</a></small></p>';

/* Attorney §4.1 (memo §7.3), word for word, with $[PRICE] filled in. */
const DISCLOSURE_REST =
  "This is not a subscription and will not renew or charge you again. " +
  "Your purchase gives you 14 weeks of access to this level (the 12-week program plus 2 extra weeks), starting on the date of purchase. " +
  "After that, you cannot start new sessions in this window. Your history, badges and streak record stay visible. " +
  "If the window ends before you finish, you can restart the same level for $2.99 within 30 days, which starts a new 14-week window. " +
  "After those 30 days, the regular price applies. Repeating a finished level is $2.99 at any time and also starts a new 14-week window. " +
  "You can request a full refund within 3 days (72 hours) of purchase by emailing coachsalimheyaime@gmail.com. " +
  "After that, all sales are final, except where the law requires otherwise. Refunds go to the original payment method. " +
  "A refund ends your access.";

export function disclosureText(price) {
  return `One-time payment of $${price}. ${DISCLOSURE_REST}`;
}

/* Restart / repeat: the Attorney's required first sentences (memo §7.3), then the rest of §4.1. */
export function disclosureFor({ kind, price, levelName, resumeAt = 1 }) {
  if (kind === "gift") return giftDisclosure({ price, levelName });
  if (kind === "restart") {
    const first = resumeAt > 1
      ? `One-time payment of $2.99 for a new 14-week access window for ${levelName} that resumes at session ${resumeAt} unless you choose to start from session 1.`
      : `One-time payment of $2.99 for a new 14-week access window for ${levelName} that starts at session 1.`;
    return `${first} ${DISCLOSURE_REST}`;
  }
  if (kind === "repeat") {
    return `One-time payment of $2.99 to repeat ${levelName}: a new 14-week access window that starts at session 1. ${DISCLOSURE_REST}`;
  }
  return disclosureText(price);
}

/* Attorney §4.2 (memo §7.3), word for word. */
export function giftDisclosure({ price, levelName }) {
  return (
    `One-time payment of $${price} for a gift of ${levelName}. This is not a subscription and will not renew or charge you again. ` +
    "The gift code can be redeemed for at least 5 years from the date of purchase. " +
    "Once the recipient redeems it, they get 14 weeks of access (the 12-week program plus 2 extra weeks) starting on the redemption date. " +
    "You can request a full refund within 3 days (72 hours) of purchase only if the code has not been redeemed. " +
    "Once redeemed, the gift is non-refundable, except where the law requires otherwise. Refunds go to the original payment method. " +
    "Gift codes have no cash value and can't be resold, except where the law requires otherwise. " +
    "Gifts may only be given to an adult 18 or older. The recipient must accept the App Terms and Health and safety information personally."
  );
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
