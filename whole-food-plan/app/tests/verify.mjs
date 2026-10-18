/**
 * Headless verification for Whole Food Plan app.
 */
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

// Existing flows start after the one-time Health and safety screen (/js/health-ack.js), which is tested on its own.
const HS_VERSION = readFileSync(new URL("../../../js/health-ack.js", import.meta.url), "utf8").match(/VERSION = "([^"]+)"/)[1];
const seedHealthAck = ([key, version]) => { try { localStorage.setItem(key, JSON.stringify({ version, at: "test" })); } catch (e) {} };


const root = join(fileURLToPath(import.meta.url), "..", "..");
const port = 8765;
const artifacts = "/opt/cursor/artifacts";

mkdirSync(artifacts, { recursive: true });

const MACRO_STEPS = ["protein", "carbs", "fat", "vegetables", "flavor"];

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
  // The app loads the site-wide /js/health-ack.js; serve it from the site root like production.
  const base = path === "/js/health-ack.js" ? join(root, "..", "..") : root;
  const file = join(base, path.replace(/^\//, ""));
  if (!file.startsWith(base) || !existsSync(file)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}

async function completeMacroPicker(page, opts = {}) {
  for (const group of MACRO_STEPS) {
    await page.waitForSelector(`#ob-${group}-eat-panel`);
    const panel = page.locator(`#ob-${group}-eat-panel`);
    if (opts.narrow && group === "protein") {
      await panel.locator(".macro-clear-all").click();
      await panel.locator('.eat-chip[data-id="poultry_0"]').click();
      await panel.locator('.eat-chip[data-id="fish_0"]').click();
      await panel.locator('.eat-chip[data-id="poultry_2"]').click();
    } else if (opts.narrow && group === "carbs") {
      await panel.locator(".macro-clear-all").click();
      await panel.locator('.eat-chip[data-id="rice"]').click();
      await panel.locator('.eat-chip[data-id="veg_17"]').click();
      await panel.locator('.eat-chip[data-id="fruit_1"]').click();
    } else if (opts.narrow && group === "fat") {
      await panel.locator(".macro-clear-all").click();
      await panel.locator('.eat-chip[data-id="avocado"]').click();
      await panel.locator('.eat-chip[data-id="olive_oil"]').click();
    } else if (opts.narrow && group === "vegetables") {
      await panel.locator(".macro-clear-all").click();
      for (const id of ["veg_0", "veg_5", "veg_8", "veg_9"]) {
        await panel.locator(`.eat-chip[data-id="${id}"]`).click();
      }
    }
    if (opts.diet === "vegan" && group === "protein") {
      await panel.locator('.bulk-toggle[data-toggle="vegan"]').click();
    }
    for (const id of opts.uncheckIds || []) {
      const chip = panel.locator(`.eat-chip[data-id="${id}"]`);
      if (await chip.count()) {
        const selected = await chip.evaluate((el) => el.classList.contains("selected"));
        if (selected) await chip.click();
      }
    }
    if (opts.screenshotMacro) {
      await page.screenshot({
        path: `${artifacts}/wf-macro-${group}.png`,
        fullPage: true,
      });
    }
    await page.click("#ob-next");
  }
}

async function completeOnboarding(page, opts = {}) {
  await page.waitForSelector("#ob-disclaimer");
  await page.check("#ob-disclaimer");
  await page.click("#ob-next");

  await page.waitForSelector("#ob-diet");
  await page.selectOption("#ob-diet", opts.diet || "omnivore");
  if (opts.allergies) await page.fill("#ob-allergies", opts.allergies);
  if (opts.intolerances) await page.fill("#ob-intol", opts.intolerances);
  await page.click("#ob-next");

  await completeMacroPicker(page, opts);

  await page.waitForSelector("#ob-symptoms");
  await page.click("#ob-next");

  await page.waitForSelector("#ob-age");
  await page.fill("#ob-age", String(opts.age || 35));
  await page.click("#ob-next");

  await page.waitForSelector("#ob-start");
  if (opts.startDate) await page.fill("#ob-start", opts.startDate);
  await page.click("#ob-next");

  await page.waitForSelector("#kitchen-checklist-card");
}

async function finishKitchenPrep(page, { skip = false, screenshot = false } = {}) {
  if (skip) {
    await page.click("#kitchen-skip");
    await page.waitForSelector("h1.page-title");
    return;
  }
  if (screenshot) {
    await page.waitForSelector(".kitchen-label-section");
    await page.screenshot({ path: `${artifacts}/wf-clear-kitchen.png`, fullPage: true });
  }
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("wf_plan_v1") || "{}");
    const raw = document.getElementById("kitchen-checklist-card")?.dataset?.allIds;
    if (!raw) return;
    const ids = JSON.parse(raw);
    const checked = { ...(s.kitchenClear?.checked || {}) };
    for (const id of ids) checked[id] = true;
    s.kitchenClear = {
      ...s.kitchenClear,
      checked,
      completed: true,
      celebrated: true,
      skipped: false,
    };
    localStorage.setItem("wf_plan_v1", JSON.stringify(s));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.goto(`http://127.0.0.1:${port}/index.html#/kitchen-clear`, { waitUntil: "networkidle" });
  await page.waitForSelector("#kitchen-celebrate");
  await page.click('a[href="#/today"]');
  await page.waitForSelector("h1.page-title");
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

async function getStored(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("wf_plan_v1") || "{}"));
}

function planText(plan) {
  return JSON.stringify(plan?.mealPlan || {});
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
  await page.addInitScript(seedHealthAck, ["actm.healthAck.whole-food-plan", HS_VERSION]);
  await track(page);

  const morning = "2026-06-15T08:00:00";

  // Kitchen clear after onboarding + screenshot
  await fresh(page, morning);
  await completeOnboarding(page, { startDate: "2026-06-15" });
  const onKitchen = await page.textContent("h1.page-title");
  results.push({ test: "post-onboarding kitchen clear screen", ok: /clear your kitchen/i.test(onKitchen || "") });
  await finishKitchenPrep(page, { screenshot: true });
  results.push({ test: "kitchen prep completes to today", ok: !!(await page.$("#suggested-now, h1.page-title")) });

  // Omnivore full plan
  await fresh(page, morning);
  await completeOnboarding(page, { diet: "omnivore", startDate: "2026-06-15" });
  await finishKitchenPrep(page, { skip: true });
  const omnivore = await getStored(page);
  const dayCount = omnivore.mealPlan?.days?.length || 0;
  const slots = omnivore.mealPlan?.days?.[0]?.meals || {};
  results.push({
    test: "omnivore gets 30-day plan with meals",
    ok: dayCount === 30 && Object.keys(slots).length >= 3,
  });
  results.push({
    test: "composed meals include macro fields",
    ok: slots.breakfast?.carbs != null && slots.breakfast?.fat != null,
  });

  // No chicken when unchecked
  await fresh(page, morning);
  await completeOnboarding(page, {
    uncheckIds: ["poultry_0", "poultry_1", "broth_chicken"],
    startDate: "2026-06-15",
  });
  await finishKitchenPrep(page, { skip: true });
  const noChickenPlan = planText(await getStored(page));
  results.push({
    test: "uncheck chicken removes chicken from plan",
    ok: !/chicken/i.test(noChickenPlan),
  });

  // Vegan + avocado dislike
  await fresh(page, morning);
  await completeOnboarding(page, { diet: "vegan", uncheckIds: ["avocado"], startDate: "2026-06-15" });
  await finishKitchenPrep(page, { skip: true });
  const veganPlan = planText(await getStored(page));
  results.push({
    test: "vegan plan no animal products",
    ok: !/\b(chicken|salmon|beef|turkey|shrimp|egg)\b/i.test(veganPlan),
  });
  results.push({
    test: "vegan dislike removes avocado fruit",
    ok: !/"avocado","|Avocado"|"id":"avocado"/i.test(veganPlan),
  });

  // Macro minimum blocks advance
  await fresh(page, morning);
  await page.waitForSelector("#ob-disclaimer");
  await page.check("#ob-disclaimer");
  await page.click("#ob-next");
  await page.click("#ob-next");
  await page.waitForSelector("#ob-protein-eat-panel");
  await page.click("#ob-protein-eat-panel .macro-clear-all");
  let dialogMsg = null;
  page.once("dialog", async (d) => {
    dialogMsg = d.message();
    await d.accept();
  });
  await page.click("#ob-next");
  await page.waitForTimeout(300);
  const stillProtein = await page.$("#ob-protein-eat-panel");
  results.push({
    test: "macro minimum blocks with message",
    ok: !!stillProtein && /at least 3 proteins/i.test(dialogMsg || ""),
  });

  // Narrow macro selection — plan and grocery only use picked foods
  await fresh(page, morning);
  await completeOnboarding(page, { narrow: true, startDate: "2026-06-15" });
  await finishKitchenPrep(page, { skip: true });
  const narrowPlan = planText(await getStored(page));
  const allowedNarrow = /\b(chicken|salmon|turkey|rice|sweet potato|avocado|olive oil|spinach|broccoli|bell peppers|tomatoes)\b/i;
  results.push({
    test: "narrow plan uses only selected foods",
    ok: allowedNarrow.test(narrowPlan) && !/\b(cod|tuna|quinoa|beef)\b/i.test(narrowPlan),
  });
  await page.click('a[href="#/meals"]');
  await page.waitForSelector(".meal-day-macros");
  await page.screenshot({ path: `${artifacts}/wf-meals-day-view.png`, fullPage: true });
  const mealsHtml = await page.content();
  results.push({
    test: "meals view shows day macro bar",
    ok: /meal-day-macros/.test(mealsHtml),
  });
  results.push({
    test: "meals UI narrow — no beef",
    ok: !/\bbeef\b/i.test(mealsHtml),
  });
  await page.screenshot({ path: `${artifacts}/wf-grocery-week.png`, fullPage: true });
  results.push({
    test: "grocery narrow — no quinoa",
    ok: !/\bquinoa\b/i.test(mealsHtml),
  });

  // Grocery week vs month totals
  await fresh(page, morning);
  await completeOnboarding(page, { startDate: "2026-06-15" });
  await finishKitchenPrep(page, { skip: true });
  await page.click('a[href="#/meals"]');
  const weekTotal = await page.textContent("#grocery-total");
  const weekMatch = weekTotal?.match(/(\d+)\s*items/);
  const weekItems = weekMatch ? Number(weekMatch[1]) : 0;
  await page.click('.grocery-scope[data-scope="month"]');
  await page.waitForSelector('.grocery-scope[data-scope="month"].selected');
  const monthTotal = await page.textContent("#grocery-total");
  const monthMatch = monthTotal?.match(/(\d+)\s*items/);
  const monthItems = monthMatch ? Number(monthMatch[1]) : 0;
  results.push({
    test: "grocery month total >= week total",
    ok: monthItems >= weekItems && weekItems > 0,
  });
  await page.screenshot({ path: `${artifacts}/wf-grocery-month.png`, fullPage: true });

  // Suggested now
  await fresh(page, morning);
  await completeOnboarding(page, { startDate: "2026-06-15" });
  await finishKitchenPrep(page, { skip: true });
  const sugAm = await page.textContent("#suggested-now");
  results.push({
    test: "morning suggested breakfast",
    ok: /Suggested now/i.test(sugAm || "") && /Breakfast/i.test(sugAm || ""),
  });

  // Macro step screenshots
  await fresh(page, morning);
  await page.waitForSelector("#ob-disclaimer");
  await page.check("#ob-disclaimer");
  await page.click("#ob-next");
  await page.click("#ob-next");
  await completeMacroPicker(page, { screenshotMacro: true });

  // Grocery order sheet
  await fresh(page, morning);
  await completeOnboarding(page, { startDate: "2026-06-15" });
  await finishKitchenPrep(page, { skip: true });
  await page.click('a[href="#/meals"]');
  await page.click("#grocery-get");
  await page.waitForSelector("#grocery-order-sheet.open");
  results.push({ test: "get groceries sheet opens", ok: !!(await page.$("#grocery-sheet-copy")) });
  await page.screenshot({ path: `${artifacts}/wf-get-groceries.png`, fullPage: true });
  await page.click(".grocery-sheet-close");

  // Desktop console check
  await page.setViewportSize({ width: 1440, height: 900 });
  await fresh(page, morning);
  await completeOnboarding(page, { startDate: "2026-06-15" });
  await finishKitchenPrep(page, { skip: true });
  results.push({ test: "desktop today loads", ok: !!(await page.$("h1.page-title")) });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  results.push({ test: "mobile reload after desktop", ok: !!(await page.$("h1.page-title")) });

  const filteredErrors = consoleErrors.filter(
    (e) => !/favicon|404|service worker/i.test(e)
  );

  await page.close();
  server.close();

  console.log(JSON.stringify({ results, consoleErrors: filteredErrors }, null, 2));
  if (results.some((r) => !r.ok) || filteredErrors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
