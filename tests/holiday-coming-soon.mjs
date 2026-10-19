/**
 * Checks for the 30 Days Before X-mas Challenge coming-soon spot.
 *   node tests/holiday-coming-soon.mjs        (needs playwright: npm i -D playwright)
 *
 * 1. NO Google Analytics on /holiday-challenge/ (Attorney's ruling): no ga.js / gtag / GTM in the HTML,
 *    no request to any Google analytics or font host while the page loads and the form is used,
 *    and window.gtag / window.dataLayer never exist.
 * 2. Copy rules on the new content: no em or en dashes, no banned names, price $9.99 shown but no buy button or Stripe link,
 *    no fixed Nov 25 / Dec 24 dates (rolling start: Day 1 is the day you get it; available through December 5, 2026),
 *    and no sale / 30% off line shown yet (only a TODO comment).
 * 3. EN/ES switch, sign-up payload (tagged as the holiday list), consent line and privacy link.
 * 4. Homepage teaser and store card, and the homepage sign-up still sends what it sent before.
 * 5. No horizontal overflow at 390 px.
 */
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { join, extname, normalize } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const root = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml" };

let failures = 0, passes = 0;
function check(ok, name, extra) {
  if (ok) { passes++; console.log("PASS  " + name); }
  else { failures++; console.log("FAIL  " + name + (extra ? "\n      " + extra : "")); }
}
const read = (p) => readFileSync(join(root, p), "utf8");

/* ---------- static checks ---------- */
const GA_PATTERNS = [/\/js\/ga\.js/i, /googletagmanager\.com/i, /google-analytics\.com/i, /\bgtag\s*\(/, /\bdataLayer\b/, /G-[A-Z0-9]{6,}/, /fonts\.googleapis\.com/i, /fonts\.gstatic\.com/i];
const HOLIDAY_FILES = ["holiday-challenge/index.html", "holiday-challenge/coming-soon.js", "holiday-challenge/coming-soon.css"];
for (const f of HOLIDAY_FILES) {
  const src = read(f).replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const hit = GA_PATTERNS.find((re) => re.test(src));
  check(!hit, `no GA / Google tag in ${f}`, hit && String(hit));
}
const html = read("holiday-challenge/index.html");
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
check(scripts.every((s) => ["/holiday-challenge/coming-soon.js", "/js/notify.js", "/js/external-links.js"].includes(s)),
  "coming-soon page loads only its own script, notify.js and external-links.js", scripts.join(", "));
for (const s of ["js/notify.js", "js/external-links.js"]) {
  const src = read(s);
  check(!/googletagmanager|google-analytics|createElement\(\s*['"]script/i.test(src), `${s} cannot load a GA script`);
}

const homeTeaser = (read("index.html").match(/<section class="holiday-teaser"[\s\S]*?<\/section>/) || [""])[0];
const storeCard = (read("store/index.html").match(/<section class="store-section" id="store-seasonal"[\s\S]*?<\/section>/) || [""])[0];
const product = JSON.parse(read("js/products.json")).products.find((p) => p.id === "30-days-before-xmas");
const enStrings = read("holiday-challenge/coming-soon.js");
const NEW_CONTENT = { "coming-soon page": html, "coming-soon.js": enStrings, "coming-soon.css": read("holiday-challenge/coming-soon.css"),
  "homepage teaser": homeTeaser, "store card (static)": storeCard, "products.json entry": JSON.stringify(product || {}) };
check(homeTeaser.length > 0, "homepage has the holiday teaser section");
check(storeCard.length > 0, "store page has the static holiday card");
check(!!product, "products.json lists the holiday card");
const BANNED = /kindle|75\s*hard|75\s*soft|whole\s*30|couch\s*to\s*5k|c25k/i;
const FIXED_DATES = /nov(ember)?\.?\s*25|25\s+de\s+noviembre|noviembre|dec(ember)?\.?\s*24|24\s+de\s+diciembre|\bnovember\b/i;
const EN_SOON = "Coming soon. Start Day 1 the day you get it.";
const EN_AVAIL = "Available through December 5, 2026.";
const ES_SOON = "Pr\u00f3ximamente. Empiezas el D\u00eda 1 el mismo d\u00eda que lo recibes.";
const ES_AVAIL = "Disponible hasta el 5 de diciembre de 2026.";
const LINE_RE = /Coming soon\. Start Day 1 the day you get it\. Available through December 5, 2026\./;
for (const [name, txt] of Object.entries(NEW_CONTENT)) {
  check(!/\u2014|&mdash;|\\u2014/.test(txt), `no em dash in ${name}`);
  check(!/\u2013|&ndash;|\\u2013/.test(txt), `no en dash in ${name}`);
  check(!FIXED_DATES.test(txt), `no fixed Nov 25 / Dec 24 date in ${name}`, (txt.match(FIXED_DATES) || [])[0]);
  if (name === "coming-soon.css") continue;
  const shown = txt.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/<[^>]*>/g, " ");
  check(!/\$\s?6\.99/.test(shown), `sale price $6.99 not shown yet in ${name}`);
  check(!/\d+\s?%|\bsale\b|descuento|\boff\b/i.test(shown), `no sale or % off line shown yet in ${name}`, (shown.match(/\d+\s?%|\bsale\b|descuento|\boff\b/i) || [])[0]);
  check(!BANNED.test(txt), `no banned names in ${name}`, (txt.match(BANNED) || [])[0]);
}
for (const [name, txt] of Object.entries({ "coming-soon page": html, "homepage teaser": homeTeaser, "store card (static)": storeCard, "products.json entry": JSON.stringify(product || {}) })) {
  const t = txt.replace(/<!--[\s\S]*?-->/g, "");
  check(!/buy\.stripe\.com|\bbuy\b/i.test(t), `no buy button or Stripe link in ${name}`);
  check(/\$9\.99/.test(t) && !/\$\s?(?!9\.99)\d/.test(t), `price $9.99 (and no other price) in ${name}`);
}
check(LINE_RE.test(homeTeaser) && /href="\/holiday-challenge\/">Get notified</.test(homeTeaser), "teaser: exact coming-soon + availability line and Get notified -> /holiday-challenge/");
check(product && LINE_RE.test(product.tagline) && LINE_RE.test(storeCard), "store card (products.json and static): rolling-start + availability line");
for (const [name, txt] of Object.entries({ "coming-soon page": html, "homepage teaser": homeTeaser, "store card (static)": storeCard })) {
  check(/TODO\(sale\)/.test(txt), `${name}: marked TODO(sale) comment where the Dec 1 sale line goes`);
}
check(/TODO\(sale\)/.test(enStrings), "coming-soon.js: marked TODO(sale) comment for the EN/ES sale line");
check((html.match(/<meta name="description" content="([^"]*)"/) || [])[1].includes(EN_SOON + " " + EN_AVAIL) && (html.match(/<meta property="og:description" content="([^"]*)"/) || [])[1].includes(EN_SOON + " " + EN_AVAIL), "meta and og descriptions: rolling-start + availability line");
check(product && product.notifyHref === "/holiday-challenge/" && product.notifyLabel === "Get notified" && product.price === "$9.99" && !(product.actions || []).length, "store product: Get notified -> /holiday-challenge/, price $9.99, no buy action");

/* ---------- browser checks ---------- */
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(root, p));
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const GOOGLE_HOST = /(googletagmanager|google-analytics|analytics\.google|doubleclick|googleapis|gstatic)\.com/i;

async function openPage(path, { width = 1280, locale = "en-US", formsubmit } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale });
  const page = await ctx.newPage();
  const requests = [];
  const posts = [];
  page.on("request", (r) => requests.push(r.url()));
  // Playwright tries the most recently added route first: catch-all abort first, specific handlers after.
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await ctx.route(GOOGLE_HOST, (route) => route.abort());
  await ctx.route(/formsubmit\.co/, async (route) => {
    posts.push({ url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(formsubmit || { success: "true" }) });
  });
  await page.goto(base + path, { waitUntil: "networkidle" });
  return { ctx, page, requests, posts };
}

// 1. No GA on the coming-soon page, including after a sign-up.
{
  const { ctx, page, requests, posts } = await openPage("/holiday-challenge/");
  check(!requests.some((u) => GOOGLE_HOST.test(u)), "coming-soon page: no request to Google analytics or font hosts on load",
    requests.filter((u) => GOOGLE_HOST.test(u)).join(", "));
  check(await page.evaluate(() => typeof window.gtag === "undefined" && typeof window.dataLayer === "undefined"), "coming-soon page: window.gtag and window.dataLayer are undefined");
  check(await page.evaluate(() => ![...document.scripts].some((s) => /ga\.js|gtag|googletagmanager/.test(s.src))), "coming-soon page: no GA script element in the DOM");

  check((await page.textContent("h1")).trim() === "30 Days Before X-mas Challenge", "EN: name");
  check((await page.textContent(".hcs-soon")).trim() === EN_SOON, "EN: rolling-start Day 1 line");
  check((await page.textContent(".hcs-dates")).trim() === EN_AVAIL, "EN: availability line (through December 5, 2026)");
  check(!FIXED_DATES.test(await page.textContent("body")), "EN: no fixed Nov 25 / Dec 24 date on the rendered page");
  check(await page.isVisible(".hcs-hero-art"), "hero art visible");
  const consent = (await page.textContent("#notify-consent")).replace(/\s+/g, " ").trim();
  check(consent.startsWith("Email me when the 30 Days Before X-mas Challenge opens. Coach Salim Heyaime LLC (coachsalimheyaime@gmail.com) will send occasional emails about this challenge. You can withdraw your consent and unsubscribe at any time with the link in every email, or by emailing coachsalimheyaime@gmail.com."), "CASL consent wording: purpose, sender, withdraw / unsubscribe line", consent);
  check(await page.isVisible("#notify-consent") && await page.evaluate(() => !document.getElementById("notify-consent").closest(".visually-hidden")), "consent wording is visible (not visually-hidden)");
  check(await page.evaluate(() => { const c = document.getElementById("notify-consent"), i = document.getElementById("notify-email"); return !!(i.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) && c.getBoundingClientRect().top >= i.getBoundingClientRect().bottom; }), "consent wording sits under the email field");
  check(!/herriman|\b\d{3,5}\s+\w+\s+(st|street|ave|avenue|rd|road|dr|drive|ln|lane|way|cir|ct)\b/i.test(consent), "no home / street address in the consent wording (left out until a PO box exists)");
  check((await page.textContent(".hcs-price")).trim() === "$9.99", "EN: price $9.99 shown");
  check(await page.$$eval("a[href*='stripe'], a[href*='buy']", (a) => a.length) === 0, "coming-soon page: no Stripe or buy link");
  check((await page.getAttribute("#notify-consent a", "href")) === "/privacy/", "consent line links the privacy page");
  const ext = await page.$$eval("a[href^='http']", (as) => as.filter((a) => new URL(a.href).hostname !== location.hostname).map((a) => [a.href, a.target]));
  check(ext.length > 0 && ext.every(([, t]) => t === "_blank"), "external links open in a new tab", JSON.stringify(ext));

  await page.fill("#notify-email", "not-an-email");
  await page.click("#notify-form button[type=submit]");
  check(posts.length === 0 && /valid email/i.test(await page.textContent("#notify-status")), "invalid email is not sent");
  await page.fill("#notify-email", "test@example.com");
  await page.click("#notify-form button[type=submit]");
  await page.waitForFunction(() => document.getElementById("notify-form").hidden);
  const body = posts[0] && posts[0].body;
  check(posts.length === 1 && /formsubmit\.co\/ajax\/coachsalimheyaime@gmail\.com/.test(posts[0].url), "sign-up posts to the site's existing FormSubmit endpoint");
  check(body && body.list === "30-days-before-xmas" && /30 Days Before X-mas Challenge/.test(body._subject) && body.lang === "en" && body.email === "test@example.com",
    "sign-up is tagged as the holiday challenge (list, subject, lang)", JSON.stringify(body));
  check(body && /withdraw your consent and unsubscribe at any time/.test(body.consent_note || "") && /Email me when the 30 Days Before X-mas Challenge opens/.test(body.consent_note || ""), "sign-up records the consent wording shown", body && body.consent_note);
  check(/on the list/i.test(await page.textContent("#notify-status")), "EN thank-you message shown");
  check(!requests.some((u) => GOOGLE_HOST.test(u)) && await page.evaluate(() => typeof window.gtag === "undefined"), "coming-soon page: still no GA after sign-up");
  await ctx.close();
}

// 2. ES: by URL, by browser language, and the saved choice.
{
  const { ctx, page, posts } = await openPage("/holiday-challenge/?lang=es");
  check((await page.textContent("h1")).trim() === "Reto 30 D\u00edas Antes de X-mas", "ES (?lang=es): name");
  check(await page.evaluate(() => document.documentElement.lang) === "es", "ES: html lang=es");
  check((await page.textContent(".hcs-soon")).trim() === ES_SOON && (await page.textContent(".hcs-dates")).trim() === ES_AVAIL, "ES: rolling-start Day 1 line and availability line");
  check(!FIXED_DATES.test(await page.textContent("body")), "ES: no fixed noviembre / 24 de diciembre date on the rendered page");
  const esConsent = (await page.textContent("#notify-consent")).replace(/\s+/g, " ");
  check(/Av\u00edsame por correo cuando abra el Reto 30 D\u00edas Antes de X-mas\./.test(esConsent) && /te enviar\u00e1 correos ocasionales sobre este reto/.test(esConsent) && /Puedes retirar tu consentimiento y darte de baja en cualquier momento/.test(esConsent), "ES: CASL consent wording (purpose, sender, withdraw / unsubscribe)", esConsent);
  check((await page.textContent(".hcs-price")).trim() === "$9.99", "ES: price $9.99 shown");
  await page.fill("#notify-email", "prueba@example.com");
  await page.click("#notify-form button[type=submit]");
  await page.waitForFunction(() => document.getElementById("notify-form").hidden);
  check(posts[0] && posts[0].body.lang === "es" && posts[0].body.list === "30-days-before-xmas" && /retirar tu consentimiento/.test(posts[0].body.consent_note || ""), "ES: sign-up tagged lang=es, records ES consent wording");
  check(/Ya est\u00e1s en la lista/.test(await page.textContent("#notify-status")), "ES: thank-you message");
  await ctx.close();
}
{
  const { ctx, page } = await openPage("/holiday-challenge/", { locale: "es-MX" });
  check((await page.textContent(".hcs-soon")).trim() === ES_SOON, "ES by browser language");
  await page.click(".hcs-lang-btn[data-lang=en]");
  check((await page.textContent("h1")).trim() === "30 Days Before X-mas Challenge" && (await page.getAttribute(".hcs-lang-btn[data-lang=en]", "aria-pressed")) === "true", "EN/ES switch works");
  await page.reload({ waitUntil: "networkidle" });
  check((await page.textContent("h1")).trim() === "30 Days Before X-mas Challenge", "language choice is remembered on this device");
  await ctx.close();
}

// 3. Homepage teaser + homepage sign-up unchanged.
{
  const { ctx, page, posts } = await openPage("/");
  check(await page.isVisible("#holiday-challenge"), "homepage teaser visible");
  check((await page.getAttribute("#holiday-challenge .btn-primary", "href")) === "/holiday-challenge/", "homepage teaser button -> /holiday-challenge/");
  check((await page.textContent("#holiday-challenge .holiday-teaser-price")).trim() === "$9.99" && await page.$$eval("#holiday-challenge a[href*='stripe']", (a) => a.length) === 0, "homepage teaser: $9.99 shown, no Stripe link");
  await page.fill("#notify-email", "home@example.com");
  await page.click("#notify-form button[type=submit]");
  await page.waitForFunction(() => document.getElementById("notify-form").hidden);
  const b = posts[0] && posts[0].body;
  check(b && b._subject === "A Challenge to Move: notify me" && !("list" in b) && !("consent_note" in b), "homepage sign-up payload unchanged", JSON.stringify(b));
  check(/new challenges launch/.test(await page.textContent("#notify-status")), "homepage thank-you message unchanged");
  await ctx.close();
}

// 4. Store card rendered from products.json.
{
  const { ctx, page } = await openPage("/store/");
  await page.waitForSelector('[data-product-id="30-days-before-xmas"]');
  const card = page.locator('[data-product-id="30-days-before-xmas"]');
  const txt = (await card.textContent()).replace(/\s+/g, " ");
  check(LINE_RE.test(txt) && /\$9\.99/.test(txt) && !/buy|\$6\.99/i.test(txt) && !FIXED_DATES.test(txt), "store card: $9.99, rolling-start + availability line, no fixed date, no buy");
  check((await card.locator("a.btn").getAttribute("href")) === "/holiday-challenge/" && (await card.locator("a.btn").textContent()).trim() === "Get notified", "store card: Get notified -> /holiday-challenge/");
  check(await page.$$eval('[data-product-id="30-days-before-xmas"] a[href*="stripe"]', (a) => a.length) === 0, "store card: no Stripe link");
  await ctx.close();
}

// 5. Mobile layout: no horizontal overflow.
for (const path of ["/", "/holiday-challenge/", "/holiday-challenge/?lang=es", "/store/"]) {
  const { ctx, page } = await openPage(path, { width: 390 });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 0, `390 px: no horizontal overflow on ${path}`, `overflow ${over}px`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
