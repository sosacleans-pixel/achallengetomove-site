import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
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

async function onboard(page, days, { e2e = false, strengthDays = 1 } = {}) {
  const q = e2e ? "?e2e=1" : "";
  await page.goto(`http://127.0.0.1:8765/doing-a-5k/app/index.html${q}`);
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
  await page.click('button[type="submit"]');
  await page.waitForSelector(".today-card");
}

async function main() {
  const errors = [];
  const http = server();
  await new Promise((r) => http.listen(8765, r));
  const browser = await chromium.launch();
  const artifacts = "/opt/cursor/artifacts";
  const results = [];

  try {
    for (const days of [3, 4, 5]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("http://127.0.0.1:8765/doing-a-5k/app/index.html");
      await page.evaluate(() => localStorage.clear());
      await onboard(page, days, { strengthDays: 1 });
      const check = await page.evaluate(() => {
        const s = window.__doingA5K.loadState();
        const runDays = new Set(s.meta.preferredDays);
        const strengthOnRun = s.strengthWorkouts.some((w) => runDays.has(w.weekday));
        const perWeek = s.strengthWorkouts.filter((w) => w.weekIndex === 0).length;
        return {
          weeks: s.meta.weeks,
          perWeek,
          strengthOnRun,
        };
      });
      const expected = { 3: 12, 4: 10, 5: 8 }[days];
      results.push({
        days,
        weeks: check.weeks,
        strengthPerWeek: check.perWeek,
        noStrengthOnRunDays: !check.strengthOnRun,
        ok: check.weeks === expected && check.perWeek === 1 && !check.strengthOnRun,
      });
      await ctx.close();
    }

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("http://127.0.0.1:8765/doing-a-5k/app/index.html");
    await page.evaluate(() => localStorage.clear());
    await onboard(page, 3, { strengthDays: 2 });
    const twoStrength = await page.evaluate(() => {
      const s = window.__doingA5K.loadState();
      return s.strengthWorkouts.filter((w) => w.weekIndex === 0).length;
    });
    results.push({ twoStrengthDays: twoStrength === 2 });

    await page.evaluate(() => localStorage.clear());
    await onboard(page, 3, { e2e: true, strengthDays: 1 });

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
    results.some((r) => r.twoStrengthDays === false) ||
    results.some((r) => r.strengthPersistence === false);
  console.log(JSON.stringify({ results, errors, failed }, null, 2));
  process.exit(failed || errors.length ? 1 : 0);
}

main();
