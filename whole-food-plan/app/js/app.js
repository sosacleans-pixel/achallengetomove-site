import {
  loadState,
  saveState,
  resetState,
  exportStateJson,
  dateKey,
  programDay,
  daysSinceStart,
  reintroUnlocked,
  ensureDayLog,
} from "./storage.js";
import { estimateCalorieTarget, macroTargets, sumLogMacros } from "./calories.js";
import { buildPersonalFoodList, ELIMINATION_GROUPS } from "./foodList.js";
import { checkFoodItem } from "./compliance.js";
import { getPersonalizedDay, buildShoppingList, mealLogEntries, weekForDay } from "./meals.js";
import { resolveSuggestedMeal, getMealWindows, DEFAULT_MEAL_WINDOWS } from "./mealTime.js";

const HEALTH_NOTE =
  "This program shares general nutrition education. It is not medical advice. Check with your doctor or a registered dietitian before changing how you eat, especially if you are pregnant, take medication, have food allergies, diabetes, kidney disease, a history of disordered eating, or any other health condition.";

let state = loadState();
let daysData = [];
let foodsData = [];
let mealsData = null;
let onboardingStep = 0;
let draftProfile = {};
/** @type {{ food: object, qty: number } | null} */
let pendingLog = null;
let mealsViewDay = null;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function getClockNow() {
  if (typeof window !== "undefined" && window.__WF_MOCK_NOW) {
    return new Date(window.__WF_MOCK_NOW);
  }
  return new Date();
}

function getSuggestion() {
  return resolveSuggestedMeal({
    now: getClockNow(),
    profile: state.profile,
    mealsData,
    logs: state.logs,
  });
}

async function loadContent() {
  const base = new URL("../data/", import.meta.url);
  const [daysRes, foodsRes, mealsRes] = await Promise.all([
    fetch(new URL("days.json", base)),
    fetch(new URL("foods.json", base)),
    fetch(new URL("meals.json", base)),
  ]);
  daysData = await daysRes.json();
  const foodsJson = await foodsRes.json();
  foodsData = foodsJson.foods || foodsJson;
  mealsData = await mealsRes.json();
}

function navigate(hash) {
  if (location.hash !== hash) location.hash = hash;
  else render();
}

function allEntriesForDay(key) {
  const log = state.logs[key];
  if (!log) return [];
  return Object.values(log.meals).flat();
}

function onPlanStreak() {
  let streak = 0;
  const start = state.profile?.startDate;
  if (!start) return 0;
  let d = new Date();
  for (let i = 0; i < 60; i++) {
    const key = dateKey(d);
    if (parseDateKeyLocal(key) < parseDateKeyLocal(start)) break;
    const entries = allEntriesForDay(key);
    if (entries.length === 0) break;
    const off = entries.some((e) => e.compliance === "off");
    if (off) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function parseDateKeyLocal(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function renderNav(active) {
  const unlocked = reintroUnlocked(state.profile);
  const links = [
    { hash: "#/today", label: "Today", icon: "☀" },
    { hash: "#/log", label: "Log", icon: "🍽" },
    { hash: "#/meals", label: "Meals", icon: "🥗" },
    { hash: "#/foods", label: "Foods", icon: "📋" },
    { hash: "#/progress", label: "Progress", icon: "📈" },
    { hash: "#/settings", label: "Settings", icon: "⚙" },
  ];
  if (unlocked) {
    links.splice(5, 0, { hash: "#/reintro", label: "Reintro", icon: "🔄" });
  }
  return `<nav class="bottom-nav" aria-label="App navigation">
    ${links
      .map(
        (l) =>
          `<a href="${l.hash}" class="${active === l.hash ? "active" : ""}" data-nav="${l.hash}"><span class="icon">${l.icon}</span>${l.label}</a>`
      )
      .join("")}
  </nav>`;
}

function render() {
  const main = $("#app-main");
  const route = location.hash || "#/today";
  const routeBase = route.split("?")[0];
  document.body.classList.toggle("route-log", routeBase === "#/log");
  if (routeBase !== "#/log") {
    pendingLog = null;
    hideLogActionBar();
  }
  if (!state.profile?.onboardingComplete) {
    main.innerHTML = renderOnboarding();
    bindOnboarding();
    $("#bottom-nav").innerHTML = "";
    return;
  }

  if (!state.foodList) {
    state.foodList = buildPersonalFoodList(state.profile, foodsData);
    saveState(state);
  }

  let html = "";
  switch (route.split("?")[0]) {
    case "#/log":
      html = renderLog();
      break;
    case "#/meals":
      html = renderMeals();
      break;
    case "#/foods":
      html = renderFoods();
      break;
    case "#/progress":
      html = renderProgress();
      break;
    case "#/reintro":
      html = renderReintro();
      break;
    case "#/settings":
      html = renderSettings();
      break;
    default:
      html = renderToday();
  }
  main.innerHTML = html;
  $("#bottom-nav").innerHTML = renderNav(route.split("?")[0]);
  bindScreen(route.split("?")[0]);
}

function renderOnboarding() {
  const steps = 5;
  const dots = Array.from({ length: steps }, (_, i) =>
    `<span class="${i === onboardingStep ? "on" : ""}"></span>`
  ).join("");
  const p = { ...state.profile, ...draftProfile };

  const panels = [
    `<div class="card">
      <h2>Welcome</h2>
      <p>30 days of real food, personalized to you. This short questionnaire builds your food list and calorie target.</p>
      <p class="health-note">${HEALTH_NOTE}</p>
      <label class="field"><input type="checkbox" id="ob-disclaimer" ${p.disclaimerAck ? "checked" : ""}> I understand this is education, not medical advice.</label>
    </div>`,
    `<div class="card">
      <h2>How you eat now</h2>
      <div class="field">
        <label>Diet style</label>
        <select id="ob-diet">
          <option value="omnivore" ${p.dietStyle === "omnivore" ? "selected" : ""}>Omnivore</option>
          <option value="pescatarian" ${p.dietStyle === "pescatarian" ? "selected" : ""}>Pescatarian</option>
          <option value="vegetarian" ${p.dietStyle === "vegetarian" ? "selected" : ""}>Vegetarian</option>
          <option value="vegan" ${p.dietStyle === "vegan" ? "selected" : ""}>Vegan</option>
        </select>
      </div>
      <div class="field">
        <label>Foods you don't eat (dislikes, religious, etc.) — comma separated</label>
        <input id="ob-avoid" value="${escapeAttr((p.avoidFoods || []).join(", "))}" placeholder="e.g. pork, shellfish">
      </div>
      <div class="field">
        <label>Allergies (always avoided)</label>
        <input id="ob-allergies" value="${escapeAttr((p.allergies || []).join(", "))}" placeholder="e.g. dairy, shellfish">
      </div>
      <div class="field">
        <label>Intolerances or foods that bother you</label>
        <input id="ob-intol" value="${escapeAttr((p.intolerances || []).join(", "))}" placeholder="e.g. garlic, spicy food">
      </div>
    </div>`,
    `<div class="card">
      <h2>Symptoms to watch</h2>
      <p class="muted">We'll use these in check-ins and reintroduction.</p>
      <div class="chip-row" id="ob-symptoms">
        ${["digestion", "energy", "skin", "sleep", "mood", "headache", "cravings"]
          .map(
            (s) =>
              `<button type="button" class="chip ${(p.symptomsTrack || []).includes(s) ? "selected" : ""}" data-symptom="${s}">${s}</button>`
          )
          .join("")}
      </div>
      <div class="field" style="margin-top:1rem">
        <label>Your why (one sentence)</label>
        <textarea id="ob-why">${escapeHtml(p.why || "")}</textarea>
      </div>
    </div>`,
    `<div class="card">
      <h2>Calorie target inputs</h2>
      <div class="field"><label>Sex assigned at birth</label>
        <select id="ob-sex"><option value="female" ${p.sex === "female" ? "selected" : ""}>Female</option><option value="male" ${p.sex === "male" ? "selected" : ""}>Male</option></select>
      </div>
      <div class="field"><label>Age</label><input type="number" id="ob-age" min="16" max="100" value="${p.age || 35}"></div>
      <div class="field"><label>Height (cm)</label><input type="number" id="ob-height" value="${p.heightCm || 170}"></div>
      <div class="field"><label>Weight (kg)</label><input type="number" id="ob-weight" step="0.1" value="${p.weightKg || 70}"></div>
      <div class="field"><label>Activity</label>
        <select id="ob-activity">
          ${["sedentary", "light", "moderate", "active", "very_active"]
            .map((a) => `<option value="${a}" ${p.activity === a ? "selected" : ""}>${a.replace("_", " ")}</option>`)
            .join("")}
        </select>
      </div>
      <div class="field"><label>Goal</label>
        <select id="ob-goal"><option value="lose" ${p.goal === "lose" ? "selected" : ""}>Lose weight gently</option><option value="maintain" ${p.goal === "maintain" ? "selected" : ""}>Maintain</option><option value="gain" ${p.goal === "gain" ? "selected" : ""}>Gain muscle</option></select>
      </div>
      <p class="muted">Estimated target: <strong id="ob-cal-preview">${estimateFromDraft(p)}</strong> kcal/day (editable later; minimum ${p.sex === "male" ? "1,500" : "1,200"}).</p>
    </div>`,
    `<div class="card">
      <h2>Start date</h2>
      <div class="field"><label>Day 1 of your plan</label><input type="date" id="ob-start" value="${p.startDate || dateKey()}"></div>
      <div class="field"><label>Water goal (cups)</label><input type="number" id="ob-water" min="4" max="16" value="${p.waterGoal || 8}"></div>
      <p class="muted">Your personal food list will be ready on the Foods tab after you finish.</p>
    </div>`,
  ];

  return `
    <h1 class="page-title">30-Day Whole Food Plan</h1>
    <p class="muted">A Challenge to Move</p>
    <div class="step-dots">${dots}</div>
    ${panels[onboardingStep]}
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
      ${onboardingStep > 0 ? '<button type="button" class="btn btn-secondary" id="ob-back">Back</button>' : ""}
      <button type="button" class="btn btn-primary" style="flex:1" id="ob-next">${onboardingStep === steps - 1 ? "Start my plan" : "Continue"}</button>
    </div>
  `;
}

function estimateFromDraft(p) {
  try {
    return estimateCalorieTarget({
      sex: p.sex || "female",
      age: Number(p.age) || 35,
      heightCm: Number(p.heightCm) || 170,
      weightKg: Number(p.weightKg) || 70,
      activity: p.activity || "moderate",
      goal: p.goal || "maintain",
    });
  } catch {
    return "—";
  }
}

function bindOnboarding() {
  $("#ob-next")?.addEventListener("click", () => {
    if (onboardingStep === 0 && !$("#ob-disclaimer")?.checked) {
      alert("Please acknowledge the health note to continue.");
      return;
    }
    collectOnboardingStep();
    if (onboardingStep < 4) {
      onboardingStep++;
      render();
      return;
    }
    finishOnboarding();
  });
  $("#ob-back")?.addEventListener("click", () => {
    collectOnboardingStep();
    onboardingStep--;
    render();
  });
  $$("#ob-symptoms .chip").forEach((btn) => {
    btn.addEventListener("click", () => btn.classList.toggle("selected"));
  });
}

function splitList(val) {
  return val
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function collectOnboardingStep() {
  if (onboardingStep === 0) {
    draftProfile.disclaimerAck = $("#ob-disclaimer")?.checked;
  }
  if (onboardingStep === 1) {
    draftProfile.dietStyle = $("#ob-diet")?.value;
    draftProfile.avoidFoods = splitList($("#ob-avoid")?.value || "");
    draftProfile.allergies = splitList($("#ob-allergies")?.value || "");
    draftProfile.intolerances = splitList($("#ob-intol")?.value || "");
    draftProfile.bothersome = [];
  }
  if (onboardingStep === 2) {
    draftProfile.symptomsTrack = $$("#ob-symptoms .chip.selected").map((b) => b.dataset.symptom);
    draftProfile.why = $("#ob-why")?.value || "";
  }
  if (onboardingStep === 3) {
    draftProfile.sex = $("#ob-sex")?.value;
    draftProfile.age = Number($("#ob-age")?.value);
    draftProfile.heightCm = Number($("#ob-height")?.value);
    draftProfile.weightKg = Number($("#ob-weight")?.value);
    draftProfile.activity = $("#ob-activity")?.value;
    draftProfile.goal = $("#ob-goal")?.value;
    draftProfile.calorieTarget = estimateCalorieTarget(draftProfile);
  }
  if (onboardingStep === 4) {
    draftProfile.startDate = $("#ob-start")?.value || dateKey();
    draftProfile.waterGoal = Number($("#ob-water")?.value) || 8;
  }
}

function finishOnboarding() {
  collectOnboardingStep();
  state.profile = {
    ...draftProfile,
    onboardingComplete: true,
    calorieTarget: draftProfile.calorieTarget || estimateCalorieTarget(draftProfile),
    mealWindows: { ...DEFAULT_MEAL_WINDOWS, ...(draftProfile.mealWindows || {}) },
  };
  state.foodList = buildPersonalFoodList(state.profile, foodsData);
  saveState(state);
  onboardingStep = 0;
  draftProfile = {};
  navigate("#/today");
}

function renderToday() {
  const dayNum = programDay(state.profile);
  const day = daysData.find((d) => d.day === dayNum) || daysData[0];
  const key = dateKey();
  const log = ensureDayLog(state, key);
  const entries = allEntriesForDay(key);
  const macros = sumLogMacros(entries);
  const target = macroTargets(state.profile.calorieTarget);
  const unlocked = reintroUnlocked(state.profile);

  const suggestion = getSuggestion();

  return `
    <h1 class="page-title">Today</h1>
    ${renderSuggestedNowCard(suggestion)}
    <div class="card">
      <p><strong>Day ${dayNum} of 30</strong> · ${escapeHtml(day.theme)}</p>
      <h2>${escapeHtml(day.title)}</h2>
      <p><strong>Habit:</strong> ${escapeHtml(day.habit)}</p>
      <p class="muted">${escapeHtml(day.tip)}</p>
      <p><strong>Action:</strong> ${escapeHtml(day.action)}</p>
    </div>
    <div class="card">
      <h2>Log summary</h2>
      <div class="macro-bar">
        <div><strong>${macros.calories}</strong>cal<span class="muted"> / ${target.calories}</span></div>
        <div><strong>${Math.round(macros.protein)}g</strong>P<span class="muted"> / ${target.protein}g</span></div>
        <div><strong>${Math.round(macros.carbs)}g</strong>C</div>
        <div><strong>${Math.round(macros.fat)}g</strong>F</div>
      </div>
      <p style="margin-top:0.75rem">
        <a href="#/log" class="btn btn-primary btn-small">Log a meal</a>
        <a href="#/meals" class="btn btn-secondary btn-small" style="margin-left:0.35rem">Today's meals</a>
      </p>
    </div>
    <div class="card">
      <h2>Daily check-in</h2>
      ${renderCheckInForm(log.checkIn, key)}
    </div>
    ${unlocked ? `<div class="card"><p><strong>Day 30 complete!</strong> <a href="#/reintro">Start reintroduction</a> when you're ready.</p></div>` : ""}
  `;
}

function renderCheckInForm(checkIn, key) {
  const c = checkIn || {};
  return `
    <div class="field"><label>Water (cups)</label><input type="number" id="ci-water" min="0" max="20" value="${c.water ?? ""}"></div>
    <div class="field"><label>Energy (1–5)</label><input type="range" id="ci-energy" min="1" max="5" value="${c.energy ?? 3}"></div>
    <div class="field"><label>Sleep quality (1–5)</label><input type="range" id="ci-sleep" min="1" max="5" value="${c.sleep ?? 3}"></div>
    <div class="field"><label>Cravings (1–5)</label><input type="range" id="ci-cravings" min="1" max="5" value="${c.cravings ?? 3}"></div>
    <div class="field"><label>Digestion (1–5)</label><input type="range" id="ci-digestion" min="1" max="5" value="${c.digestion ?? 3}"></div>
    <div class="field"><label>Note (optional)</label><textarea id="ci-note">${escapeHtml(c.note || "")}</textarea></div>
    <button type="button" class="btn btn-primary btn-block" id="ci-save" data-key="${key}">Save check-in</button>
  `;
}

function mealLabel(meal) {
  return meal.charAt(0).toUpperCase() + meal.slice(1);
}

function renderSuggestedNowCard(s) {
  if (!s?.meal) return "";
  const ings = (s.meal.ingredients || []).filter((i) => i !== "---").slice(0, 6);
  return `
    <div class="card suggested-now-card" id="suggested-now">
      <p class="suggested-now-label">${escapeHtml(s.heading)} · ${mealLabel(s.slot)}</p>
      <h2 class="suggested-now-title">${escapeHtml(s.meal.name)}</h2>
      <p class="meal-meta">~${s.meal.calories} cal · ${s.meal.protein}g protein</p>
      <ul class="suggested-now-ing">${ings.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
      <div class="suggested-now-actions">
        <button type="button" class="btn btn-primary suggested-log-meal" data-slot="${s.slot}" data-day="${s.planDay}" data-log-key="${s.logKey}">Log this meal</button>
        <a class="btn btn-secondary btn-small suggested-see-recipe" href="#/meals" data-day="${s.planDay}">See recipe</a>
      </div>
    </div>
  `;
}

function logPlannedMeal(slot, dayNum, logKey) {
  const plan = getPersonalizedDay(mealsData, dayNum, state.profile);
  const m = plan?.meals?.[slot];
  if (!m) return null;
  const items = mealLogEntries(m);
  let lastComp = { status: "on" };
  for (const food of items) {
    lastComp = addFoodEntry(food, { silent: true, meal: slot, logKey }) || lastComp;
  }
  return { lastComp, meal: m };
}

function renderLog() {
  const key = dateKey(getClockNow());
  const log = ensureDayLog(state, key);
  const meals = ["breakfast", "lunch", "dinner", "snack"];
  const macros = sumLogMacros(allEntriesForDay(key));
  const target = macroTargets(state.profile.calorieTarget);
  const suggestion = getSuggestion();
  const defaultMeal = suggestion?.slot || "breakfast";

  return `
    <h1 class="page-title">Food log</h1>
    <p class="muted">${key}</p>
    ${renderSuggestedNowCard(suggestion)}
    <div class="card macro-bar" id="log-macro-bar">
      <div><strong>${macros.calories}</strong>Cal / ${target.calories}</div>
      <div><strong>${Math.round(macros.protein)}g</strong>P</div>
      <div><strong>${Math.round(macros.carbs)}g</strong>C</div>
      <div><strong>${Math.round(macros.fat)}g</strong>F</div>
    </div>
    <div class="card">
      <h2>Add food</h2>
      <div class="field"><label>Meal</label>
        <select id="log-meal">${meals.map((m) => `<option value="${m}" ${m === defaultMeal ? "selected" : ""}>${mealLabel(m)}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Search foods</label><input type="search" id="log-search" placeholder="e.g. salmon, rice, apple" autocomplete="off" enterkeyhint="search"></div>
      <div class="search-results hidden" id="log-results"></div>
      <div id="log-selected-hint" class="muted ${pendingLog ? "" : "hidden"}">${pendingLog ? `Selected: <strong>${escapeHtml(pendingLog.food.name)}</strong> — adjust servings below, then tap Add to ${mealLabel(defaultMeal)}.` : ""}</div>
    </div>
    <div class="card">
      <h2>Custom food</h2>
      <div class="field"><label>Name</label><input id="custom-name" placeholder="e.g. Homemade soup"></div>
      <div class="field"><label>Calories</label><input type="number" id="custom-cal" min="0" inputmode="numeric"></div>
      <div class="field"><label>Protein / Carbs / Fat (g)</label>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.35rem">
          <input type="number" id="custom-p" placeholder="P" min="0" step="0.1" inputmode="decimal">
          <input type="number" id="custom-c" placeholder="C" min="0" step="0.1" inputmode="decimal">
          <input type="number" id="custom-f" placeholder="F" min="0" step="0.1" inputmode="decimal">
        </div>
      </div>
      <label class="field"><input type="checkbox" id="custom-packaged"> Packaged / label check</label>
      <button type="button" class="btn btn-primary btn-block" id="custom-log">Log food</button>
    </div>
    ${meals
      .map((m) => {
        const items = log.meals[m] || [];
        return `<div class="card"><h2>${mealLabel(m)}</h2>
          ${items.length ? items.map((e) => renderLogEntry(e)).join("") : '<p class="muted">Nothing logged yet.</p>'}
        </div>`;
      })
      .join("")}
  `;
}

function renderMeals() {
  const storedDay = sessionStorage.getItem("wf_meals_day");
  if (storedDay) {
    mealsViewDay = Number(storedDay);
    sessionStorage.removeItem("wf_meals_day");
  }
  const dayNum = mealsViewDay ?? programDay(state.profile, getClockNow());
  const plan = getPersonalizedDay(mealsData, dayNum, state.profile);
  const week = weekForDay(dayNum);
  const shopKey = String(week);
  if (!state.shoppingLists[shopKey]) {
    state.shoppingLists[shopKey] = buildShoppingList(mealsData, week, state.profile).map((name) => ({
      name,
      checked: false,
    }));
    saveState(state);
  }
  const shop = state.shoppingLists[shopKey];

  const slotHtml = (slot, label) => {
    const m = plan?.meals?.[slot];
    if (!m) return "";
    return `<details class="card meal-card" open>
      <summary>${label}: ${escapeHtml(m.name)} <span class="meal-meta">~${m.calories} cal · ${m.protein}g protein</span></summary>
      ${m.portionNote ? `<p class="muted">${escapeHtml(m.portionNote)}</p>` : ""}
      <p><strong>Ingredients</strong></p>
      <ul>${m.ingredients.map((i) => (i === "---" ? "" : `<li>${escapeHtml(i)}</li>`)).join("")}</ul>
      <p><strong>Steps</strong></p>
      <ol>${m.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
      <button type="button" class="btn btn-primary btn-small log-meal-btn" data-slot="${slot}" data-day="${dayNum}">Log this meal</button>
    </details>`;
  };

  return `
    <h1 class="page-title">Suggested meals</h1>
    <div class="card">
      <div class="field"><label>Program day (1–30)</label>
        <input type="number" id="meals-day" min="1" max="30" value="${dayNum}">
      </div>
      <p class="muted">${escapeHtml(plan?.themeNote || "")}</p>
    </div>
    ${slotHtml("breakfast", "Breakfast")}
    ${slotHtml("lunch", "Lunch")}
    ${slotHtml("dinner", "Dinner")}
    ${plan?.meals?.snack ? slotHtml("snack", "Snack") : ""}
    <div class="card">
      <h2>Week ${week} shopping list</h2>
      <p class="muted">From suggested meals for days ${(week - 1) * 7 + 1}–${Math.min(week * 7, 30)}.</p>
      <ul class="shopping-list">
        ${shop.map((item, idx) => `<li><input type="checkbox" data-shop-idx="${idx}" ${item.checked ? "checked" : ""}><span>${escapeHtml(item.name)}</span></li>`).join("")}
      </ul>
    </div>
  `;
}

function showToast(message, type = "on") {
  const host = $("#toast-host");
  if (!host) return;
  const cls = type === "off" ? "toast-off" : type === "check" ? "toast-check" : "toast-on";
  host.innerHTML = `<div class="toast ${cls}">${escapeHtml(message)}</div>`;
  window.setTimeout(() => {
    if (host) host.innerHTML = "";
  }, 3200);
}

function hideLogActionBar() {
  const bar = $("#log-action-bar");
  if (!bar) return;
  bar.classList.add("hidden");
  bar.setAttribute("aria-hidden", "true");
  bar.innerHTML = "";
  document.body.classList.remove("route-log-has-pending");
}

function updateLogActionBar() {
  const bar = $("#log-action-bar");
  if (!bar) return;
  const route = (location.hash || "").split("?")[0];
  if (route !== "#/log" || !pendingLog) {
    hideLogActionBar();
    return;
  }
  const meal = $("#log-meal")?.value || "breakfast";
  bar.classList.remove("hidden");
  bar.setAttribute("aria-hidden", "false");
  document.body.classList.add("route-log-has-pending");
  bar.innerHTML = `
    <div class="log-action-inner">
      <div class="log-action-selected">
        <strong>${escapeHtml(pendingLog.food.name)}</strong>
        <span class="muted">${escapeHtml(pendingLog.food.serving || "1 serving")}</span>
      </div>
      <div class="qty-stepper">
        <button type="button" id="qty-minus" aria-label="Decrease servings">−</button>
        <span id="qty-val">${pendingLog.qty}</span>
        <button type="button" id="qty-plus" aria-label="Increase servings">+</button>
      </div>
      <button type="button" class="btn btn-primary btn-block" id="log-commit">Add to ${mealLabel(meal)}</button>
    </div>
  `;
  $("#qty-minus")?.addEventListener("click", () => {
    pendingLog.qty = Math.max(0.5, pendingLog.qty - 0.5);
    updateLogActionBar();
  });
  $("#qty-plus")?.addEventListener("click", () => {
    pendingLog.qty = Math.min(5, pendingLog.qty + 0.5);
    updateLogActionBar();
  });
  $("#log-commit")?.addEventListener("click", () => commitPendingLog());
}

function selectPendingFood(food) {
  pendingLog = { food: { ...food }, qty: 1 };
  updateLogActionBar();
  const hint = $("#log-selected-hint");
  if (hint) {
    hint.classList.remove("hidden");
    hint.innerHTML = `Selected: <strong>${escapeHtml(food.name)}</strong> — adjust servings below, then tap Add.`;
  }
  $$(".search-pick").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.foodId === food.id);
  });
}

function commitPendingLog() {
  if (!pendingLog) return;
  const { food, qty } = pendingLog;
  const scaled = {
    ...food,
    calories: Math.round(food.calories * qty),
    protein: Math.round(food.protein * qty * 10) / 10,
    carbs: Math.round((food.carbs || 0) * qty * 10) / 10,
    fat: Math.round((food.fat || 0) * qty * 10) / 10,
    serving: qty === 1 ? food.serving || "1 serving" : `${qty} × ${food.serving || "serving"}`,
  };
  const comp = addFoodEntry(scaled, { silent: true });
  pendingLog = null;
  hideLogActionBar();
  if ($("#log-search")) $("#log-search").value = "";
  $("#log-results")?.classList.add("hidden");
  if (comp) {
    const msg =
      comp.status === "on"
        ? "On plan — logged!"
        : comp.status === "off"
          ? `Off plan: ${comp.reason}`
          : comp.reason;
    showToast(msg, comp.status);
  }
  render();
}

function refreshLogMacros() {
  const key = dateKey();
  const macros = sumLogMacros(allEntriesForDay(key));
  const target = macroTargets(state.profile.calorieTarget);
  const bar = $("#log-macro-bar");
  if (bar) {
    bar.innerHTML = `
      <div><strong>${macros.calories}</strong>Cal / ${target.calories}</div>
      <div><strong>${Math.round(macros.protein)}g</strong>P</div>
      <div><strong>${Math.round(macros.carbs)}g</strong>C</div>
      <div><strong>${Math.round(macros.fat)}g</strong>F</div>
    `;
  }
}

function renderLogEntry(e) {
  const cls = e.compliance === "on" ? "status-on" : e.compliance === "off" ? "status-off" : "status-check";
  const label = e.compliance === "on" ? "On plan" : e.compliance === "off" ? "Off plan" : "Check the label";
  return `<div class="log-item" data-id="${e.id}">
    <div>
      <strong>${escapeHtml(e.name)}</strong> <span class="muted">${e.serving || ""}</span><br>
      <span class="status-pill ${cls}">${label}</span>
      ${e.reason && e.compliance !== "on" ? `<br><span class="muted">${escapeHtml(e.reason)}</span>` : ""}
      ${e.swaps?.length ? `<br><span class="muted">Try: ${escapeHtml(e.swaps.join(" · "))}</span>` : ""}
      <br><span class="muted">${e.calories} cal · P${e.protein} C${e.carbs} F${e.fat}</span>
    </div>
    <button type="button" class="btn btn-small btn-secondary log-del" data-id="${e.id}">×</button>
  </div>`;
}

function renderFoods() {
  const fl = state.foodList;
  const q = sessionStorage.getItem("wf_food_q") || "";
  return `
    <h1 class="page-title">Your food list</h1>
    <div class="field"><input type="search" id="food-q" value="${escapeAttr(q)}" placeholder="Search enjoy list…"></div>
    ${(fl.enjoyNotes || []).map((n) => `<p class="muted">${escapeHtml(n)}</p>`).join("")}
    <div class="food-list-group card">
      <h2>Enjoy</h2>
      <p class="muted">${fl.enjoy.length} whole foods tailored to you during the 30-day reset.</p>
      <div class="food-list-scroll" id="enjoy-list"></div>
    </div>
    <div class="food-list-group card">
      <h2>Avoid (30-day pause)</h2>
      <ul>${fl.avoid.map((a) => `<li><strong>${escapeHtml(a.label)}</strong> — <span class="muted">${escapeHtml(a.detail)}</span></li>`).join("")}</ul>
    </div>
    <div class="food-list-group card">
      <h2>Your extra avoids</h2>
      ${fl.extraAvoids.length ? `<ul>${fl.extraAvoids.map((e) => `<li><strong>${escapeHtml(e.text)}</strong> — ${escapeHtml(e.reason)}</li>`).join("")}</ul>` : '<p class="muted">None added — update in Settings if needed.</p>'}
    </div>
  `;
}

function renderProgress() {
  const completed = Object.keys(state.logs).filter((k) => {
    const e = allEntriesForDay(k);
    return e.length > 0;
  }).length;
  const streak = onPlanStreak();
  const keys = Object.keys(state.logs).sort().slice(-14);
  const calSeries = keys.map((k) => sumLogMacros(allEntriesForDay(k)).calories);

  return `
    <h1 class="page-title">Progress</h1>
    <div class="progress-grid">
      <div class="stat-box"><div class="num">${completed}</div><div class="muted">Days logged</div></div>
      <div class="stat-box"><div class="num">${streak}</div><div class="muted">On-plan streak</div></div>
      <div class="stat-box"><div class="num">${programDay(state.profile)}</div><div class="muted">Program day</div></div>
      <div class="stat-box"><div class="num">${daysSinceStart(state.profile) > 30 ? "✓" : daysSinceStart(state.profile)}</div><div class="muted">${daysSinceStart(state.profile) > 30 ? "Plan complete" : "Days since start"}</div></div>
    </div>
    <div class="card">
      <h2>Calories (last ${keys.length} days)</h2>
      ${renderBarChart(calSeries, state.profile.calorieTarget)}
    </div>
    <div class="card">
      <h2>Check-in trends</h2>
      ${renderCheckInTrends()}
    </div>
  `;
}

function renderBarChart(values, target) {
  if (!values.length) return '<p class="muted">Log meals to see your chart.</p>';
  const max = Math.max(target, ...values, 1);
  return `<div style="display:flex;align-items:flex-end;gap:4px;height:100px">
    ${values
      .map((v) => {
        const h = Math.round((v / max) * 100);
        return `<div title="${v} cal" style="flex:1;background:var(--yellow);height:${h}%;min-height:2px;border-radius:3px 3px 0 0"></div>`;
      })
      .join("")}
  </div><p class="muted">Target line: ${target} kcal/day</p>`;
}

function renderCheckInTrends() {
  const rows = Object.entries(state.logs)
    .filter(([, v]) => v.checkIn)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7);
  if (!rows.length) return '<p class="muted">Save a daily check-in on Today.</p>';
  return `<table style="width:100%;font-size:0.85rem"><tr><th>Date</th><th>Energy</th><th>Sleep</th><th>Digestion</th></tr>
    ${rows.map(([k, v]) => `<tr><td>${k.slice(5)}</td><td>${v.checkIn.energy}</td><td>${v.checkIn.sleep}</td><td>${v.checkIn.digestion}</td></tr>`).join("")}
  </table>`;
}

function renderReintro() {
  if (!reintroUnlocked(state.profile)) {
    return `<h1 class="page-title">Reintroduction</h1><div class="card"><p>Unlocks after Day 30. You're on day ${programDay(state.profile)} — keep going!</p></div>`;
  }
  const order = state.reintro.order || [];
  const groups = {
    eggs: "Eggs",
    dairy: "Dairy",
    gluten: "Gluten / wheat",
    soy: "Soy",
    corn: "Corn",
    nuts: "Peanuts & tree nuts",
  };
  const allergySkip = (g) => {
    const a = (state.profile.allergies || []).join(" ").toLowerCase();
    if (g === "dairy" && a.includes("dairy")) return true;
    if (g === "eggs" && a.includes("egg")) return true;
    if (g === "nuts" && (a.includes("nut") || a.includes("peanut"))) return true;
    if (g === "gluten" && (a.includes("gluten") || a.includes("wheat"))) return true;
    if (g === "soy" && a.includes("soy")) return true;
    if (g === "corn" && a.includes("corn")) return true;
    return false;
  };

  return `
    <h1 class="page-title">Reintroduction</h1>
    <div class="card">
      <p>After Day 30, test one food group at a time. Eat it on test day, then log symptoms for 2–3 days (0–3 scale).</p>
      <p class="health-note">Skip any true allergy — only reintroduce those with your doctor.</p>
    </div>
    <div class="card">
      <h2>Your order</h2>
      <ol id="reintro-order">${order.map((g) => `<li data-group="${g}">${groups[g] || g}${allergySkip(g) ? " <em>(skipped — allergy)</em>" : ""}</li>`).join("")}</ol>
      <button type="button" class="btn btn-secondary btn-small" id="reintro-shuffle">Move next group down</button>
    </div>
    ${order
      .map((g) => {
        const t = state.reintro.tests[g] || { phase: "pending", days: [] };
        if (allergySkip(g)) return "";
        return `<div class="card" data-reintro="${g}">
          <h2>${groups[g]}</h2>
          <p>Status: <strong>${t.result || t.phase}</strong></p>
          ${renderReintroControls(g, t)}
        </div>`;
      })
      .join("")}
  `;
}

function renderReintroControls(group, t) {
  if (t.result) return `<p class="muted">Result recorded: ${t.result}</p>`;
  if (t.phase === "observe") {
    const dayIdx = t.days.length;
    return `<p>Observation day ${dayIdx + 1} of 3</p>
      ${["digestion", "energy", "skin", "sleep", "mood", "headache"]
        .map(
          (s) =>
            `<div class="field"><label>${s} (0–3)</label><input type="range" min="0" max="3" value="0" class="ri-symptom" data-symptom="${s}"></div>`
        )
        .join("")}
      <button type="button" class="btn btn-primary btn-small ri-save-day" data-group="${group}">Save observation day</button>`;
  }
  return `<button type="button" class="btn btn-primary btn-small ri-start" data-group="${group}">Test day — I ate ${group}</button>`;
}

function renderSettings() {
  const w = getMealWindows(state.profile);
  return `
    <h1 class="page-title">Settings</h1>
    <div class="card">
      <h2>Meal times</h2>
      <p class="muted">Used for “Suggested now” on Today and Log. Format 24h HH:MM.</p>
      <div class="field"><label>Breakfast starts</label><input type="time" id="mw-b0" value="${w.breakfastStart}"></div>
      <div class="field"><label>Breakfast ends / lunch starts</label><input type="time" id="mw-b1" value="${w.breakfastEnd}"></div>
      <div class="field"><label>Lunch ends / snack starts</label><input type="time" id="mw-l1" value="${w.lunchEnd}"></div>
      <div class="field"><label>Snack ends / dinner starts</label><input type="time" id="mw-s1" value="${w.snackEnd}"></div>
      <div class="field"><label>Dinner ends (after = up next breakfast)</label><input type="time" id="mw-d1" value="${w.dinnerEnd}"></div>
      <button type="button" class="btn btn-primary btn-small" id="mw-save">Save meal times</button>
    </div>
    <div class="card">
      <h2>Calorie target</h2>
      <div class="field"><label>Daily calories</label><input type="number" id="set-cal" value="${state.profile.calorieTarget}"></div>
      <button type="button" class="btn btn-primary btn-small" id="set-cal-save">Save target</button>
    </div>
    <div class="card">
      <h2>Program</h2>
      <div class="field"><label>Start date</label><input type="date" id="set-start" value="${state.profile.startDate}"></div>
      <button type="button" class="btn btn-secondary btn-small" id="set-regen">Re-run questionnaire</button>
      <button type="button" class="btn btn-secondary btn-small" id="set-export">Export JSON</button>
      <button type="button" class="btn btn-secondary btn-small" id="set-reset">Reset all data</button>
    </div>
    <p class="health-note">${HEALTH_NOTE}</p>
  `;
}

function bindSuggestedNow() {
  $$(".suggested-log-meal").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = logPlannedMeal(btn.dataset.slot, Number(btn.dataset.day), btn.dataset.logKey);
      if (!r) return;
      const msg =
        r.lastComp.status === "on"
          ? `Logged ${r.meal.name} — on plan!`
          : r.lastComp.status === "off"
            ? `Logged with off-plan items: ${r.lastComp.reason}`
            : `Logged — ${r.lastComp.reason}`;
      showToast(msg, r.lastComp.status);
      render();
    });
  });
  $$(".suggested-see-recipe").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      mealsViewDay = Number(a.dataset.day);
      sessionStorage.setItem("wf_meals_day", String(mealsViewDay));
      navigate("#/meals");
    });
  });
}

function bindScreen(route) {
  if (route === "#/today") {
    bindToday();
    bindSuggestedNow();
  }
  if (route === "#/log") {
    bindLog();
    bindSuggestedNow();
    updateLogActionBar();
  }
  if (route === "#/meals") bindMeals();
  if (route === "#/foods") bindFoods();
  if (route === "#/reintro") bindReintro();
  if (route === "#/settings") bindSettings();
}

function bindToday() {
  $("#ci-save")?.addEventListener("click", () => {
    const key = $("#ci-save").dataset.key;
    const log = ensureDayLog(state, key);
    log.checkIn = {
      water: Number($("#ci-water").value) || 0,
      energy: Number($("#ci-energy").value),
      sleep: Number($("#ci-sleep").value),
      cravings: Number($("#ci-cravings").value),
      digestion: Number($("#ci-digestion").value),
      note: $("#ci-note").value,
    };
    saveState(state);
    alert("Check-in saved — nice work.");
  });
}

function bindLog() {
  const search = $("#log-search");
  const results = $("#log-results");
  const renderHits = () => {
    const q = search.value.trim().toLowerCase();
    if (q.length < 2) {
      results.classList.add("hidden");
      return;
    }
    const hits = foodsData.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 12);
    results.innerHTML = hits
      .map(
        (f) =>
          `<div class="search-row">
            <button type="button" class="search-pick ${pendingLog?.food?.id === f.id ? "selected" : ""}" data-food-id="${f.id}">
              <span class="search-pick-text">
                <span class="search-pick-name">${escapeHtml(f.name)}</span>
                <span class="search-pick-cal muted">${f.calories} cal</span>
              </span>
            </button>
            <button type="button" class="btn btn-small btn-secondary search-add" data-food-id="${f.id}">+ Add</button>
          </div>`
      )
      .join("");
    results.classList.remove("hidden");
    $$(".search-pick, .search-add", results).forEach((btn) => {
      btn.addEventListener("click", () => {
        const food = foodsData.find((x) => x.id === btn.dataset.foodId);
        if (food) selectPendingFood(food);
      });
    });
  };
  search?.addEventListener("input", renderHits);
  $("#log-meal")?.addEventListener("change", () => updateLogActionBar());

  $("#custom-log")?.addEventListener("click", () => {
    const food = {
      id: `custom_${Date.now()}`,
      name: $("#custom-name").value.trim(),
      calories: Number($("#custom-cal").value) || 0,
      protein: Number($("#custom-p").value) || 0,
      carbs: Number($("#custom-c").value) || 0,
      fat: Number($("#custom-f").value) || 0,
      customPackaged: $("#custom-packaged").checked,
      tags: [],
      serving: "1 serving",
    };
    if (!food.name) return;
    const comp = addFoodEntry(food, { silent: true });
    if (comp) {
      const msg =
        comp.status === "on"
          ? "On plan — logged!"
          : comp.status === "off"
            ? `Off plan: ${comp.reason}`
            : comp.reason;
      showToast(msg, comp.status);
    }
    $("#custom-name").value = "";
    $("#custom-cal").value = "";
    $("#custom-p").value = "";
    $("#custom-c").value = "";
    $("#custom-f").value = "";
    render();
  });

  $$(".log-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const key = dateKey();
      const log = ensureDayLog(state, key);
      for (const meal of Object.keys(log.meals)) {
        log.meals[meal] = log.meals[meal].filter((e) => e.id !== id);
      }
      saveState(state);
      render();
    });
  });
}

function addFoodEntry(food, opts = {}) {
  const meal = opts.meal || $("#log-meal")?.value || "lunch";
  const key = opts.logKey || dateKey(getClockNow());
  const log = ensureDayLog(state, key);
  const comp = checkFoodItem(food, state.profile, state.foodList);
  const entry = {
    id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    foodId: food.id,
    name: food.name,
    serving: food.serving,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    compliance: comp.status,
    reason: comp.reason,
    swaps: comp.swaps,
  };
  log.meals[meal].push(entry);
  saveState(state);
  if (!opts.silent) {
    render();
  }
  return comp;
}

function bindMeals() {
  $("#meals-day")?.addEventListener("change", () => {
    mealsViewDay = Number($("#meals-day").value) || 1;
    render();
  });
  $$(".log-meal-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slot = btn.dataset.slot;
      const dayNum = Number(btn.dataset.day);
      const r = logPlannedMeal(slot, dayNum, dateKey(getClockNow()));
      if (!r) return;
      const msg =
        r.lastComp.status === "on"
          ? `Logged ${r.meal.name} — on plan!`
          : r.lastComp.status === "off"
            ? `Logged with off-plan items: ${r.lastComp.reason}`
            : `Logged — ${r.lastComp.reason}`;
      showToast(msg, r.lastComp.status);
      navigate("#/log");
    });
  });
  $$(".shopping-list input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const week = weekForDay(mealsViewDay ?? programDay(state.profile));
      const shopKey = String(week);
      const idx = Number(cb.dataset.shopIdx);
      if (state.shoppingLists[shopKey]?.[idx]) {
        state.shoppingLists[shopKey][idx].checked = cb.checked;
        saveState(state);
      }
    });
  });
}

function bindFoods() {
  const fl = state.foodList;
  const input = $("#food-q");
  const renderList = () => {
    const q = (input?.value || "").toLowerCase();
    sessionStorage.setItem("wf_food_q", input?.value || "");
    const list = fl.enjoy.filter((f) => !q || f.name.toLowerCase().includes(q)).slice(0, 200);
    $("#enjoy-list").innerHTML =
      list
        .map(
          (f) =>
            `<div>${escapeHtml(f.name)} <span class="muted">(${escapeHtml(f.serving)})</span>${f.note ? `<div class="muted" style="font-size:0.82rem;margin-top:0.15rem">${escapeHtml(f.note)}</div>` : ""}</div>`
        )
        .join("") || '<p class="muted">No matches.</p>';
  };
  input?.addEventListener("input", renderList);
  renderList();
}

function bindReintro() {
  $("#reintro-shuffle")?.addEventListener("click", () => {
    const o = [...state.reintro.order];
    if (o.length > 1) {
      const [first, ...rest] = o;
      state.reintro.order = [...rest, first];
      saveState(state);
      render();
    }
  });
  $$(".ri-start").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.dataset.group;
      state.reintro.tests[g] = { phase: "observe", days: [], testDate: dateKey() };
      saveState(state);
      render();
    });
  });
  $$(".ri-save-day").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.dataset.group;
      const t = state.reintro.tests[g];
      const symptoms = {};
      btn.closest(".card").querySelectorAll(".ri-symptom").forEach((inp) => {
        symptoms[inp.dataset.symptom] = Number(inp.value);
      });
      t.days.push({ date: dateKey(), symptoms });
      if (t.days.length >= 3) {
        const max = Math.max(...t.days.flatMap((d) => Object.values(d.symptoms)));
        t.result = max >= 2 ? "react" : max === 1 ? "unsure" : "tolerated";
        t.phase = "done";
      }
      saveState(state);
      render();
    });
  });
}

function bindSettings() {
  $("#mw-save")?.addEventListener("click", () => {
    state.profile.mealWindows = {
      breakfastStart: $("#mw-b0").value || DEFAULT_MEAL_WINDOWS.breakfastStart,
      breakfastEnd: $("#mw-b1").value || DEFAULT_MEAL_WINDOWS.breakfastEnd,
      lunchEnd: $("#mw-l1").value || DEFAULT_MEAL_WINDOWS.lunchEnd,
      snackEnd: $("#mw-s1").value || DEFAULT_MEAL_WINDOWS.snackEnd,
      dinnerEnd: $("#mw-d1").value || DEFAULT_MEAL_WINDOWS.dinnerEnd,
    };
    saveState(state);
    showToast("Meal times saved", "on");
  });
  $("#set-cal-save")?.addEventListener("click", () => {
    const v = Number($("#set-cal").value);
    const floor = state.profile.sex === "male" ? 1500 : 1200;
    state.profile.calorieTarget = Math.max(floor, v);
    saveState(state);
    alert("Target updated.");
  });
  $("#set-start")?.addEventListener("change", () => {
    state.profile.startDate = $("#set-start").value;
    saveState(state);
  });
  $("#set-regen")?.addEventListener("click", () => {
    if (confirm("This will restart the questionnaire and rebuild your food list. Continue?")) {
      draftProfile = { ...state.profile };
      delete draftProfile.onboardingComplete;
      state.profile = null;
      state.foodList = null;
      onboardingStep = 0;
      saveState(state);
      render();
    }
  });
  $("#set-export")?.addEventListener("click", () => {
    const blob = new Blob([exportStateJson(state)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "whole-food-plan-export.json";
    a.click();
  });
  $("#set-reset")?.addEventListener("click", () => {
    if (confirm("Delete all app data on this device?")) {
      resetState();
      state = loadState();
      onboardingStep = 0;
      render();
    }
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}

async function init() {
  await loadContent();
  window.addEventListener("hashchange", render);
  registerSW();
  if (!location.hash) location.hash = "#/today";
  render();
}

init();
