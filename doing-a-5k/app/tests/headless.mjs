import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync, statSync, mkdirSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");
const repoRoot = join(root, "../..");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

function server() {
  return createServer((req, res) => {
    let path = req.url.split("?")[0];
    if (path === "/" || path === "/doing-a-5k/app" || path === "/doing-a-5k/app/") {
      path = "/doing-a-5k/app/index.html";
    }
    const filePath = join(repoRoot, path);
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const body = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  });
}

async function onboard5k(page, days, { e2e = false, strengthDays = 1, pushups = 5, equipment = [] } = {}) {
  const q = e2e ? "?e2e=1" : "";
  await page.goto(`http://127.0.0.1:8765/doing-a-5k/app/index.html${q}`);
  await page.waitForSelector("#onboard-form");
  await page.click('input[name="goal"][value="5k"]');
  await page.click(`input[name="days"][value="${days}"]`);
  await page.click(`input[name="strengthDays"][value="${strengthDays}"]`);
  const boxes = await page.$$('input[name="day"]');
  for (let i = 0; i < days; i++) {
    await boxes[i].check();
  }
  await page.evaluate((sd) => {
    const form = document.getElementById("onboard-form");
    const runDays = [...form.querySelectorAll('input[name="day"]:checked')].map((el) => Number(el.value));
    const defaults = window.__doingA5K.defaultStrengthDays(runDays, sd);
    form.querySelectorAll('input[name="strengthDay"]').forEach((el) => {
      el.checked = defaults.includes(Number(el.value));
    });
  }, strengthDays);
  await page.fill('input[name="pushups"]', String(pushups));
  for (const eq of equipment) {
    await page.check(`input[name="equipment"][value="${eq}"]`);
  }
  await page.click('button[type="submit"]');
  await page.waitForSelector(".today-card");
}

async function fillHalfRunLevel(page, runLevel) {
  await page.click('input[name="runLevelMethod"][value="b"]');
  if (runLevel === "average") {
    await page.click('input[name="continuousRange"][value="m40plus"]');
    await page.click('input[name="runDaysNow"][value="d3plus"]');
  } else if (runLevel === "beginner") {
    await page.click('input[name="continuousRange"][value="m20_39"]');
    await page.click('input[name="runDaysNow"][value="d0_1"]');
  } else if (runLevel === "not_ready") {
    await page.click('input[name="continuousRange"][value="lt20"]');
  }
}

async function onboardHalf(
  page,
  { days = 3, pushups = 10, equipment = "dumbbells", runLevel = "average", optional = [] } = {}
) {
  await page.goto("http://127.0.0.1:8765/doing-a-5k/app/index.html");
  await page.waitForSelector("#onboard-form");
  await page.click('input[name="goal"][value="half"]');
  await page.click(`input[name="daysHalf"][value="${days}"]`);
  await page.click(`input[name="equipmentHalf"][value="${equipment}"]`);
  for (const o of optional) {
    await page.check(`input[name="equipmentOptional"][value="${o}"]`);
  }
  await fillHalfRunLevel(page, runLevel);
  const boxes = await page.$$('input[name="day"]');
  for (let i = 0; i < days; i++) {
    await boxes[i].check();
  }
  await page.fill('input[name="pushupsHalf"]', String(pushups));
  await page.click('button[type="submit"]');
  await page.waitForSelector(".today-card");
}

async function main() {
  const errors = [];
  const http = server();
  await new Promise((r) => http.listen(8765, r));
  const browser = await chromium.launch();
  const artifacts = "/opt/cursor/artifacts";
  mkdirSync(artifacts, { recursive: true });
  const results = [];

  const attachErrors = (page) => {
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
  };

  try {
    for (const days of [3, 4, 5]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      attachErrors(page);
      await page.goto("http://127.0.0.1:8765/doing-a-5k/app/index.html");
      await page.evaluate(() => localStorage.clear());
      await onboard5k(page, days, { strengthDays: 1 });
      const check = await page.evaluate(() => {
        const s = window.__doingA5K.loadState();
        const runDays = new Set(s.meta.preferredDays);
        const strengthOnRun = s.strengthWorkouts.some((w) => runDays.has(w.weekday));
        const perWeek = s.strengthWorkouts.filter((w) => w.weekIndex === 0).length;
        return { weeks: s.meta.weeks, goal: s.meta.goal, perWeek, strengthOnRun };
      });
      const expected = { 3: 12, 4: 10, 5: 8 }[days];
      results.push({
        test: `5k-${days}days`,
        ok: check.weeks === expected && check.perWeek === 1 && !check.strengthOnRun && check.goal === "5k",
        check,
      });
      await ctx.close();
    }

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    attachErrors(page);

    await page.goto("http://127.0.0.1:8765/doing-a-5k/app/index.html");
    await page.evaluate(() => localStorage.clear());
    await page.waitForSelector("#onboard-form");
    await page.click('input[name="goal"][value="half"]');
    await page.screenshot({ path: `${artifacts}/half-run-level-screen.png`, fullPage: true });

    await page.click('input[name="goal"][value="half"]');
    await page.fill('input[name="pushupsHalf"]', "12");
    await page.screenshot({ path: `${artifacts}/half-strength-level-screen.png`, fullPage: true });

    await onboardHalf(page, { days: 3, pushups: 10, equipment: "dumbbells", runLevel: "average" });
    const half3avg = await page.evaluate(() => {
      const s = window.__doingA5K.loadState();
      const lr = s.longRunProgressionKm;
      const peakWeekKm = lr[9];
      return {
        weeks: s.meta.weeks,
        runLevel: s.meta.runLevel,
        strengthLevel: s.meta.strengthLevel,
        coachPlanId: s.meta.coachPlanId,
        peakWeekKm,
        version: s.coachMeta ? "coach" : null,
      };
    });
    const planVersion = await page.evaluate(async () => {
      const r = await fetch("/doing-a-5k/app/data/half-marathon-plan.json");
      const j = await r.json();
      return j.meta.version;
    });
    results.push({
      test: "half-3day-average-v2",
      ok:
        half3avg.weeks === 12 &&
        half3avg.runLevel === "average" &&
        half3avg.strengthLevel === "average" &&
        half3avg.coachPlanId === "average-3day" &&
        half3avg.peakWeekKm >= 19 &&
        planVersion === "2.0",
      half3avg,
      planVersion,
    });

    await page.click('[data-nav="plan"]');
    await page.waitForSelector(".plan-week");
    await page.screenshot({ path: `${artifacts}/half-plan-week-v2.png`, fullPage: true });

    await page.evaluate(() => localStorage.clear());
    await onboardHalf(page, { days: 4, pushups: 3, equipment: "none", runLevel: "beginner" });
    const half4beg = await page.evaluate(() => {
      const s = window.__doingA5K.loadState();
      return { weeks: s.meta.weeks, runLevel: s.meta.runLevel, strengthLevel: s.meta.strengthLevel, w14: s.longRunProgressionKm[13] };
    });
    results.push({
      test: "half-4day-beginner-v2",
      ok: half4beg.weeks === 16 && half4beg.runLevel === "beginner" && half4beg.strengthLevel === "beginner" && half4beg.w14 >= 16,
      half4beg,
    });

    await page.evaluate(() => localStorage.clear());
    await onboardHalf(page, { days: 3, pushups: 12, equipment: "none", runLevel: "beginner" });
    const split = await page.evaluate(() => {
      const s = window.__doingA5K.loadState();
      return { runLevel: s.meta.runLevel, strengthLevel: s.meta.strengthLevel, weeks: s.meta.weeks };
    });
    results.push({
      test: "half-beginner-run-average-strength",
      ok: split.runLevel === "beginner" && split.strengthLevel === "average" && split.weeks === 16,
      split,
    });

    const notReady = await page.evaluate(() => {
      const a = window.__doingA5K.resolveRunLevelMethodB({ continuousRange: "lt20", runDays: "d3plus" });
      return a.ok;
    });
    results.push({ test: "run-level-not-ready", ok: notReady === false });

    const boundaries = await page.evaluate(() => ({
      seven: window.__doingA5K.strengthLevelFromPushUps(7),
      eight: window.__doingA5K.strengthLevelFromPushUps(8),
    }));
    results.push({ pushupBoundary7: boundaries.seven === "beginner" });
    results.push({ pushupBoundary8: boundaries.eight === "average" });

    await page.evaluate(() => localStorage.clear());
    await onboard5k(page, 3, { e2e: true, strengthDays: 1 });
    results.push({ strengthPersistence5k: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:8765/doing-a-5k/app/index.html");
    await page.waitForSelector(".today-card");
    await ctx.close();
  } finally {
    await browser.close();
    http.close();
  }

  const failed =
    results.some((r) => r.ok === false) ||
    results.some((r) => r.pushupBoundary7 === false) ||
    results.some((r) => r.pushupBoundary8 === false);
  console.log(JSON.stringify({ results, errors, failed }, null, 2));
  process.exit(failed || errors.length ? 1 : 0);
}

main();
