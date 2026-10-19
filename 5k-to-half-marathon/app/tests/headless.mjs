/**
 * 5K to Half Marathon app: headless click-through.
 *   PORT=8799 SHOTS=/workspace/half-app node 5k-to-half-marathon/app/tests/headless.mjs
 * Needs puppeteer-core (resolved from ./node_modules, e.g. a symlink to /workspace/pptr-tools/node_modules)
 * and Chrome at /usr/bin/google-chrome (or CHROME=...).
 * Covers: Health and safety + App Terms consent screen (shared design, hs version, text hash), onboarding (run level A and B, not-ready block), Day 1, run timer,
 * check-off and undo, strength timer, EN/ES, offline reload via the service worker, no Google Analytics,
 * no sideways scroll at 390 px, manifest icons, copy rules (no em/en dashes, no banned names).
 */
import puppeteer from "puppeteer-core";
import { createServer } from "http";
import { readFileSync, existsSync, statSync, mkdirSync, readdirSync } from "fs";
import { join, extname, normalize } from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const appDir = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
const repo = normalize(join(appDir, "..", ".."));
const PORT = Number(process.env.PORT || 8799);
const SHOTS = process.env.SHOTS || "";
const BASE = `http://127.0.0.1:${PORT}`;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".woff2": "font/woff2" };

let passes = 0, failures = 0;
function check(ok, name, extra) {
  if (ok) { passes++; console.log("PASS  " + name); }
  else { failures++; console.log("FAIL  " + name + (extra !== undefined ? "\n      " + JSON.stringify(extra) : "")); }
}

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  let f = normalize(join(repo, p));
  if (!f.startsWith(repo)) { res.writeHead(403); return res.end(); }
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(PORT, "127.0.0.1");

const APP = `${BASE}/5k-to-half-marathon/app/`;
const shot = async (page, name, fullPage = true) => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: join(SHOTS, name), fullPage }); } };
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("5k-to-half-marathon-v1") || "null"));

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
try {
  // 1. copy rules on app source
  const banned = /75 Hard|75 Soft|Whole30|Couch to 5K|C25K|Kindle/i;
  const files = [];
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
    if (e.name === "node_modules" || e.name === "tests") return;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(js|json|html|css|webmanifest)$/.test(e.name)) files.push(p);
  });
  walk(appDir);
  const dashFiles = files.filter((f) => /[\u2013\u2014]/.test(readFileSync(f, "utf8")));
  const bannedFiles = files.filter((f) => banned.test(readFileSync(f, "utf8")));
  check(dashFiles.length === 0, "no em or en dashes in app files", dashFiles);
  check(bannedFiles.length === 0, "no banned names in app files", bannedFiles);
  const html = readFileSync(join(appDir, "index.html"), "utf8");
  check(!/ga\.js|gtag|googletagmanager/.test(html), "no Google Analytics tag in app HTML");
  check(/noindex/.test(html), "app page is noindex (same as Doing a 5K app)");
  const appSrc = readFileSync(join(appDir, "js", "app.js"), "utf8") + readFileSync(join(appDir, "js", "i18n.js"), "utf8");
  check(/coachsalimheyaime@gmail\.com/.test(appSrc) && /3 days \(72 hours\)/.test(appSrc), "refund email and 3-day policy text in app");
  check(/all sales are final, except where the law requires otherwise\./.test(appSrc) && /todas las ventas son definitivas, salvo cuando la ley exija otra cosa\./.test(appSrc), "refund text: 'except where the law requires otherwise' (EN) and 'todas las ventas son definitivas, salvo cuando la ley exija otra cosa' (ES)");
  check(!/18 años o más y leí|have read the Health and safety information above/.test(appSrc), "old health checkbox text is gone");
  const { HS_VERSION, HS_TEXT } = await import(join(appDir, "js", "health-ack-text.js"));
  for (const l of ["en", "es"]) {
    const h = HS_TEXT[l];
    const txt = [h.ackTitle, h.ackLabel, h.ack, h.title, h.lead, ...h.sections.map((x) => x[1] + "\n" + x[2]), h.termsHeading, ...h.terms.map((x) => x[0] + "\n" + x[1])].join("\n\n");
    check(createHash("sha256").update(txt).digest("hex") === h.hash, `consent text ${l} matches its SHA-256 (verbatim copy of the shared screen)`);
  }
  check(HS_TEXT.en.ackLabel === "I agree to the Terms, Health and Safety." && HS_TEXT.es.ackLabel === "Acepto los Términos y la información de Salud y seguridad.", "approved short labels EN/ES");
  check(HS_TEXT.en.ack === "I am 18 or older. I have read the Health and safety information, and I agree to the App Terms, including the Assumption of Risk and the Release of Liability, which includes claims based on negligence." &&
    HS_TEXT.es.ack === "Tengo 18 años o más. Leí la información de Salud y seguridad y acepto los Términos de las apps, incluidas la Asunción de riesgos y la Exoneración de responsabilidad, que incluye reclamos por negligencia.", "approved consent sentences EN/ES");
  const shared = existsSync(join(repo, "js", "health-ack.js")) ? readFileSync(join(repo, "js", "health-ack.js"), "utf8") : "";
  if (shared) check(shared.includes(`VERSION = "${HS_VERSION}"`) && shared.includes(HS_TEXT.en.hash) && shared.includes(HS_TEXT.es.hash), "same version and text hashes as /js/health-ack.js");

  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const gaHits = [];
  page.on("request", (r) => { if (/googletagmanager|google-analytics|analytics\.google/.test(r.url())) gaHits.push(r.url()); });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());

  // 2. health and safety screen
  await page.goto(APP + "?e2e&lang=en", { waitUntil: "networkidle0" });
  check(!!(await page.$('[data-screen="health-ack"]')), "Health and safety screen shows first");
  check(await page.$eval("#ack-go", (b) => b.disabled), "Continue disabled until the box is ticked");
  check(!(await page.$("#onboard-form")), "no onboarding behind the health screen");
  check(await noSideways(page), "health screen: no sideways scroll at 390");
  await shot(page, "half-app-health-390.png", false);
  const cs = await page.evaluate(() => {
    const lab = document.querySelector('label[for="ack-tick"]');
    const sent = document.querySelector("#ack-sentence");
    const r = sent.getBoundingClientRect();
    return {
      label: lab.querySelector("strong.hs-ack-label")?.textContent,
      sentence: sent.textContent,
      sentenceInLabel: lab.contains(sent),
      sentenceVisible: r.height > 0 && !sent.closest("details"),
      links: [...sent.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href"), a.target]),
      detailsClosed: !document.querySelector(".hs-ack-more").open,
      hasTerms: /ASSUMPTION OF RISK/.test(document.querySelector(".hs-ack-full").textContent) && /RELEASE OF LIABILITY/.test(document.querySelector(".hs-ack-full").textContent),
    };
  });
  check(cs.label === "I agree to the Terms, Health and Safety.", "bold short label", cs.label);
  check(cs.sentenceInLabel && cs.sentenceVisible && /^I am 18 or older\. .*claims based on negligence\.$/.test(cs.sentence), "consent sentence always visible, inside the label", cs);
  check(JSON.stringify(cs.links) === JSON.stringify([["Health and safety information", "/health-safety/", "_blank"], ["App Terms", "/purchase-terms/", "_blank"]]), "sentence links Health and safety and App Terms", cs.links);
  check(cs.detailsClosed && cs.hasTerms, "'Read the full text' collapsed, includes Assumption of Risk and Release");
  await page.click('#ack-sentence a[href="/purchase-terms/"]').catch(() => {});
  await sleep(200);
  for (const p of (await browser.pages())) if (p !== page && /purchase-terms/.test(p.url())) await p.close();
  check(!(await page.$eval("#ack-tick", (c) => c.checked)) && (await page.$eval("#ack-go", (b) => b.disabled)), "clicking a link does not tick the box");
  await page.click("#ack-tick");
  await page.click("#ack-go");
  await page.waitForSelector("#onboard-form");
  const ack = await page.evaluate(() => JSON.parse(localStorage.getItem("actm.healthAck.5k-to-half-marathon") || "null"));
  check(ack && ack.version === HS_VERSION && ack.lang === "en" && ack.textHash === HS_TEXT.en.hash && ack.label === HS_TEXT.en.ackLabel && ack.accepted === HS_TEXT.en.ack && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(ack.at), "consent stored on device: version, text hash, language, label, sentence, ISO time", ack);

  // 3. onboarding
  await shot(page, "half-app-onboarding-390.png");
  check(await noSideways(page), "onboarding: no sideways scroll at 390");
  check(!(await page.$('input[name="goal"]')), "no 5K goal option in the Half app");
  await page.$eval('input[name="continuousMin"]', (el) => { el.value = "10"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  check(await page.$eval("#not-ready-card", (el) => !el.classList.contains("hidden")) && (await page.$eval("#build-plan", (b) => b.disabled)), "not-ready message and disabled build under 20 min without run-walk");
  await page.click('input[name="can30RunWalk"]');
  check(await page.$eval("#not-ready-card", (el) => el.classList.contains("hidden")), "30 min run-walk makes you Beginner");
  await page.$eval('input[name="continuousMin"]', (el) => { el.value = "25"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.$eval('input[name="pushups"]', (el) => { el.value = "10"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  const preview = await page.$eval("#run-level-preview", (el) => el.textContent);
  check(/Beginner \(16 weeks\)/.test(preview), "run level preview Beginner 16 weeks", preview);
  await page.click("#build-plan");
  await page.waitForSelector(".today-card");
  let s = await state(page);
  check(s && s.meta.weeks === 16 && s.meta.coachPlanId === "beginner-3day" && s.meta.strengthLevel === "average" && s.meta.goal === "half", "plan: beginner-3day, 16 weeks, strength Average", s && s.meta);
  check(s.workouts.length > 30 && s.strengthWorkouts.length > 10, "plan has runs and strength sessions", [s.workouts.length, s.strengthWorkouts.length]);

  // 4. Day 1
  const day1 = await page.$eval(".today-card", (el) => el.textContent);
  check(/Week 1/.test(day1) && /Start run/.test(day1), "Day 1 card shows Week 1 and Start run", day1.slice(0, 120));
  await shot(page, "half-app-day1-390.png", false);
  check(await noSideways(page), "Today: no sideways scroll at 390");

  // 5. run timer
  const firstId = s.workouts.sort((a, b) => a.sessionIndex - b.sessionIndex)[0].id;
  await page.click("#start-workout");
  await page.waitForSelector('[data-screen="timer"]');
  const c1 = await page.$eval("#timer-countdown", (el) => el.textContent);
  check(/^\d+:\d\d$/.test(c1), "timer shows a countdown", c1);
  check(await noSideways(page), "timer: no sideways scroll at 390");
  await page.click("#timer-pause");
  check((await page.$eval("#timer-pause", (b) => b.textContent)) === "Resume", "pause toggles to Resume");
  await page.click("#timer-pause");
  await page.waitForSelector("#complete-form", { timeout: 20000 });
  check(true, "timer runs through all steps to the save screen");
  await page.click("#complete-form button[type=submit]");
  await page.waitForSelector(".today-card");
  s = await state(page);
  check(s.completed.length === 1 && s.completed[0].workoutId === firstId, "run saved as complete", s.completed);

  // 6. check-off without the timer
  await page.click("#check-off-run");
  await page.waitForSelector(".today-card");
  s = await state(page);
  check(s.completed.length === 2, "Mark done checks off the next run", s.completed.length);
  await page.click(".btn-check-strength");
  await page.waitForSelector(".btn-undo-strength");
  s = await state(page);
  check(s.strengthCompleted.length === 1, "strength check-off saved");
  await page.click(".btn-undo-strength");
  await page.waitForSelector(".btn-start-strength");
  s = await state(page);
  check(s.strengthCompleted.length === 0, "strength undo works");

  // 7. strength timer
  await page.click(".btn-start-strength");
  await page.waitForSelector("#begin-strength");
  check(await noSideways(page), "strength overview: no sideways scroll at 390");
  await page.click("#begin-strength");
  await page.waitForSelector('[data-screen="strength-timer"]');
  await page.waitForFunction(() => !document.querySelector("#strength-done").hidden, { timeout: 10000 });
  await page.click("#strength-done");
  await page.waitForSelector("#strength-complete-form", { timeout: 15000 });
  await page.click("#strength-complete-form button[type=submit]");
  await page.waitForSelector(".today-card");
  s = await state(page);
  check(s.strengthCompleted.length === 1, "strength timer flow saves the session");

  // 8. plan, progress, settings at 390
  for (const v of ["plan", "progress", "settings"]) {
    await page.evaluate((h) => (location.hash = h), v);
    await sleep(200);
    check(await noSideways(page), `${v}: no sideways scroll at 390`);
  }
  const settingsText = await page.$eval("#app", (el) => el.textContent);
  check(/coachsalimheyaime@gmail\.com/.test(settingsText) && /3 days \(72 hours\)/.test(settingsText), "Settings shows the refund policy and email");

  // 9. Spanish
  await page.evaluate(() => (location.hash = "today"));
  await sleep(200);
  await page.click("#lang-btn");
  await sleep(200);
  const es = await page.evaluate(() => ({ lang: document.documentElement.lang, nav: [...document.querySelectorAll(".app-nav-btn")].map((b) => b.textContent), text: document.querySelector("#app").textContent }));
  check(es.lang === "es" && es.nav.join(",") === "Hoy,Plan,Progreso,Ajustes" && /Semana/.test(es.text) && /Empezar carrera/.test(es.text), "Spanish UI after the language button", es.nav);
  await shot(page, "half-app-es-390.png", false);
  check(await noSideways(page), "Spanish Today: no sideways scroll at 390");
  await page.evaluate(() => (location.hash = "settings"));
  await sleep(200);
  const esSettings = await page.$eval("#app", (el) => el.textContent);
  check(/Reembolsos/.test(esSettings) && /3 días \(72 horas\)/.test(esSettings) && /coachsalimheyaime@gmail\.com/.test(esSettings), "Spanish refund text");
  check(await noSideways(page), "Spanish settings: no sideways scroll at 390");
  await page.reload({ waitUntil: "networkidle0" });
  check((await page.evaluate(() => document.documentElement.lang)) === "es", "language choice persists after reload (no ?lang)", await page.evaluate(() => location.search));
  await page.evaluate(() => (location.hash = "today"));
  await sleep(200);
  await page.click("#lang-btn");
  await sleep(200);
  check((await page.evaluate(() => document.documentElement.lang)) === "en", "switch back to English");

  // 10. offline
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 15000 }).catch(() => {});
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload({ waitUntil: "networkidle0" }); }
  check(await page.evaluate(() => !!navigator.serviceWorker.controller), "service worker controls the app");
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".today-card", { timeout: 10000 }).catch(() => {});
  const offlineOk = !!(await page.$(".today-card"));
  check(offlineOk, "app loads offline and shows Today");
  await page.setOfflineMode(false);

  // 11. no GA, no errors
  check(gaHits.length === 0 && (await page.evaluate(() => typeof window.gtag === "undefined" && typeof window.dataLayer === "undefined")), "no Google Analytics requests or globals in the app", gaHits);
  check(errors.length === 0, "no page errors", errors);

  // 12. manifest and icons
  const man = JSON.parse(readFileSync(join(appDir, "manifest.webmanifest"), "utf8"));
  check(man.name === "5K to Half Marathon" && man.icons.length >= 3, "manifest name and icons");
  for (const ic of ["icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
    const same = readFileSync(join(appDir, "icons", ic)).equals(readFileSync(join(repo, "icons", "apps", "5k-to-half-marathon", ic)));
    check(same, `app icon ${ic} matches /icons/apps/5k-to-half-marathon/`);
  }
  await ctx.close();

  // 13. Average plan via the two questions, 4 days, Spanish from the start
  const ctx2 = await browser.createBrowserContext();
  const p2 = await ctx2.newPage();
  await p2.setViewport({ width: 390, height: 844 });
  p2.on("dialog", (d) => d.accept());
  await p2.goto(APP + "?e2e&lang=es", { waitUntil: "networkidle0" });
  const ackEs = await p2.evaluate(() => ({ label: document.querySelector("strong.hs-ack-label")?.textContent, sentence: document.querySelector("#ack-sentence")?.textContent, links: [...document.querySelectorAll("#ack-sentence a")].map((a) => a.getAttribute("href")) }));
  check(ackEs.label === "Acepto los Términos y la información de Salud y seguridad." && ackEs.sentence === HS_TEXT.es.ack && JSON.stringify(ackEs.links) === JSON.stringify(["/health-safety/#es", "/purchase-terms/#es"]), "Spanish consent screen: label, sentence, links", ackEs);
  check(await noSideways(p2), "Spanish consent screen: no sideways scroll at 390");
  await shot(p2, "half-app-health-es-390.png", false);
  await p2.click("#ack-tick");
  await p2.click("#ack-go");
  await p2.waitForSelector("#onboard-form");
  const ack2 = await p2.evaluate(() => JSON.parse(localStorage.getItem("actm.healthAck.5k-to-half-marathon") || "null"));
  check(ack2 && ack2.lang === "es" && ack2.textHash === HS_TEXT.es.hash && ack2.accepted === HS_TEXT.es.ack, "Spanish consent stored with ES text hash", ack2);
  await p2.click('input[name="days"][value="4"]');
  await p2.click('input[name="runLevelMethod"][value="b"]');
  await p2.click('input[name="continuousRange"][value="m40plus"]');
  await p2.click('input[name="runDaysNow"][value="d3plus"]');
  for (const d of [1, 3, 5, 6]) {
    const checked = await p2.$eval(`input[name="day"][value="${d}"]`, (el) => el.checked);
    if (!checked) await p2.click(`input[name="day"][value="${d}"]`);
  }
  await p2.click("#build-plan");
  await p2.waitForSelector(".today-card");
  const s2 = await state(p2);
  check(s2.meta.weeks === 12 && s2.meta.coachPlanId === "average-4day" && s2.meta.daysPerWeek === 4, "two-question route: Average, 12 weeks, 4 days", s2.meta);
  check(await noSideways(p2), "Spanish Today (4 days): no sideways scroll at 390");
  await ctx2.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
