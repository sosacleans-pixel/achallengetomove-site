/* Buy-button trust component (achallengetomove.com).
 * Under every Stripe buy button, in this order: button, Stripe badge, refund line.
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
  var REFUND_HTML =
    '<p class="buy-refund"><small>You can request a full refund within 3 days (72 hours) of purchase by emailing ' +
    '<a class="text-link" href="mailto:coachsalimheyaime@gmail.com?subject=Refund+request">coachsalimheyaime@gmail.com</a>. ' +
    "After that, all sales are final. Refunds go to the original payment method.</small></p>";
  /* 12-month access note (EN + ES) for apps sold with 12 months of access (products.json "accessNote": true). */
  var ACCESS_NOTE_HTML =
    "<div class=\"access-note\"><p><small>Purchases include 12 months of app access. If you bought before [GATING DATE], your 12 months start on [GATING DATE]. There is no automatic renewal.</small></p><p lang=\"es\"><small>Las compras incluyen 12 meses de acceso a la app. Si compraste antes del [GATING DATE], tus 12 meses empiezan el [GATING DATE]. No hay renovación automática.</small></p><p><small><a class=\"text-link\" href=\"/purchase-terms/\">Purchase terms</a> · <a class=\"text-link\" href=\"/purchase-terms/#es\" lang=\"es\" hreflang=\"es\">Términos de compra</a></small></p></div>";
  window.ACTM_BUY_TRUST = {
    stripeBadgeHtml: STRIPE_BADGE_HTML,
    refundHtml: REFUND_HTML,
    accessNoteHtml: ACCESS_NOTE_HTML,
    /* Badge + refund line, to place directly after the element holding the buy button. */
    html: STRIPE_BADGE_HTML + REFUND_HTML
  };
})();
