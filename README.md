# achallengetomove.com (draft)

Static marketing site for **A Challenge to Move** — the umbrella brand for Salim Heyaime's wellness books and fitness apps.

## Status

- **Draft** on branch `draft/v1` — not published (no CNAME, Pages not enabled).
- `<meta name="robots" content="noindex">` on all pages.

## Local preview

```bash
python3 -m http.server 8080
```

Open http://localhost:8080/

## Structure

- `index.html` — home (hero, programs grid + featured app, the book, store teaser, how it works, about, notify)
- `store/index.html` — product catalog (rendered from `js/products.json` via `js/store.js`)
- `privacy/index.html` — privacy placeholder
- `styles.css` — shared styles
- `img/` — book cover assets
- `icons/logo.svg` — brand mark from companion app
- `js/products.json` — store catalog data (add books, apps, bundles here)
- `js/store.js` — renders the store grid; includes a commented hook for future checkout
- `js/home-programs.js` — renders homepage Programs from `products.json`
- `js/checkout-config.js` — single place for app prices, buy links and gift links (`ACTM_CHECKOUT`). Doing a 5K flips from $6.99 to $8.99 everywhere when `newBuyLink` is set; 5K to Half Marathon goes live when `buyLink` is set; each app's gift button goes live when its `giftLink` is set. See `GIFT-LINKS.md`.
- `5k-to-half-marathon/app/` — 5K to Half Marathon app (offline PWA, EN/ES); test: `5k-to-half-marathon/app/tests/headless.mjs`
- `tests/checkout-config.mjs` — prices, buy and gift buttons in default and flipped config
