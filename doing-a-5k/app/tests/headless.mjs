import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync, statSync, mkdirSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const PORT = Number(process.env.PORT || 8765);
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
  await page.goto(`http://127.0.0.1:${PORT}/doing-a-5k/app/index.html${q}`);
  await page.waitForSelector("#onboard-form");
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

async function main() {
  const errors = [];
  const http = server();
  await new Promise((r) => http.listen(PORT, r));
  const browser = await chromium.launch();
  const artifacts = process.env.ARTIFACTS || "/opt/cursor/artifacts";
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
      await page.goto(`http://127.0.0.1:${PORT}/doing-a-5k/app/index.html`);
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

    // The half marathon goal moved to its own app (/5k-to-half-marathon/app/): no goal choice here any more.
    await page.goto(`http://127.0.0.1:${PORT}/doing-a-5k/app/index.html`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector("#onboard-form");
    const noGoal = await page.evaluate(() => ({
      goalInputs: document.querySelectorAll('input[name="goal"]').length,
      halfFields: document.querySelectorAll("#half-base-field, #days-half-row, #half-disclaimer-details").length,
      text: document.querySelector("#app").textContent,
    }));
    results.push({ test: "no-half-goal-in-onboarding", ok: noGoal.goalInputs === 0 && noGoal.halfFields === 0 && !/half marathon/i.test(noGoal.text), noGoal: { goalInputs: noGoal.goalInputs, halfFields: noGoal.halfFields } });

    // Saved plans from before the split (goal "half") still open and can switch back to 5K.
    await page.evaluate(() => {
      const plan = window.__doingA5K.buildPlan({ goal: "half", daysPerWeek: 3, runLevel: "beginner", strengthLevel: "beginner", preferredDays: [1, 3, 5], startDateISO: "2026-10-19", name: "", strengthDaysPerWeek: 2, strengthPreferredDays: [2, 4], equipment: ["none"], units: "mi", pushups: 5 });
      localStorage.setItem("doing-a-5k-v3", JSON.stringify({ ...plan, completed: [], strengthCompleted: [], settings: { voice: true, units: "mi" } }));
    });
    await page.reload();
    await page.waitForSelector(".today-card");
    await page.click('[data-nav="settings"]');
    await page.waitForSelector("#apply-goal");
    results.push({ test: "legacy-half-plan-still-opens", ok: true });

    const boundaries = await page.evaluate(() => ({
      seven: window.__doingA5K.strengthLevelFromPushUps(7),
      eight: window.__doingA5K.strengthLevelFromPushUps(8),
    }));
    results.push({ pushupBoundary7: boundaries.seven === "beginner" });
    results.push({ pushupBoundary8: boundaries.eight === "average" });

    await page.evaluate(() => localStorage.clear());
    await onboard5k(page, 3, { e2e: true, strengthDays: 1 });
    await page.waitForSelector(".today-card");
    const strengthDone = await page.evaluate(() => {
      const s = window.__doingA5K.loadState();
      return s.strengthWorkouts.length > 0;
    });
    results.push({ strengthPersistence5k: strengthDone });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:${PORT}/doing-a-5k/app/index.html`);
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
    results.some((r) => r.strengthPersistence5k === false);
  console.log(JSON.stringify({ results, errors, failed }, null, 2));
  process.exit(failed || errors.length ? 1 : 0);
}

main();
