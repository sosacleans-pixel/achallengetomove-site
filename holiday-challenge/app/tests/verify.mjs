/**
 * Playwright checks for the 30 Days Before X-mas app.
 * Serves the whole site root so the app runs at /holiday-challenge/app/ (same path as production).
 * Env: CHROME=/path/to/chrome (optional), SHOTS=/dir for screenshots (optional).
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
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

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

const results = [];
const errors = [];
function check(name, cond, extra = "") { results.push([name, !!cond, extra]); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`); }

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

async function newPage(mockNow, viewport = { width: 390, height: 844 }, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block", ...ctxOpts });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.text() + (m.location()?.url || ""))) errors.push(`console: ${m.text()}`); });
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
for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
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
{
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
{
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
{
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
for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
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
{
  const days = {}; for (let n = 1; n <= 12; n++) days[n] = { status: "core" }; days[13] = { status: "protected" }; days[14] = { status: "protected" };
  const { ctx, page } = await newPage("2026-12-25T10:00:00");
  await seed(page, baseState({ days }));
  await page.waitForSelector(".done-hero");
  check("not-yet copy is 'welcome back', never 'failed'", /Welcome back/.test(await page.textContent(".done-hero")) && !/fail/i.test(await page.textContent("main")));
  check("protected days open Keep Going make-up logging", await page.isVisible("#log-makeup"));
  await ctx.close();
}

// 6. Date-override URL param
{
  const { ctx, page } = await newPage(null);
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

// 7. Offline reload (service worker allowed)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
  await page.waitForSelector(".day-head", { timeout: 5000 }).catch(() => {});
  check("offline reload still renders today's day", /Day 9 of 30/.test((await page.textContent("main")) || ""));
  await page.goto(BASE + "index.html#/moves").catch(() => {});
  await page.waitForSelector(".move-card", { timeout: 3000 }).catch(() => {});
  check("offline navigation works (Moves)", (await page.locator(".move-card").count()) > 20);
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
  check("no ad pixels / analytics in app", !/fbq\(|facebook\.net|tiktok|gtag\(|googletagmanager|ga\.js/i.test(all));
  check("no stripe links", !/stripe\.com/i.test(all));
  const sitemap = readFileSync(join(siteRoot, "sitemap.xml"), "utf8");
  check("not in sitemap", !/holiday-challenge/.test(sitemap));
  const publicHtml = [];
  const walk2 = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); if ([".git", "node_modules", "holiday-challenge"].includes(f)) return; statSync(p).isDirectory() ? walk2(p) : f.endsWith(".html") && publicHtml.push(p); });
  walk2(siteRoot);
  check("not linked from any other page", !publicHtml.some((f) => /holiday-challenge/.test(readFileSync(f, "utf8"))));
}

check("no JS errors across all runs", errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();
server.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
