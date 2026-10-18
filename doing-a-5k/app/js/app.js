import {
  buildPlan,
  replanFromWeek,
  scheduledDateForWorkout,
  formatDate,
  formatDuration,
  workoutTotalSeconds,
  weeksForDaysPerWeek,
  DAY_NAMES,
} from "./plan.js";
import {
  weeksForHalfPlan,
  formatDistance,
  formatRaceDistance,
  startDateFromRace,
  longRunProgressionKm,
  parseDateOnly,
  resolveHalfPlacement,
  strengthLevelFromPushUps,
  COACH_DISCLAIMER,
  COACH_EFFORT_GUIDE,
  coachEquipmentSummary,
} from "./halfPlan.js";
import {
  defaultStrengthDays,
  strengthDaysValid,
  strengthSessionOverview,
  equipmentSummary,
} from "./strength.js";
import {
  loadState,
  saveState,
  resetState,
  exportState,
  getSettings,
  updateSettings,
  markWorkoutComplete,
  markStrengthComplete,
  isWorkoutComplete,
  isStrengthComplete,
  repeatWeek,
  nextWorkout,
  strengthForWeek,
  stats,
} from "./storage.js";
import { WorkoutTimer, SPEECH_CUES } from "./timer.js";
import { StrengthTimer } from "./strength-timer.js";

const E2E = new URLSearchParams(location.search).has("e2e");

const EQUIPMENT_OPTIONS_5K = [
  { value: "bodyweight", label: "None / bodyweight" },
  { value: "dumbbells", label: "Dumbbells" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "bands", label: "Resistance bands" },
  { value: "pullup", label: "Pull-up bar" },
  { value: "bench", label: "Bench or step" },
];
const EQUIPMENT_OPTIONS_HALF = [
  { value: "none", label: "None (bodyweight)" },
  { value: "dumbbells", label: "Dumbbells" },
  { value: "kettlebells_essentials", label: "Kettlebells + essentials (step, band, mat)" },
];

let state = loadState();
let activeTimer = null;
let activeWorkoutId = null;
let activeSessionKind = "run";

const $ = (sel, root = document) => root.querySelector(sel);

function speak(text, enabled) {
  if (!enabled || !text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  u.volume = 1;
  window.speechSynthesis.speak(u);
}

function route() {
  const hash = location.hash.replace("#", "") || (state ? "today" : "onboarding");
  render(hash);
}

function setState(next) {
  state = next;
  saveState(state);
}

function init() {
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = btn.dataset.nav;
    });
  });
  window.addEventListener("hashchange", route);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
  }
  route();
}

function shell(content, { showNav = true, title = "Doing a 5K", extraFooter = "" } = {}) {
  const nav = showNav && state
    ? `<nav class="app-nav" aria-label="App sections">
        <button type="button" data-nav="today" class="app-nav-btn ${location.hash === "#today" || !location.hash ? "is-active" : ""}">Today</button>
        <button type="button" data-nav="plan" class="app-nav-btn ${location.hash === "#plan" ? "is-active" : ""}">Plan</button>
        <button type="button" data-nav="progress" class="app-nav-btn ${location.hash === "#progress" ? "is-active" : ""}">Progress</button>
        <button type="button" data-nav="settings" class="app-nav-btn ${location.hash === "#settings" ? "is-active" : ""}">Settings</button>
      </nav>`
    : "";

  return `
    <div class="app-screen">
      <header class="app-header">
        <p class="app-eyebrow">A Challenge to Move</p>
        <h1 class="app-title">${title}</h1>
      </header>
      ${content}
      ${nav}
      <footer class="app-footer">
        <p class="safety-note"><strong>Safety:</strong> Check with a doctor before starting an exercise program. Stop if you feel pain, dizziness, or chest discomfort. ${extraFooter}</p>
        <p>&copy; ${new Date().getFullYear()} Coach Salim Heyaime LLC</p>
      </footer>
    </div>`;
}

function render(view) {
  const root = $("#app");
  if (!root) return;

  if (view === "onboarding" || !state) {
    root.innerHTML = renderOnboarding();
    bindOnboarding();
    return;
  }

  switch (view) {
    case "today":
      root.innerHTML = renderToday();
      bindToday();
      break;
    case "workout":
      root.innerHTML = renderWorkout();
      bindWorkout();
      break;
    case "complete":
      root.innerHTML = renderComplete();
      bindComplete();
      break;
    case "strength-overview":
      root.innerHTML = renderStrengthOverview();
      bindStrengthOverview();
      break;
    case "strength-workout":
      root.innerHTML = renderStrengthWorkout();
      bindStrengthWorkout();
      break;
    case "strength-complete":
      root.innerHTML = renderStrengthComplete();
      bindStrengthComplete();
      break;
    case "plan":
      root.innerHTML = renderPlan();
      break;
    case "progress":
      root.innerHTML = renderProgress();
      break;
    case "settings":
      root.innerHTML = renderSettings();
      bindSettings();
      break;
    default:
      location.hash = "today";
  }
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = btn.dataset.nav;
    });
  });
}

function strengthDayChips(runDays, selected, count) {
  const run = new Set(runDays);
  return DAY_NAMES.map((name, i) => {
    if (run.has(i)) return "";
    const checked = selected.includes(i);
    return `<label class="chip"><input type="checkbox" name="strengthDay" value="${i}" ${checked ? "checked" : ""}> ${name}</label>`;
  }).join("");
}

function equipmentChecks(selected = ["bodyweight"], goal = "5k") {
  const opts = goal === "half" ? EQUIPMENT_OPTIONS_HALF : EQUIPMENT_OPTIONS_5K;
  const set = new Set(selected);
  const defaultVal = goal === "half" ? "none" : "bodyweight";
  return opts
    .map((opt) => {
      const checked =
        set.has(opt.value) ||
        (opt.value === defaultVal && !selected.length) ||
        (goal === "half" && opt.value === "none" && selected.includes("bodyweight"));
      const type = goal === "half" ? "radio" : "checkbox";
      const inputName = goal === "half" ? "equipmentHalf" : "equipment";
      return `<label class="chip"><input type="${type}" name="${inputName}" value="${opt.value}" ${checked ? "checked" : ""}> ${opt.label}</label>`;
    })
    .join("");
}

function renderOnboarding() {
  const today = new Date().toISOString().slice(0, 10);
  const defaultRun = [1, 3, 5];
  const defaultStrength = defaultStrengthDays(defaultRun, 1);
  const dayChecks = DAY_NAMES.map(
    (name, i) =>
      `<label class="chip"><input type="checkbox" name="day" value="${i}" ${defaultRun.includes(i) ? "checked" : ""}> ${name}</label>`
  ).join("");

  return shell(
    `
    <p class="app-tagline">Your first 5K, or go further to a half marathon.</p>
    <form id="onboard-form" class="card">
      <label class="field">
        <span>Your name (optional)</span>
        <input name="name" type="text" autocomplete="name" placeholder="Alex">
      </label>
      <fieldset class="field" id="goal-field">
        <legend>Goal</legend>
        <div class="radio-row">
          <label><input type="radio" name="goal" value="5k" checked> 5K</label>
          <label><input type="radio" name="goal" value="half"> Half marathon (21.1 km / 13.1 mi)</label>
        </div>
      </fieldset>
      <fieldset class="field" id="five-k-days-field">
        <legend>Run days per week</legend>
        <div class="radio-row" id="days-5k-row">
          <label><input type="radio" name="days" value="3" checked> 3 days (12 weeks)</label>
          <label><input type="radio" name="days" value="4"> 4 days (10 weeks)</label>
          <label><input type="radio" name="days" value="5"> 5 days (8 weeks)</label>
        </div>
        <div class="radio-row hidden" id="days-half-row">
          <label><input type="radio" name="daysHalf" value="3" checked> 3 days (~16 / ~12 weeks)</label>
          <label><input type="radio" name="daysHalf" value="4"> 4 days (~16 / ~12 weeks)</label>
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>Preferred run days</legend>
        <div class="chip-row" id="run-day-chips">${dayChecks}</div>
      </fieldset>
      <fieldset class="field" id="strength-schedule-field">
        <legend>Strength days per week</legend>
        <div class="radio-row">
          <label><input type="radio" name="strengthDays" value="1" checked> 1 day (recommended)</label>
          <label><input type="radio" name="strengthDays" value="2"> 2 days</label>
        </div>
      </fieldset>
      <fieldset class="field" id="strength-days-field">
        <legend>Strength days (not on run days)</legend>
        <div class="chip-row" id="strength-day-chips">${strengthDayChips(defaultRun, defaultStrength, 1)}</div>
      </fieldset>
      <fieldset class="field" id="five-k-level-field">
        <legend>Current level (5K track)</legend>
        <div class="radio-row">
          <label><input type="radio" name="level" value="walk30" checked> I can walk 30 minutes</label>
          <label><input type="radio" name="level" value="jogLittle"> I can jog a little</label>
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>Equipment available</legend>
        <div class="chip-row" id="equipment-chips">${equipmentChecks([], "5k")}</div>
      </fieldset>
      <fieldset class="field" id="pushup-test-field">
        <legend>Level test</legend>
        <label class="field">
          <span>How many <strong>floor push-ups</strong> (full, from the toes, no knees) can you do in a row with good form?</span>
          <input name="pushups" type="number" min="0" max="100" value="5" inputmode="numeric" required>
        </label>
        <p class="muted" id="strength-level-preview">Strength level: Beginner (under 8 push-ups)</p>
      </fieldset>
      <fieldset class="field hidden" id="half-base-field">
        <legend>Running base (half marathon)</legend>
        <p class="muted">Answer honestly — this picks your <strong>run</strong> plan length. Push-ups pick your strength progression.</p>
        <label class="check-row">
          <input type="checkbox" name="base3x4" id="base3x4">
          <span>I have been running about <strong>3 days per week</strong> for at least the <strong>last 4 weeks</strong>.</span>
        </label>
        <label class="check-row">
          <input type="checkbox" name="base4mi" id="base4mi">
          <span>I have done a run of at least <strong>4 mi (6.4 km)</strong> in the past month.</span>
        </label>
        <label class="check-row">
          <input type="checkbox" name="base30cont" id="base30cont">
          <span>I can run <strong>30–40 minutes continuously</strong> at easy effort (full sentences).</span>
        </label>
        <fieldset class="field">
          <legend>Minimum readiness</legend>
          <div class="radio-row">
            <label><input type="radio" name="base30rw" value="yes" checked> I can complete <strong>30 minutes</strong> of easy running or run-walk (e.g. 4 min run / 1 min walk)</label>
            <label><input type="radio" name="base30rw" value="no"> I cannot yet do 30 minutes of run-walk</label>
          </div>
        </fieldset>
        <div class="card card-note hidden" id="half-recommend-card">
          <p>Finish the 5K track in this app first, then return to the half marathon goal.</p>
          <button type="button" class="btn btn-secondary btn-block" id="switch-to-5k">Switch to 5K goal</button>
        </div>
        <p class="muted" id="half-plan-preview"></p>
      </fieldset>
      <details class="card card-note hidden" id="half-disclaimer-details">
        <summary>Medical disclaimer (required reading)</summary>
        <p class="disclaimer-text">${COACH_DISCLAIMER}</p>
      </details>
      <label class="field" id="race-date-field">
        <span>Race day (optional — sets your start date backward)</span>
        <input name="race" type="date" value="">
      </label>
      <label class="field">
        <span>Start date</span>
        <input name="start" type="date" value="${today}" required>
      </label>
      <button type="submit" class="btn btn-primary btn-block">Build my plan</button>
    </form>
    `,
    { showNav: false, title: "Doing a 5K" }
  );
}

function getRunDaysFromForm(form) {
  return [...form.querySelectorAll('input[name="day"]:checked')].map((el) => Number(el.value));
}

function refreshStrengthChips(form) {
  const runDays = getRunDaysFromForm(form);
  const spd = Number(form.querySelector('input[name="strengthDays"]:checked')?.value || 1);
  const prev = [...form.querySelectorAll('input[name="strengthDay"]:checked')].map((el) => Number(el.value));
  let selected = prev.filter((d) => !runDays.includes(d));
  if (selected.length < spd) {
    selected = defaultStrengthDays(runDays, spd);
  } else {
    selected = selected.slice(0, spd);
  }
  const el = $("#strength-day-chips", form);
  if (el) el.innerHTML = strengthDayChips(runDays, selected, spd);
}

function getEquipmentFromForm(form, goal) {
  if (goal === "half") {
    const val = form.querySelector('input[name="equipmentHalf"]:checked')?.value || "none";
    return [val];
  }
  const picked = [...form.querySelectorAll('input[name="equipment"]:checked')].map((el) => el.value);
  if (!picked.length) return ["bodyweight"];
  if (picked.includes("bodyweight") && picked.length > 1) {
    return picked.filter((v) => v !== "bodyweight");
  }
  return picked;
}

function getRunningBaseFromForm(form) {
  return {
    threePerWeek4Weeks: Boolean(form.querySelector('[name="base3x4"]')?.checked),
    recent4Mi: Boolean(form.querySelector('[name="base4mi"]')?.checked),
    continuous30_40: Boolean(form.querySelector('[name="base30cont"]')?.checked),
    can30RunWalk: form.querySelector('[name="base30rw"]:checked')?.value === "yes",
  };
}

function updateHalfPlanPreview(form) {
  const pushups = Number(form.querySelector('input[name="pushups"]')?.value ?? 0);
  const base = getRunningBaseFromForm(form);
  const placement = resolveHalfPlacement(pushups, base);
  const el = $("#half-plan-preview", form);
  if (!el) return;
  if (!base.can30RunWalk) {
    el.textContent = "";
    return;
  }
  if (placement.runLevel === "average") {
    el.textContent =
      "Your assignment: 12-week Average run plan + Average strength (push-ups 8+ and running base met).";
  } else if (placement.strengthLevel === "average") {
    el.textContent =
      "Your assignment: 16-week Beginner run plan + Average strength (push-ups 8+ but running base not fully met).";
  } else {
    el.textContent = "Your assignment: 16-week Beginner run plan + Beginner strength.";
  }
}

function updatePushupPreview(form) {
  const n = Number(form.querySelector('input[name="pushups"]')?.value ?? 0);
  const level = strengthLevelFromPushUps(n);
  const el = $("#strength-level-preview", form);
  if (el) {
    el.textContent =
      level === "average"
        ? "Strength level: Average (8 or more push-ups)"
        : "Strength level: Beginner (under 8 push-ups)";
  }
}

function syncOnboardingGoal(form) {
  const goal = form.querySelector('input[name="goal"]:checked')?.value || "5k";
  const isHalf = goal === "half";
  $("#five-k-level-field", form)?.classList.toggle("hidden", isHalf);
  $("#half-base-field", form)?.classList.toggle("hidden", !isHalf);
  $("#half-disclaimer-details", form)?.classList.toggle("hidden", !isHalf);
  $("#days-5k-row", form)?.classList.toggle("hidden", isHalf);
  $("#days-half-row", form)?.classList.toggle("hidden", !isHalf);
  $("#strength-schedule-field", form)?.classList.toggle("hidden", isHalf);
  $("#strength-days-field", form)?.classList.toggle("hidden", isHalf);
  const eq = $("#equipment-chips", form);
  if (eq) eq.innerHTML = equipmentChecks([], goal);
  const base30 = form.querySelector('[name="base30rw"]:checked')?.value;
  $("#half-recommend-card", form)?.classList.toggle("hidden", !isHalf || base30 !== "no");
  if (isHalf) updateHalfPlanPreview(form);
  refreshStrengthChips(form);
}

function bindOnboarding() {
  const form = $("#onboard-form");
  syncOnboardingGoal(form);
  updatePushupPreview(form);
  form?.querySelector('input[name="pushups"]')?.addEventListener("input", () => updatePushupPreview(form));
  form?.addEventListener("change", (e) => {
    if (
      e.target.name === "goal" ||
      e.target.name === "base30rw" ||
      e.target.name === "base3x4" ||
      e.target.name === "base4mi" ||
      e.target.name === "base30cont"
    ) {
      syncOnboardingGoal(form);
    }
    if (e.target.name === "pushups") {
      updatePushupPreview(form);
      updateHalfPlanPreview(form);
    }
    if (e.target.name === "day" || e.target.name === "days" || e.target.name === "daysHalf" || e.target.name === "strengthDays") {
      refreshStrengthChips(form);
    }
    if (e.target.name === "race") {
      const race = form.querySelector('input[name="race"]')?.value;
      const goal = form.querySelector('input[name="goal"]:checked')?.value || "5k";
      const pushups = Number(form.querySelector('input[name="pushups"]')?.value ?? 0);
      const runLevel =
        goal === "half"
          ? resolveHalfPlacement(pushups, getRunningBaseFromForm(form)).runLevel
          : null;
      if (race) {
        const days =
          goal === "half"
            ? Number(form.querySelector('input[name="daysHalf"]:checked')?.value || 3)
            : Number(form.querySelector('input[name="days"]:checked')?.value || 3);
        const weeks =
          goal === "half" ? weeksForHalfPlan(runLevel || "beginner") : weeksForDaysPerWeek(days);
        form.querySelector('input[name="start"]').value = startDateFromRace(race, weeks);
      }
    }
  });
  $("#switch-to-5k", form)?.addEventListener("click", () => {
    form.querySelector('input[name="goal"][value="5k"]').checked = true;
    const rw = form.querySelector('input[name="base30rw"][value="yes"]');
    if (rw) rw.checked = true;
    syncOnboardingGoal(form);
  });
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const goal = fd.get("goal") || "5k";
    const pushups = Number(fd.get("pushups"));
    const runningBase = getRunningBaseFromForm(form);
    let runLevel = "beginner";
    let strengthLevel = strengthLevelFromPushUps(pushups);
    if (goal === "half") {
      if (!runningBase.can30RunWalk) {
        alert("Finish the 5K track first — you need at least 30 minutes of run-walk.");
        return;
      }
      const placement = resolveHalfPlacement(pushups, runningBase);
      runLevel = placement.runLevel;
      strengthLevel = placement.strengthLevel;
    }
    const days =
      goal === "half" ? Number(fd.get("daysHalf") || 3) : Number(fd.get("days"));
    let strengthDaysPerWeek = Number(fd.get("strengthDays"));
    const level = fd.get("level") || "walk30";
    let startDateISO = fd.get("start");
    const raceDateISO = fd.get("race") || "";
    const name = String(fd.get("name") || "").trim();
    const equipment = getEquipmentFromForm(form, goal);
    const preferredDays = getRunDaysFromForm(form);
    let strengthPreferredDays = [...form.querySelectorAll('input[name="strengthDay"]:checked')].map((el) =>
      Number(el.value)
    );
    if (goal === "half") {
      strengthDaysPerWeek = 2;
      strengthPreferredDays = defaultStrengthDays(preferredDays.slice(0, days), 2);
    }
    if (preferredDays.length < days) {
      alert(`Pick at least ${days} run days.`);
      return;
    }
    if (goal !== "half" && strengthPreferredDays.length < strengthDaysPerWeek) {
      alert(`Pick ${strengthDaysPerWeek} strength day(s) on non-run days.`);
      return;
    }
    if (
      goal !== "half" &&
      !strengthDaysValid(preferredDays.slice(0, days), strengthPreferredDays)
    ) {
      alert("Strength days must be on different days than your run days.");
      return;
    }
    const units = "mi";
    if (raceDateISO) {
      const weeks =
        goal === "half" ? weeksForHalfPlan(runLevel) : weeksForDaysPerWeek(days);
      startDateISO = startDateFromRace(raceDateISO, weeks);
    }
    const plan = buildPlan({
      goal,
      daysPerWeek: days,
      level,
      runLevel,
      strengthLevel,
      preferredDays: preferredDays.slice(0, days),
      startDateISO,
      raceDateISO,
      name,
      strengthDaysPerWeek,
      strengthPreferredDays: strengthPreferredDays.slice(0, strengthDaysPerWeek),
      equipment,
      units,
      pushups,
      runningBase: goal === "half" ? runningBase : null,
    });
    setState({
      ...plan,
      completed: [],
      strengthCompleted: [],
      settings: { voice: true, units },
    });
    location.hash = "today";
    route();
  });
}

function renderToday() {
  const workout = nextWorkout(state);
  const meta = state.meta;
  const greeting = meta.name ? `Hi, ${meta.name}` : "Your next session";
  const weekIndex = workout?.weekIndex ?? 0;
  const strengthSessions = strengthForWeek(state, weekIndex).filter((s) => !isStrengthComplete(state, s.id));

  let runCard = "";
  if (!workout) {
    const doneMsg =
      meta.goal === "half"
        ? `You finished all ${meta.totalSessions} run sessions. Celebrate your half marathon.`
        : `You finished all ${meta.totalSessions} run sessions. Celebrate your first 5K.`;
    runCard = `<div class="card card-celebrate">
        <h2>You did it!</h2>
        <p>${doneMsg}</p>
        <a class="btn btn-primary btn-block" href="#progress">See your progress</a>
      </div>`;
  } else {
    const when = scheduledDateForWorkout(meta.startDateISO, workout, state.workouts, meta.daysPerWeek);
    const total = formatDuration(workoutTotalSeconds(workout));
    runCard = `
    <div class="card today-card">
      <p class="today-date">${formatDate(when)}</p>
      <h2 class="today-title">${workout.title}</h2>
      <p class="today-summary">${workout.summary}</p>
      <p class="today-meta">${total} total · Week ${workout.weekIndex + 1} of ${meta.weeks}</p>
      <button type="button" id="start-workout" class="btn btn-primary btn-block btn-start">Start run</button>
    </div>`;
  }

  const strengthCards = strengthSessions
    .map(
      (s) => `
    <div class="card today-card today-card--strength">
      <span class="strength-badge" aria-hidden="true">💪</span>
      <h2 class="today-title">${s.title}</h2>
      <p class="today-summary">${s.summary}</p>
      <p class="today-meta">${DAY_NAMES[s.weekday]} · Optional · Week ${s.weekIndex + 1}</p>
      <button type="button" class="btn btn-secondary btn-block btn-start-strength" data-strength-id="${s.id}">Start strength</button>
    </div>`
    )
    .join("");

  return shell(
    `
    <p class="today-greet">${greeting}</p>
    ${runCard}
    ${strengthCards ? `<h2 class="section-mini">Strength this week</h2>${strengthCards}` : ""}
    ${state.repeatWeekBanner != null ? `<p class="banner">You chose to repeat week ${state.repeatWeekBanner + 1}. Take it at your pace.</p>` : ""}
    `,
    { title: "Today" }
  );
}

function bindToday() {
  $("#start-workout")?.addEventListener("click", () => {
    const w = nextWorkout(state);
    if (!w) return;
    activeWorkoutId = w.id;
    activeSessionKind = "run";
    location.hash = "workout";
  });
  document.querySelectorAll(".btn-start-strength").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeWorkoutId = btn.dataset.strengthId;
      activeSessionKind = "strength";
      location.hash = "strength-overview";
    });
  });
}

function stepsForWorkout(workout) {
  if (!E2E) return workout.steps;
  return [
    { type: "walk", label: "Warm-up walk", durationSeconds: 2 },
    { type: "run", label: "Easy jog", durationSeconds: 2 },
    { type: "walk", label: "Cool-down walk", durationSeconds: 2 },
  ];
}

function stepsForStrength(workout) {
  if (!E2E) return workout.steps;
  return [
    { mode: "timed", label: "March", durationSeconds: 2, voiceCue: "March." },
    { mode: "rest", label: "Rest", durationSeconds: 2, voiceCue: "Rest" },
    { mode: "timed", label: "Stretch", durationSeconds: 2, voiceCue: "Stretch" },
  ];
}

function renderWorkout() {
  const workout = state.workouts.find((w) => w.id === activeWorkoutId) || nextWorkout(state);
  if (!workout) {
    location.hash = "today";
    return "";
  }
  activeWorkoutId = workout.id;
  const steps = stepsForWorkout(workout);
  const stepList = steps
    .map(
      (s, i) =>
        `<li class="step-preview ${i === 0 ? "is-current" : ""}" data-step="${i}">${s.label} · ${formatDuration(s.durationSeconds)}${s.effort ? ` · ${s.effort}` : ""}</li>`
    )
    .join("");

  return shell(
    `
    <div class="card timer-card">
      <p class="timer-phase" id="timer-phase">${steps[0].label}</p>
      <p class="timer-countdown" id="timer-countdown" aria-live="polite">${formatDuration(steps[0].durationSeconds)}</p>
      <p class="timer-next">Next: <span id="timer-next">${steps[1]?.label ?? "Finish"}</span></p>
      <div class="progress-bar" aria-hidden="true"><div class="progress-fill" id="timer-progress" style="width:0%"></div></div>
      <ul class="step-list">${stepList}</ul>
      <div class="timer-actions">
        <button type="button" class="btn btn-secondary" id="timer-pause">Pause</button>
        <button type="button" class="btn btn-secondary" id="timer-skip">Skip step</button>
        <button type="button" class="btn btn-small" id="timer-exit">Exit</button>
      </div>
    </div>
    `,
    { showNav: false, title: "Run workout" }
  );
}

function bindWorkout() {
  const workout = state.workouts.find((w) => w.id === activeWorkoutId);
  const steps = stepsForWorkout(workout);
  const voice = getSettings(state).voice;

  activeTimer?.stop();
  activeTimer = new WorkoutTimer({
    steps,
    onTick: ({ step, remainingSeconds, overallProgress, stepIndex }) => {
      $("#timer-phase").textContent = step.label;
      $("#timer-countdown").textContent = formatDuration(remainingSeconds);
      $("#timer-progress").style.width = `${overallProgress * 100}%`;
      document.querySelectorAll(".step-preview").forEach((el, i) => {
        el.classList.toggle("is-current", i === stepIndex);
      });
      const next = steps[stepIndex + 1];
      $("#timer-next").textContent = next?.label ?? "Finish";
    },
    onStepChange: (idx) => {
      document.querySelectorAll(".step-preview").forEach((el, i) => {
        el.classList.toggle("is-current", i === idx);
      });
    },
    onComplete: () => {
      location.hash = "complete";
    },
    onCue: (kind) => {
      speak(SPEECH_CUES[kind] || "", voice);
    },
  });

  activeTimer.start();

  let paused = false;
  $("#timer-pause")?.addEventListener("click", () => {
    if (paused) {
      activeTimer.resume();
      $("#timer-pause").textContent = "Pause";
      paused = false;
    } else {
      activeTimer.pause();
      $("#timer-pause").textContent = "Resume";
      paused = true;
    }
  });
  $("#timer-skip")?.addEventListener("click", () => activeTimer.skipStep());
  $("#timer-exit")?.addEventListener("click", () => {
    activeTimer.stop();
    location.hash = "today";
  });
}

function renderStrengthOverview() {
  const workout = (state.strengthWorkouts || []).find((w) => w.id === activeWorkoutId);
  if (!workout) {
    location.hash = "today";
    return "";
  }
  const overview = strengthSessionOverview(workout);
  const circuitItems = overview.circuit
    .map(
      (ex, i) => `
      <li class="strength-exercise-item">
        <button type="button" class="strength-exercise-btn" aria-expanded="false" aria-controls="strength-ex-detail-${i}" id="strength-ex-btn-${i}">
          <span class="strength-exercise-name">${ex.label}</span>
          <span class="strength-exercise-amount">${ex.amount}</span>
        </button>
        <div class="strength-exercise-detail" id="strength-ex-detail-${i}" hidden>
          <p>${ex.description}</p>
          <p><strong>Easier:</strong> ${ex.easier}</p>
          <p><strong>Harder:</strong> ${ex.harder}</p>
        </div>
      </li>`
    )
    .join("");

  return shell(
    `
    <div class="card strength-overview-card">
      <span class="strength-badge strength-badge--large" aria-hidden="true">💪</span>
      <h2>${workout.title}</h2>
      <p class="strength-overview-meta">${halfEquipmentLabel(state.meta)} · about 15–20 min · ${overview.phaseLabel} phase</p>
      <div class="strength-outline">
        <p class="strength-outline-block"><strong>Warm-up</strong> · 3 min</p>
        <div class="strength-outline-block">
          <p><strong>Circuit</strong> · ${overview.rounds} rounds</p>
          <ul class="strength-preview-list">${circuitItems}</ul>
          <p class="strength-rest-note">${overview.restSeconds}s rest between exercises</p>
        </div>
        <p class="strength-outline-block"><strong>Cool-down stretch</strong> · 2 min</p>
      </div>
      <button type="button" id="begin-strength" class="btn btn-primary btn-block btn-start">Begin session</button>
      <button type="button" id="back-today" class="btn btn-small btn-block">Back</button>
    </div>
    `,
    {
      showNav: false,
      title: "Strength",
      extraFooter:
        "Stop if you feel sharp pain. Lower-back moves should feel like gentle work, never pain.",
    }
  );
}

function bindStrengthOverview() {
  document.querySelectorAll(".strength-exercise-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = document.getElementById(btn.getAttribute("aria-controls"));
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      if (panel) panel.hidden = open;
      btn.classList.toggle("is-open", !open);
    });
  });
  $("#begin-strength")?.addEventListener("click", () => {
    location.hash = "strength-workout";
  });
  $("#back-today")?.addEventListener("click", () => {
    location.hash = "today";
  });
}

function renderStrengthWorkout() {
  const workout = (state.strengthWorkouts || []).find((w) => w.id === activeWorkoutId);
  if (!workout) {
    location.hash = "today";
    return "";
  }
  const steps = stepsForStrength(workout);
  const step = steps[0];
  const countdown =
    step.mode === "reps" ? `${step.reps} reps` : formatDuration(step.durationSeconds);

  return shell(
    `
    <div class="card timer-card timer-card--strength">
      <p class="timer-phase" id="timer-phase">${step.label}</p>
      <p class="timer-desc" id="timer-desc">${step.description || ""}</p>
      <p class="timer-countdown" id="timer-countdown" aria-live="polite">${countdown}</p>
      <p class="timer-variant muted" id="timer-variant"></p>
      <p class="timer-next">Next: <span id="timer-next">${steps[1]?.label ?? "Finish"}</span></p>
      <div class="progress-bar" aria-hidden="true"><div class="progress-fill progress-fill--strength" id="timer-progress" style="width:0%"></div></div>
      <div class="timer-actions">
        <button type="button" class="btn btn-primary" id="strength-done" hidden>Done</button>
        <button type="button" class="btn btn-secondary" id="timer-pause">Pause</button>
        <button type="button" class="btn btn-secondary" id="timer-skip">Skip</button>
        <button type="button" class="btn btn-small" id="timer-exit">Exit</button>
      </div>
    </div>
    `,
    {
      showNav: false,
      title: "Strength",
      extraFooter:
        "Stop if you feel sharp pain. Lower-back moves should feel like gentle work, never pain.",
    }
  );
}

function bindStrengthWorkout() {
  const workout = (state.strengthWorkouts || []).find((w) => w.id === activeWorkoutId);
  const steps = stepsForStrength(workout);
  const voice = getSettings(state).voice;

  const updateUi = ({ step, remainingSeconds, overallProgress, stepIndex }) => {
    $("#timer-phase").textContent = step.label;
    $("#timer-desc").textContent = step.description || (step.mode === "rest" ? "Breathe and reset." : "");
    const doneBtn = $("#strength-done");
    if (step.mode === "reps") {
      $("#timer-countdown").textContent = `${step.reps} reps`;
      doneBtn.hidden = false;
    } else {
      $("#timer-countdown").textContent = formatDuration(Math.max(0, remainingSeconds ?? step.durationSeconds));
      doneBtn.hidden = true;
    }
    if (step.easier && step.harder) {
      $("#timer-variant").textContent = `Easier: ${step.easier} · Harder: ${step.harder}`;
    } else {
      $("#timer-variant").textContent = "";
    }
    $("#timer-progress").style.width = `${(overallProgress || 0) * 100}%`;
    const next = steps[stepIndex + 1];
    $("#timer-next").textContent = next?.label ?? "Finish";
  };

  activeTimer?.stop();
  activeTimer = new StrengthTimer({
    steps,
    onTick: updateUi,
    onComplete: () => {
      location.hash = "strength-complete";
    },
    onCue: (kind, text) => {
      if (kind === "custom") speak(text, voice);
      else if (kind === "complete") speak("Strength session complete. Well done.", voice);
      else if (kind === "halfway") speak("Halfway.", voice);
    },
  });

  activeTimer.start();
  updateUi({
    step: steps[0],
    stepIndex: 0,
    remainingSeconds: steps[0].durationSeconds,
    overallProgress: 0,
  });

  let paused = false;
  $("#timer-pause")?.addEventListener("click", () => {
    if (paused) {
      activeTimer.resume();
      $("#timer-pause").textContent = "Pause";
      paused = false;
    } else {
      activeTimer.pause();
      $("#timer-pause").textContent = "Resume";
      paused = true;
    }
  });
  $("#strength-done")?.addEventListener("click", () => activeTimer.completeRepStep());
  $("#timer-skip")?.addEventListener("click", () => activeTimer.skipStep());
  $("#timer-exit")?.addEventListener("click", () => {
    activeTimer.stop();
    location.hash = "today";
  });
}

function renderComplete() {
  const workout = state.workouts.find((w) => w.id === activeWorkoutId);
  return shell(
    `
    <div class="card">
      <h2>Nice work!</h2>
      <p>${workout?.title ?? "Session"} is marked when you save below.</p>
      <form id="complete-form">
        <fieldset class="field">
          <legend>How did it feel?</legend>
          <div class="radio-row">
            <label><input type="radio" name="feel" value="easy"> Easy</label>
            <label><input type="radio" name="feel" value="ok" checked> OK</label>
            <label><input type="radio" name="feel" value="hard"> Hard</label>
          </div>
        </fieldset>
        <label class="field">
          <span>Notes (optional)</span>
          <textarea name="notes" rows="3" placeholder="How was the weather? How did your legs feel?"></textarea>
        </label>
        <label class="check-row">
          <input type="checkbox" name="repeat" id="repeat-week">
          <span>Repeat this week (if it felt too hard)</span>
        </label>
        <button type="submit" class="btn btn-primary btn-block">Save &amp; continue</button>
      </form>
    </div>
    `,
    { showNav: false, title: "Complete" }
  );
}

function bindComplete() {
  $("#complete-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    let next = markWorkoutComplete(state, activeWorkoutId, {
      feel: fd.get("feel"),
      notes: fd.get("notes"),
    });
    if (fd.get("repeat") === "on") {
      const w = state.workouts.find((x) => x.id === activeWorkoutId);
      if (w) next = repeatWeek(next, w.weekIndex);
    } else {
      next = { ...next, repeatWeekBanner: undefined };
    }
    setState(next);
    activeWorkoutId = null;
    location.hash = "today";
  });
}

function renderStrengthComplete() {
  const workout = (state.strengthWorkouts || []).find((w) => w.id === activeWorkoutId);
  return shell(
    `
    <div class="card">
      <h2>Strength saved?</h2>
      <p>${workout?.title ?? "Session"} — optional, but great for your running legs.</p>
      <form id="strength-complete-form">
        <button type="submit" class="btn btn-primary btn-block">Mark complete</button>
        <button type="button" id="skip-strength-save" class="btn btn-secondary btn-block">Skip saving</button>
      </form>
    </div>
    `,
    { showNav: false, title: "Complete" }
  );
}

function bindStrengthComplete() {
  $("#strength-complete-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    setState(markStrengthComplete(state, activeWorkoutId, {}));
    activeWorkoutId = null;
    location.hash = "today";
  });
  $("#skip-strength-save")?.addEventListener("click", () => {
    activeWorkoutId = null;
    location.hash = "today";
  });
}

function daysUntilRace(meta) {
  if (!meta.raceDateISO) return null;
  const race = parseDateOnly(meta.raceDateISO);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  race.setHours(0, 0, 0, 0);
  return Math.round((race - today) / (24 * 60 * 60 * 1000));
}

function goalLabel(meta) {
  if (meta.goal === "half") {
    const rl = meta.runLevel === "average" ? "Average" : "Beginner";
    return `Half marathon (${formatRaceDistance(meta.units || "mi")}) · ${rl} run`;
  }
  return "5K";
}

function halfEquipmentLabel(meta) {
  if (meta.goal === "half") return coachEquipmentSummary(meta.equipment);
  return equipmentSummary(meta.equipment);
}

function renderPlan() {
  const meta = state.meta;
  const weeks = meta.weeks;
  const runDays = new Set(meta.preferredDays || []);
  const countdown = daysUntilRace(meta);
  const longRuns =
    state.longRunProgressionKm ||
    (meta.goal === "half"
      ? longRunProgressionKm(meta.runLevel || "beginner", meta.daysPerWeek)
      : null);
  const peakLong =
    longRuns?.length ? Math.max(...longRuns.slice(0, Math.max(0, weeks - 2))) : null;
  const effortRows = (COACH_EFFORT_GUIDE?.scale || [])
    .slice(0, 6)
    .map((r) => `<tr><td>${r.rpe}</td><td>${r.label}</td><td>${r.talk_test}</td></tr>`)
    .join("");
  const coachExtras =
    meta.goal === "half"
      ? `<details class="plan-effort-guide"><summary>Effort guide (RPE + talk test)</summary>
      <table class="effort-table"><thead><tr><th>RPE</th><th>Feel</th><th>Talk test</th></tr></thead><tbody>${effortRows}</tbody></table>
      <p class="muted">${(COACH_EFFORT_GUIDE.notes || []).join(" ")}</p></details>
      <details><summary>Medical disclaimer</summary><p class="disclaimer-text">${state.coachMeta?.disclaimer || COACH_DISCLAIMER}</p></details>`
      : "";
  const overview = `
    <div class="card plan-overview-card">
      <h2>Your plan</h2>
      <p><strong>Goal:</strong> ${goalLabel(meta)}</p>
      <p><strong>Length:</strong> ${weeks} weeks · ${meta.daysPerWeek} run days / week · Strength ${meta.strengthLevel === "average" ? "Average" : "Beginner"}</p>
      <p><strong>Equipment:</strong> ${halfEquipmentLabel(meta)}</p>
      ${coachExtras}
      ${
        countdown != null
          ? `<p class="plan-countdown"><strong>Race countdown:</strong> ${countdown} day(s)${meta.raceDateISO ? ` · race ${meta.raceDateISO}` : ""}</p>`
          : `<p class="muted">Add a race day in Settings for a countdown.</p>`
      }
      ${
        peakLong && meta.goal === "half"
          ? `<p class="muted">Long run peaks around ${formatDistance(peakLong, meta.units || "mi")} with a 2-week taper.</p>`
          : ""
      }
    </div>`;
  let html = "";
  for (let w = 0; w < weeks; w++) {
    const runs = state.workouts
      .filter((x) => x.weekIndex === w)
      .map((workout) => {
        const done = isWorkoutComplete(state, workout.id);
        return `<li class="plan-item ${done ? "is-done" : ""}">
          <span class="plan-check plan-check--run" aria-hidden="true">${done ? "✓" : "🏃"}</span>
          <span>${workout.title}<br><small>${workout.summary}</small></span>
        </li>`;
      });
    const strengths = (state.strengthWorkouts || [])
      .filter((x) => x.weekIndex === w)
      .map((workout) => {
        const done = isStrengthComplete(state, workout.id);
        const onRun = runDays.has(workout.weekday);
        return `<li class="plan-item plan-item--strength ${done ? "is-done" : ""}" data-weekday="${workout.weekday}">
          <span class="plan-check plan-check--strength" aria-hidden="true">${done ? "✓" : "💪"}</span>
          <span>${workout.title}<br><small>${workout.summary}${onRun ? " · check schedule" : ""}</small></span>
        </li>`;
      });
    const items = [...runs, ...strengths].join("");
    const longNote =
      meta.goal === "half" && longRuns?.[w]
        ? ` · Long ${formatDistance(longRuns[w], meta.units || "mi")}`
        : "";
    html += `<section class="plan-week" data-week="${w + 1}"><h2>Week ${w + 1}${longNote}</h2><ul>${items}</ul></section>`;
  }
  return shell(`<div class="plan-scroll">${overview}${html}</div>`, { title: "Plan" });
}

function renderProgress() {
  const s = stats(state);
  const meta = state.meta;
  const programName = meta.goal === "half" ? "your half marathon plan" : "Doing a 5K";
  const finish = s.allDone
    ? `<div class="card card-celebrate"><h2>Finish line</h2><p>You completed ${programName} — ${meta.weeks} weeks, ${s.workoutsDone} runs${s.strengthDone ? ` and ${s.strengthDone} strength sessions` : ""}.</p></div>`
    : `<p class="muted">Keep going — your finish line is week ${meta.weeks}.</p>`;

  return shell(
    `
    <div class="stats-grid">
      <div class="stat"><span class="stat-num">${s.streak}</span><span class="stat-label">Day streak</span></div>
      <div class="stat"><span class="stat-num">${s.workoutsDone}</span><span class="stat-label">Runs done</span></div>
      <div class="stat"><span class="stat-num">${s.strengthDone}</span><span class="stat-label">Strength done</span></div>
    </div>
    <div class="stats-grid stats-grid--secondary">
      <div class="stat"><span class="stat-num">${s.totalMinutes}</span><span class="stat-label">Run minutes</span></div>
      <div class="stat"><span class="stat-num">${s.strengthMinutes}</span><span class="stat-label">Strength min (est.)</span></div>
      <div class="stat"><span class="stat-num">${s.totalStrength}</span><span class="stat-label">Strength planned</span></div>
    </div>
    ${finish}
    `,
    { title: "Progress" }
  );
}

function renderSettings() {
  const voice = getSettings(state).voice;
  const units = getSettings(state).units || "mi";
  const spd = state.meta.strengthDaysPerWeek ?? 1;
  const isHalf = state.meta.goal === "half";
  const dayOptions = isHalf
    ? `<label><input type="radio" name="sdays" value="3" ${state.meta.daysPerWeek === 3 ? "checked" : ""}> 3 / week</label>
        <label><input type="radio" name="sdays" value="4" ${state.meta.daysPerWeek === 4 ? "checked" : ""}> 4 / week</label>`
    : `<label><input type="radio" name="sdays" value="3" ${state.meta.daysPerWeek === 3 ? "checked" : ""}> 3 / week</label>
        <label><input type="radio" name="sdays" value="4" ${state.meta.daysPerWeek === 4 ? "checked" : ""}> 4 / week</label>
        <label><input type="radio" name="sdays" value="5" ${state.meta.daysPerWeek === 5 ? "checked" : ""}> 5 / week</label>`;
  return shell(
    `
    <div class="card settings-card">
      <h2>Goal</h2>
      <p>Current: <strong>${goalLabel(state.meta)}</strong></p>
      <div class="radio-row" id="goal-setting">
        <label><input type="radio" name="sgoal" value="5k" ${!isHalf ? "checked" : ""}> 5K</label>
        <label><input type="radio" name="sgoal" value="half" ${isHalf ? "checked" : ""}> Half marathon</label>
      </div>
      <button type="button" class="btn btn-secondary btn-block" id="apply-goal">Change goal (resets plan)</button>
    </div>
    <div class="card settings-card">
      <h2>Distance units</h2>
      <div class="radio-row" id="units-setting">
        <label><input type="radio" name="sunits" value="mi" ${units === "mi" ? "checked" : ""}> Miles</label>
        <label><input type="radio" name="sunits" value="km" ${units === "km" ? "checked" : ""}> Kilometers</label>
      </div>
      <button type="button" class="btn btn-secondary btn-block" id="apply-units">Save units</button>
    </div>
    <div class="card settings-card">
      <h2>Race day</h2>
      <label class="field">
        <span>Optional race date (countdown on Plan)</span>
        <input type="date" id="race-date-input" value="${state.meta.raceDateISO || ""}">
      </label>
      <button type="button" class="btn btn-secondary btn-block" id="apply-race">Save race date</button>
    </div>
    <div class="card settings-card">
      <h2>Run schedule</h2>
      <p>Change run days per week (re-plans from your current week onward).</p>
      <div class="radio-row" id="days-setting">
        ${dayOptions}
      </div>
      <button type="button" class="btn btn-secondary btn-block" id="apply-days">Apply &amp; re-plan runs</button>
    </div>
    <div class="card settings-card">
      <h2>Strength days per week</h2>
      <div class="radio-row" id="strength-setting">
        <label><input type="radio" name="sstrength" value="1" ${spd === 1 ? "checked" : ""}> 1 day</label>
        <label><input type="radio" name="sstrength" value="2" ${spd === 2 ? "checked" : ""}> 2 days</label>
      </div>
      <button type="button" class="btn btn-secondary btn-block" id="apply-strength">Update strength plan</button>
    </div>
    <div class="card settings-card">
      <label class="check-row">
        <input type="checkbox" id="voice-toggle" ${voice ? "checked" : ""}>
        <span>Spoken cues during workouts</span>
      </label>
    </div>
    <div class="card settings-card">
      <button type="button" class="btn btn-secondary btn-block" id="export-btn">Export data (JSON)</button>
      <button type="button" class="btn btn-secondary btn-block" id="reset-btn">Reset all data</button>
    </div>
    <div class="card settings-card refund-card">
      <h2>Refunds for Doing a 5K</h2>
      <p>You can request a full refund within 3 days (72 hours) of purchase by emailing <a href="mailto:coachsalimheyaime@gmail.com?subject=Refund+request">coachsalimheyaime@gmail.com</a>. After that, all sales are final. Refunds go to the original payment method.</p>
    </div>
    `,
    { title: "Settings" }
  );
}

function replanStrength(state, strengthDaysPerWeek) {
  const current = nextWorkout(state);
  const fromWeek = current?.weekIndex ?? 0;
  const runDays = state.meta.preferredDays;
  const strengthPreferredDays = defaultStrengthDays(runDays, strengthDaysPerWeek);
  const meta = {
    ...state.meta,
    strengthDaysPerWeek,
    strengthPreferredDays,
  };
  return replanFromWeek({ ...state, meta }, fromWeek);
}

function bindSettings() {
  $("#voice-toggle")?.addEventListener("change", (e) => {
    setState(updateSettings(state, { voice: e.target.checked }));
  });
  $("#export-btn")?.addEventListener("click", () => {
    const blob = new Blob([exportState()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "doing-a-5k-backup.json";
    a.click();
  });
  $("#reset-btn")?.addEventListener("click", () => {
    if (confirm("Delete all app data on this device? This cannot be undone.")) {
      resetState();
      state = null;
      location.hash = "onboarding";
      route();
    }
  });
  $("#apply-units")?.addEventListener("click", () => {
    const val = document.querySelector('#units-setting input[name="sunits"]:checked')?.value || "mi";
    setState(updateSettings(state, { units: val }));
    route();
  });
  $("#apply-race")?.addEventListener("click", () => {
    const raceDateISO = $("#race-date-input")?.value || "";
    let meta = { ...state.meta, raceDateISO };
    if (raceDateISO) {
      const weeks = meta.weeks;
      meta = { ...meta, startDateISO: startDateFromRace(raceDateISO, weeks) };
    }
    setState({ ...state, meta });
    route();
  });
  $("#apply-goal")?.addEventListener("click", () => {
    const goal = document.querySelector('#goal-setting input[name="sgoal"]:checked')?.value;
    if (!goal || goal === state.meta.goal) return;
    if (
      !confirm(
        "Changing goal will reset your plan and progress. Your name and settings stay. Continue?"
      )
    ) {
      return;
    }
    const meta = state.meta;
    const strengthLevel = meta.strengthLevel || "beginner";
    const runLevel = meta.runLevel || "beginner";
    const days = goal === "half" ? Math.min(4, meta.daysPerWeek) : meta.daysPerWeek;
    const plan = buildPlan({
      goal,
      daysPerWeek: days,
      level: meta.level || "walk30",
      runLevel: goal === "half" ? runLevel : undefined,
      strengthLevel,
      preferredDays: meta.preferredDays.slice(0, days),
      startDateISO: meta.startDateISO,
      raceDateISO: meta.raceDateISO || "",
      name: meta.name,
      strengthDaysPerWeek: goal === "half" ? 2 : meta.strengthDaysPerWeek ?? 1,
      strengthPreferredDays: meta.strengthPreferredDays,
      equipment: meta.equipment || (goal === "half" ? ["none"] : ["bodyweight"]),
      units: getSettings(state).units || "mi",
      pushups: meta.pushups ?? 5,
      runningBase: meta.runningBase,
    });
    setState({
      ...plan,
      completed: [],
      strengthCompleted: [],
      settings: getSettings(state),
    });
    location.hash = "today";
    route();
  });
  $("#apply-days")?.addEventListener("click", () => {
    const val = Number(document.querySelector('#days-setting input[name="sdays"]:checked')?.value);
    if (!val || val === state.meta.daysPerWeek) return;
    const current = nextWorkout(state);
    const fromWeek = current?.weekIndex ?? 0;
    let preferred = state.meta.preferredDays.slice(0, val);
    while (preferred.length < val) {
      preferred.push(defaultStrengthDays(preferred, 1)[0] ?? 0);
    }
    const meta = { ...state.meta, daysPerWeek: val, preferredDays: preferred };
    const replanned = replanFromWeek({ ...state, meta }, fromWeek);
    setState(replanned);
    const weekMsg =
      state.meta.goal === "half"
        ? `${replanned.meta.weeks} weeks`
        : `${weeksForDaysPerWeek(val)} weeks`;
    alert(`Plan updated: ${weekMsg} at ${val} run days per week.`);
    route();
  });
  $("#apply-strength")?.addEventListener("click", () => {
    const val = Number(document.querySelector('#strength-setting input[name="sstrength"]:checked')?.value);
    if (!val || val === (state.meta.strengthDaysPerWeek ?? 1)) return;
    setState(replanStrength(state, val));
    alert(`Strength plan updated: ${val} day(s) per week on non-run days.`);
    route();
  });
}

init();

function startWorkoutById(workoutId) {
  activeWorkoutId = workoutId;
  activeSessionKind = "run";
  location.hash = "workout";
  route();
}

window.__doingA5K = {
  buildPlan,
  weeksForDaysPerWeek,
  weeksForHalfPlan,
  longRunProgressionKm,
  strengthLevelFromPushUps,
  resolveHalfPlacement,
  loadState,
  resetState,
  nextWorkout,
  defaultStrengthDays,
  strengthDaysValid,
  startWorkoutById,
};
