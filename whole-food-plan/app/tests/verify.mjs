/**
 * Headless verification for Whole Food Plan app.
 */
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const port = 8765;
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

async function completeOnboarding(page, opts = {}) {
  await page.waitForSelector("#ob-disclaimer");
  await page.check("#ob-disclaimer");
  await page.click("#ob-next");

  await page.waitForSelector("#ob-diet");
  await page.selectOption("#ob-diet", opts.diet || "omnivore");
  if (opts.allergies) await page.fill("#ob-allergies", opts.allergies);
  if (opts.intolerances) await page.fill("#ob-intol", opts.intolerances);
  await page.click("#ob-next");

  await page.waitForSelector("#ob-eat-panel");
  if (opts.diet === "vegan") {
    await page.click('.bulk-toggle[data-toggle="vegan"]');
  }
  for (const id of opts.uncheckIds || []) {
    const chip = page.locator(`.eat-chip[data-id="${id}"]`);
    const selected = await chip.evaluate((el) => el.classList.contains("selected"));
    if (selected) await chip.click();
  }
  await page.click("#ob-next");

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

function groceryTotal(page, scope, week) {
  return page.evaluate(
    ({ scope, week }) => {
      const s = JSON.parse(localStorage.getItem("wf_plan_v1"));
      return s.groceryScope === scope && (scope === "month" || s.groceryWeek === week);
    },
    { scope, week }
  );
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

  const morning = "2026-06-15T08:00:00";

  // Kitchen clear after onboarding + screenshot
  await fresh(page, morning);
  await completeOnboarding(page, { startDate: "2026-06-15" });
  const onKitchen = await page.textContent("h1.page-title");
  results.push({ test: "post-onboarding kitchen clear screen", ok: /clear your kitchen/i.test(onKitchen || "") });
  const kitchenLead = await page.textContent(".kitchen-lead");
  results.push({
    test: "kitchen encouraging lead copy",
    ok: /set yourself up to win/i.test(kitchenLead || ""),
  });
  const groupTitle = await page.textContent(".kitchen-group-title");
  results.push({
    test: "kitchen food group step visible",
    ok: /grains & breads/i.test(groupTitle || ""),
  });
  const labelSection = await page.$(".kitchen-label-section .kitchen-label-chip");
  results.push({ test: "kitchen label checklist chips", ok: !!labelSection });
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

  // No chicken when unchecked
  await fresh(page, morning);
  await completeOnboarding(page, { uncheckIds: ["poultry_0", "poultry_1"], startDate: "2026-06-15" });
  await finishKitchenPrep(page, { skip: true });
  const noChickenPlan = planText(await getStored(page));
  results.push({
    test: "uncheck chicken removes chicken from plan",
    ok: !/chicken/i.test(noChickenPlan),
  });
  await page.click('a[href="#/meals"]');
  const mealsNoChicken = await page.content();
  results.push({
    test: "meals UI no chicken",
    ok: !/\bchicken\b/i.test(mealsNoChicken),
  });
  const groceryChicken = mealsNoChicken;
  results.push({
    test: "grocery section no chicken",
    ok: !/\bchicken\b/i.test(groceryChicken),
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
    test: "vegan dislike removes avocado",
    ok: !/\bavocado\b/i.test(veganPlan),
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

  // Suggested now
  await fresh(page, morning);
  await completeOnboarding(page, { startDate: "2026-06-15" });
  await finishKitchenPrep(page, { skip: true });
  const sugAm = await page.textContent("#suggested-now");
  results.push({
    test: "morning suggested breakfast",
    ok: /Suggested now/i.test(sugAm || "") && /Breakfast/i.test(sugAm || ""),
  });

  // Kitchen reminder when skipped
  await fresh(page, morning);
  await completeOnboarding(page, { startDate: "2026-06-15" });
  await page.click("#kitchen-skip");
  await page.waitForSelector("#kitchen-today-banner");
  results.push({ test: "skipped kitchen shows today reminder", ok: true });

  // Screenshots
  await fresh(page, morning);
  await page.waitForSelector("#ob-disclaimer");
  await page.check("#ob-disclaimer");
  await page.click("#ob-next");
  await page.click("#ob-next");
  await page.waitForSelector("#ob-eat-panel");
  await page.screenshot({ path: `${artifacts}/wf-food-chips-onboarding.png`, fullPage: true });
  await page.click("#ob-next");
  await page.click("#ob-next");
  await page.fill("#ob-age", "35");
  await page.click("#ob-next");
  await page.click("#ob-next");
  await page.waitForSelector("#kitchen-checklist-card");
  await finishKitchenPrep(page, { skip: true });
  await page.click('a[href="#/meals"]');
  await page.screenshot({ path: `${artifacts}/wf-meals-day-view.png`, fullPage: true });
  await page.click('.grocery-scope[data-scope="week"]');
  await page.screenshot({ path: `${artifacts}/wf-grocery-week.png`, fullPage: true });
  await page.click('.grocery-scope[data-scope="month"]');
  await page.screenshot({ path: `${artifacts}/wf-grocery-month.png`, fullPage: true });

  // Grocery order sheet
  await page.click("#grocery-get");
  await page.waitForSelector("#grocery-order-sheet.open");
  results.push({ test: "get groceries sheet opens", ok: !!(await page.$("#grocery-sheet-copy")) });
  const instacartHref = await page.locator(".grocery-item-search").first().getAttribute("href");
  results.push({
    test: "preferred store search link instacart",
    ok: !!instacartHref?.includes("instacart.com/store/s?k="),
  });
  await page.screenshot({ path: `${artifacts}/wf-get-groceries.png`, fullPage: true });
  await page.click(".grocery-sheet-close");
  await page.waitForFunction(() => document.getElementById("grocery-order-sheet")?.classList.contains("hidden"));
  await page.click('a[href="#/settings"]');
  await page.selectOption("#grocery-store-pref", "walmart");
  await page.click('a[href="#/meals"]');
  await page.click("#grocery-get");
  await page.waitForSelector("#grocery-order-sheet.open");
  const walmartHref = await page.locator(".grocery-item-search").first().getAttribute("href");
  results.push({
    test: "settings preferred store walmart",
    ok: !!walmartHref?.includes("walmart.com/search?q="),
  });
  await page.click(".grocery-sheet-close");
  await page.click(".meal-grocery-btn");
  await page.waitForSelector("#grocery-order-sheet.open");
  results.push({ test: "meal get groceries sheet", ok: !!(await page.$("#grocery-sheet-title")) });

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
