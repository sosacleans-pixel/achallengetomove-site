/**
 * Playwright checks for the 30 Days Before X-mas app.
 * Serves the whole site root so the app runs at /holiday-challenge/app/ (same path as production).
 * Env: CHROME=/path/to/chrome (optional), SHOTS=/dir for screenshots (optional),
 *      HC_TIMEOUT=ms per Playwright action (default 60000; slow boxes can raise it),
 *      HC_ONLY=1,2,8 to run only some sections (default: all). Section 0 (privacy/network checks) and the
 *      final "no off-origin requests" / "no JS errors" checks always run.
 * Sections: 1-9 live challenge, 10 late-join goal, 11 self-paced edition, 12 Spanish (EN/ES key parity, switch,
 *   390px overflow), 13 Consumer Health Data Privacy Policy page (/privacy/consumer-health-data/, links, sitemap),
 *   14 bold negligence release, 15 protected days = make-up days after Day 30, 16 no GA on holiday pages / checkout path,
 *   17 Notify-me unchecked opt-in (FormSubmit stubbed).
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
  const cached = await page.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open("holiday-30-v5"); return { keys, urls: (await c.keys()).map((r) => new URL(r.url).pathname) }; });
  check("service worker cache is holiday-30-v5", cached.keys.includes("holiday-30-v5"), cached.keys.join(","));
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
  for (const [which, arr, n] of [["terms", S.legal.terms, 19], ["privacy", S.legal.privacy, 13], ["refund", S.legal.refund, 5]]) {
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
  check("refund: approved 3-day wording shown exactly", refundText.includes("You can request a full refund within 3 days (72 hours) of purchase by emailing coachsalimheyaime@gmail.com. After that, all sales are final. After Dec 24 the challenge continues as a self-paced edition for the rest of your 12-month Access Period. Gift purchases: the buyer can request a full refund within 3 days of purchase, as long as the recipient hasn't redeemed the access code. Refunds go to the original payment method."));
  check("refund screen shows Attorney section C (refund ends access, dispute suspends) and the redemption-flow gift paragraph", refundText.includes("When a refund is issued, access ends right away and any sign-in links stop working.") && refundText.includes("access is suspended while the dispute is open") && refundText.includes("we email the gift code to the buyer") && !refundText.includes("["));
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
  const termsText = await page.textContent("#legal-terms");
  check("terms screen shows B2, B4, B5, B6 and D", ["Your email is your key", "We will email you about 14 days before your access ends.", "Your account and saved progress are kept", "If we discontinue the challenge entirely", "Gift codes can be redeemed for at least 5 years from the date of purchase."].every((t) => termsText.includes(t)));
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
  const STATUS = "Spanish legal text reviewed 2026-10-18 (legal-review-es-notes.md); pending final sign-off by a Utah attorney and a native-speaker legal translator";
  check("strings.es.js: legal text marked with its review status (reviewed, pending final sign-off)", esSrc.startsWith("// " + STATUS) && esSrc.includes("// ===== " + STATUS + " =====") && !/pending attorney review/.test(esSrc));
  check("legal draft notices show the review status (EN + ES)", EN.legal.draft.includes("reviewed October 18, 2026, pending final sign-off by a Utah attorney") && ES.legal.draft.includes("revisado el 18 de octubre de 2026") && ES.legal.draft.includes("prevalece la versión en inglés"));
  check("reviewed ES release wording in place", ES.legal.terms[3][0] === "EXONERACIÓN DE RESPONSABILIDAD, INCLUIDA LA NEGLIGENCIA" && ES.legal.terms[3][1].includes("ESTA EXONERACIÓN INCLUYE LOS RECLAMOS BASADOS EN LA NEGLIGENCIA DE COACH SALIM HEYAIME LLC") && !/cedes/.test(ES.legal.terms[3][1]) && ES.legal.terms.find(([h]) => h === "Otros términos")[1].includes("prevalece la versión en inglés"));
  check("ES refund keeps the approved meaning (3 days, final, self-paced for the rest of the 12-month Access Period after Dec 24)", ES.legal.refund[1][1].includes("dentro de los 3 días (72 horas)") && ES.legal.refund[1][1].includes("Después del 24 de diciembre, el reto continúa como edición a tu ritmo durante el resto de tu Periodo de acceso de 12 meses.") && ES.legal.refund[1][1].includes("coachsalimheyaime@gmail.com"));
  check("refund: old 'never expires' line gone (EN + ES)", !/never expires|converts to the self-paced/i.test(JSON.stringify(EN.legal)) && !/nunca vence/i.test(JSON.stringify(ES.legal)));
  const termsEN = JSON.stringify(EN.legal.terms), termsES = JSON.stringify(ES.legal.terms);
  check("terms: liability cap is the greater of the amount paid or $50 (EN + ES)", termsEN.includes("is limited to the greater of the amount you paid or $50") && !termsEN.includes("limited to the amount paid") && termsES.includes("la cantidad mayor entre el monto que pagaste o $50"));
  check("terms: 12-month Access Period + early re-buy stacking sentence (EN + ES)", termsEN.includes("12 months starting on the date of purchase") && termsEN.includes("If you buy again while your access is active, the new 12 months start when the current period ends.") && termsES.includes("Si vuelves a comprar mientras tu acceso sigue activo, los nuevos 12 meses empiezan cuando termina el periodo actual."));
  const privEN = JSON.stringify(EN.legal.privacy), privES = JSON.stringify(ES.legal.privacy);
  check("privacy: access records + service providers wording, no 'no sign-in' claim (EN + ES)", privEN.includes("To give you access, we keep your email address and your access dates. Your challenge progress stays on your device. We use Stripe (payments), Supabase (access records), and Resend (email) as service providers.") && !/no sign-in|No accounts/i.test(privEN) && privES.includes("Supabase (registros de acceso)") && !/no tiene inicio de sesión|Sin cuentas/i.test(privES));
  check("no em dashes in user-facing strings (EN + ES)", !/\u2014/.test(JSON.stringify(EN) + JSON.stringify(ES)) && !readFileSync(join(appDir, "js", "strings.en.js"), "utf8").includes("\u2014") && !readFileSync(join(appDir, "js", "strings.es.js"), "utf8").includes("\u2014"));
  // Attorney 12-month-access-terms.md: B2, B4 to B6, C and D, as written ([PRODUCT] = "the challenge"; B4's bracketed drafting note omitted).
  const ATT = {
    B2: "Access is linked to the email address used at checkout (or, for gifts, the email used to redeem the code). You sign in with a link sent to that email. Keep that email account secure and don't share sign-in links. We can move access to a new email only after verifying you own the original purchase.",
    B4: "We will email you about 14 days before your access ends.",
    B5: "Your account and saved progress are kept, so you can pick up where you left off if you buy again, unless the account is deleted under our inactivity policy (accounts with no sign-in for 24 months are deleted after a 30-day email warning) or you ask us to delete it.",
    B6: "We may update, improve, or retire parts of the content during the Access Period. If we discontinue the challenge entirely before your Access Period ends, we will give you a prorated refund or equal access to a comparable program, at your choice.",
    C: "You can request a full refund within 3 days of purchase. When a refund is issued, access ends right away and any sign-in links stop working. Gifts can be refunded within 3 days of purchase only if the gift code has not been redeemed; once redeemed, the gift is non-refundable. If a payment is disputed or charged back, access is suspended while the dispute is open and ends if the dispute is decided in the payer's favor. Nothing here limits any refund right you have under the law.",
    D: "A gift code gives the recipient 12 months of access, starting on the day they redeem it with their email. Gift codes can be redeemed for at least 5 years from the date of purchase. Gift codes have no cash value and can't be resold, except where the law requires otherwise.",
  };
  const tEN = (h) => (EN.legal.terms.find(([x]) => x === h) || [])[1], rEN = (h) => (EN.legal.refund.find(([x]) => x === h) || [])[1];
  check("Attorney B2 verbatim (Your email is your key)", tEN("Your email is your key") === ATT.B2);
  check("Attorney B4 verbatim (Reminder), no bracketed drafting note", tEN("Reminder") === ATT.B4 && !/Transactional notice/.test(JSON.stringify(EN.legal)));
  check("Attorney B5 verbatim (After access ends)", tEN("After access ends") === ATT.B5);
  check("Attorney B6 verbatim with [PRODUCT] = the challenge (Content changes)", tEN("Content changes") === ATT.B6 && !/\[PRODUCT\]/.test(JSON.stringify(EN.legal)));
  check("Attorney D verbatim (Gift codes, in Terms)", tEN("Gift codes") === ATT.D);
  check("Attorney C verbatim (Refunds and access, in Refund policy)", rEN("Refunds and access") === ATT.C);
  const gEN = rEN("Gift enrollments"), gES = (ES.legal.refund.find(([x]) => x === "Inscripciones de regalo") || [])[1] || "";
  check("gift paragraph matches the redemption flow (code to buyer, own email, 12 months from redemption, 5 years, 3-day refund only if unredeemed)", ["we email the gift code to the buyer", "redeems the code with their own email address", "12 months of access start on the day they redeem it", "redeemed for 5 years from the date of purchase", "within 3 days (72 hours) of purchase, only if the code hasn't been redeemed"].every((t) => gEN.includes(t)) && !/buyer enters the recipient's email/.test(gEN));
  check("ES gift paragraph matches the flow too", ["enviamos el código de regalo por correo electrónico a quien lo compró", "con su propio correo electrónico", "12 meses de acceso empiezan el día en que lo canjea", "durante 5 años a partir de la fecha de compra", "solo si el código no se ha canjeado"].every((t) => gES.includes(t)));
  check("no [PENDING SALIM'S APPROVAL] bracket left on the gift paragraph (EN + ES)", !/PENDING SALIM'S APPROVAL|PENDIENTE DE APROBACIÓN DE SALIM/.test(JSON.stringify(EN.legal) + JSON.stringify(ES.legal)) && !/\[/.test(gEN + gES));
  const tES = ES.legal.terms.map(([h]) => h), rES = ES.legal.refund.map(([h]) => h);
  check("ES has the same new sections in the same places", ["Tu correo electrónico es tu llave", "Recordatorio", "Después de que termina el acceso", "Cambios en el contenido", "Códigos de regalo"].every((h, i) => tES[tES.indexOf("Compra") + 1 + i] === h) && rES[rES.indexOf("Reembolsos") + 1] === "Reembolsos y acceso" && EN.legal.terms.length === ES.legal.terms.length && EN.legal.refund.length === ES.legal.refund.length);
  check("ES keeps the key facts of C and D (immediate end, suspension, 5 years, no cash value)", (ES.legal.refund.find(([x]) => x === "Reembolsos y acceso") || [])[1].includes("el acceso termina de inmediato") && (ES.legal.refund.find(([x]) => x === "Reembolsos y acceso") || [])[1].includes("el acceso se suspende mientras la disputa esté abierta") && (ES.legal.terms.find(([x]) => x === "Códigos de regalo") || [])[1].includes("al menos 5 años") && (ES.legal.terms.find(([x]) => x === "Códigos de regalo") || [])[1].includes("no tienen valor en efectivo"));
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

// 13. Consumer Health Data Privacy Policy: standalone page + /privacy/ pointer + every footer + the app's Privacy screen
const CHD_URL = "/privacy/consumer-health-data/";
if (run(13)) {
  const { CONFIG } = await import(new URL("../js/config.js", import.meta.url).href);
  for (const l of ["en-US", "es-MX"]) {
    const { ctx, page } = await newPage("2026-11-10T10:00:00", undefined, { locale: l });
    await page.goto(BASE + "index.html#/legal/privacy");
    await page.waitForSelector("#chd-link");
    check(`[${l}] app Privacy screen links the standalone CHD page`, (await page.getAttribute("#chd-link", "href")) === CHD_URL && CONFIG.consumerHealthPolicyUrl === CHD_URL);
    await ctx.close();
  }
  const html = readFileSync(join(siteRoot, "privacy", "consumer-health-data", "index.html"), "utf8");
  const main = (html.match(/<main[\s\S]*?<\/main>/) || [""])[0];
  const sec = main.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  check("CHD page: /privacy/consumer-health-data/ with the policy as its h1", /<h1 id="consumer-health-data">Consumer Health Data Privacy Policy<\/h1>/.test(html) && /<link rel="canonical" href="https:\/\/achallengetomove\.com\/privacy\/consumer-health-data\/">/.test(html));
  check("CHD page: effective date is the [PUBLISH DATE] placeholder", /Effective date: \[PUBLISH DATE\]\./.test(sec) && !/Effective date: October/.test(sec));
  check("CHD page: styled like /privacy/ (site stylesheet, header, footer, page-simple)", /href="\/styles\.css"/.test(html) && /class="site-header"/.test(html) && /class="wrap page-simple chd-page"/.test(html) && /<footer class="footer">/.test(html));
  check("CHD page: no Google Analytics", !/ga\.js|gtag|googletagmanager/.test(html));
  const need = [["collects name, email, purchase and gift details via Stripe", /name, your email address and your purchase details/.test(sec) && /gift/.test(sec) && /Stripe/.test(sec)],
    ["purpose: deliver the purchase and access", /deliver your purchase and your access/.test(sec)],
    ["never sold, never used for advertising", /never sell/.test(sec) && /advertising/.test(sec)],
    ["workout and health inputs stay on the device", /saved only in your own browser on your device/.test(sec) && /not sent to us/.test(sec)],
    ["access and delete by emailing coachsalimheyaime@gmail.com", /access/i.test(sec) && /delete/.test(sec) && /coachsalimheyaime@gmail\.com/.test(sec)],
    ["marketing email only on request; unchecked checkbox", /separate checkbox that is never checked for you/.test(sec)],
    ["applies to Washington, Nevada and similar states", /Washington, Nevada and other states with similar/.test(sec)],
    ["reviewed sections present (sources, sharing, tracking, rights, appeals, changes)", ["Where the data comes from", "Who we share it with", "Tracking over time and across websites", "Your rights and how to use them", "Appeals.", "Changes to this policy"].every((h) => sec.includes(h))],
    ["Notify-me statement is exactly the attorney's sentence", sec.includes("Notify-me signups join our marketing list only if you tick the opt-in box.")],
    ["GA statement is exactly the attorney's sentence", sec.includes("GA records that a checkout button was clicked, but not which product.")],
    ["nothing contradicts the opt-in form or the neutral buy click", !/by submitting the Notify-me form|including which product|use it only to tell you when new challenges/i.test(sec)],
    ["business name, no banned contacts", /Coach Salim Heyaime LLC/.test(sec) && !/workforcewellness/i.test(html)]];
  for (const [n, ok] of need) check(`CHD page: ${n}`, ok);
  const priv = readFileSync(join(siteRoot, "privacy", "index.html"), "utf8");
  const privText = priv.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  check("/privacy/ agrees with the CHD page (opt-in; checkout click without product)", privText.includes("Notify-me signups join our marketing list only if you tick the opt-in box.") && privText.includes("GA records that a checkout button was clicked, but not which product.") && !/use it only to tell you when new challenges|Stripe checkout, or sign up to be notified \(which link/i.test(privText));
  check("/privacy/: CHD section replaced by a short pointer to the new page", !/id="consumer-health-data"/.test(priv) && /is on its own page: <a class="text-link" href="\/privacy\/consumer-health-data\/">Consumer Health Data Privacy Policy<\/a>/.test(priv) && !/Never sold, never used for advertising/.test(priv));
  check("sitemap lists /privacy/consumer-health-data/", readFileSync(join(siteRoot, "sitemap.xml"), "utf8").includes("<loc>https://achallengetomove.com/privacy/consumer-health-data/</loc>"));
  const pages = [];
  const walk4 = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); if ([".git", "node_modules", "holiday-challenge"].includes(f)) return; statSync(p).isDirectory() ? walk4(p) : f.endsWith(".html") && pages.push(p); });
  walk4(siteRoot);
  const withFooter = pages.filter((f) => /<nav class="footer-nav"/.test(readFileSync(f, "utf8")));
  const missing = withFooter.filter((f) => !/<nav class="footer-nav"[\s\S]*?<a href="\/privacy\/consumer-health-data\/">Consumer Health Data Privacy Policy<\/a>[\s\S]*?<\/nav>/.test(readFileSync(f, "utf8")));
  const oldAnchor = pages.filter((f) => readFileSync(f, "utf8").includes("/privacy/#consumer-health-data"));
  check("every site footer (homepage, the 10 shared-layout pages, the CHD page) links /privacy/consumer-health-data/", withFooter.length === 12 && withFooter.includes(join(siteRoot, "index.html")) && missing.length === 0 && oldAnchor.length === 0, `footers=${withFooter.length} missing=${missing.map((f) => f.replace(siteRoot, "")).join(",")} old=${oldAnchor.length}`);
  const siteReqs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  trackRequests(ctx, siteReqs);
  await ctx.route((url) => new URL(url).origin !== ORIGIN, (route) => route.abort());
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/`);
  await page.waitForLoadState("load");
  siteReqs.length = 0; // only count what the CHD page itself loads
  await page.click('footer a[href="/privacy/consumer-health-data/"]');
  await page.waitForSelector("h1#consumer-health-data");
  check("homepage footer link opens the CHD page", new URL(page.url()).pathname === CHD_URL);
  check("CHD page fits 390px", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  check("CHD page loads no GA", !siteReqs.some((u) => /googletagmanager|google-analytics/.test(u)) && (await page.evaluate(() => typeof window.gtag)) === "undefined");
  await ctx.close();
}

// 14. Bold release: the negligence release renders in bold caps in the Terms and in the setup checkbox (EN + ES)
if (run(14)) {
  for (const [l, SS] of [["en-US", (await import(new URL("../js/strings.en.js", import.meta.url).href)).S], ["es-MX", (await import(new URL("../js/strings.es.js", import.meta.url).href)).S]]) {
    const caps = SS.legal.terms[3][1].match(/[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 ,.'\-]{24,}\./)[0];
    const { ctx, page } = await newPage("2026-11-10T10:00:00", undefined, { locale: l });
    await page.goto(BASE + "index.html#/legal/terms");
    await page.waitForSelector("#legal-terms");
    const strong = await page.$$eval("#legal-terms p strong", (els) => els.map((e) => [e.textContent, getComputedStyle(e).fontWeight]));
    check(`[${l}] Terms: the negligence release sentence (and only it) is bold caps`, strong.length === 1 && strong[0][0] === caps && Number(strong[0][1]) >= 700 && caps === caps.toUpperCase() && /NEGLIGEN/.test(caps), JSON.stringify(strong));
    const tags = await page.$$eval("#legal-terms h2.legal-h + p", (ps) => [...new Set(ps.flatMap((p) => [...p.querySelectorAll("*")].map((e) => e.tagName)))]);
    check(`[${l}] Terms bodies: only <strong> is added (no other markup from strings)`, tags.every((t) => t === "STRONG"), tags.join(","));
    await page.evaluate(() => { const b = document.querySelector("#legal-terms h2.legal-h + p strong"); if (b) b.scrollIntoView({ block: "center" }); });
    if (l === "en-US") await shot(page, "terms-bold-release-en-390.png"); else await shot(page, "terms-bold-release-es-390.png");
    await page.goto(BASE + "index.html#/today");
    await page.click("#start-setup");
    await page.check("#age-ok"); await page.click("#setup-next");
    for (let i = 0; i < 6; i++) await page.check(`input[name=q${i}][value=no]`);
    await page.click("#setup-next"); await page.click("#setup-next"); await page.click("#setup-next");
    await page.waitForSelector("#terms-label");
    const lab = await page.$eval("#terms-label", (e) => [e.tagName, e.textContent, getComputedStyle(e).fontWeight, e.children.length]);
    check(`[${l}] setup checkbox label is bold, plain text, with NEGLIGENCIA/NEGLIGENCE of the LLC in caps`, lab[0] === "STRONG" && lab[1] === SS.setup.termsLabel && Number(lab[2]) >= 700 && lab[3] === 0 && (l === "en-US" ? lab[1].includes("NEGLIGENCE of Coach Salim Heyaime LLC") : lab[1].includes("NEGLIGENCIA de Coach Salim Heyaime LLC")));
    const o = await overflowOn(page); check(`[${l}] setup terms step fits 390px`, o.length === 0, o.slice(0, 3).join(" | "));
    await page.evaluate(() => document.getElementById("terms-label").scrollIntoView({ block: "center" }));
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `setup-bold-release-${l === "en-US" ? "en" : "es"}-390.png`) });
    await ctx.close();
  }
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const em = (t) => esc(t).replace(/([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 ,.'\-]{24,}[.])/g, "<strong>$1</strong>");
  check("bold helper escapes markup first (an injected tag stays text)", em('<IMG SRC=X ONERROR=ALERT(1)> THIS IS A LONG CAPS SENTENCE HERE.') === "&lt;IMG SRC=X ONERROR=ALERT(1)&gt;<strong> THIS IS A LONG CAPS SENTENCE HERE.</strong>" || !/<img/i.test(em('<img src=x onerror=alert(1)> THIS IS A LONG CAPS SENTENCE HERE.')));
  check("app.js uses the reviewed bold patch on escaped text", /const em = \(t\) => esc\(t\)\.replace\(/.test(readFileSync(join(appDir, "js", "app.js"), "utf8")));
}

// 15. Protected days: each (up to 7) adds one make-up day after Day 30; nothing "pauses"
if (run(15)) {
  const EN = (await import(new URL("../js/strings.en.js", import.meta.url).href)).S;
  const ES = (await import(new URL("../js/strings.es.js", import.meta.url).href)).S;
  check("protected-day copy matches the reviewed EN/ES text", EN.self.protectedDay === "Protected day. It doesn't count as missed, and it gives you one extra day after Day 30 to log a make-up day (up to 7 extra days)." && ES.self.protectedDay === "Día protegido. No cuenta como día perdido y te da un día extra después del Día 30 para registrar un día de reposición (hasta 7 días extra)." && EN.day.protectedDay === "Protected day. It doesn't count as missed, and it gives you one extra day after Dec 24 to log a make-up day (up to Dec 31)." && ES.day.protectedDay === "Día protegido. No cuenta como día perdido y te da un día extra después del 24 de diciembre para registrar un día de reposición (hasta el 31 de dic.).");
  check("no 'pauses your window' copy left (EN/ES)", !/pauses your window|pausa tu periodo/i.test(JSON.stringify(EN) + JSON.stringify(ES)));
  for (const [l, SS] of [["en-US", EN], ["es-MX", ES]]) {
    const { ctx, page } = await newPage("2027-01-20T10:00:00", undefined, { locale: l });
    await seed(page, baseState({ mode: "self", startDate: "2027-01-10", joinedDate: "2027-01-10", days: { 1: { status: "core" }, 5: { status: "protected" } } }));
    await page.click("#stop-log"); await page.click("#stop-confirm");
    await page.waitForSelector(".status-card.protected");
    check(`[${l}] self-paced protected day shows the reviewed copy`, (await page.textContent(".status-card.protected")).includes(SS.self.protectedDay));
    const o = await overflowOn(page); check(`[${l}] protected-day screen fits 390px`, o.length === 0, o.slice(0, 3).join(" | "));
    if (SHOTS) { await page.waitForTimeout(3500); await page.evaluate(() => { const c = document.querySelector(".status-card"); if (c) c.scrollIntoView({ block: "center" }); }); }
    await shot(page, `protected-day-${l === "en-US" ? "en" : "es"}-390.png`);
    await ctx.close();
  }
  const R = await import(new URL("../js/rules.js", import.meta.url).href);
  const mk = (p) => { const d = {}; for (let n = 1; n <= p; n++) d[n] = { status: "protected" }; return { setupDone: true, mode: "self", startDate: "2027-01-01", joinedDate: "2027-01-01", days: d, makeup: [] }; };
  check("self-paced: 1 protected day = 1 make-up day after Day 30; 9 protected = 7 (cap)", R.endOf(mk(0)) === "2027-01-30" && R.deadline(mk(0)) === "2027-01-30" && R.deadline(mk(1)) === "2027-01-31" && R.deadline(mk(7)) === "2027-02-06" && R.deadline(mk(9)) === "2027-02-06");
  // the 30 dated days don't shift: Day 15 is still Jan 15 with protected days before it
  const st = mk(5); check("protected days don't shift the dated days", R.dateFor(st, 15) === "2027-01-15");
  // make-up days: one per day, only after Day 30, until the deadline
  const days = {}; for (let n = 1; n <= 20; n++) days[n] = { status: "core" }; days[21] = { status: "protected" };
  const { ctx, page } = await newPage("2027-02-01T10:00:00");
  await seed(page, baseState({ mode: "self", startDate: "2027-01-01", joinedDate: "2027-01-01", days }));
  await page.waitForSelector(".done-hero");
  check("1 protected day: no make-up day 2 days after Day 30 (window was Jan 31 only)", !(await page.isVisible("#log-makeup")));
  await ctx.close();
  const c2 = await newPage("2027-01-31T10:00:00");
  await seed(c2.page, baseState({ mode: "self", startDate: "2027-01-01", joinedDate: "2027-01-01", days }));
  await c2.page.waitForSelector(".done-hero");
  check("1 protected day: make-up day open on Jan 31, with a warning on the keep-going offer", (await c2.page.isVisible("#log-makeup")) && (await c2.page.isVisible("#keep-going-warn")));
  await c2.page.click("#log-makeup"); await c2.page.waitForSelector("#done-complete");
  check("make-up day counts toward the goal", (await c2.page.textContent("#done-complete")).trim() === "21");
  await c2.ctx.close();
}

// 16. Site GA: never on holiday pages or the holiday checkout path; buy_app_click has no product param
if (run(16)) {
  const holidayHtml = [];
  const walk5 = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); if (["node_modules", "tests"].includes(f)) return; statSync(p).isDirectory() ? walk5(p) : f.endsWith(".html") && holidayHtml.push(p); });
  walk5(join(siteRoot, "holiday-challenge"));
  check("no /holiday-challenge/ page includes GA or gtag", holidayHtml.length > 0 && holidayHtml.every((f) => !/ga\.js|gtag|googletagmanager|google-analytics/.test(readFileSync(f, "utf8"))), holidayHtml.map((f) => f.replace(siteRoot, "")).join(","));
  const gaSrc = readFileSync(join(siteRoot, "js", "ga.js"), "utf8");
  check("ga.js: buy_app_click keeps its name and sends only neutral params (no product, no link_url)", /send\('buy_app_click', neutralBuyParams\(\)\)/.test(gaSrc) && !/product:/.test(gaSrc) && !/neutralBuyParams\(\) \{[^}]*link_url/.test(gaSrc));
  const reqs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  trackRequests(ctx, reqs);
  await ctx.route((url) => new URL(url).origin !== ORIGIN, (route) => route.abort());
  const stub = `<!DOCTYPE html><html><head><script src="/js/ga.js"></script></head><body><a id="buy" href="https://buy.stripe.com/test_holiday" data-product="holiday-30-days-before-xmas">Buy</a></body></html>`;
  const holidayPaths = ["/holiday-challenge/", "/holiday-challenge/app/", "/store/holiday-30-days-before-xmas/", "/buy/holiday/", "/checkout/30-days-before-x-mas/", "/thank-you/holiday/", "/thanks/xmas/", "/30-days-before-x-mas/"];
  for (const p of holidayPaths) await ctx.route(`${ORIGIN}${p}`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: stub }));
  const page = await ctx.newPage();
  const gaHits = () => reqs.filter((u) => /googletagmanager|google-analytics/.test(u)).length;
  for (const p of holidayPaths) {
    const before = gaHits();
    await page.goto(`${ORIGIN}${p}`);
    await page.waitForLoadState("load");
    const st = await page.evaluate(() => ({ gtag: typeof window.gtag, dl: (window.dataLayer || []).length }));
    check(`no GA on ${p}`, gaHits() === before && st.gtag === "undefined" && st.dl === 0);
  }
  // the real app page with ga.js injected anyway: still nothing
  await page.goto(BASE + "index.html"); await page.waitForSelector("#app-main > *");
  const before = gaHits();
  await page.addScriptTag({ url: "/js/ga.js" }); await page.waitForTimeout(100);
  check("ga.js does nothing even if injected into the holiday app", gaHits() === before && (await page.evaluate(() => typeof window.gtag)) === "undefined");
  // control: GA still loads on the homepage; buy_app_click has no product; holiday links skipped
  await page.goto(`${ORIGIN}/`); await page.waitForLoadState("load");
  check("GA unchanged on the homepage (gtag.js requested)", reqs.some((u) => /googletagmanager\.com\/gtag\/js\?id=G-CZNZSJ2290/.test(u)));
  const events = await page.evaluate(() => {
    document.addEventListener("click", (e) => e.preventDefault()); // don't leave the page
    const mk = (href, product, text) => { const a = document.createElement("a"); a.href = href; if (product) a.setAttribute("data-product", product); a.textContent = text; document.body.appendChild(a); a.click(); };
    mk("https://buy.stripe.com/test_22day", "22-day-workout-app", "Buy app");
    mk("https://buy.stripe.com/test_holiday", "holiday-30-days-before-xmas", "Buy");
    mk("https://buy.stripe.com/test_gift", "", "Gift the 30 Days Before X-mas Challenge");
    const off = document.createElement("a"); off.href = "https://buy.stripe.com/test_off"; off.setAttribute("data-ga", "off"); off.textContent = "Buy"; document.body.appendChild(off); off.click();
    return (window.dataLayer || []).map((a) => Array.from(a)).filter((a) => a[0] === "event").map((a) => [a[1], a[2]]);
  });
  const buys = events.filter(([n]) => n === "buy_app_click");
  check("buy_app_click sent once for a regular product, with no product parameter", buys.length === 1 && !("product" in buys[0][1]), JSON.stringify(events));
  check("holiday buy/gift links and data-ga=off links are not tracked", buys.length === 1 && !JSON.stringify(events).includes("holiday"));
  // From a product page with a query string: the buy click must not name the product anywhere
  // (no link_url/link_text, and page_location/page_title/page_referrer replaced by the neutral root).
  await page.goto(`${ORIGIN}/22-day-7-minute-workout/?utm_content=22-day-app&product=22day`, { referer: `${ORIGIN}/75-all-in/` }); await page.waitForLoadState("load");
  const pev = await page.evaluate(() => {
    document.addEventListener("click", (e) => e.preventDefault());
    const add = (href, attrs, text) => { const a = document.createElement("a"); a.href = href; for (const k in attrs) a.setAttribute(k, attrs[k]); a.textContent = text; document.body.appendChild(a); a.click(); };
    add("https://buy.stripe.com/test_22day?client_reference_id=22-day-app", { "data-product": "22-day-workout-app" }, "Buy the 22-Day 7-Minute Workout app");
    add("https://www.amazon.com/dp/B0HN22P5F4", { "data-ga-buy": "app" }, "Get the 22-Day app on Amazon");
    add("https://www.amazon.com/dp/B0HN22P5F4", {}, "Buy paperback on Amazon");
    return (window.dataLayer || []).map((a) => Array.from(a)).filter((a) => a[0] === "event").map((a) => [a[1], a[2]]);
  });
  const root = `${ORIGIN}/`;
  const neutral = (p) => p && p.page_location === root && p.page_referrer === root && p.page_title === "A Challenge to Move" && !("link_url" in p) && !("link_text" in p) && !("asin" in p) && !("product" in p) && !/22|day|workout|75|utm|stripe|amazon/i.test(JSON.stringify(p).split(root).join("")); // strip every copy of the origin: a random port like :41475 must not trip the check
  const pb = pev.filter(([n]) => n === "buy_app_click");
  check("buy_app_click from a product page (with query + referrer) sends only neutral params", pb.length === 1 && neutral(pb[0][1]), JSON.stringify(pb));
  const am = pev.filter(([n]) => n === "amazon_click");
  check("amazon_click on a buy-the-app link is neutral too", am.length === 2 && neutral(am[0][1]), JSON.stringify(am[0]));
  check("amazon_click on a book link is unchanged (link_url, link_text, asin, page_location)", am.length === 2 && am[1][1].link_url === "https://www.amazon.com/dp/B0HN22P5F4" && am[1][1].asin === "B0HN22P5F4" && am[1][1].link_text === "Buy paperback on Amazon" && /22-day-7-minute-workout/.test(am[1][1].page_location), JSON.stringify(am[1]));
  const storeSrc = readFileSync(join(siteRoot, "js", "store.js"), "utf8");
  check("store entries for the holiday product are marked data-ga=off", /product\.analytics === false \|\| \/holiday\|x-\?mas\|30-days-before\/i\.test\(product\.id/.test(storeSrc));
  await ctx.close();
}

// 17. Notify-me: explicit unchecked opt-in; nothing is sent to FormSubmit unless it's ticked (network stubbed)
if (run(17)) {
  const posts = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  ctx.setDefaultTimeout(TIMEOUT);
  await ctx.route((url) => new URL(url).origin !== ORIGIN, (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "formsubmit.co") { posts.push({ url: u.href, method: route.request().method(), body: route.request().postData() }); return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ success: "true", message: "stub" }) }); }
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/#notify`);
  await page.waitForSelector("#notify-optin");
  const label = (await page.textContent('label[for="notify-optin"]')).replace(/\s+/g, " ").trim();
  check("notify form: opt-in checkbox with the exact text, unchecked by default", label === "Email me when it launches and occasional updates from Coach Salim Heyaime LLC. Unsubscribe anytime." && !(await page.isChecked("#notify-optin")) && (await page.getAttribute("#notify-optin", "type")) === "checkbox");
  await page.fill("#notify-email", "test@example.com");
  await page.click('#notify-form button[type="submit"]');
  await page.waitForTimeout(300);
  check("notify form: without the tick nothing is sent and a message explains the box is needed", posts.length === 0 && /tick the box/i.test(await page.textContent("#notify-status")) && (await page.isVisible("#notify-form")));
  if (SHOTS) { await page.evaluate(() => document.getElementById("notify").scrollIntoView()); await page.screenshot({ path: join(SHOTS, "notify-optin-unticked-390.png") }); }
  await page.check("#notify-optin");
  await page.click('#notify-form button[type="submit"]');
  await page.waitForSelector("#notify-form", { state: "hidden" });
  const body = posts[0] ? JSON.parse(posts[0].body) : {};
  check("notify form: with the tick, one POST to the FormSubmit AJAX endpoint (stubbed) with the consent text", posts.length === 1 && posts[0].method === "POST" && posts[0].url === "https://formsubmit.co/ajax/coachsalimheyaime@gmail.com" && body.email === "test@example.com" && body.consent === "yes: Email me when it launches and occasional updates from Coach Salim Heyaime LLC. Unsubscribe anytime." && !!body.consent_at);
  check("notify form: thank-you shown after success", /You're on the list/.test(await page.textContent("#notify-status")));
  await page.reload(); await page.waitForSelector("#notify-optin");
  await page.evaluate(() => document.getElementById("notify").scrollIntoView());
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "notify-optin-390.png") });
  check("notify form fits 390px", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
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
  const allRaw = files.map((f) => readFileSync(f, "utf8")).join("\n");
  // The Attorney-required liability cap ("the greater of the amount you paid or $50", EN + ES) is a legal floor,
  // not a price; it is the only "$" amount allowed. Anything else is still a failure.
  const CAP_EN = "the greater of the amount you paid or $50", CAP_ES = "el monto que pagaste o $50";
  check("only the liability cap carries a $ amount (EN + ES)", allRaw.includes(CAP_EN) && allRaw.includes(CAP_ES));
  const all = allRaw.split(CAP_EN).join("").split(CAP_ES).join("");
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
  check("sw.js cache name is holiday-30-v5", /const CACHE = "holiday-30-v5"/.test(sw));
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
