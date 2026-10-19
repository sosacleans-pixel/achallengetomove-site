# App icon family

One icon per program, built by hand as SVG on a 1024 grid: charcoal `#1e1e1e` rounded square (rx 224),
a thin yellow inner outline, one bold symbol in yellow `#ffc700` with a rust `#bf3404` or cream `#fff7e8` accent,
and a short cream label. Label digits are outlined paths from Anton (OFL, see `holiday-challenge/fonts/`),
so the SVGs need no web font.

Each folder has:

- `icon.svg`: master artwork
- `icon-512.png`, `icon-192.png`: rounded corners, transparent outside (web app manifest sizes)
- `apple-touch-icon.png`: 180 x 180, opaque full-bleed square (iOS applies its own corner mask)

The site shows `icon.svg` at the top left of each program card on the homepage and store, mapped by product id in `/js/app-icons.js`.

| Program | Folder | Symbol + label | Where it could later be the home-screen icon (not changed here) |
| --- | --- | --- | --- |
| 22-Day 7-Minute Workout | `22-day-7-minute-workout/` | stopwatch with a 7-minute wedge, `22` | reader-app (book.coachsalimheyaime.com): `manifest.webmanifest` icons `/icons/icon-192-v5.png`, `/icons/icon-512-v5.png`, maskable 512, and its apple-touch icon |
| Doing a 5K | `doing-a-5k/` | finish flag, `5K` | this repo: `doing-a-5k/app/manifest.webmanifest` and `doing-a-5k/app/icons/` (icon-192, icon-512, icon.svg, apple-touch-icon) |
| 30-Day Whole Food Plan | `whole-food-plan/` | apple with leaf, `30` | this repo: `whole-food-plan/app/manifest.webmanifest` and `whole-food-plan/app/icons/` |
| 5K to Half Marathon | `5k-to-half-marathon/` | finisher medal, `13.1` | this repo: `5k-to-half-marathon/app/manifest.webmanifest` and `5k-to-half-marathon/app/icons/` (copied from this folder) |
| 5K 2-Pack | `5k-2-pack/` | two stacked tiles with a 2, `5K` | retired: the 5K 2-Pack product was removed (Oct 18, 2026). Files kept, not mapped in `/js/app-icons.js` |
| 75 Adaptive | `75-adaptive/` | bending arrow, `75` | this repo: `75-day/app/icons/75-adaptive-{180,192,512}.png` and `75-adaptive.svg` (the app swaps `#app-apple-icon` by mode in `75-day/app/js/app.js`) |
| 75 All-In | `75-all-in/` | flame, `75` | this repo: `75-day/app/icons/75-all-in-{180,192,512}.png` and `75-all-in.svg`, plus `75-day/app/manifest.webmanifest` |
| 30 Days Before X-mas Challenge | `30-days-before-xmas/` | tree with star, `30` | holiday app when it ships; could replace `holiday-challenge/img/30-days-before-xmas.svg` (kept as is for now, still used by the coming-soon page and store image) |

To rebuild: the generator scripts are kept outside the repo in the Web Manager workspace (`/workspace/app-icons/src/`).
