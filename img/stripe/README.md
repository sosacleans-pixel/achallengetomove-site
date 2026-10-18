# Powered by Stripe badge

Official, unmodified files from Stripe's "Powered by Stripe" badge kit
(https://stripe.com/newsroom/brand-assets → "Download badges",
Powered_by_Stripe-badge.zip, downloaded 2026-10-18). Only the file names were
changed (lowercase, no spaces). Do not edit, recolor or crop these files.

- powered-by-stripe-blurple.svg — default, for light backgrounds (used site-wide)
- powered-by-stripe-black.svg   — light backgrounds, monochrome
- powered-by-stripe-white.svg   — dark backgrounds

Use is subject to Stripe's Mark Usage Terms: https://stripe.com/marks/legal
(use only next to Stripe checkout, don't alter it, don't make it more prominent
than our own brand, don't imply endorsement, don't place anything so close it
forms a new mark). Stripe suggests linking the badge to stripe.com.

Markup (component: `.stripe-badge`, see styles.css and js/buy-trust.js).
Order under a buy button: button, Stripe badge, refund line.

    <p class="stripe-badge"><a href="https://stripe.com" target="_blank" rel="noopener noreferrer"><img src="/img/stripe/powered-by-stripe-blurple.svg" width="124" height="28" alt="Powered by Stripe" loading="lazy" decoding="async"></a></p>
