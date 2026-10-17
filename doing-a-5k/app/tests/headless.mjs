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

async function onboard(page, days, { e2e = false } = {}) {
  const q = e2e ? "?e2e=1" : "";
  await page.goto(`http://127.0.0.1:8765/doing-a-5k/app/index.html${q}`);
  await page.waitForSelector("#onboard-form");
  await page.click(`input[name="days"][value="${days}"]`);
  const boxes = await page.$$('input[name="day"]');
  for (let i = 0; i < days; i++) {
    await boxes[i].check();
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
      await onboard(page, days);
      const weeks = await page.evaluate(() => window.__doingA5K.loadState().meta.weeks);
      const expected = { 3: 12, 4: 10, 5: 8 }[days];
      results.push({ days, weeks, ok: weeks === expected });
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
    await page.waitForSelector("#onboard-form");
    await page.screenshot({ path: `${artifacts}/5k-onboarding-mobile.png`, fullPage: true });
    await onboard(page, 3);
    await page.screenshot({ path: `${artifacts}/5k-today-mobile.png`, fullPage: true });

    await page.click("#start-workout");
    await page.waitForSelector("#timer-countdown");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${artifacts}/5k-timer-mobile.png`, fullPage: true });

    await page.evaluate(() => localStorage.clear());
    await onboard(page, 3, { e2e: true });
    await page.click("#start-workout");
    await page.waitForSelector("#complete-form", { timeout: 15000 });
    await page.click('button[type="submit"]');
    await page.waitForSelector(".today-card");
    const done = await page.evaluate(() => window.__doingA5K.loadState().completed.length);
    await page.reload();
    const doneAfter = await page.evaluate(() => window.__doingA5K.loadState().completed.length);
    results.push({ persistence: done === 1 && doneAfter === 1 });

    await page.click('[data-nav="plan"]');
    await page.waitForSelector(".plan-week");
    await page.screenshot({ path: `${artifacts}/5k-plan-mobile.png`, fullPage: true });

    await page.click('[data-nav="progress"]');
    await page.waitForSelector(".stats-grid");
    await page.screenshot({ path: `${artifacts}/5k-progress-mobile.png`, fullPage: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:8765/doing-a-5k/app/index.html");
    await page.waitForSelector(".today-card");
    await page.screenshot({ path: `${artifacts}/5k-today-desktop.png`, fullPage: true });
    await ctx.close();
  } finally {
    await browser.close();
    http.close();
  }

  const failed = results.some((r) => r.ok === false) || results.some((r) => r.persistence === false);
  console.log(JSON.stringify({ results, errors, failed }, null, 2));
  process.exit(failed || errors.length ? 1 : 0);
}

main();
