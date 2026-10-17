/**
 * Headless verification for Whole Food Plan app.
 */
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

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

async function fresh(page) {
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
}

async function main() {
  const server = createServer(serve);
  await new Promise((r) => server.listen(port, r));
  const browser = await chromium.launch();
  const results = [];
  const consoleErrors = [];

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  await fresh(page);
  await completeOnboarding(page, { allergies: "dairy" });
  await page.click('a[href="#/foods"]');
  await page.waitForSelector(".food-list-group");
  const extraHtml = await page.content();
  results.push({ test: "dairy allergy in extra avoids", ok: /Your extra avoids[\s\S]*dairy/i.test(extraHtml) });

  await fresh(page);
  await completeOnboarding(page, { diet: "vegan" });
  await page.click('a[href="#/foods"]');
  await page.waitForSelector("#enjoy-list");
  const enjoy = await page.textContent("#enjoy-list");
  results.push({ test: "vegan includes legumes", ok: /lentil|chickpea|black bean/i.test(enjoy || "") });
  results.push({ test: "vegan excludes salmon", ok: !/salmon/i.test(enjoy || "") });

  await fresh(page);
  await completeOnboarding(page, { diet: "omnivore" });
  await page.click('a[href="#/foods"]');
  const enjoyOmni = await page.textContent("#enjoy-list");
  results.push({ test: "omnivore includes salmon", ok: /salmon/i.test(enjoyOmni || "") });

  await page.click('a[href="#/log"]');
  await page.fill("#log-search", "cheddar");
  await page.waitForSelector("#log-results:not(.hidden) button");
  await page.click("#log-results button");
  await page.waitForSelector(".status-off");
  results.push({ test: "cheese off plan", ok: true });
  await page.fill("#log-search", "salmon");
  await page.waitForSelector("#log-results:not(.hidden) button");
  await page.click("#log-results button");
  await page.waitForSelector(".status-on");
  results.push({ test: "salmon on plan", ok: true });
  const calBefore = await page.textContent(".card.macro-bar");
  const cals = Number((calBefore.match(/(\d+)/) || [0, 0])[1]);
  results.push({ test: "calories total sensible", ok: cals > 150 });
  await page.reload({ waitUntil: "networkidle" });
  await page.click('a[href="#/log"]');
  const calAfter = await page.textContent(".card.macro-bar");
  results.push({ test: "data persists reload", ok: calAfter === calBefore });

  await fresh(page);
  const old = new Date();
  old.setDate(old.getDate() - 35);
  await completeOnboarding(page, { startDate: localDateStr(old) });
  await page.goto(`http://127.0.0.1:${port}/index.html#/reintro`, { waitUntil: "networkidle" });
  const unlocked = await page.textContent("#app-main");
  results.push({
    test: "reintro unlocked after day 30",
    ok: /Test day/i.test(unlocked || "") && !/Unlocks after Day 30/i.test(unlocked || ""),
  });

  await fresh(page);
  await completeOnboarding(page, {});
  await page.goto(`http://127.0.0.1:${port}/index.html#/reintro`, { waitUntil: "networkidle" });
  const locked = await page.textContent("#app-main");
  results.push({ test: "reintro locked before day 30", ok: /Unlocks after Day 30/i.test(locked || "") });

  // Screenshots (mobile)
  await fresh(page);
  await page.screenshot({ path: `${artifacts}/wf-questionnaire.png`, fullPage: true });
  await page.check("#ob-disclaimer");
  await page.click("#ob-next");
  await page.screenshot({ path: `${artifacts}/wf-questionnaire-step2.png`, fullPage: true });

  await fresh(page);
  await completeOnboarding(page, {});
  await page.click('a[href="#/foods"]');
  await page.screenshot({ path: `${artifacts}/wf-food-list.png`, fullPage: true });
  await page.click('a[href="#/log"]');
  await page.fill("#log-search", "cheese");
  await page.waitForSelector("#log-results:not(.hidden) button");
  await page.click("#log-results button");
  await page.waitForSelector(".status-off");
  await page.fill("#log-search", "salmon");
  await page.waitForSelector("#log-results:not(.hidden) button");
  await page.click("#log-results button");
  await page.screenshot({ path: `${artifacts}/wf-food-log.png`, fullPage: true });
  await page.click('a[href="#/today"]');
  await page.screenshot({ path: `${artifacts}/wf-today.png`, fullPage: true });
  await page.click('a[href="#/progress"]');
  await page.screenshot({ path: `${artifacts}/wf-progress.png`, fullPage: true });

  await fresh(page);
  const oldStart = new Date();
  oldStart.setDate(oldStart.getDate() - 35);
  await completeOnboarding(page, { startDate: localDateStr(oldStart) });
  await page.click('a[href="#/reintro"]');
  await page.screenshot({ path: `${artifacts}/wf-reintroduction.png`, fullPage: true });

  // Desktop viewport smoke
  await page.setViewportSize({ width: 1440, height: 900 });
  await fresh(page);
  await completeOnboarding(page, {});
  await page.click('a[href="#/today"]');
  await page.screenshot({ path: `${artifacts}/wf-today-desktop.png`, fullPage: true });

  await page.close();
  server.close();
  await browser.close();

  console.log(JSON.stringify({ results, consoleErrors }, null, 2));
  if (results.some((r) => !r.ok) || consoleErrors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
