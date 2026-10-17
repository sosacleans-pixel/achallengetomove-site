import {
  generatePlan,
  replanFromWeek,
  scheduledDateForWorkout,
  formatDate,
  formatDuration,
  workoutTotalSeconds,
  weeksForDaysPerWeek,
  DAY_NAMES,
} from "./plan.js";
import { defaultStrengthDays, strengthDaysValid, strengthSessionOverview } from "./strength.js";
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
    <p class="app-tagline">Go from walking to your first 5K in 8 to 12 weeks.</p>
    <form id="onboard-form" class="card">
      <label class="field">
        <span>Your name (optional)</span>
        <input name="name" type="text" autocomplete="name" placeholder="Alex">
      </label>
      <fieldset class="field">
        <legend>Run days per week</legend>
        <div class="radio-row">
          <label><input type="radio" name="days" value="3" checked> 3 days (12 weeks)</label>
          <label><input type="radio" name="days" value="4"> 4 days (10 weeks)</label>
          <label><input type="radio" name="days" value="5"> 5 days (8 weeks)</label>
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>Preferred run days</legend>
        <div class="chip-row" id="run-day-chips">${dayChecks}</div>
      </fieldset>
      <fieldset class="field">
        <legend>Strength days per week</legend>
        <div class="radio-row">
          <label><input type="radio" name="strengthDays" value="1" checked> 1 day (recommended)</label>
          <label><input type="radio" name="strengthDays" value="2"> 2 days</label>
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>Strength days (not on run days)</legend>
        <div class="chip-row" id="strength-day-chips">${strengthDayChips(defaultRun, defaultStrength, 1)}</div>
      </fieldset>
      <fieldset class="field">
        <legend>Current level</legend>
        <div class="radio-row">
          <label><input type="radio" name="level" value="walk30" checked> I can walk 30 minutes</label>
          <label><input type="radio" name="level" value="jogLittle"> I can jog a little</label>
        </div>
      </fieldset>
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

function bindOnboarding() {
  const form = $("#onboard-form");
  form?.addEventListener("change", (e) => {
    if (e.target.name === "day" || e.target.name === "days" || e.target.name === "strengthDays") {
      refreshStrengthChips(form);
    }
  });
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const days = Number(fd.get("days"));
    const strengthDaysPerWeek = Number(fd.get("strengthDays"));
    const level = fd.get("level");
    const startDateISO = fd.get("start");
    const name = String(fd.get("name") || "").trim();
    const preferredDays = getRunDaysFromForm(form);
    const strengthPreferredDays = [...form.querySelectorAll('input[name="strengthDay"]:checked')].map((el) =>
      Number(el.value)
    );
    if (preferredDays.length < days) {
      alert(`Pick at least ${days} run days.`);
      return;
    }
    if (strengthPreferredDays.length < strengthDaysPerWeek) {
      alert(`Pick ${strengthDaysPerWeek} strength day(s) on non-run days.`);
      return;
    }
    if (!strengthDaysValid(preferredDays.slice(0, days), strengthPreferredDays)) {
      alert("Strength days must be on different days than your run days.");
      return;
    }
    const plan = generatePlan({
      daysPerWeek: days,
      level,
      preferredDays: preferredDays.slice(0, days),
      startDateISO,
      name,
      strengthDaysPerWeek,
      strengthPreferredDays: strengthPreferredDays.slice(0, strengthDaysPerWeek),
    });
    setState({
      ...plan,
      completed: [],
      strengthCompleted: [],
      settings: { voice: true },
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
    runCard = `<div class="card card-celebrate">
        <h2>You did it!</h2>
        <p>You finished all ${meta.totalSessions} run sessions. Celebrate your first 5K.</p>
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
        `<li class="step-preview ${i === 0 ? "is-current" : ""}" data-step="${i}">${s.label} · ${formatDuration(s.durationSeconds)}</li>`
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
      <p class="strength-overview-meta">Bodyweight only · about 15–20 min · ${overview.phaseLabel} phase</p>
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

function renderPlan() {
  const weeks = state.meta.weeks;
  const runDays = new Set(state.meta.preferredDays || []);
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
    html += `<section class="plan-week" data-week="${w + 1}"><h2>Week ${w + 1}</h2><ul>${items}</ul></section>`;
  }
  return shell(`<div class="plan-scroll">${html}</div>`, { title: "Plan" });
}

function renderProgress() {
  const s = stats(state);
  const meta = state.meta;
  const finish = s.allDone
    ? `<div class="card card-celebrate"><h2>Finish line</h2><p>You completed Doing a 5K — ${meta.weeks} weeks, ${s.workoutsDone} runs${s.strengthDone ? ` and ${s.strengthDone} strength sessions` : ""}.</p></div>`
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
  const spd = state.meta.strengthDaysPerWeek ?? 1;
  return shell(
    `
    <div class="card settings-card">
      <h2>Run schedule</h2>
      <p>Change run days per week (re-plans from your current week onward).</p>
      <div class="radio-row" id="days-setting">
        <label><input type="radio" name="sdays" value="3" ${state.meta.daysPerWeek === 3 ? "checked" : ""}> 3 / week</label>
        <label><input type="radio" name="sdays" value="4" ${state.meta.daysPerWeek === 4 ? "checked" : ""}> 4 / week</label>
        <label><input type="radio" name="sdays" value="5" ${state.meta.daysPerWeek === 5 ? "checked" : ""}> 5 / week</label>
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
    alert(`Plan updated: ${weeksForDaysPerWeek(val)} weeks at ${val} run days per week.`);
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

window.__doingA5K = {
  generatePlan,
  weeksForDaysPerWeek,
  loadState,
  resetState,
  nextWorkout,
  defaultStrengthDays,
  strengthDaysValid,
};
