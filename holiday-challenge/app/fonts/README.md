# Self-hosted fonts

Served from this folder so the app makes no requests to Google Fonts (fonts.googleapis.com / fonts.gstatic.com).

| File | Family | Weight | Source |
|---|---|---|---|
| anton-v27-latin-400.woff2 | Anton | 400 | Google Fonts, Anton v27, latin subset |
| lato-v25-latin-400.woff2 | Lato | 400 | Google Fonts, Lato v25, latin subset |
| lato-v25-latin-700.woff2 | Lato | 700 | Google Fonts, Lato v25, latin subset |
| lato-v25-latin-900.woff2 | Lato | 900 | Google Fonts, Lato v25, latin subset |

Both families are licensed under the SIL Open Font License 1.1: see `OFL-Anton.txt` and `OFL-Lato.txt`.
The `@font-face` rules are at the top of `../css/app.css`. These files are also listed in `../sw.js` for offline use.
