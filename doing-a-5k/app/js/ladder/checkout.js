/* Doing a 5K ladder checkout (PREVIEW).
 * Live plan: Stripe Checkout in one-time payment mode (mode: "payment"), one fresh checkout for every
 * purchase, restart and repeat. No subscription, no saved card, no automatic charge. Web/Stripe only.
 * Nothing here holds a key. Price IDs stay null until Salim approves and the Stripe test prices exist;
 * while they are null the app only shows a clearly labeled preview checkout that grants local access. */

export const CHECKOUT = {
  mode: "preview", // "preview" | "stripe" (stripe needs a server endpoint that creates the Checkout Session)
  sessionEndpoint: null, // e.g. a Supabase Edge Function URL, set after approval
  prices: {
    "walk-to-run-30": { amount: "4.99", stripePriceId: null },
    "5k-30": { amount: "6.99", stripePriceId: null },
    "faster-5k-30": { amount: "6.99", stripePriceId: null },
    restart: { amount: "2.99", stripePriceId: null },
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

/* Attorney §4.1, word for word, with $[PRICE] filled in. */
export function disclosureText(price) {
  return (
    `One-time payment of $${price}. This is not a subscription and will not renew or charge you again. ` +
    "Your purchase gives you 90 days of access to this level, starting on the date of purchase. " +
    "After 90 days, you cannot start new sessions in this window. Your history, badges and streak record stay visible. " +
    "If the window ends before you finish, you can restart the same level for $2.99 within 30 days, which starts a new 90-day window. " +
    "After those 30 days, the regular price applies. Repeating a finished level is $2.99 at any time and also starts a new 90-day window. " +
    "You can request a full refund within 3 days (72 hours) of purchase by emailing coachsalimheyaime@gmail.com. " +
    "After that, all sales are final, except where the law requires otherwise. Refunds go to the original payment method. " +
    "A refund ends your access."
  );
}

/* Restart / repeat: the first sentence states the $2.99 price and what it buys (Attorney §4.1 note).
 * The rest of §4.1 follows word for word. FIRST SENTENCE WORDING NEEDS ATTORNEY CONFIRMATION. */
export function disclosureFor({ kind, price, levelName, resumeAt }) {
  const base = disclosureText(price);
  if (kind === "restart") {
    const what =
      resumeAt > 1
        ? `a new 90-day window for ${levelName} that resumes at session ${resumeAt} unless you choose to start from session 1`
        : `a new 90-day window for ${levelName} that starts at session 1`;
    return base.replace(`One-time payment of $${price}.`, `One-time payment of $${price} for ${what}.`);
  }
  if (kind === "repeat") {
    return base.replace(`One-time payment of $${price}.`, `One-time payment of $${price} to repeat ${levelName}: a new 90-day window that starts at session 1.`);
  }
  return base;
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
