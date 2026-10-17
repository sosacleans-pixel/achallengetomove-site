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

async function onboardHalf(page, { days = 3, pushups = 10, equipment = [], e2e = false } = {}) {
  const q = e2e ? "?e2e=1" : "";
  await page.goto(`http://127.0.0.1:8765/doing-a-5k/app/index.html${q}`);
  await page.waitForSelector("#onboard-form");
  await page.click('input[name="goal"][value="half"]');
  await page.click(`input[name="daysHalf"][value="${days}"]`);
  const boxes = await page.$$('input[name="day"]');
  for (let i = 0; i < days; i++) {
    await boxes[i].check();
  }
  await page.evaluate(() => {
    const form = document.getElementById("onboard-form");
    const runDays = [...form.querySelectorAll('input[name="day"]:checked')].map((el) => Number(el.value));
    const defaults = window.__doingA5K.defaultStrengthDays(runDays, 1);
    form.querySelectorAll('input[name="strengthDay"]').forEach((el) => {
      el.checked = defaults.includes(Number(el.value));
    });
  });
  await page.fill('input[name="pushups"]', String(pushups));
  for (const eq of equipment) {
    await page.check(`input[name="equipment"][value="${eq}"]`);
  }
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
        return {
          weeks: s.meta.weeks,
          goal: s.meta.goal,
          perWeek,
          strengthOnRun,
        };
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
    await page.screenshot({ path: `${artifacts}/goal-picker.png`, fullPage: true });

    await page.fill('input[name="pushups"]', "7");
    await page.dispatchEvent('input[name="pushups"]', "input");
    await page.screenshot({ path: `${artifacts}/level-test-beginner.png`, fullPage: true });

    await page.fill('input[name="pushups"]', "8");
    await page.dispatchEvent('input[name="pushups"]', "input");
    const level8 = await page.textContent("#strength-level-preview");
    results.push({ pushupBoundary8: level8.includes("Average") });

    await page.fill('input[name="pushups"]', "7");
    const level7 = await page.textContent("#strength-level-preview");
    results.push({ pushupBoundary7: level7.includes("Beginner") });

    await page.check('input[name="equipment"][value="dumbbells"]');
    await page.screenshot({ path: `${artifacts}/equipment-select.png`, fullPage: true });

    await onboardHalf(page, { days: 3, pushups: 10, equipment: ["dumbbells"] });
    const half3 = await page.evaluate(() => {
      const s = window.__doingA5K.loadState();
      const longRuns = s.longRunProgressionKm || window.__doingA5K.longRunProgressionKm(s.meta.weeks);
      const peak = Math.max(...longRuns.slice(0, s.meta.weeks - 2));
      const taper = longRuns.slice(-2);
      const hasInterval = s.workouts.some((w) => w.title.includes("Interval") || w.summary.includes("interval"));
      const strengthUsesDb = s.strengthWorkouts[0]?.steps?.some((st) =>
        (st.label || "").toLowerCase().includes("dumbbell") || (st.label || "").toLowerCase().includes("goblet")
      );
      return {
        weeks: s.meta.weeks,
        days: s.meta.daysPerWeek,
        strengthLevel: s.meta.strengthLevel,
        peakKm: peak,
        taperKm: taper,
        hasInterval,
        strengthUsesDb,
      };
    });
    results.push({
      test: "half-3day-average",
      ok:
        half3.weeks === 12 &&
        half3.days === 3 &&
        half3.strengthLevel === "average" &&
        half3.peakKm >= 16 &&
        half3.peakKm <= 19.5 &&
        half3.taperKm[0] < half3.peakKm &&
        half3.taperKm[1] < half3.taperKm[0] &&
        half3.hasInterval &&
        half3.strengthUsesDb,
      half3,
    });

    await page.click('[data-nav="plan"]');
    await page.waitForSelector(".plan-overview-card");
    await page.screenshot({ path: `${artifacts}/half-overview.png`, fullPage: true });

    await page.click('[data-nav="today"]');
    await page.waitForSelector(".btn-start-strength");
    await page.click(".btn-start-strength");
    await page.waitForSelector("#begin-strength");
    await page.screenshot({ path: `${artifacts}/strength-equipment-overview.png`, fullPage: false });

    const intervalId = await page.evaluate(() => {
      const s = window.__doingA5K.loadState();
      const w = s.workouts.find((x) => x.title.includes("Interval") || (x.summary || "").includes("interval"));
      return w?.id;
    });
    if (intervalId) {
      await page.evaluate((id) => window.__doingA5K.startWorkoutById(id), intervalId);
      await page.waitForSelector("#timer-countdown");
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${artifacts}/interval-workout-timer.png`, fullPage: false });
    } else {
      results.push({ intervalWorkoutFound: false });
    }

    await page.evaluate(() => localStorage.clear());
    await onboardHalf(page, { days: 4, pushups: 3, equipment: [] });
    const half4beg = await page.evaluate(() => {
      const s = window.__doingA5K.loadState();
      return { weeks: s.meta.weeks, days: s.meta.daysPerWeek, strengthLevel: s.meta.strengthLevel };
    });
    results.push({
      test: "half-4day-beginner",
      ok: half4beg.weeks === 16 && half4beg.days === 4 && half4beg.strengthLevel === "beginner",
      half4beg,
    });

    await page.evaluate(() => localStorage.clear());
    await onboard5k(page, 3, { e2e: true, strengthDays: 1 });

    await page.click('[data-nav="plan"]');
    await page.waitForSelector(".plan-item--strength");
    await page.screenshot({ path: `${artifacts}/5k-plan-strength-week.png`, fullPage: false });

    await page.click('[data-nav="today"]');
    await page.waitForSelector(".btn-start-strength");
    await page.click(".btn-start-strength");
    await page.waitForSelector("#begin-strength");
    await page.screenshot({ path: `${artifacts}/5k-strength-overview.png`, fullPage: false });

    await page.click("#begin-strength");
    await page.waitForSelector("#timer-countdown");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${artifacts}/5k-strength-timer.png`, fullPage: false });

    await page.waitForSelector("#strength-complete-form", { timeout: 20000 });
    await page.click('#strength-complete-form button[type="submit"]');
    await page.waitForSelector(".today-card");
    const strengthDone = await page.evaluate(
      () => window.__doingA5K.loadState().strengthCompleted.length
    );
    await page.reload();
    const strengthAfter = await page.evaluate(
      () => window.__doingA5K.loadState().strengthCompleted.length
    );
    results.push({ strengthPersistence: strengthDone === 1 && strengthAfter === 1 });

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
    results.some((r) => r.pushupBoundary8 === false) ||
    results.some((r) => r.strengthPersistence === false);
  console.log(JSON.stringify({ results, errors, failed }, null, 2));
  process.exit(failed || errors.length ? 1 : 0);
}

main();
