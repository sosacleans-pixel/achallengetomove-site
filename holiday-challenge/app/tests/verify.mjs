/**
 * Playwright checks for the 30 Days Before X-mas app.
 * Serves the whole site root so the app runs at /holiday-challenge/app/ (same path as production).
 * Env: CHROME=/path/to/chrome (optional), SHOTS=/dir for screenshots (optional),
 *      HC_TIMEOUT=ms per Playwright action (default 60000; slow boxes can raise it),
 *      HC_ONLY=1,2,8 to run only some sections (default: all). Section 0 (privacy/network checks) and the
 *      final "no off-origin requests" / "no JS errors" checks always run.
 * Sections: 1-9 live challenge, 10 late-join goal, 11 self-paced edition, 12 Spanish (EN/ES key parity, switch,
 *   390px overflow), 13 Consumer Health Data Privacy Policy (app link + site page + footers).
 * Date override: CONFIG.allowDateOverride is false in the shipped app. Tests that need ?date= call
 * newPage(..., { dateOverride: true }), which intercepts js/config.js in that test browser only.
 */
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const appDir = join(fileURLToPath(import.meta.url), "..", "..");
const siteRoot = join(appDir, "..", "..");
let BASE = "";
const SHOTS = process.env.SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".txt": "text/plain" };
const TIMEOUT = Number(process.env.HC_TIMEOUT) || 60000;
const ONLY = (process.env.HC_ONLY || "").split(",").map((x) => x.trim()).filter(Boolean);
const run = (k) => !ONLY.length || ONLY.includes(String(k));

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = join(siteRoot, p);
  if (!file.startsWith(siteRoot) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(Number(process.env.PORT) || 0, "127.0.0.1", r));
BASE = `http://127.0.0.1:${server.address().port}/holiday-challenge/app/`;
const ORIGIN = new URL(BASE).origin;

const results = [];
const errors = [];
const offsite = []; // every request that leaves the app's own origin (must stay empty)
const sameOrigin = []; // same-origin requests seen (proves the tracker is wired up)
function trackRequests(ctx, sink = offsite) {
  ctx.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol === "data:" || u.protocol === "blob:") return;
    if (u.origin !== ORIGIN) sink.push(r.url()); else sameOrigin.push(u.pathname);
  });
}
const configSrc = readFileSync(join(appDir, "js", "config.js"), "utf8");
async function enableDateOverride(ctx) {
  const body = configSrc.replace(/allowDateOverride:\s*false/, "allowDateOverride: true");
  if (body === configSrc) throw new Error("could not flip allowDateOverride in the test copy of config.js");
  await ctx.route("**/holiday-challenge/app/js/config.js", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body }));
}
// Every element inside the app's main area, modal, header and bottom nav must fit the viewport (no sideways overflow).
async function overflowOn(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    if (document.documentElement.scrollWidth > vw + 1) bad.push(`page ${document.documentElement.scrollWidth}>${vw}`);
    document.querySelectorAll("#app-main *, .modal *, .app-header *, .bottom-nav *, .app-footer *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > vw + 1 || r.left < -1)) bad.push(`${el.tagName.toLowerCase()}.${el.className}: ${(el.textContent || "").trim().slice(0, 40)}`);
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible" && el.clientWidth) bad.push(`overflowing ${el.tagName.toLowerCase()}.${el.className}: ${(el.textContent || "").trim().slice(0, 40)}`);
    });
    return bad;
  });
}
function check(name, cond, extra = "") { results.push([name, !!cond, extra]); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`); }

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

async function newPage(mockNow, viewport = { width: 390, height: 844 }, { dateOverride = false, ...ctxOpts } = {}) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block", locale: "en-US", ...ctxOpts });
  ctx.setDefaultTimeout(TIMEOUT);
  trackRequests(ctx);
  if (dateOverride) await enableDateOverride(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  if (mockNow) await page.addInitScript((iso) => { window.__HC_MOCK_NOW = iso; }, mockNow);
  return { ctx, page };
}
async function seed(page, state) {
  await page.goto(BASE + "index.html#/today");
  await page.evaluate((s) => localStorage.setItem("holiday-30-v1", JSON.stringify(s)), state);
  await page.reload();
  await page.waitForSelector("#app-main > *");
}
function baseState(extra = {}) {
  return { version: 1, setupDone: true, joinedDate: "2026-11-25", setup: { age: true, readiness: [false, false, false, false, false, false], gentleAck: false, terms: true }, level: "b", equipment: "none", busyDays: [], reminderTime: "07:00", unbrokenOptIn: false, days: {}, makeup: [], tests: {}, levelLog: [], ...extra };
}
async function shot(page, name) {
  if (!SHOTS) return;
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.screenshot({ path: join(SHOTS, name) }); // what the screen shows
  // full-length capture; the fixed bottom nav is pinned to the end so it doesn't cover content
  await page.addStyleTag({ content: ".bottom-nav{position:static!important} body{padding-bottom:0!important}" });
  await page.screenshot({ path: join(SHOTS, name.replace(".png", "-full.png")), fullPage: true });
  await page.evaluate(() => document.querySelectorAll("style").forEach((s) => { if (s.textContent.includes(".bottom-nav{position:static")) s.remove(); }));
}
async function setup(page) {
  await page.click("#start-setup");
  await page.check("#age-ok"); await page.click("#setup-next");
  for (let i = 0; i < 6; i++) await page.check(`input[name=q${i}][value=no]`);
  await page.click("#setup-next");
  await page.fill("#pu-now", "5"); await page.click("#setup-next");
  await page.check('input[name=eq][value="dumbbell"]'); await page.check('input[name=busy][value="6"]'); await page.click("#setup-next");
  await page.click("#setup-next");
  check("terms checkbox required (not pre-checked)", await page.isVisible("#setup-err"));
  await page.check("#terms-ok"); await page.click("#setup-next");
}

// 1. Pre-launch countdown + preview Day 1 + setup
if (run(1)) for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  const { ctx, page } = await newPage("2026-11-10T10:00:00", vp);
  await page.goto(BASE + "index.html");
  await page.waitForSelector("#countdown");
  const d = await page.textContent("#cd-d");
  check(`[${vp.width}] pre-launch countdown shows days to Nov 25`, Number(d) === 14, `days=${d}`);
  check(`[${vp.width}] preview Day 1 button`, await page.isVisible("#preview-day1"));
  await shot(page, `welcome-countdown-${vp.width}.png`);
  if (vp.width === 390) {
    await page.click("#preview-day1");
    await page.waitForSelector(".day-head");
    const t = await page.textContent(".page-title");
    check("preview Day 1 shows Baseline test", /Baseline test/.test(t), t.trim());
    check("preview has no check-off buttons", !(await page.isVisible("#log-core")));
    await page.goto(BASE + "index.html#/today");
    await page.waitForSelector("#start-setup");
    await setup(page);
    await page.waitForSelector("#countdown");
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem("holiday-30-v1")));
    check("setup saved locally (joined = Nov 25, dumbbell, busy Sat)", st.setupDone && st.joinedDate === "2026-11-25" && st.equipment === "dumbbell" && st.busyDays.includes(6));
  }
  await ctx.close();
}

// 2. Day 1
if (run(2)) {
  const { ctx, page } = await newPage("2026-11-25T08:00:00");
  await seed(page, baseState());
  const t = await page.textContent(".page-title");
  check("Nov 25 opens Day 1", /Baseline test/.test(t) && /Day 1 of 30/.test(await page.textContent(".day-head .kicker")));
  await page.click("#log-core");
  await page.waitForSelector(".status-card.core");
  await page.fill('#tests-form input[name="pu"]', "10");
  await page.fill('#tests-form input[name="sts"]', "12");
  await page.click('#tests-form button[type="submit"]');
  await page.waitForTimeout(150);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem("holiday-30-v1")));
  check("Day 1 core logged + test saved", st.days[1].status === "core" && st.tests[1].pu === 10);
  check("push-up 10 sets level to Average", st.level === "a");
  await shot(page, "day1-390.png");
  await ctx.close();
}

// 3. Mid-challenge (Day 15, Dec 9) with history; back-log rule
if (run(3)) {
  const days = {}; for (let n = 1; n <= 14; n++) if (![4, 9].includes(n)) days[n] = { status: n % 3 ? "core" : "floor", habits: { water: true, steps: true, wind_down: true, breath_1min: true } };
  days[9] = { status: "protected" };
  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const { ctx, page } = await newPage("2026-12-09T10:30:00", vp);
    await seed(page, baseState({ days, busyDays: [3], tests: { 1: { pu: 5, sts: 10 } } }));
    const head = await page.textContent(".day-head");
    check(`[${vp.width}] Dec 9 opens Day 15 Strength A`, /Day 15 of 30/.test(head) && /Strength A/.test(head));
    check(`[${vp.width}] busy-day nudge on Wednesday`, await page.isVisible("#busy-nudge"));
    check(`[${vp.width}] Day 15 optional push-up check shown`, await page.isVisible("#check15-form"));
    await shot(page, `day-mid-${vp.width}.png`);
    await page.goto(BASE + "index.html#/day/14");
    await page.waitForSelector(".day-head");
    check(`[${vp.width}] yesterday editable before noon`, (await page.isVisible(".status-card")) && (await page.isVisible("#undo-day")));
    await page.goto(BASE + "index.html#/progress");
    await page.waitForSelector("#complete-count");
    const cc = await page.textContent("#complete-count");
    check(`[${vp.width}] progress counts 12 complete days`, cc.trim() === "12", cc);
    { const sn = Number(await page.textContent("#streak-now")); check(`[${vp.width}] streak survives the protected day (5-8, protected 9, 10-14 = 9)`, sn === 9, `streak=${sn}`); }
    await shot(page, `progress-${vp.width}.png`);
    await ctx.close();
  }
  const { ctx, page } = await newPage("2026-12-09T13:00:00");
  await seed(page, baseState({ days: {} }));
  await page.goto(BASE + "index.html#/day/8");
  await page.waitForSelector(".day-head");
  check("older missed day is locked", !(await page.isVisible("#log-core")));
  await page.goto(BASE + "index.html#/day/14");
  await page.waitForSelector(".day-head");
  check("yesterday locked after 11:59 AM", !(await page.isVisible("#log-core")));
  await page.goto(BASE + "index.html#/day/15");
  await page.waitForSelector(".day-head");
  await page.click("#stop-log");
  await page.click("#stop-confirm");
  await page.waitForSelector(".status-card.protected");
  check("Stop & Log marks the day protected", true);
  await ctx.close();
}

// 4. Late join (Dec 10 = Day 16)
if (run(4)) {
  const { ctx, page } = await newPage("2026-12-10T09:00:00");
  await page.goto(BASE + "index.html");
  await page.waitForSelector(".late-card");
  check("late joiner sees 'today is Day 16' and 15 days left", /Day 16/.test(await page.textContent(".late-card")) && /15 days left/.test(await page.textContent(".late-card")));
  await setup(page);
  await page.waitForSelector(".day-head");
  check("late joiner lands on Day 16", /Day 16 of 30/.test(await page.textContent(".day-head")));
  check("late joiner gets a baseline test form on join day", await page.isVisible("#tests-form"));
  await page.goto(BASE + "index.html#/plan");
  await page.waitForSelector(".plan-item");
  const before = await page.locator(".plan-item.st-before").count();
  check("days 1-15 shown as 'before you joined'", before === 15, `count=${before}`);
  await page.goto(BASE + "index.html#/progress");
  await page.waitForSelector(".ring");
  check("late-join target is proportional (11)", /\/ 11/.test(await page.textContent(".ring")));
  await shot(page, "late-join-progress-390.png");
  await ctx.close();
}

// 5. Completion (Dec 26)
if (run(5)) for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  const days = {}; for (let n = 1; n <= 30; n++) if (n % 5) days[n] = { status: n % 2 ? "core" : "floor", habits: {} };
  const { ctx, page } = await newPage("2026-12-26T10:00:00", vp);
  await seed(page, baseState({ days, tests: { 1: { pu: 4, sts: 10, bal: 20 }, 30: { pu: 7, sts: 9, bal: 25 } } }));
  await page.waitForSelector(".done-hero");
  check(`[${vp.width}] after Dec 24 shows completion summary`, /Finisher/.test(await page.textContent(".done-hero")));
  check(`[${vp.width}] summary shows 24 complete days`, (await page.textContent("#done-complete")).trim() === "24");
  check(`[${vp.width}] lower retest number shows 'logged', not a drop`, /logged/.test(await page.textContent("table.cmp")));
  await shot(page, `completion-${vp.width}.png`);
  await ctx.close();
}
if (run(5)) {
  const days = {}; for (let n = 1; n <= 12; n++) days[n] = { status: "core" }; days[13] = { status: "protected" }; days[14] = { status: "protected" };
  const { ctx, page } = await newPage("2026-12-25T10:00:00");
  await seed(page, baseState({ days }));
  await page.waitForSelector(".done-hero");
  check("not-yet copy is 'welcome back', never 'failed'", /Welcome back/.test(await page.textContent(".done-hero")) && !/fail/i.test(await page.textContent("main")));
  check("protected days open Keep Going make-up logging", await page.isVisible("#log-makeup"));
  await ctx.close();
}

// 6. Date-override URL param (enabled only in this test browser; see enableDateOverride)
if (run(6)) {
  const { ctx, page } = await newPage(null, undefined, { dateOverride: true });
  await page.goto(BASE + "index.html?date=2026-12-01#/day/7");
  await page.waitForSelector(".day-head");
  check("?date= param shows debug ribbon", await page.isVisible("#debug-ribbon"));
  await seed(page, baseState());
  check("?date=2026-12-01 makes today Day 7", /Day 7 of 30/.test(await page.textContent(".day-head")));
  const ics = await page.evaluate(() => window.__HC.buildICS());
  check("reminder calendar has 30 events", (ics.match(/BEGIN:VEVENT/g) || []).length === 30);
  await page.goto(BASE + "index.html?date=clear#/today");
  check("?date=clear removes override", !(await page.isVisible("#debug-ribbon")));
  await ctx.close();
}
// 6b. Shipped config: visitors can't move the clock with ?date= / ?now=
if (run(6)) {
  const { ctx, page } = await newPage(null);
  await page.goto(BASE + "index.html?date=2026-12-01#/day/7");
  await page.waitForSelector(".day-head");
  check("shipped config: ?date= shows no debug ribbon", !(await page.isVisible("#debug-ribbon")));
  check("shipped config: ?date= not stored", (await page.evaluate(() => sessionStorage.getItem("holiday-30-debug-now"))) === null);
  await page.goto(BASE + "index.html?now=2026-12-01T08:00#/today");
  await page.waitForSelector("#app-main > *");
  check("shipped config: ?now= ignored too", !(await page.isVisible("#debug-ribbon")));
  await ctx.close();
}

// 7. Offline reload (service worker allowed)
if (run(7)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  ctx.setDefaultTimeout(TIMEOUT);
  trackRequests(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror(offline): ${e.message}`));
  await page.addInitScript(() => { window.__HC_MOCK_NOW = "2026-12-03T09:00:00"; });
  await page.goto(BASE + "index.html");
  await page.evaluate(() => localStorage.setItem("holiday-30-v1", JSON.stringify({ version: 1, setupDone: true, joinedDate: "2026-11-25", setup: { readiness: [] }, level: "b", equipment: "none", busyDays: [], days: {}, makeup: [], tests: {}, levelLog: [] })));
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector(".day-head", { timeout: 15000 }).catch(() => {});
  check("offline reload still renders today's day", /Day 9 of 30/.test((await page.textContent("main")) || ""));
  await page.goto(BASE + "index.html#/moves").catch(() => {});
  await page.waitForSelector(".move-card", { timeout: 15000 }).catch(() => {});
  check("offline navigation works (Moves)", (await page.locator(".move-card").count()) > 20);
  const cached = await page.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open("holiday-30-v3"); return { keys, urls: (await c.keys()).map((r) => new URL(r.url).pathname) }; });
  check("service worker cache is holiday-30-v3", cached.keys.includes("holiday-30-v3"), cached.keys.join(","));
  check("fonts are in the offline cache", ["anton-v27-latin-400", "lato-v25-latin-400", "lato-v25-latin-700", "lato-v25-latin-900"].every((f) => cached.urls.some((u) => u.endsWith(`/fonts/${f}.woff2`))));
  await ctx.close();
}

// 9. Legal screens: every reviewed entry renders; reviewed text fits the phone layout; fonts are local
if (run(9)) {
  const { S } = await import(new URL("../js/strings.en.js", import.meta.url).href);
  const { ctx, page } = await newPage("2026-11-10T10:00:00");
  const overflow = () => page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    if (document.documentElement.scrollWidth > vw + 1) bad.push(`page ${document.documentElement.scrollWidth}>${vw}`);
    document.querySelectorAll("#app-main *, .modal *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > vw + 1 || r.left < -1)) bad.push(`${el.tagName.toLowerCase()}.${el.className}: ${(el.textContent || "").trim().slice(0, 40)}`);
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible" && el.clientWidth) bad.push(`overflowing ${el.tagName.toLowerCase()}.${el.className}: ${(el.textContent || "").trim().slice(0, 40)}`);
    });
    return bad;
  });
  for (const [which, arr, n] of [["terms", S.legal.terms, 14], ["privacy", S.legal.privacy, 13], ["refund", S.legal.refund, 4]]) {
    await page.goto(BASE + `index.html#/legal/${which}`);
    await page.waitForSelector(`#legal-${which}`);
    const got = await page.$$eval(`#legal-${which} h2.legal-h`, (hs) => hs.map((h) => [h.textContent, h.nextElementSibling?.textContent || ""]));
    check(`${which}: ${n} entries in strings, ${n} rendered`, arr.length === n && got.length === n, `strings=${arr.length} rendered=${got.length}`);
    check(`${which}: every heading and body renders in full`, arr.every(([h, b], i) => got[i] && got[i][0] === h && got[i][1] === b && h.trim() && b.trim()));
    const o = await overflow();
    check(`${which}: text fits a 390px screen`, o.length === 0, o.slice(0, 3).join(" | "));
    await shot(page, `legal-${which}-390.png`);
  }
  for (const which of ["disclaimer", "safety"]) {
    await page.goto(BASE + `index.html#/legal/${which}`);
    await page.waitForSelector(`#legal-${which}`);
    const o = await overflow();
    check(`${which}: text fits a 390px screen`, o.length === 0, o.slice(0, 3).join(" | "));
  }
  await page.goto(BASE + "index.html#/legal/refund");
  await page.waitForSelector("#legal-refund");
  const refundText = await page.textContent("#legal-refund");
  check("refund: approved 3-day wording shown exactly", refundText.includes("You can request a full refund within 3 days (72 hours) of purchase by emailing coachsalimheyaime@gmail.com. After that, all sales are final, and your enrollment never expires; it converts to the self-paced edition after Dec 24. Gift purchases: the buyer can request a full refund within 3 days of purchase, as long as the recipient hasn't redeemed the access code. Refunds go to the original payment method."));
  check("refund: no PENDING tag on the refund window", !S.legal.refund.find(([h]) => h === "Refunds")[1].includes("PENDING"));
  check("refund: old 7-day / Dec 1 window gone", !/7 days|whichever is later|activat/i.test(JSON.stringify(S.legal)));
  check("privacy: no longer says fonts come from Google", !/Google Fonts, so Google/.test(JSON.stringify(S.legal.privacy)));
  // setup screens with every readiness answer Yes (shows all hints and the any-Yes notice)
  await page.goto(BASE + "index.html#/today");
  await page.click("#start-setup");
  let o = await overflow(); check("setup step 1 (18+) fits 390px", o.length === 0, o.slice(0, 3).join(" | "));
  await page.check("#age-ok"); await page.click("#setup-next");
  for (let i = 0; i < 6; i++) await page.check(`input[name=q${i}][value=yes]`);
  const hints = await page.$$eval(".rq-hint", (els) => els.filter((e) => !e.classList.contains("hidden")).length);
  check("setup step 2: all 6 reviewed hints and the any-Yes notice show", hints === 6 && (await page.isVisible("#anyyes")));
  o = await overflow(); check("setup step 2 (readiness, all Yes) fits 390px", o.length === 0, o.slice(0, 3).join(" | "));
  await shot(page, "setup-readiness-yes-390.png");
  await page.check("#gentle-ack"); await page.click("#setup-next");
  await page.click("#setup-next"); await page.click("#setup-next");
  await page.waitForSelector("#terms-ok");
  o = await overflow(); check("setup step 5 (terms) fits 390px", o.length === 0, o.slice(0, 3).join(" | "));
  await shot(page, "setup-terms-390.png");
  await page.check("#terms-ok"); await page.click("#setup-next");
  await page.waitForSelector("#countdown");
  // Stop & Log text (day.stopText / stopSigns) in the modal, opened from a live day
  const { ctx: c2, page: p2 } = await newPage("2026-12-09T10:00:00");
  await seed(p2, baseState());
  await p2.click("#stop-log");
  await p2.waitForSelector(".modal");
  check("Stop & Log modal shows reviewed 911 text", (await p2.textContent(".modal")).includes(S.day.stopText));
  o = await p2.evaluate(() => { const vw = document.documentElement.clientWidth; return [...document.querySelectorAll(".modal *")].filter((el) => el.getBoundingClientRect().right > vw + 1).map((el) => el.tagName); });
  check("Stop & Log modal fits 390px", o.length === 0, o.join(","));
  await c2.close();
  // fonts: every weight in use is loaded from the app's own fonts folder
  await page.goto(BASE + "index.html#/legal/terms");
  await page.waitForSelector("#legal-terms");
  const fonts = await page.evaluate(async () => {
    await Promise.all(["400 16px Anton", "400 16px Lato", "700 16px Lato", "900 16px Lato"].map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    return [...document.fonts].map((f) => `${f.family.replace(/"/g, "")} ${f.weight} ${f.status}`);
  });
  check("self-hosted Anton 400 and Lato 400/700/900 load", ["Anton 400", "Lato 400", "Lato 700", "Lato 900"].every((f) => fonts.includes(`${f} loaded`)), fonts.join(", "));
  check("font files requested from the app's fonts folder", ["anton-v27-latin-400", "lato-v25-latin-400", "lato-v25-latin-700", "lato-v25-latin-900"].every((f) => sameOrigin.some((u) => u.endsWith(`/holiday-challenge/app/fonts/${f}.woff2`))));
  await ctx.close();
}


// 10. Late joins (DECIDED): allowed, goal = ceil(22/30 x days remaining); a Day 1 start = 22 of 30
if (run(10)) {
  const { CONFIG } = await import(new URL("../js/config.js", import.meta.url).href);
  const R = await import(new URL("../js/rules.js", import.meta.url).href);
  check("config: late joins allowed, proportional goal, 22 of 30", CONFIG.lateJoin === true && CONFIG.lateJoinTarget === "proportional" && CONFIG.requiredDays === 22);
  const expect = { 1: 22, 2: 22, 8: 17, 16: 11, 23: 6, 29: 2, 30: 1 };
  const got = Object.fromEntries(Object.keys(expect).map((j) => [j, R.lateJoinTarget(Number(j))]));
  check("late-join goal = ceil(22 * daysLeft / 30)", Object.entries(expect).every(([j, v]) => got[j] === v && v === Math.ceil((22 * (31 - j)) / 30) || (Number(j) === 1 && got[j] === 22)), JSON.stringify(got));
  const { ctx, page } = await newPage("2026-12-23T09:00:00");
  await page.goto(BASE + "index.html");
  await page.waitForSelector(".late-card");
  check("late join on Dec 23 is open (Day 29, 2 days left)", /Day 29/.test(await page.textContent(".late-card")) && /2 days left/.test(await page.textContent(".late-card")));
  await setup(page);
  await page.goto(BASE + "index.html#/progress");
  await page.waitForSelector(".ring");
  check("late join on Day 29: goal is 2", /\/ 2\b/.test(await page.textContent(".ring")));
  await ctx.close();
}

// 11. Self-paced edition (after Dec 24, or by choice): Day 1 = own start date, 30 days, no fixed calendar
if (run(11)) {
  const { S } = await import(new URL("../js/strings.en.js", import.meta.url).href);
  const { CONFIG } = await import(new URL("../js/config.js", import.meta.url).href);
  check("config: self-paced on, after Dec 24, 30 days", CONFIG.selfPaced.enabled && CONFIG.selfPaced.after === "2026-12-24" && CONFIG.selfPaced.days === 30);
  // a. first open after Dec 24
  {
    const { ctx, page } = await newPage("2026-12-28T09:00:00");
    await page.goto(BASE + "index.html");
    await page.waitForSelector("#self-start-card");
    check("first open Dec 28: self-paced start card, no live setup button", (await page.isVisible("#start-self")) && !(await page.isVisible("#start-setup")) && !(await page.isVisible("#countdown")));
    await shot(page, "self-paced-start-390.png");
    await page.click("#start-self");
    await page.waitForSelector("#self-setup-note");
    check("self-paced setup explains Day 1 = today", (await page.textContent("#self-setup-note")) === S.self.setupNote);
    await page.check("#age-ok"); await page.click("#setup-next");
    for (let i = 0; i < 6; i++) await page.check(`input[name=q${i}][value=no]`);
    await page.click("#setup-next"); await page.fill("#pu-now", "9"); await page.click("#setup-next"); await page.click("#setup-next");
    await page.check("#terms-ok"); await page.click("#setup-next");
    await page.waitForSelector(".day-head");
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem("holiday-30-v1")));
    check("self-paced state saved: mode self, start Dec 28", st.mode === "self" && st.startDate === "2026-12-28" && st.joinedDate === "2026-12-28");
    const kick = await page.textContent(".day-head .kicker");
    check("self-paced Day 1 is today (Mon, Dec 28)", /Day 1 of 30/.test(kick) && /Dec 28/.test(kick) && /Baseline test/.test(await page.textContent(".page-title")), kick.trim());
    check("self-paced Day 1 can be logged", await page.isVisible("#log-core"));
    await page.goto(BASE + "index.html#/day/2");
    await page.waitForSelector(".day-head");
    const d2 = await page.textContent("main");
    check("self-paced Day 2 is Dec 29, no Thanksgiving calendar text", /Dec 29/.test(d2) && !/Thanksgiving|Nov 26/.test(d2));
    await page.goto(BASE + "index.html#/day/30");
    await page.waitForSelector(".day-head");
    const d30 = await page.textContent("main");
    check("self-paced Day 30 is Jan 26, no Christmas Eve dates", /Jan 26/.test(d30) && !/Dec 2[2-7]|Christmas Eve/.test(d30));
    await page.goto(BASE + "index.html#/plan");
    await page.waitForSelector(".plan-item");
    check("self-paced plan: 30 days, none 'before you joined', own-calendar lead", (await page.locator(".plan-item").count()) === 30 && (await page.locator(".plan-item.st-before").count()) === 0 && (await page.textContent("main")).includes(S.self.planLead));
    await page.goto(BASE + "index.html#/progress");
    await page.waitForSelector(".ring");
    check("self-paced goal is 22 of 30", /\/ 22\b/.test(await page.textContent(".ring")));
    const ics = await page.evaluate(() => window.__HC.buildICS());
    check("self-paced reminders: 30 events from Dec 28 to Jan 26", (ics.match(/BEGIN:VEVENT/g) || []).length === 30 && /DTSTART:20261228T/.test(ics) && /DTSTART:20270126T/.test(ics) && !/DTSTART:20261125T/.test(ics));
    await ctx.close();
  }
  // b. choosing self-paced before the live window
  {
    const { ctx, page } = await newPage("2026-11-10T10:00:00");
    await page.goto(BASE + "index.html");
    await page.waitForSelector("#countdown");
    check("pre-launch welcome offers 'start self-paced' alongside the live setup", (await page.isVisible("#start-self")) && (await page.isVisible("#start-setup")));
    await page.click("#start-self");
    await page.check("#age-ok"); await page.click("#setup-next");
    for (let i = 0; i < 6; i++) await page.check(`input[name=q${i}][value=no]`);
    await page.click("#setup-next"); await page.click("#setup-next"); await page.click("#setup-next");
    await page.check("#terms-ok"); await page.click("#setup-next");
    await page.waitForSelector(".day-head");
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem("holiday-30-v1")));
    check("chose self-paced on Nov 10: Day 1 is Nov 10, no countdown", st.mode === "self" && st.startDate === "2026-11-10" && /Day 1 of 30/.test(await page.textContent(".day-head")) && !(await page.isVisible("#countdown")));
    await ctx.close();
  }
  // c. mid-run day numbering follows the user's own start date
  {
    const { ctx, page } = await newPage("2027-01-24T10:00:00");
    await seed(page, baseState({ mode: "self", startDate: "2027-01-10", joinedDate: "2027-01-10", days: { 1: { status: "core" }, 2: { status: "floor" } } }));
    const head = await page.textContent(".day-head");
    check("self-paced started Jan 10: Jan 24 is Day 15", /Day 15 of 30/.test(head) && /Jan 24/.test(head));
    await page.goto(BASE + "index.html#/progress");
    await page.waitForSelector("#complete-count");
    check("self-paced progress counts its own days", (await page.textContent("#complete-count")).trim() === "2");
    await ctx.close();
  }
  // d. existing live user past Dec 24: completion summary first, then the option to keep going self-paced
  {
    const days = {}; for (let n = 1; n <= 30; n++) if (n % 5) days[n] = { status: "core", habits: {} };
    const { ctx, page } = await newPage("2026-12-26T10:00:00");
    await seed(page, baseState({ days, tests: { 1: { pu: 4 } } }));
    await page.waitForSelector(".done-hero");
    const order = await page.evaluate(() => { const a = document.querySelector("#done-complete"); const b = document.querySelector("#keep-going-self-card"); return !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)); });
    check("live user on Dec 26 sees the completion summary, then 'keep going self-paced'", (await page.textContent("#done-complete")).trim() === "24" && order);
    await shot(page, "self-paced-keep-going-390.png");
    await page.click("#keep-going-self");
    await page.waitForSelector(".day-head");
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem("holiday-30-v1")));
    check("keep going: new self-paced run from Dec 26, live results kept in history", st.mode === "self" && st.startDate === "2026-12-26" && Object.keys(st.days).length === 0 && st.history.length === 1 && st.history[0].mode === "live" && Object.keys(st.history[0].days).length === 24 && st.setup.terms === true);
    check("keep going: today is self-paced Day 1", /Day 1 of 30/.test(await page.textContent(".day-head")) && (await page.isVisible("#log-core")));
    await ctx.close();
  }
  // e. self-paced finish + protected-day extension (capped at 7 extra days)
  {
    const days = {}; for (let n = 1; n <= 20; n++) days[n] = { status: "core" }; days[21] = { status: "protected" }; days[22] = { status: "protected" };
    const { ctx, page } = await newPage("2027-02-01T10:00:00");
    await seed(page, baseState({ mode: "self", startDate: "2027-01-01", joinedDate: "2027-01-01", days }));
    await page.waitForSelector(".done-hero");
    check("self-paced run past Day 30 shows its own finish title", (await page.textContent(".done-hero")).includes(S.self.doneTitle) && !/Christmas Eve/.test(await page.textContent(".done-hero")));
    check("self-paced protected days open make-up logging (Jan 30 + 2 days)", await page.isVisible("#log-makeup"));
    check("self-paced finish offers another self-paced round", await page.isVisible("#keep-going-self"));
    await ctx.close();
    const R = await import(new URL("../js/rules.js", import.meta.url).href);
    const many = {}; for (let n = 1; n <= 12; n++) many[n] = { status: "protected" };
    check("self-paced extension capped at 7 days", R.deadline({ setupDone: true, mode: "self", startDate: "2027-01-01", joinedDate: "2027-01-01", days: many, makeup: [] }) === "2027-02-06");
  }
}

// 12. Spanish: every key in both languages, EN/ES switch, browser default, no overflow at 390px
if (run(12)) {
  const EN = (await import(new URL("../js/strings.en.js", import.meta.url).href)).S;
  const ES = (await import(new URL("../js/strings.es.js", import.meta.url).href)).S;
  const PEN = (await import(new URL("../js/program.en.js", import.meta.url).href)).PROGRAM;
  const PES = (await import(new URL("../js/program.es.js", import.meta.url).href)).PROGRAM;
  const diffs = [];
  const sample = [3, 5];
  const cmp = (a, b, p) => {
    if (typeof a !== typeof b) return diffs.push(`${p}: ${typeof a} vs ${typeof b}`);
    if (typeof a === "function") {
      if (a.length !== b.length) diffs.push(`${p}: arity ${a.length} vs ${b.length}`);
      const out = b(...sample.slice(0, Math.max(1, b.length)).map((x) => (p.includes("window") || p.includes("extension") || p.includes("keepGoingWeek") || p.includes("debugRibbon") || p.includes("contact") ? "X" : x)));
      if (typeof out !== "string" || !out.trim()) diffs.push(`${p}: ES function returns empty`);
      return;
    }
    if (Array.isArray(a)) { if (!Array.isArray(b) || a.length !== b.length) diffs.push(`${p}: length ${a.length} vs ${b?.length}`); return a.forEach((v, i) => cmp(v, b?.[i], `${p}[${i}]`)); }
    if (a && typeof a === "object") { for (const k of new Set([...Object.keys(a), ...Object.keys(b || {})])) { if (!(k in a)) diffs.push(`${p}.${k}: only in ES`); else if (!b || !(k in b)) diffs.push(`${p}.${k}: missing in ES`); else cmp(a[k], b[k], `${p}.${k}`); } return; }
    if (typeof a === "string" && typeof b === "string" && a.trim() && !b.trim()) diffs.push(`${p}: empty in ES`);
  };
  cmp(EN, ES, "S");
  check("strings: every EN key exists in ES and vice versa (same shape, same list lengths)", diffs.length === 0, diffs.slice(0, 5).join(" | "));
  check("strings: ES bundle is marked lang es", EN.lang === "en" && ES.lang === "es");
  const pd = [];
  const KEEP = new Set(["id", "version", "date", "wd", "cat", "week", "start", "end"]);
  const cmpP = (a, b, p, key, idx) => {
    if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) return pd.push(`${p}: type`);
    if (Array.isArray(a)) { if (a.length !== b.length) pd.push(`${p}: length`); return a.forEach((v, i) => cmpP(v, b[i], `${p}[${i}]`, key, i)); }
    if (a && typeof a === "object") { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (k === "lang") continue; if (!(k in a) || !(k in b)) pd.push(`${p}.${k}: key`); else cmpP(a[k], b[k], `${p}.${k}`, k, -1); } return; }
    if ((KEEP.has(key) || idx === 0) && a !== b) pd.push(`${p}: code/date changed`);
  };
  cmpP(PEN, PES, "PROGRAM", "", -1);
  check("program: ES has the same days, levels, blocks, library keys, codes and dates as EN", pd.length === 0 && PES.days.length === 30 && Object.keys(PES.library).length === Object.keys(PEN.library).length, pd.slice(0, 5).join(" | "));
  const untranslated = [];
  const walkT = (a, b, key, idx) => { if (typeof a === "string") { if (!KEEP.has(key) && idx !== 0 && a === b && /[a-z]{4,}/i.test(a) && !/^(RPE|TEST-)/.test(a)) untranslated.push(a); } else if (Array.isArray(a)) a.forEach((v, i) => walkT(v, b[i], key, i)); else if (a && typeof a === "object") for (const k in a) walkT(a[k], b[k], k, -1); };
  walkT(PEN, PES, "", -1);
  check("program: every display string is translated (exercise names included)", untranslated.length === 0, untranslated.slice(0, 5).join(" | "));
  check("program: Spanish exercise names are sensible", PES.library.SQ.name === "Sentadilla" && PES.library.PU.name === "Flexión de brazos" && PES.library.HG.name === "Bisagra de cadera" && PES.library.RW.name === "Remo");
  const esSrc = readFileSync(join(appDir, "js", "strings.es.js"), "utf8");
  check("strings.es.js: legal text marked 'Spanish legal text pending attorney review'", /^\/\/ Spanish legal text pending attorney review/.test(esSrc) && /=+ Spanish legal text pending attorney review =+/.test(esSrc));
  check("ES refund keeps the approved meaning (3 days, final, converts to self-paced after Dec 24)", ES.legal.refund[1][1].includes("dentro de los 3 días (72 horas)") && ES.legal.refund[1][1].includes("se convierte en la edición a tu ritmo después del 24 de diciembre") && ES.legal.refund[1][1].includes("coachsalimheyaime@gmail.com"));
  check("'X-mas' spelling in both languages", EN.appName.includes("X-mas") && ES.appName.includes("X-mas") && !/\bXmas\b|X-Mas|X mas/.test(JSON.stringify(EN) + JSON.stringify(ES)));

  // browser default + stored choice
  {
    const { ctx, page } = await newPage("2026-11-10T10:00:00", undefined, { locale: "es-MX" });
    await page.goto(BASE + "index.html");
    await page.waitForSelector("#countdown");
    check("browser in Spanish (es-MX): app opens in Spanish", (await page.getAttribute("html", "lang")) === "es" && (await page.textContent(".hero-title")) === ES.welcome.title);
    check("welcome has the EN/ES switch", (await page.isVisible('#lang-welcome [data-lang="en"]')) && (await page.isVisible('#lang-welcome [data-lang="es"]')));
    await shot(page, "es-welcome-390.png");
    await page.click('#lang-welcome [data-lang="en"]');
    check("switch to EN on the welcome screen", (await page.textContent(".hero-title")) === EN.welcome.title && (await page.getAttribute("html", "lang")) === "en");
    await page.reload(); await page.waitForSelector(".hero-title");
    check("EN choice is stored on the device and beats the browser language", (await page.textContent(".hero-title")) === EN.welcome.title && (await page.evaluate(() => localStorage.getItem("holiday-30-lang"))) === "en");
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage("2026-11-10T10:00:00", undefined, { locale: "en-US" });
    await page.goto(BASE + "index.html");
    await page.waitForSelector(".hero-title");
    check("browser in English: app opens in English", (await page.getAttribute("html", "lang")) === "en" && (await page.textContent(".hero-title")) === EN.welcome.title);
    await page.goto(BASE + "index.html#/more");
    await page.waitForSelector("#lang-settings");
    await page.click('#lang-settings [data-lang="es"]');
    check("switch to ES in More > Settings", (await page.textContent(".page-title")) === ES.more.title && (await page.textContent("#bottom-nav")).includes(ES.nav.today));
    await ctx.close();
  }

  // ES screens at 390px: no overflow anywhere
  const bad = {};
  const note = async (page, name) => { const o = await overflowOn(page); if (o.length) bad[name] = o.slice(0, 3); };
  {
    const { ctx, page } = await newPage("2026-11-10T10:00:00", undefined, { locale: "es-MX" });
    await page.goto(BASE + "index.html"); await page.waitForSelector("#countdown"); await note(page, "welcome-pre");
    await page.click("#start-setup"); await page.waitForSelector("#age-ok"); await note(page, "setup-1");
    await page.check("#age-ok"); await page.click("#setup-next");
    for (let i = 0; i < 6; i++) await page.check(`input[name=q${i}][value=yes]`);
    await note(page, "setup-2-all-yes");
    await page.check("#gentle-ack"); await page.click("#setup-next"); await page.waitForSelector("#pu-now"); await note(page, "setup-3");
    await page.click("#setup-next"); await page.waitForSelector("input[name=eq]"); await note(page, "setup-4");
    await page.click("#setup-next"); await page.waitForSelector("#terms-ok"); await page.click("#setup-next"); await note(page, "setup-5-error");
    for (const w of ["disclaimer", "safety", "terms", "refund", "privacy"]) {
      await page.goto(BASE + `index.html#/legal/${w}`); await page.waitForSelector(`#legal-${w}`); await note(page, `legal-${w}`);
      if (w === "refund") await shot(page, "es-refund-390.png");
    }
    const refund = await page.goto(BASE + "index.html#/legal/refund").then(() => page.waitForSelector("#legal-refund")).then(() => page.textContent("#legal-refund"));
    check("ES refund screen renders the Spanish policy", refund.includes(ES.legal.refund[1][1]) && refund.includes(ES.legal.refundTitle));
    await page.goto(BASE + "index.html#/moves"); await page.waitForSelector(".move-card");
    await page.$$eval("details", (ds) => ds.forEach((d) => (d.open = true))); await note(page, "moves-all-open");
    await page.goto(BASE + "index.html#/plan"); await page.waitForSelector(".plan-item"); await note(page, "plan-visitor");
    await ctx.close();
  }
  {
    const days = {}; for (let n = 1; n <= 14; n++) days[n] = { status: n % 3 ? "core" : "floor", habits: { water: true } }; days[9] = { status: "protected" };
    const { ctx, page } = await newPage("2026-12-09T10:00:00", undefined, { locale: "es-MX" });
    await seed(page, baseState({ days, busyDays: [3], setup: { age: true, readiness: [true, false, false, false, false, false], gentleAck: true, terms: true }, tests: { 1: { pu: 5, sts: 10 } } }));
    const kick = await page.textContent(".day-head .kicker");
    check("ES day screen: Spanish program text and Spanish date", /Día 15 de 30/.test(kick) && /dic/.test(kick) && (await page.textContent(".page-title")).includes("Fuerza A"), kick.trim());
    await note(page, "day15-core");
    await shot(page, "es-day15-390.png");
    await page.click('.tab[data-tab="floor"]'); await note(page, "day15-floor");
    for (const n of [1, 2, 7, 13, 14, 21, 28, 30]) {
      await page.goto(BASE + `index.html#/day/${n}`); await page.waitForSelector(".day-head");
      await page.$$eval("details", (ds) => ds.forEach((d) => (d.open = true))); await note(page, `day${n}`);
      await page.click('.tab[data-tab="floor"]'); await note(page, `day${n}-floor`);
    }
    await page.goto(BASE + "index.html#/day/14"); await page.waitForSelector(".day-head"); await note(page, "day14-logged");
    await page.goto(BASE + "index.html#/day/15"); await page.waitForSelector(".day-head");
    await page.click("#log-core"); await page.waitForSelector("#rpe-input"); await page.check("#pain-input"); await note(page, "day15-feel");
    await page.click("#undo-day"); await page.waitForSelector("#stop-log"); await page.click("#stop-log"); await page.waitForSelector(".modal"); await note(page, "stop-modal");
    await page.click("#stop-cancel");
    await page.goto(BASE + "index.html#/progress"); await page.waitForSelector("#complete-count"); await note(page, "progress");
    await page.goto(BASE + "index.html#/plan"); await page.waitForSelector(".plan-item"); await note(page, "plan");
    await page.goto(BASE + "index.html#/more"); await page.waitForSelector("#settings-form"); await note(page, "more");
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage("2026-12-10T09:00:00", undefined, { locale: "es-MX" });
    await page.goto(BASE + "index.html"); await page.waitForSelector(".late-card"); await note(page, "welcome-late");
    check("ES late-join card", /Día 16/.test(await page.textContent(".late-card")) && /quedan 15 días/.test(await page.textContent(".late-card")));
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage("2026-12-28T09:00:00", undefined, { locale: "es-MX" });
    await page.goto(BASE + "index.html"); await page.waitForSelector("#self-start-card"); await note(page, "welcome-self");
    await shot(page, "es-self-paced-start-390.png");
    await ctx.close();
  }
  {
    const days = {}; for (let n = 1; n <= 30; n++) if (n % 5) days[n] = { status: "core", habits: {} };
    const { ctx, page } = await newPage("2026-12-26T10:00:00", undefined, { locale: "es-MX" });
    await seed(page, baseState({ days, tests: { 1: { pu: 4, sts: 10 }, 30: { pu: 7, sts: 9 } } }));
    await page.waitForSelector(".done-hero"); await note(page, "done-live-keep-going");
    await page.click("#keep-going-self"); await page.waitForSelector(".day-head"); await note(page, "self-day1");
    await ctx.close();
  }
  check("ES UI renders with no overflow at 390px (welcome, setup, every legal screen, days, moves, plan, progress, more, done, self-paced)", Object.keys(bad).length === 0, JSON.stringify(bad).slice(0, 400));
}

// 13. Consumer Health Data Privacy Policy: site section + footers + link from the app's Privacy screen
if (run(13)) {
  const { CONFIG } = await import(new URL("../js/config.js", import.meta.url).href);
  for (const l of ["en-US", "es-MX"]) {
    const { ctx, page } = await newPage("2026-11-10T10:00:00", undefined, { locale: l });
    await page.goto(BASE + "index.html#/legal/privacy");
    await page.waitForSelector("#chd-link");
    check(`[${l}] app Privacy screen links the Consumer Health Data Privacy Policy`, (await page.getAttribute("#chd-link", "href")) === "/privacy/#consumer-health-data" && CONFIG.consumerHealthPolicyUrl === "/privacy/#consumer-health-data");
    await ctx.close();
  }
  const html = readFileSync(join(siteRoot, "privacy", "index.html"), "utf8");
  const m = html.match(/<h2 id="consumer-health-data">([\s\S]*?)(?=<h2>Questions<\/h2>)/);
  const sec = m ? m[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : "";
  check("site /privacy/: 'Consumer Health Data Privacy Policy' section with id consumer-health-data", /<h2 id="consumer-health-data">Consumer Health Data Privacy Policy<\/h2>/.test(html));
  const need = [["collects name, email, purchase and gift details via Stripe", /name, your email address and your purchase details/.test(sec) && /gift/.test(sec) && /Stripe/.test(sec)],
    ["purpose: deliver the purchase and access", /deliver your purchase and your access/.test(sec)],
    ["never sold, never used for advertising", /never sell/.test(sec) && /advertising/.test(sec)],
    ["workout and health inputs stay on the device", /saved only in your own browser on your device/.test(sec) && /not sent to us/.test(sec)],
    ["access and delete by emailing coachsalimheyaime@gmail.com", /access/i.test(sec) && /delete/.test(sec) && /coachsalimheyaime@gmail\.com/.test(sec)],
    ["marketing email only with a separate unchecked opt-in", /separate checkbox that is never checked for you/.test(sec)],
    ["applies to Washington, Nevada and similar states", /Washington, Nevada and other states with similar/.test(sec)],
    ["business name, no banned contacts", /Coach Salim Heyaime LLC/.test(sec) && !/workforcewellness/i.test(html)]];
  for (const [n, ok] of need) check(`site /privacy/ CHD section: ${n}`, ok);
  const pages = [];
  const walk4 = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); if ([".git", "node_modules", "holiday-challenge"].includes(f)) return; statSync(p).isDirectory() ? walk4(p) : f.endsWith(".html") && pages.push(p); });
  walk4(siteRoot);
  const withFooter = pages.filter((f) => /<nav class="footer-nav"/.test(readFileSync(f, "utf8")));
  const missing = withFooter.filter((f) => !/<nav class="footer-nav"[\s\S]*?<a href="\/privacy\/#consumer-health-data">Consumer Health Data Privacy Policy<\/a>[\s\S]*?<\/nav>/.test(readFileSync(f, "utf8")));
  check("every site footer (homepage + shared layout) links the CHD policy", withFooter.length >= 10 && withFooter.some((f) => f === join(siteRoot, "index.html")) && missing.length === 0, missing.map((f) => f.replace(siteRoot, "")).join(", "));
  // render the site section at 390px (separate request log: the site's own GA4 + Google Fonts are left alone and blocked here)
  const siteReqs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  trackRequests(ctx, siteReqs);
  await ctx.route((url) => new URL(url).origin !== ORIGIN, (route) => route.abort());
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/privacy/#consumer-health-data`);
  await page.waitForSelector("#consumer-health-data");
  const fit = await page.evaluate(() => { const vw = document.documentElement.clientWidth; return document.documentElement.scrollWidth <= vw + 1; });
  check("site CHD section fits 390px", fit);
  await ctx.close();
}

// 0. Off-origin tracker self-test: prove a third-party request would be caught (kept out of the real list)
{
  const probe = [];
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  ctx.setDefaultTimeout(TIMEOUT);
  trackRequests(ctx, probe);
  await ctx.route((url) => new URL(url).origin !== ORIGIN, (route) => route.abort());
  const page = await ctx.newPage();
  await page.goto(BASE + "index.html");
  await page.waitForSelector("#app-main > *");
  await page.evaluate(() => { new Image().src = "https://www.google-analytics.com/g/collect?probe=1"; return fetch("https://example.com/pixel").catch(() => {}); });
  await page.waitForTimeout(300);
  check("off-origin tracker catches third-party requests (self-test)", probe.some((u) => u.includes("google-analytics.com")) && probe.some((u) => u.includes("example.com")), probe.join(", "));
  await ctx.close();
}

// 8. Static checks: noindex, banned words, not linked/sitemapped, no pixels
{
  const html = readFileSync(join(appDir, "index.html"), "utf8");
  check("index.html has noindex", /<meta name="robots" content="noindex/.test(html));
  const files = [];
  const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); if (f === "node_modules" || f === "tests") return; statSync(p).isDirectory() ? walk(p) : /\.(js|html|css|webmanifest)$/.test(f) && files.push(p); });
  walk(appDir);
  const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const banned = /75 ?hard|75 ?soft|whole ?30|couch to 5k|c25k|workforcewellness|countdown to christmas|25 days of|\$\s?\d/i;
  const m = all.match(banned);
  check("no banned names, no prices", !m, m ? m[0] : "");
  check("no ad pixels / analytics in app", !/fbq\(|facebook\.net|tiktok|gtag\(|googletagmanager|google-analytics|ga\.js|dataLayer|pixel\.|clarity\.ms|hotjar|segment\.(io|com)/i.test(all));
  check("no Google Fonts (googleapis / gstatic) references in app", !/googleapis|gstatic/i.test(all));
  check("no geolocation / geofencing APIs in app code", !/navigator\.geolocation|getCurrentPosition|watchPosition|geofence\s*\(|GeofencingRequest/i.test(all));
  check("no price shown anywhere in the app (no $ amounts, no 9.99)", !/\$\s?\d|9[.,]99|USD/.test(all));
  check("no absolute http(s) URLs loaded by app code", !/(src|href)\s*=\s*["']https?:|url\(\s*["']?https?:|import\s*\(?\s*["']https?:|fetch\(\s*["']https?:/i.test(all));
  check("shipped config has allowDateOverride: false", /allowDateOverride:\s*false/.test(configSrc));
  const sw = readFileSync(join(appDir, "sw.js"), "utf8");
  check("sw.js cache name is holiday-30-v3", /const CACHE = "holiday-30-v3"/.test(sw));
  const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const runtime = [];
  const walk3 = (d, rel = "") => readdirSync(d).forEach((f) => { const p = join(d, f); const r = rel + f; if (["node_modules", "tests"].includes(f) || f.startsWith(".")) return; statSync(p).isDirectory() ? walk3(p, r + "/") : /\.(html|css|js|webmanifest|png|svg|woff2)$/.test(f) && f !== "sw.js" && runtime.push("./" + r); });
  walk3(appDir);
  const missing = runtime.filter((f) => !assets.includes(f));
  const ghost = assets.filter((a) => a !== "./" && !existsSync(join(appDir, a)));
  check("sw.js caches every app file (incl. fonts)", missing.length === 0, missing.join(", "));
  check("every file sw.js caches exists", ghost.length === 0, ghost.join(", "));
  check("OFL license files ship with the fonts", existsSync(join(appDir, "fonts", "OFL-Anton.txt")) && existsSync(join(appDir, "fonts", "OFL-Lato.txt")));
  check("no stripe links", !/stripe\.com/i.test(all));
  const sitemap = readFileSync(join(siteRoot, "sitemap.xml"), "utf8");
  check("not in sitemap", !/holiday-challenge/.test(sitemap));
  const publicHtml = [];
  const walk2 = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); if ([".git", "node_modules", "holiday-challenge"].includes(f)) return; statSync(p).isDirectory() ? walk2(p) : f.endsWith(".html") && publicHtml.push(p); });
  walk2(siteRoot);
  check("not linked from any other page", !publicHtml.some((f) => /holiday-challenge/.test(readFileSync(f, "utf8"))));
}

check("tracker saw the app's own requests", sameOrigin.length > 0, `${sameOrigin.length} same-origin requests`);
check("no request left the app's origin (no GA, gtag, pixels, Google Fonts or other third parties)", offsite.length === 0, offsite.slice(0, 5).join(" | "));
check("no JS errors across all runs", errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();
server.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
