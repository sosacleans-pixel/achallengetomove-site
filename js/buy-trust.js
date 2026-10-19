/* Buy-button trust component (achallengetomove.com).
 * Under every Stripe buy button, in this order: button, Terms line (EN/ES), Stripe badge, refund line.
 * The Terms line links the App Terms (/purchase-terms/) and Health and safety (/health-safety/), same tab.
 * Static pages paste the same markup by hand; JS-rendered cards (store.js, home-programs.js)
 * read it from window.ACTM_BUY_TRUST. Load this file before those scripts.
 * The badge is Stripe's official, unmodified "Powered by Stripe" SVG, self-hosted in /img/stripe/
 * (see /img/stripe/README.md for usage rules). Do not recolor, crop or redraw it. */
(function () {
  "use strict";
  var STRIPE_BADGE_HTML =
    '<p class="stripe-badge"><a href="https://stripe.com" target="_blank" rel="noopener noreferrer">' +
    '<img src="/img/stripe/powered-by-stripe-blurple.svg" width="124" height="28" alt="Powered by Stripe" loading="lazy" decoding="async">' +
    "</a></p>";
  var AGREE_HTML =
    '<p class="buy-agree"><small>By buying, you agree to the <a class="text-link" href="/purchase-terms/">Terms</a>. <a class="text-link" href="/health-safety/">Health and safety</a></small> <small lang="es">Al comprar, aceptas los <a class="text-link" href="/purchase-terms/">Términos</a>. <a class="text-link" href="/health-safety/">Salud y seguridad</a></small></p>';
  var REFUND_HTML =
    '<p class="buy-refund"><small>You can request a full refund within 3 days (72 hours) of purchase by emailing ' +
    '<a class="text-link" href="mailto:coachsalimheyaime@gmail.com?subject=Refund+request">coachsalimheyaime@gmail.com</a>. ' +
    "After that, all sales are final, except where the law requires otherwise. Refunds go to the original payment method.</small></p>";
  window.ACTM_BUY_TRUST = {
    agreeHtml: AGREE_HTML,
    stripeBadgeHtml: STRIPE_BADGE_HTML,
    refundHtml: REFUND_HTML,
    /* Terms line + badge + refund line, to place directly after the element holding the buy button. */
    html: AGREE_HTML + STRIPE_BADGE_HTML + REFUND_HTML
  };
})();
