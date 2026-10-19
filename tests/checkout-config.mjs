/**
 * Checks for /js/checkout-config.js (prices, buy links, gift links) and the 5K 2-Pack removal.
 *   PORT=8799 node tests/checkout-config.mjs
 * Uses puppeteer-core (import "puppeteer-core", or PPTR=/path/to/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js)
 * and Chrome at /usr/bin/google-chrome (or CHROME=...).
 *
 * Default config: Doing a 5K shows $6.99 everywhere with the live link; 5K to Half Marathon shows $8.99 with a
 * disabled Checkout pending button; every app (6) shows a disabled Gift checkout pending button, a Terms link,
 * and the gift line in EN and ES on home, store and its product page; 22-Day adds its gift line.
 * Flipped config (served copy with links filled in): every Doing a 5K price mention shows $8.99 and the new link
 * at once, no $6.99 left anywhere (text, meta, JSON-LD), Half buy button live, gift buttons live.
 * Never: "was $", strikethrough, 2-Pack.
 */
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { join, extname, normalize } from "path";
import { fileURLToPath } from "url";
const puppeteer = (await import(process.env.PPTR || "puppeteer-core")).default;

const repo = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
const PORT = Number(process.env.PORT || 8799);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".xml": "application/xml" };
let passes = 0, failures = 0;
const check = (ok, name, extra) => { if (ok) { passes++; console.log("PASS  " + name); } else { failures++; console.log("FAIL  " + name + (extra !== undefined ? "\n      " + JSON.stringify(extra).slice(0, 600) : "")); } };

const NEW_5K = "https://buy.stripe.com/test_new899doing5k";
const HALF = "https://buy.stripe.com/test_half899";
const GIFT = (id) => `https://buy.stripe.com/test_gift_${id}`;
let flipped = false;
const server = createServer((req, res) => {
  let f = normalize(join(repo, decodeURIComponent(req.url.split("?")[0])));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  let body = readFileSync(f);
  if (flipped && f.endsWith("/js/checkout-config.js")) {
    let s = body.toString();
    s = s.replace('newBuyLink: "",', `newBuyLink: "${NEW_5K}",`).replace('buyLink: "", /*', `buyLink: "${HALF}", /*`);
    s = s.replace(/"([a-z0-9-]+)": \{ giftLink: "" \}/g, (m, id) => `"${id}": { giftLink: "${GIFT(id)}" }`).replace(/giftLink: ""\n/g, `giftLink: "${GIFT("x")}"\n`);
    body = Buffer.from(s);
  }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
  res.end(body);
}).listen(PORT, "127.0.0.1");

const APPS = ["22-day-workout-app", "doing-a-5k", "5k-to-half-marathon", "whole-food-app", "75-adaptive", "75-all-in"];
const PAGES = { "/22-day-7-minute-workout/": "22-day-workout-app", "/doing-a-5k/": "doing-a-5k", "/5k-to-half-marathon/": "5k-to-half-marathon", "/whole-food-plan/": "whole-food-app", "/75-adaptive/": "75-adaptive", "/75-all-in/": "75-all-in" };
const GIFT_EN = "Gift buyers get a code to send. Gifts can be refunded within 3 days of purchase if the code hasn't been redeemed.";
const GIFT_ES = "Quien compra un regalo recibe un código para enviar. Los regalos se pueden reembolsar dentro de los 3 días posteriores a la compra si el código no se ha canjeado.";
const G22_EN = "A 22-Day gift gives the recipient the same access as a purchase.";
const G22_ES = "Un regalo de 22-Day da a quien lo recibe el mismo acceso que una compra.";
const LINE = (p) => `${p} one-time payment. Includes 12 months of access. No subscription.`;
const LINE_ES = (p) => `${p} pago único. Incluye 12 meses de acceso. Sin suscripción.`;

// static source checks
const files = ["js/products.json", "index.html", "store/index.html", "sitemap.xml", "js/app-icons.js", "README.md", ...Object.keys(PAGES).map((p) => p.slice(1) + "index.html")];
const packHits = files.filter((f) => /2-pack|2 pack|5k-2-pack/i.test(readFileSync(join(repo, f), "utf8")));
check(packHits.length === 0, "no 5K 2-Pack in products, pages, sitemap, icon map, README", packHits);
check(existsSync(join(repo, "icons/apps/5k-2-pack/icon.svg")), "2-Pack icon files kept (unmapped)");
const products = JSON.parse(readFileSync(join(repo, "js/products.json"), "utf8")).products;
check(!products.some((p) => p.id === "5k-2-pack" || p.type === "bundle"), "products.json has no bundle");
const half = products.find((p) => p.id === "5k-to-half-marathon");
check(half && half.status === "checkout_pending" && half.price === "$8.99", "Half product is the real program at $8.99, Checkout pending");

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
async function visit(path, width = 1280) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  await page.setRequestInterception(true);
  page.on("request", (r) => (r.url().startsWith(`http://127.0.0.1:${PORT}`) ? r.continue() : r.abort()));
  await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: "networkidle0" });
  const info = await page.evaluate(() => ({
    text: document.body.innerText,
    html: document.documentElement.outerHTML,
    metas: [...document.querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')].map((m) => m.content),
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
    strike: document.querySelectorAll("s, del, strike").length + [...document.querySelectorAll("*")].filter((e) => getComputedStyle(e).textDecorationLine.includes("line-through")).length,
    gifts: [...document.querySelectorAll(".gift-block")].map((g) => ({
      id: g.getAttribute("data-gift-for"),
      btn: g.querySelector(".btn-gift")?.textContent.trim(),
      href: g.querySelector("a.btn-gift")?.getAttribute("href") || null,
      disabled: g.querySelector(".btn-gift")?.getAttribute("aria-disabled") === "true",
      terms: g.querySelector("a.gift-terms")?.getAttribute("href"),
      note: g.querySelector(".gift-note")?.innerText,
    })),
    buy5k: [...document.querySelectorAll('[data-product="doing-a-5k"]')].filter((a) => /^Buy app/.test(a.textContent.trim())).map((a) => ({ href: a.getAttribute("href"), text: a.textContent.trim() })),
    buyHalf: [...document.querySelectorAll('[data-product="5k-to-half-marathon"]')].map((a) => ({ href: a.getAttribute("href"), text: a.textContent.trim(), disabled: a.getAttribute("aria-disabled") === "true" })),
    sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    heights: (() => { const rows = {}; document.querySelectorAll("#home-programs-layout > .program-card:not(.program-card--featured)").forEach((c) => { const r = c.getBoundingClientRect(); (rows[Math.round(r.top)] = rows[Math.round(r.top)] || []).push(Math.round(r.height)); }); return Object.values(rows); })(),
  }));
  await page.close();
  return info;
}

try {
  for (const mode of ["default", "flipped"]) {
    flipped = mode === "flipped";
    const P5 = flipped ? "$8.99" : "$6.99";
    const L5 = flipped ? NEW_5K : "https://buy.stripe.com/14A6oH32iclb6TgeHf4ko04";
    for (const path of ["/", "/store/", ...Object.keys(PAGES)]) {
      const v = await visit(path);
      const tag = `[${mode}] ${path}`;
      check(!/was \$|\bwas\b[^.]{0,12}\$\d/i.test(v.text) && v.strike === 0, `${tag}: no "was" price, no strikethrough`);
      check(!/2-pack/i.test(v.text), `${tag}: no 2-Pack`);
      const expectGifts = path === "/" || path === "/store/" ? APPS : [PAGES[path]];
      check(JSON.stringify(v.gifts.map((g) => g.id).sort()) === JSON.stringify([...expectGifts].sort()), `${tag}: gift block on every app`, v.gifts.map((g) => g.id));
      for (const g of v.gifts) {
        const okBtn = flipped ? g.href && g.href.startsWith("https://buy.stripe.com/test_gift_") && /Give as a gift/.test(g.btn) && /Regalar/.test(g.btn) && !g.disabled : !g.href && g.btn === "Gift checkout pending" && g.disabled;
        const okNote = g.note.includes(GIFT_EN) && g.note.includes(GIFT_ES) && (g.id !== "22-day-workout-app" || (g.note.includes(G22_EN) && g.note.includes(G22_ES)));
        check(okBtn && g.terms === "/purchase-terms/" && okNote, `${tag}: ${g.id} gift button, Terms link, gift line EN/ES`, g);
      }
      if (path === "/" || path === "/store/" || path === "/doing-a-5k/") {
        const other = flipped ? "$6.99" : "$8.99";
        const where5k = path === "/doing-a-5k/" ? v.text : v.text;
        check(where5k.includes(LINE(P5)) && where5k.includes(LINE_ES(P5)), `${tag}: Doing a 5K price line EN/ES at ${P5}`);
        check(v.buy5k.length >= 1 && v.buy5k.every((b) => b.href === L5 && b.text === `Buy app, ${P5}`), `${tag}: Doing a 5K buy button ${P5} -> ${flipped ? "new" : "live"} link`, v.buy5k);
        check(!v.text.includes(other) || (path !== "/doing-a-5k/" && !flipped && v.text.includes("$8.99")), `${tag}: no stray ${other} for Doing a 5K`);
      }
      if (flipped) {
        check(!v.text.includes("$6.99") && !v.metas.some((m) => m.includes("$6.99")) && !v.ld.some((l) => /"6\.99"/.test(l)), `${tag}: no $6.99 left in text, meta or JSON-LD`);
      }
      if (path === "/doing-a-5k/") {
        check(v.metas.length === 3 && v.metas.every((m) => m.endsWith(`${P5}.`)), `${tag}: meta descriptions show ${P5}`, v.metas);
        check(v.ld.some((l) => l.includes(`"${P5.slice(1)}"`) && l.includes(L5)), `${tag}: JSON-LD offer ${P5} with ${flipped ? "new" : "live"} link`);
      }
      if (path === "/") check(v.ld.some((l) => l.includes(`"${P5.slice(1)}"`)), `${tag}: home JSON-LD Doing a 5K offer ${P5}`);
      if (path === "/" || path === "/store/" || path === "/5k-to-half-marathon/") {
        check(v.text.includes(LINE("$8.99")) && v.text.includes(LINE_ES("$8.99")), `${tag}: Half price line EN/ES $8.99`);
        const okHalf = flipped ? v.buyHalf.some((b) => b.href === HALF && !b.disabled && b.text === "Buy app, $8.99") : v.buyHalf.some((b) => b.disabled && b.text === "Buy app, $8.99") && !v.buyHalf.some((b) => /buy\.stripe\.com/.test(b.href || ""));
        check(okHalf, `${tag}: Half buy button ${flipped ? "live" : "Checkout pending"}`, v.buyHalf);
        check(!/Coming soon/i.test((v.text.match(/5K to Half Marathon[\s\S]{0,200}/) || [""])[0]) || path === "/store/", `${tag}: Half no longer Coming soon`);
      }
      if (path === "/") check(v.heights.every((r) => new Set(r).size === 1), `${tag}: program cards equal height per row at 1280`, v.heights);
    }
    for (const path of ["/", "/store/", "/5k-to-half-marathon/", "/doing-a-5k/"]) {
      const m = await visit(path, 390);
      check(!m.sideways, `[${mode}] ${path}: no sideways scroll at 390`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
