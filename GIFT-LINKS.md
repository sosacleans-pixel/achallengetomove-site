# Gift links and app checkout links (for Stripe setup)

Everything below is set in ONE file: `js/checkout-config.js` (`CONFIG`). Empty value = disabled button.
No "was" price and no strikethrough, ever.

## Buy links still needed

| App | Price | Config key | Empty shows |
| --- | --- | --- | --- |
| Doing a 5K (new price) | $8.99 | `CONFIG["doing-a-5k"].newBuyLink` | $6.99 everywhere with the current live $6.99 link |
| 5K to Half Marathon | $8.99 | `CONFIG["5k-to-half-marathon"].buyLink` | "Buy app, $8.99" disabled, "Checkout pending" |

Setting `doing-a-5k.newBuyLink` flips, at the same moment: home card, store card, product page price line
(EN and ES), buy button label and link, the three meta descriptions on /doing-a-5k/, and the schema.org price on
home and /doing-a-5k/. After the flip, also update the no-JS copies so crawlers and no-JS visitors see $8.99:
`js/products.json` (doing-a-5k price and href), the static card fallbacks in `index.html` and `store/index.html`,
and the static text/meta/JSON-LD in `doing-a-5k/index.html` (run `tests/checkout-config.mjs` after).

## Gift links (one per app)

| App | Gift price | Config key |
| --- | --- | --- |
| 22-Day 7-Minute Workout | $4.99 | `CONFIG["22-day-workout-app"].giftLink` |
| Doing a 5K | $8.99 | `CONFIG["doing-a-5k"].giftLink` |
| 5K to Half Marathon | $8.99 | `CONFIG["5k-to-half-marathon"].giftLink` |
| 30-Day Whole Food Plan | $9.99 | `CONFIG["whole-food-app"].giftLink` |
| 75 Adaptive | $9.99 | `CONFIG["75-adaptive"].giftLink` |
| 75 All-In | $9.99 | `CONFIG["75-all-in"].giftLink` |

Doing a 5K gift: create it at $8.99 and set it at the same time as `newBuyLink`, so the gift price never
differs from the shown app price.

### Pay-button text (custom text on every gift Payment Link)

EN: One-time payment. You'll get a gift code to send. The recipient's access starts when they redeem it. No subscription.

ES: Pago único. Recibirás un código de regalo para enviar. El acceso de quien lo recibe empieza cuando lo canjea. Sin suscripción.

### Lines shown under every gift button (attorney approved), with a "Terms" link to /purchase-terms/

EN: Gift buyers get a code to send. Gifts can be refunded within 3 days of purchase if the code hasn't been redeemed.

ES: Quien compra un regalo recibe un código para enviar. Los regalos se pueden reembolsar dentro de los 3 días posteriores a la compra si el código no se ha canjeado.

22-Day only, added:

EN: A 22-Day gift gives the recipient the same access as a purchase.

ES: Un regalo de 22-Day da a quien lo recibe el mismo acceso que una compra.

## Before turning any gift link on: what a gift code needs to grant access

No app has entitlements or code redemption today. Selling a gift link before this exists would sell a code
that unlocks nothing. Needed (backend entitlements work, not built here):

Shared for all apps
- Stripe webhook (`checkout.session.completed` on gift links) that issues a unique, single-use code and emails it
  to the buyer (the buyer sends it on).
- Code store: code, app, purchase id, buyer email, issued date, redeemed date, recipient email.
- Redemption page/endpoint: recipient enters code + email; marks it used (one use), records recipient email.
- Rules from the terms: 5-year redemption window from purchase; access 12 months from redemption (22-Day: same
  access as a purchase); refund within 3 days of purchase only if unredeemed (refund must void the code);
  stacking (a second code for the same app adds time to the end of the current access).
- Sign-in or restore by recipient email on a new device.

Per app
- 22-Day 7-Minute Workout (reader app at book.coachsalimheyaime.com): has no access code or unlock path today
  (paid access is tied to the purchase flow only). Needs a code-entry screen and an unlock that grants exactly
  what a $4.99 purchase grants.
- Doing a 5K (/doing-a-5k/app/), 5K to Half Marathon (/5k-to-half-marathon/app/): open noindex URLs with
  local-only data. Need an access gate (code or email check) before a code means anything, and an
  expiry check for the 12-month window.
- 30-Day Whole Food Plan (/whole-food-plan/app/), 75 Adaptive and 75 All-In (/75-day/app/): same as above:
  open URLs today, need a gate plus per-app entitlement (75 Adaptive and 75 All-In share one app, so the
  entitlement must say which program).
