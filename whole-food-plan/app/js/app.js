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
import {
  generateMealPlan,
  shuffleMealInPlan,
  mealLogEntries,
  getPersonalizedDay,
  buildGroceryFromPlan,
  programWeekForDay,
} from "./meals.js";
import { resolveSuggestedMeal, getMealWindows, DEFAULT_MEAL_WINDOWS } from "./mealTime.js";
import { defaultEatSelections, applyDietStyle } from "./masterFood.js";
import { groceryListText, buildGroceryFromMeal } from "./grocery.js";
import { initGroceryOrderSheet, openGroceryOrderSheet, GROCERY_STORE_IDS, getGroceryStore } from "./grocerySheet.js";
import {
  MACRO_GROUPS,
  MACRO_PICKER_VERSION,
  validateMacroGroup,
} from "./macroGroups.js";
import {
  renderMacroPickerPanel,
  bindMacroPicker,
  readMacroSelectionsFromDom,
} from "./macroPickerUi.js";
const ONBOARDING_STEPS = 10;
const MACRO_STEP_START = 2;

function isMacroOnboardingStep(step) {
  return step >= MACRO_STEP_START && step < MACRO_STEP_START + MACRO_GROUPS.length;
}

function macroGroupForOnboardingStep(step) {
  return MACRO_GROUPS[step - MACRO_STEP_START]?.id;
}
import {
  buildKitchenChecklist,
  kitchenProgress,
  isKitchenClearComplete,
  shouldShowKitchenReminder,
  defaultKitchenClear,
  clampGroupIndex,
  groupProgress,
} from "./clearKitchen.js";

const HEALTH_NOTE =
  "This program shares general nutrition education. It is not medical advice. Check with your doctor or a registered dietitian before changing how you eat, especially if you are pregnant, take medication, have food allergies, diabetes, kidney disease, a history of disordered eating, or any other health condition.";

let state = loadState();
let daysData = [];
let foodsData = [];
let mealsData = null;
let masterListData = null;
let onboardingStep = 0;
let draftProfile = {};
let foodsEditMode = false;
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
    mealPlan: state.mealPlan,
    logs: state.logs,
  });
}

function syncPlanAndList() {
  if (!state.profile || !masterListData) return;
  state.foodList = buildPersonalFoodList(state.profile, masterListData);
  state.mealPlan = generateMealPlan(state.profile, mealsData, masterListData);
  saveState(state);
}

function ensureMealPlan() {
  if (state.profile?.onboardingComplete && masterListData && mealsData && !state.mealPlan) {
    syncPlanAndList();
  }
}

async function loadContent() {
  const base = new URL("../data/", import.meta.url);
  const [daysRes, foodsRes, mealsRes, masterRes] = await Promise.all([
    fetch(new URL("days.json", base)),
    fetch(new URL("foods.json", base)),
    fetch(new URL("meals.json", base)),
    fetch(new URL("master-list.json", base)),
  ]);
  daysData = await daysRes.json();
  const foodsJson = await foodsRes.json();
  foodsData = foodsJson.foods || foodsJson;
  mealsData = await mealsRes.json();
  masterListData = await masterRes.json();
}

function getEatSelections(source) {
  return source?.eatSelections || defaultEatSelections(masterListData);
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
  if (state.profile?.needsMacroPickerRefresh) {
    state.profile.needsMacroPickerRefresh = false;
    state.profile.onboardingComplete = false;
    onboardingStep = MACRO_STEP_START;
    saveState(state);
  }

  if (!state.profile?.onboardingComplete) {
    main.innerHTML = renderOnboarding();
    bindOnboarding();
    $("#bottom-nav").innerHTML = "";
    return;
  }

  ensureMealPlan();
  if (!state.foodList && masterListData) {
    state.foodList = buildPersonalFoodList(state.profile, masterListData);
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
    case "#/kitchen-clear":
      html = renderKitchenClear();
      break;
    default:
      html = renderToday();
  }
  main.innerHTML = html;
  $("#bottom-nav").innerHTML = renderNav(route.split("?")[0]);
  bindScreen(route.split("?")[0]);
}

function renderOnboarding() {
  const steps = ONBOARDING_STEPS;
  const dots = Array.from({ length: steps }, (_, i) =>
    `<span class="${i === onboardingStep ? "on" : ""}"></span>`
  ).join("");
  const p = { ...state.profile, ...draftProfile };
  if (!draftProfile.eatSelections && masterListData) {
    draftProfile.eatSelections = defaultEatSelections(masterListData);
  }

  const panels = [
    `<div class="card">
      <h2>Welcome</h2>
      <p>30 days of real food, personalized to you. This short questionnaire builds your food list and calorie target.</p>
      <p class="health-note">${HEALTH_NOTE}</p>
      <label class="field"><input type="checkbox" id="ob-disclaimer" ${p.disclaimerAck ? "checked" : ""}> I understand this is education, not medical advice.</label>
    </div>`,
    `<div class="card">
      <h2>Allergies & diet</h2>
      <div class="field">
        <label>Default diet style (quick toggles on next step)</label>
        <select id="ob-diet">
          <option value="omnivore" ${p.dietStyle === "omnivore" ? "selected" : ""}>Omnivore</option>
          <option value="pescatarian" ${p.dietStyle === "pescatarian" ? "selected" : ""}>Pescatarian</option>
          <option value="vegetarian" ${p.dietStyle === "vegetarian" ? "selected" : ""}>Vegetarian</option>
          <option value="vegan" ${p.dietStyle === "vegan" ? "selected" : ""}>Vegan</option>
        </select>
      </div>
      <div class="field">
        <label>Allergies (always on extra avoids)</label>
        <input id="ob-allergies" value="${escapeAttr((p.allergies || []).join(", "))}" placeholder="e.g. dairy, shellfish">
      </div>
      <div class="field">
        <label>Intolerances (optional)</label>
        <input id="ob-intol" value="${escapeAttr((p.intolerances || []).join(", "))}" placeholder="e.g. garlic">
      </div>
    </div>`,
    ...MACRO_GROUPS.map((g) =>
      masterListData
        ? renderMacroPickerPanel(masterListData, getEatSelections(p), g.id, "ob")
        : `<div class="card"><p class="muted">Loading food list…</p></div>`
    ),
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
      <button type="button" class="btn btn-primary" style="flex:1" id="ob-next">${onboardingStep === steps - 1 ? "Start my plan" : isMacroOnboardingStep(onboardingStep) ? "Next foods" : "Continue"}</button>
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
    if (isMacroOnboardingStep(onboardingStep)) {
      const gid = macroGroupForOnboardingStep(onboardingStep);
      const check = validateMacroGroup(masterListData, draftProfile.eatSelections || getEatSelections(draftProfile), gid);
      if (!check.ok) {
        alert(check.message);
        return;
      }
    }
    if (onboardingStep < ONBOARDING_STEPS - 1) {
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
  const gidOnStep = isMacroOnboardingStep(onboardingStep) ? macroGroupForOnboardingStep(onboardingStep) : null;
  const eatPanel = gidOnStep ? $(`#ob-${gidOnStep}-eat-panel`) : null;
  if (eatPanel && masterListData && gidOnStep) {
    const gid = gidOnStep;
    bindMacroPicker(
      eatPanel,
      () => draftProfile.eatSelections || getEatSelections(draftProfile),
      (sel) => {
        draftProfile.eatSelections = sel;
      },
      masterListData,
      gid,
      () => render()
    );
  }
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
    draftProfile.allergies = splitList($("#ob-allergies")?.value || "");
    draftProfile.intolerances = splitList($("#ob-intol")?.value || "");
    if (masterListData && draftProfile.dietStyle && draftProfile.dietStyle !== "omnivore") {
      draftProfile.eatSelections = applyDietStyle(
        draftProfile.eatSelections || defaultEatSelections(masterListData),
        masterListData,
        draftProfile.dietStyle
      );
    }
  }
  if (isMacroOnboardingStep(onboardingStep)) {
    const gid = macroGroupForOnboardingStep(onboardingStep);
    const panel = $(`#ob-${gid}-eat-panel`);
    if (panel) {
      draftProfile.eatSelections = readMacroSelectionsFromDom(
        panel,
        draftProfile.eatSelections || getEatSelections(draftProfile)
      );
    }
  }
  const symptomsStep = MACRO_STEP_START + MACRO_GROUPS.length;
  if (onboardingStep === symptomsStep) {
    draftProfile.symptomsTrack = $$("#ob-symptoms .chip.selected").map((b) => b.dataset.symptom);
    draftProfile.why = $("#ob-why")?.value || "";
  }
  if (onboardingStep === symptomsStep + 1) {
    draftProfile.sex = $("#ob-sex")?.value;
    draftProfile.age = Number($("#ob-age")?.value);
    draftProfile.heightCm = Number($("#ob-height")?.value);
    draftProfile.weightKg = Number($("#ob-weight")?.value);
    draftProfile.activity = $("#ob-activity")?.value;
    draftProfile.goal = $("#ob-goal")?.value;
    draftProfile.calorieTarget = estimateCalorieTarget(draftProfile);
  }
  if (onboardingStep === symptomsStep + 2) {
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
  state.profile.eatSelections =
    draftProfile.eatSelections || defaultEatSelections(masterListData);
  state.profile.macroPickerVersion = MACRO_PICKER_VERSION;
  if (!state.kitchenClear) state.kitchenClear = defaultKitchenClear();
  syncPlanAndList();
  onboardingStep = 0;
  draftProfile = {};
  navigate("#/kitchen-clear");
}

function ensureKitchenState() {
  if (!state.kitchenClear) state.kitchenClear = defaultKitchenClear();
}

function renderKitchenClear() {
  ensureKitchenState();
  const checklist = buildKitchenChecklist(masterListData, state.profile);
  const prog = kitchenProgress(state.kitchenClear, checklist);
  const complete = isKitchenClearComplete(state.kitchenClear, checklist);
  const celebrated = state.kitchenClear.celebrated || complete;
  const groupCount = checklist.groups.length;
  const gi = clampGroupIndex(state.kitchenClear.groupIndex, groupCount);
  const group = checklist.groups[gi];
  const gProg = groupProgress(state.kitchenClear, group);
  const allIds = JSON.stringify(checklist.allItems.map((it) => it.id));

  const clearRows = group.clearItems
    .map((it) => {
      const checked = state.kitchenClear.checked[it.id] ? "checked" : "";
      return `<li><label class="kitchen-check-row"><input type="checkbox" class="kitchen-check" data-id="${escapeAttr(it.id)}" ${checked}><span>${escapeHtml(it.label)}</span></label></li>`;
    })
    .join("");

  const labelChips = group.labelChecks
    .map((it) => {
      const learned = state.kitchenClear.checked[it.id];
      return `<button type="button" class="chip kitchen-label-chip ${learned ? "selected learned" : ""}" data-id="${escapeAttr(it.id)}" data-label="${escapeAttr(it.label)}" aria-pressed="${learned ? "true" : "false"}">${learned ? "✓ " : ""}${escapeHtml(it.label)}</button>`;
    })
    .join("");

  const groupDots = checklist.groups
    .map((g, i) => {
      const gp = groupProgress(state.kitchenClear, g);
      const done = gp.done >= gp.total && gp.total > 0;
      return `<span class="kitchen-group-dot ${i === gi ? "on" : ""} ${done ? "done" : ""}" title="${escapeHtml(g.title)}"></span>`;
    })
    .join("");

  const tips = checklist.tips.map((t) => `<li>${escapeHtml(t)}</li>`).join("");

  return `
    <h1 class="page-title">Clear your kitchen</h1>
    <div class="card kitchen-hero">
      <p class="kitchen-lead">Set yourself up to win: clear out what might tempt you.</p>
      <p class="muted">Work through each food group: clear tempting items, then tap what you will watch for on labels.</p>
      <div class="kitchen-progress-wrap" aria-label="Kitchen clear progress">
        <div class="kitchen-progress-bar"><div class="kitchen-progress-fill" style="width:${prog.pct}%"></div></div>
        <p class="muted kitchen-progress-label">${prog.done} of ${prog.total} steps done (all groups)</p>
      </div>
      <div class="kitchen-group-dots" aria-hidden="true">${groupDots}</div>
    </div>
    ${celebrated ? `<div class="card kitchen-celebrate" id="kitchen-celebrate"><p class="kitchen-celebrate-title">Kitchen cleared!</p><p>You did the prep work — Day 1 will feel easier. Proud of you.</p><a href="#/today" class="btn btn-primary btn-block">Go to Today</a></div>` : ""}
    <div class="card" id="kitchen-checklist-card" data-all-ids="${escapeAttr(allIds)}">
      <p class="kitchen-group-step muted">Group ${gi + 1} of ${groupCount}</p>
      <h2 class="kitchen-group-title">${escapeHtml(group.title)}</h2>
      <p class="muted kitchen-group-sub">${gProg.done} / ${gProg.total} in this group</p>
      ${group.keepNote ? `<p class="kitchen-keep-note">${escapeHtml(group.keepNote)}</p>` : ""}
      <h3>Common items to clear</h3>
      <ul class="kitchen-list">${clearRows}</ul>
      <div class="kitchen-label-section">
        <h3>What to look for on the label</h3>
        <p class="muted">Tap each line when you know what to watch for — these count toward your progress.</p>
        <div class="chip-row kitchen-label-row">${labelChips}</div>
      </div>
      <div class="kitchen-group-nav">
        ${gi > 0 ? `<button type="button" class="btn btn-secondary btn-small" id="kitchen-prev-group">Previous group</button>` : ""}
        ${gi < groupCount - 1 ? `<button type="button" class="btn btn-primary btn-small" id="kitchen-next-group">Next group</button>` : ""}
      </div>
      <div class="kitchen-tips">
        <h3>Tips</h3>
        <ul>${tips}</ul>
      </div>
      <div class="kitchen-actions">
        ${complete && !state.kitchenClear.completed ? `<button type="button" class="btn btn-primary btn-block" id="kitchen-mark-done">Kitchen cleared!</button>` : ""}
        ${!complete ? `<button type="button" class="btn btn-secondary btn-block" id="kitchen-skip">I'll do this later</button>` : ""}
        ${state.kitchenClear.skipped && !complete ? `<a href="#/today" class="btn btn-secondary btn-block">Back to Today</a>` : ""}
      </div>
    </div>
  `;
}

function renderKitchenTodayBanner() {
  ensureKitchenState();
  if (!masterListData || !shouldShowKitchenReminder(state.kitchenClear)) return "";
  const checklist = buildKitchenChecklist(masterListData, state.profile);
  if (isKitchenClearComplete(state.kitchenClear, checklist)) {
    if (!state.kitchenClear.completed) return "";
  }
  if (state.kitchenClear.completed) return "";

  const dayNum = programDay(state.profile);
  const prog = kitchenProgress(state.kitchenClear, checklist);
  const isDayOne = dayNum === 1;
  const title = isDayOne ? "Day 1 prep: clear your kitchen" : "Friendly reminder: kitchen prep";
  const msg = state.kitchenClear.skipped
    ? "When you have a few minutes, finish clearing temptations so your reset feels easier."
    : isDayOne
      ? "Before you dive into meals, set your space up for success."
      : "You can still finish your kitchen clear checklist anytime.";

  return `
    <div class="card kitchen-today-banner" id="kitchen-today-banner">
      <h2>${title}</h2>
      <p class="muted">${msg}</p>
      <div class="kitchen-progress-wrap compact">
        <div class="kitchen-progress-bar"><div class="kitchen-progress-fill" style="width:${prog.pct}%"></div></div>
        <p class="muted kitchen-progress-label">${prog.done} / ${prog.total}</p>
      </div>
      <a href="#/kitchen-clear" class="btn btn-primary btn-small">Open checklist</a>
    </div>
  `;
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
    ${renderKitchenTodayBanner()}
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
  const plan = getPersonalizedDay(state.mealPlan, dayNum);
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
  const plan = getPersonalizedDay(state.mealPlan, dayNum);
  const scope = state.groceryScope || "week";
  const week = state.groceryWeek || programWeekForDay(dayNum);
  const grocery = buildGroceryFromPlan(state.mealPlan, masterListData, scope, week);
  const labels = grocery.sectionLabels;
  const dayMealEntries = Object.values(plan?.meals || {})
    .filter(Boolean)
    .flatMap((m) => mealLogEntries(m));
  const dayMacros = sumLogMacros(dayMealEntries);
  const dayTarget = macroTargets(state.profile.calorieTarget);

  const slotHtml = (slot, label) => {
    const m = plan?.meals?.[slot];
    if (!m) return "";
    return `<details class="card meal-card" open>
      <summary>${label}: ${escapeHtml(m.name)} <span class="meal-meta">~${m.calories} cal · P ${m.protein}g · C ${m.carbs ?? "—"}g · F ${m.fat ?? "—"}g</span></summary>
      <p><strong>Ingredients</strong></p>
      <ul>${m.ingredients.map((i) => (i === "---" ? "" : `<li>${escapeHtml(i)}</li>`)).join("")}</ul>
      <p><strong>Steps</strong></p>
      <ol>${m.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
      <div style="display:flex;gap:0.35rem;flex-wrap:wrap">
        <button type="button" class="btn btn-primary btn-small log-meal-btn" data-slot="${slot}" data-day="${dayNum}">Log this meal</button>
        <button type="button" class="btn btn-secondary btn-small shuffle-meal-btn" data-slot="${slot}" data-day="${dayNum}">Shuffle this meal</button>
        <button type="button" class="btn btn-secondary btn-small meal-grocery-btn" data-slot="${slot}" data-day="${dayNum}">Get these groceries</button>
      </div>
    </details>`;
  };

  const bySec = {};
  for (const item of grocery.items) {
    if (!bySec[item.section]) bySec[item.section] = [];
    bySec[item.section].push(item);
  }
  const shopHtml = Object.entries(bySec)
    .map(([sec, items]) => {
      const title = labels[sec] || sec;
      const lis = items
        .map((it) => {
          const checked = state.groceryChecked?.[it.key] ? "checked" : "";
          return `<li><input type="checkbox" class="grocery-check" data-key="${escapeAttr(it.key)}" ${checked}><span>${escapeHtml(it.label)}${it.count > 1 ? ` <span class="muted">(×${it.count})</span>` : ""}</span></li>`;
        })
        .join("");
      return `<h3>${escapeHtml(title)}</h3><ul class="shopping-list">${lis}</ul>`;
    })
    .join("");

  return `
    <h1 class="page-title">Your meal plan</h1>
    <div class="card">
      <div class="field"><label>Program day (1–30)</label>
        <input type="number" id="meals-day" min="1" max="30" value="${dayNum}">
      </div>
      <p class="muted">${escapeHtml(plan?.themeNote || "")}</p>
      <div class="macro-bar meal-day-macros">
        <div><strong>${dayMacros.calories}</strong>cal<span class="muted"> / ${dayTarget.calories}</span></div>
        <div><strong>${Math.round(dayMacros.protein)}g</strong>P<span class="muted"> / ${dayTarget.protein}g</span></div>
        <div><strong>${Math.round(dayMacros.carbs)}g</strong>C<span class="muted"> / ${dayTarget.carbs}g</span></div>
        <div><strong>${Math.round(dayMacros.fat)}g</strong>F<span class="muted"> / ${dayTarget.fat}g</span></div>
      </div>
    </div>
    ${slotHtml("breakfast", "Breakfast")}
    ${slotHtml("lunch", "Lunch")}
    ${slotHtml("dinner", "Dinner")}
    ${plan?.meals?.snack ? slotHtml("snack", "Snack") : ""}
    <div class="card" id="grocery-card">
      <h2>Grocery list</h2>
      <div class="chip-row" style="margin-bottom:0.5rem">
        <button type="button" class="chip grocery-scope ${scope === "week" ? "selected" : ""}" data-scope="week">This week</button>
        <button type="button" class="chip grocery-scope ${scope === "month" ? "selected" : ""}" data-scope="month">Full month</button>
      </div>
      ${scope === "week" ? `<div class="field"><label>Week</label><select id="grocery-week">${[1, 2, 3, 4].map((w) => `<option value="${w}" ${w === week ? "selected" : ""}>Week ${w}</option>`).join("")}</select></div>` : ""}
      <p class="muted" id="grocery-total">${grocery.totalLines} items · ${scope === "week" ? `Week ${week}` : "Days 1–30"}</p>
      ${shopHtml}
      <button type="button" class="btn btn-primary btn-small" id="grocery-get">Get these groceries</button>
      <button type="button" class="btn btn-secondary btn-small" id="grocery-copy">Share / Copy as text</button>
    </div>
  `;
}

function openPlanGrocerySheet() {
  const dayNum = mealsViewDay ?? programDay(state.profile, getClockNow());
  const scope = state.groceryScope || "week";
  const week = state.groceryWeek || programWeekForDay(dayNum);
  const grocery = buildGroceryFromPlan(state.mealPlan, masterListData, scope, week);
  const subtitle =
    scope === "month" ? "Full month · paste into any delivery app" : `Week ${week} · paste into any delivery app`;
  openGroceryOrderSheet({
    title: "Get these groceries",
    subtitle,
    grocery,
    storeId: state.groceryStore || "instacart",
  });
}

function openMealGrocerySheet(slot, dayNum) {
  const plan = getPersonalizedDay(state.mealPlan, dayNum);
  const meal = plan?.meals?.[slot];
  if (!meal) return;
  const grocery = buildGroceryFromMeal(meal, masterListData);
  const slotLabel = mealLabel(slot);
  openGroceryOrderSheet({
    title: `Groceries for ${slotLabel}`,
    subtitle: `${meal.name} · Day ${dayNum}`,
    grocery,
    storeId: state.groceryStore || "instacart",
  });
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
  if (foodsEditMode && masterListData) {
    const macroPanels = MACRO_GROUPS
      .map((g) => renderMacroPickerPanel(masterListData, getEatSelections(state.profile), g.id, "edit"))
      .join("");
    return `
      <h1 class="page-title">Edit my foods</h1>
      <p class="muted">Pick foods by macro group. Changes regenerate your 30-day meal plan.</p>
      ${macroPanels}
      <button type="button" class="btn btn-primary btn-block" id="save-eat-edit">Save & update plan</button>
      <button type="button" class="btn btn-secondary btn-block" id="cancel-eat-edit">Cancel</button>
    `;
  }
  return `
    <h1 class="page-title">Your food list</h1>
    <p><button type="button" class="btn btn-secondary btn-small" id="edit-my-foods">Edit my foods</button></p>
    <div class="field"><input type="search" id="food-q" value="${escapeAttr(q)}" placeholder="Search your Eat list…"></div>
    <div class="food-list-group card">
      <h2>Eat</h2>
      <p class="muted">${fl.enjoy.length} foods on your plan.</p>
      <div class="food-list-scroll" id="enjoy-list"></div>
    </div>
    ${fl.paused?.length ? `<div class="card"><h2>Removed from your Eat list</h2><ul>${fl.paused.map((p) => `<li><strong>${escapeHtml(p.label)}</strong> — ${escapeHtml(p.reason)}</li>`).join("")}</ul></div>` : ""}
    <div class="food-list-group card">
      <h2>Skip for 30 days</h2>
      <ul>${fl.avoid.map((a) => `<li><strong>${escapeHtml(a.label)}</strong> — <span class="muted">${escapeHtml(a.detail)}</span></li>`).join("")}</ul>
    </div>
    <div class="food-list-group card">
      <h2>Your extra avoids</h2>
      ${fl.extraAvoids.length ? `<ul>${fl.extraAvoids.map((e) => `<li><strong>${escapeHtml(e.text)}</strong> — ${escapeHtml(e.reason)}</li>`).join("")}</ul>` : '<p class="muted">None — add allergies in Settings.</p>'}
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
      <h2>Grocery ordering</h2>
      <p class="muted">Choose your preferred store for quick item searches from meal and list sheets.</p>
      <div class="field">
        <label>Preferred store</label>
        <select id="grocery-store-pref">
          ${GROCERY_STORE_IDS
            .map(
              (id) =>
                `<option value="${id}" ${(state.groceryStore || "instacart") === id ? "selected" : ""}>${escapeHtml(getGroceryStore(id).searchButtonLabel.replace("Search on ", ""))}</option>`
            )
            .join("")}
        </select>
      </div>
    </div>
    <div class="card">
      <h2>Program</h2>
      <div class="field"><label>Start date</label><input type="date" id="set-start" value="${state.profile.startDate}"></div>
      <button type="button" class="btn btn-secondary btn-small" id="set-edit-foods">Edit my foods</button>
      <button type="button" class="btn btn-secondary btn-small" id="set-regen">Re-run questionnaire</button>
      <button type="button" class="btn btn-secondary btn-small" id="set-export">Export JSON</button>
      <button type="button" class="btn btn-secondary btn-small" id="set-reset">Reset all data</button>
    </div>
    <div class="card refund-card">
      <h2>Refunds for the 30-Day Whole Food Plan</h2>
      <p>You can request a full refund within 3 days (72 hours) of purchase by emailing <a href="mailto:coachsalimheyaime@gmail.com?subject=Refund+request">coachsalimheyaime@gmail.com</a>. After that, all sales are final. Refunds go to the original payment method.</p>
      <p>$9.99 one-time payment. Includes 12 months of access. No subscription.</p>
      <p lang="es">$9.99 pago único. Incluye 12 meses de acceso. Sin suscripción.</p>
      <p>Purchases include 12 months of app access. If you bought before [GATING DATE], your 12 months start on [GATING DATE]. There is no automatic renewal.</p>
      <p lang="es">Las compras incluyen 12 meses de acceso a la app. Si compraste antes del [GATING DATE], tus 12 meses empiezan el [GATING DATE]. No hay renovación automática.</p>
      <p><a href="/purchase-terms/" target="_blank" rel="noopener">Purchase terms</a> · <a href="/health-safety/" target="_blank" rel="noopener">Health and safety</a> · <a href="/purchase-terms/#es" target="_blank" rel="noopener" lang="es" hreflang="es">Términos de compra</a> · <a href="/health-safety/#es" target="_blank" rel="noopener" lang="es" hreflang="es">Salud y seguridad</a></p>
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
  if (route === "#/kitchen-clear") bindKitchenClear();
}

function updateKitchenProgressUi(checklist) {
  const prog = kitchenProgress(state.kitchenClear, checklist);
  $$(".kitchen-progress-fill").forEach((el) => {
    el.style.width = `${prog.pct}%`;
  });
  const full = $("#kitchen-checklist-card")?.querySelector(".kitchen-progress-label");
  if (full) full.textContent = `${prog.done} of ${prog.total} steps done (all groups)`;
}

function bindKitchenClear() {
  const checklist = buildKitchenChecklist(masterListData, state.profile);
  const maybeFinish = () => {
    if (isKitchenClearComplete(state.kitchenClear, checklist)) {
      state.kitchenClear.completed = true;
      state.kitchenClear.celebrated = true;
      state.kitchenClear.skipped = false;
      saveState(state);
      render();
      return true;
    }
    return false;
  };

  const toggleKitchenId = (id, on) => {
    state.kitchenClear.checked[id] = on;
    saveState(state);
    if (!maybeFinish()) {
      updateKitchenProgressUi(checklist);
      const gi = clampGroupIndex(state.kitchenClear.groupIndex, checklist.groups.length);
      const chip = $(`.kitchen-label-chip[data-id="${id}"]`);
      if (chip) {
        chip.classList.toggle("selected", on);
        chip.classList.toggle("learned", on);
        chip.setAttribute("aria-pressed", on ? "true" : "false");
        const label = chip.dataset.label || "";
        chip.textContent = on ? `✓ ${label}` : label;
      }
      const sub = $(".kitchen-group-sub");
      if (sub) {
        const gProg = groupProgress(state.kitchenClear, checklist.groups[gi]);
        sub.textContent = `${gProg.done} / ${gProg.total} in this group`;
      }
    }
  };

  $$(".kitchen-check").forEach((cb) => {
    cb.addEventListener("change", () => toggleKitchenId(cb.dataset.id, cb.checked));
  });

  $$(".kitchen-label-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const on = !state.kitchenClear.checked[id];
      toggleKitchenId(id, on);
    });
  });

  $("#kitchen-next-group")?.addEventListener("click", () => {
    state.kitchenClear.groupIndex = clampGroupIndex(
      (state.kitchenClear.groupIndex || 0) + 1,
      checklist.groups.length
    );
    saveState(state);
    render();
  });
  $("#kitchen-prev-group")?.addEventListener("click", () => {
    state.kitchenClear.groupIndex = clampGroupIndex(
      (state.kitchenClear.groupIndex || 0) - 1,
      checklist.groups.length
    );
    saveState(state);
    render();
  });

  $("#kitchen-mark-done")?.addEventListener("click", () => {
    state.kitchenClear.completed = true;
    state.kitchenClear.celebrated = true;
    state.kitchenClear.skipped = false;
    saveState(state);
    render();
  });

  $("#kitchen-skip")?.addEventListener("click", () => {
    state.kitchenClear.skipped = true;
    saveState(state);
    navigate("#/today");
  });
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
  $$(".shuffle-meal-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dayNum = Number(btn.dataset.day);
      const slot = btn.dataset.slot;
      state.mealPlan = shuffleMealInPlan(
        state.mealPlan,
        dayNum,
        slot,
        state.profile,
        mealsData,
        masterListData
      );
      saveState(state);
      render();
    });
  });
  $$(".grocery-scope").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.groceryScope = btn.dataset.scope;
      saveState(state);
      render();
    });
  });
  $("#grocery-week")?.addEventListener("change", () => {
    state.groceryWeek = Number($("#grocery-week").value) || 1;
    saveState(state);
    render();
  });
  $$(".grocery-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      state.groceryChecked[cb.dataset.key] = cb.checked;
      saveState(state);
    });
  });
  $("#grocery-get")?.addEventListener("click", () => openPlanGrocerySheet());
  $$(".meal-grocery-btn").forEach((btn) => {
    btn.addEventListener("click", () => openMealGrocerySheet(btn.dataset.slot, Number(btn.dataset.day)));
  });
  $("#grocery-copy")?.addEventListener("click", async () => {
    const dayNum = mealsViewDay ?? programDay(state.profile, getClockNow());
    const scope = state.groceryScope || "week";
    const week = state.groceryWeek || programWeekForDay(dayNum);
    const grocery = buildGroceryFromPlan(state.mealPlan, masterListData, scope, week);
    const text = groceryListText(grocery, state.groceryChecked);
    try {
      await navigator.clipboard.writeText(text);
      showToast("Grocery list copied", "on");
    } catch {
      showToast("Copy failed — try again", "check");
    }
  });
}

function bindFoods() {
  if (foodsEditMode && masterListData) {
    for (const g of MACRO_GROUPS) {
      const panel = $(`#edit-${g.id}-eat-panel`);
      if (!panel) continue;
      bindMacroPicker(
        panel,
        () => state.profile.eatSelections || getEatSelections(state.profile),
        (sel) => {
          state.profile.eatSelections = sel;
        },
        masterListData,
        g.id,
        () => render()
      );
    }
    $("#save-eat-edit")?.addEventListener("click", () => {
      let sel = state.profile.eatSelections || getEatSelections(state.profile);
      for (const g of MACRO_GROUPS) {
        const p = $(`#edit-${g.id}-eat-panel`);
        if (p) sel = readMacroSelectionsFromDom(p, sel);
      }
      state.profile.eatSelections = sel;
      foodsEditMode = false;
      syncPlanAndList();
      showToast("Meal plan updated", "on");
      render();
    });
    $("#cancel-eat-edit")?.addEventListener("click", () => {
      foodsEditMode = false;
      render();
    });
    return;
  }
  $("#edit-my-foods")?.addEventListener("click", () => {
    foodsEditMode = true;
    render();
  });
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
  $("#grocery-store-pref")?.addEventListener("change", () => {
    state.groceryStore = $("#grocery-store-pref").value || "instacart";
    saveState(state);
    showToast("Preferred store saved", "on");
  });
  $("#set-edit-foods")?.addEventListener("click", () => {
    foodsEditMode = true;
    navigate("#/foods");
  });
  $("#set-regen")?.addEventListener("click", () => {
    if (confirm("This will restart the questionnaire and rebuild your food list. Continue?")) {
      draftProfile = { ...state.profile };
      delete draftProfile.onboardingComplete;
      state.profile = null;
      state.foodList = null;
      state.mealPlan = null;
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
  initGroceryOrderSheet({ showToast });
  window.addEventListener("hashchange", render);
  registerSW();
  if (!location.hash) location.hash = "#/today";
  render();
}

init();
