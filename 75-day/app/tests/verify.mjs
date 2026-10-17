/**
 * Playwright verification for 75-Day Challenge app.
 */
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const port = 8775;
const artifacts = "/opt/cursor/artifacts";

mkdirSync(artifacts, { recursive: true });

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

function serve(req, res) {
  let path = req.url.split("?")[0];
  if (path === "/") path = "/index.html";
  const file = join(root, path.replace(/^\//, ""));
  if (!file.startsWith(root) || !existsSync(file)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}

async function fresh(page, mockNow) {
  if (mockNow) {
    await page.addInitScript((iso) => {
      window.__75_MOCK_NOW = iso;
    }, mockNow);
  }
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
}

async function completeAllInOnboarding(page, { useToday = true, why = "Test why" } = {}) {
  await page.click("#mode-all-in");
  await page.waitForSelector("#ob-next");
  await page.click("#ob-next");
  await page.waitForSelector("#ob-rules-next");
  await page.click("#ob-rules-next");
  await page.waitForSelector("#commit-btn");
  if (why) await page.fill("#my-why", why);
  await page.click("#commit-btn");
  await page.waitForSelector("#start-tomorrow");
  await page.click(useToday ? "#start-today" : "#start-tomorrow");
  await page.waitForSelector("#day0-form");
  await page.fill('input[name="energy"]', "6");
  await page.fill('input[name="mood"]', "7");
  await page.click('#day0-form button[type="submit"]');
  await page.waitForSelector(".page-title");
}

async function completeAllTasks(page) {
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("seventy-five-v1"));
    const now = window.__75_MOCK_NOW ? new Date(window.__75_MOCK_NOW) : new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    let key = `${y}-${m}-${d}`;
    if (now.getHours() < 10) {
      const prev = new Date(now);
      prev.setDate(prev.getDate() - 1);
      key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`;
    }
    if (key < s.startDate) key = s.startDate;
    if (!s.days[key]) s.days[key] = { tasks: {}, waterMl: 4000, workouts: [], reading: {} };
    const day = s.days[key];
    day.tasks = {
      workouts: true,
      nutrition: true,
      alcohol: true,
      water: true,
      reading: true,
      photo: true,
      sleep: true,
    };
    day.waterMl = 4000;
    day.workouts = [
      { type: "A", minutes: 45, outdoor: true, loggedAt: 1 },
      { type: "B", minutes: 45, outdoor: false, loggedAt: 4 * 3600000 },
    ];
    day.reading = { pages: 10 };
    day.photoThumbId = "test";
    localStorage.setItem("seventy-five-v1", JSON.stringify(s));
  });
  await page.reload({ waitUntil: "networkidle" });
}

async function main() {
  const server = createServer(serve);
  await new Promise((r) => server.listen(port, r));
  const results = [];
  const consoleErrors = [];

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  const morning = "2026-06-15T11:00:00";
  const startDate = "2026-06-15";

  await fresh(page, morning);
  await page.screenshot({ path: `${artifacts}/75-mode-picker.png`, fullPage: true });
  results.push({ test: "mode picker loads", ok: !!(await page.$("#mode-all-in")) });

  await fresh(page, morning);
  await page.click("#mode-all-in");
  await page.waitForSelector("#ob-next");
  await page.click("#ob-next");
  await page.click("#ob-rules-next");
  await page.waitForSelector("#commitment-step");
  await page.screenshot({ path: `${artifacts}/75-commitment.png`, fullPage: true });
  results.push({ test: "commitment step", ok: !!(await page.$("#commit-btn")) });

  await fresh(page, morning);
  await completeAllInOnboarding(page, { useToday: true, why: "Test why" });
  await page.screenshot({ path: `${artifacts}/75-day0-done.png`, fullPage: true });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("seventy-five-v1")));
  results.push({
    test: "onboarding completes with day0",
    ok: stored.journey?.onboardingComplete && stored.journey?.day0?.energy === 6,
  });

  await page.goto(`http://127.0.0.1:${port}/index.html#/today`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${artifacts}/75-all-in-today.png`, fullPage: true });
  const whyText = await page.textContent(".why-banner");
  results.push({ test: "my why on today", ok: /Test why/.test(whyText || "") });

  await page.goto(`http://127.0.0.1:${port}/index.html#/workout`, { waitUntil: "networkidle" });
  results.push({ test: "weather exception toggle", ok: !!(await page.$("#weather-exception")) });

  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("seventy-five-v1"));
    const key = "2026-06-15";
    s.days[key] = s.days[key] || {};
    s.days[key].weatherException = true;
    s.days[key].workouts = [
      { minutes: 45, outdoor: false, loggedAt: 1 },
      { minutes: 45, outdoor: false, loggedAt: 4 * 3600000 },
    ];
    localStorage.setItem("seventy-five-v1", JSON.stringify(s));
  });
  await page.goto(`http://127.0.0.1:${port}/index.html#/progress`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${artifacts}/75-progress-grid.png`, fullPage: true });
  results.push({ test: "progress grid weather class", ok: !!(await page.$(".progress-dot.weather")) });

  await page.goto(`http://127.0.0.1:${port}/index.html#/water`, { waitUntil: "networkidle" });
  await page.click("#water-add");
  const water = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("seventy-five-v1"));
    const k = "2026-06-15";
    return s.days[k]?.waterMl || 0;
  });
  results.push({ test: "water tracker adds", ok: water >= 237 });

  await completeAllTasks(page);
  await page.goto(`http://127.0.0.1:${port}/index.html#/today`, { waitUntil: "networkidle" });
  if (await page.$("#close-day")) await page.click("#close-day");
  await page.waitForSelector("#day-complete-screen");
  await page.click("#day-complete-continue");
  await page.waitForSelector("#honesty-screen");
  await page.click("#honesty-yes");
  await page.waitForSelector(".page-title");
  results.push({
    test: "all-in day complete with honesty",
    ok: await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("seventy-five-v1"));
      return !!s.days["2026-06-15"]?.dayClosed;
    }),
  });

  await fresh(page, morning);
  await completeAllInOnboarding(page, { useToday: true });
  await page.addInitScript(() => {
    window.__75_MOCK_NOW = "2026-06-16T11:00:00";
  });
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("seventy-five-v1"));
    s.days["2026-06-15"] = { tasks: {}, waterMl: 0, evaluated: false };
    localStorage.setItem("seventy-five-v1", JSON.stringify(s));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#restart-screen", { timeout: 8000 });
  await page.screenshot({ path: `${artifacts}/75-restart-screen.png`, fullPage: true });
  results.push({ test: "all-in restart on missed locked day", ok: !!(await page.$("#confirm-restart")) });

  await fresh(page, morning);
  await page.click("#mode-adaptive");
  await page.waitForSelector("#adaptive-form");
  await page.screenshot({ path: `${artifacts}/75-adaptive-setup.png`, fullPage: true });
  await page.click('#adaptive-form button[type="submit"]');
  await page.waitForSelector("#ob-next");
  await page.click("#ob-next");
  await page.click("#ob-rules-next");
  await page.click("#commit-btn");
  await page.click("#start-today");
  await page.fill('input[name="energy"]', "5");
  await page.fill('input[name="mood"]', "5");
  await page.click('#day0-form button[type="submit"]');
  await page.goto(`http://127.0.0.1:${port}/index.html#/today`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${artifacts}/75-adaptive-today.png`, fullPage: true });
  const ad = await page.evaluate(() => JSON.parse(localStorage.getItem("seventy-five-v1")));
  results.push({
    test: "adaptive setup defaults",
    ok: ad.mode === "adaptive" && ad.adaptive?.workoutMinutes === 45 && ad.settings?.waterTargetMl === 3000,
  });

  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("seventy-five-v1"));
    const k = s.startDate;
    s.days[k] = { tasks: {}, waterMl: 0, workouts: [] };
    localStorage.setItem("seventy-five-v1", JSON.stringify(s));
  });
  await page.reload({ waitUntil: "networkidle" });
  results.push({
    test: "adaptive continues on missed day",
    ok: !(await page.$("#restart-screen")),
  });

  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("seventy-five-v1"));
    s.journey.milestonesSeen = [];
    s.journey.pendingMilestone = { day: 7, title: "One week in" };
    localStorage.setItem("seventy-five-v1", JSON.stringify(s));
  });
  await page.goto(`http://127.0.0.1:${port}/index.html#/milestone`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${artifacts}/75-milestone.png`, fullPage: true });
  results.push({ test: "milestone screen", ok: !!(await page.$("#milestone-screen")) });

  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("seventy-five-v1"));
    s.journey.finishSeen = false;
    s.startDate = "2026-04-01";
    s.currentAttemptStart = "2026-04-01";
    localStorage.setItem("seventy-five-v1", JSON.stringify(s));
  });
  await page.goto(`http://127.0.0.1:${port}/index.html#/finish`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${artifacts}/75-finish.png`, fullPage: true });
  results.push({ test: "day 75 finish screen", ok: !!(await page.$("#finish-summary")) });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: "networkidle" });
  results.push({ test: "desktop viewport loads", ok: !!(await page.$("#finish-summary, .page-title")) });

  await browser.close();
  server.close();

  const filteredErrors = consoleErrors.filter((e) => !/favicon|404|service worker/i.test(e));
  console.log(JSON.stringify({ results, consoleErrors: filteredErrors }, null, 2));
  if (results.some((r) => !r.ok) || filteredErrors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
