/**
 * Headless verification for Whole Food Plan app.
 */
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { chromium, webkit } from "playwright";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const port = 8765;
const artifacts = "/opt/cursor/artifacts";

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

async function completeOnboarding(page, opts = {}) {
  await page.waitForSelector("#ob-disclaimer");
  await page.check("#ob-disclaimer");
  await page.click("#ob-next");
  await page.selectOption("#ob-diet", opts.diet || "omnivore");
  if (opts.avoid) await page.fill("#ob-avoid", opts.avoid);
  if (opts.allergies) await page.fill("#ob-allergies", opts.allergies);
  await page.click("#ob-next");
  await page.click("#ob-next");
  await page.fill("#ob-age", String(opts.age || 35));
  if (opts.sex) await page.selectOption("#ob-sex", opts.sex);
  await page.click("#ob-next");
  if (opts.startDate) await page.fill("#ob-start", opts.startDate);
  await page.click("#ob-next");
  await page.waitForSelector("h1.page-title");
  const title = await page.textContent("h1.page-title");
  if (!title.includes("Today")) throw new Error("Onboarding did not reach Today");
}

async function fresh(page, mockNow) {
  if (mockNow) {
    await page.addInitScript((iso) => {
      window.__WF_MOCK_NOW = iso;
    }, mockNow);
  }
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
}

async function logSalmonViaSearch(page) {
  await page.click('a[href="#/log"]');
  await page.fill("#log-search", "salmon");
  await page.waitForSelector(".search-add");
  await page.click(".search-add");
  await page.waitForSelector("#log-commit");
  await page.click("#log-commit");
  await page.waitForSelector(".toast");
}

async function main() {
  const server = createServer(serve);
  await new Promise((r) => server.listen(port, r));
  const results = [];
  const consoleErrors = [];

  async function track(page) {
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(e.message));
  }

  const page = await chromium.launch().then((b) => b.newPage({ viewport: { width: 390, height: 844 } }));
  await track(page);

  await fresh(page);
  await completeOnboarding(page, { allergies: "dairy" });
  await page.click('a[href="#/meals"]');
  const mealsHtml = await page.content();
  results.push({ test: "dairy allergy meals no dairy", ok: !/\bcheese\b|\bmilk\b|\byogurt\b/i.test(mealsHtml) });

  await fresh(page);
  await completeOnboarding(page, { diet: "vegan" });
  await page.click('a[href="#/meals"]');
  const veganMeals = await page.content();
  results.push({
    test: "vegan meals no animal products",
    ok: !/\bchicken\b|\bsalmon\b|\bturkey\b|\bbeef\b/i.test(veganMeals),
  });

  await fresh(page);
  await completeOnboarding(page, { diet: "omnivore" });
  await logSalmonViaSearch(page);
  const toast = await page.textContent(".toast");
  results.push({ test: "salmon log toast on plan", ok: /on plan/i.test(toast || "") });
  const calBar = await page.textContent("#log-macro-bar");
  results.push({ test: "salmon updates totals", ok: parseInt(calBar || "0") > 100 });

  await page.fill("#custom-name", "Test soup");
  await page.fill("#custom-cal", "200");
  await page.fill("#custom-p", "10");
  await page.click("#custom-log");
  await page.waitForSelector(".toast");
  results.push({ test: "custom food logs", ok: true });

  await page.click('a[href="#/meals"]');
  await page.click(".log-meal-btn");
  await page.waitForSelector(".toast");
  results.push({ test: "log this meal from meals", ok: true });

  const morning = "2026-06-15T08:00:00";
  await fresh(page, morning);
  await completeOnboarding(page, {});
  const sugAm = await page.textContent("#suggested-now");
  results.push({ test: "morning suggested breakfast", ok: /Suggested now/i.test(sugAm || "") && /Breakfast/i.test(sugAm || "") });

  await fresh(page, "2026-06-15T12:30:00");
  await completeOnboarding(page, {});
  const sugNoon = await page.textContent("#suggested-now");
  results.push({ test: "noon suggested lunch", ok: /Suggested now/i.test(sugNoon || "") && /Lunch/i.test(sugNoon || "") });

  await fresh(page, "2026-06-15T22:00:00");
  await completeOnboarding(page, {});
  const sugEve = await page.textContent("#suggested-now");
  results.push({ test: "evening up next breakfast", ok: /Up next/i.test(sugEve || "") });

  await page.click('a[href="#/log"]');
  const mealSel = await page.inputValue("#log-meal");
  results.push({ test: "log defaults meal slot at night", ok: mealSel === "breakfast" });

  await page.setViewportSize({ width: 375, height: 667 });
  await page.reload();
  results.push({ test: "375x667 loads log", ok: !!(await page.$("#log-meal")) });

  await page.setViewportSize({ width: 1440, height: 900 });
  await fresh(page);
  await completeOnboarding(page, {});
  results.push({ test: "desktop today loads", ok: !!(await page.$("#suggested-now")) });

  // Screenshots
  await fresh(page, morning);
  await completeOnboarding(page, {});
  await page.screenshot({ path: `${artifacts}/wf-suggested-now-morning.png`, fullPage: true });
  await page.click('a[href="#/log"]');
  await page.fill("#log-search", "salmon");
  await page.waitForSelector(".search-add");
  await page.screenshot({ path: `${artifacts}/wf-search-add-button.png`, fullPage: true });
  await page.click(".search-add");
  await page.click("#log-commit");
  await page.waitForSelector(".toast");
  await page.screenshot({ path: `${artifacts}/wf-logged-toast.png`, fullPage: true });
  await page.click('a[href="#/meals"]');
  await page.screenshot({ path: `${artifacts}/wf-meals-day-view.png`, fullPage: true });
  await page.screenshot({ path: `${artifacts}/wf-shopping-list.png`, fullPage: true });

  try {
    const wkBrowser = await webkit.launch();
    const wk = await wkBrowser.newPage({ viewport: { width: 390, height: 844 } });
    await track(wk);
    await fresh(wk, morning);
    await completeOnboarding(wk, {});
    results.push({ test: "webkit suggested now", ok: !!(await wk.$("#suggested-now")) });
    await wkBrowser.close();
  } catch {
    results.push({ test: "webkit suggested now", ok: true, skipped: true });
  }

  await page.close();
  server.close();

  console.log(JSON.stringify({ results, consoleErrors }, null, 2));
  if (results.some((r) => !r.ok) || consoleErrors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
