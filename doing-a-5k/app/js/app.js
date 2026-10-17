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
import {
  loadState,
  saveState,
  resetState,
  exportState,
  getSettings,
  updateSettings,
  markWorkoutComplete,
  isWorkoutComplete,
  repeatWeek,
  nextWorkout,
  stats,
} from "./storage.js";
import { WorkoutTimer, SPEECH_CUES } from "./timer.js";

const E2E = new URLSearchParams(location.search).has("e2e");

let state = loadState();
let activeTimer = null;
let activeWorkoutId = null;

const $ = (sel, root = document) => root.querySelector(sel);

function speak(text, enabled) {
  if (!enabled || !window.speechSynthesis) return;
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

function shell(content, { showNav = true, title = "Doing a 5K" } = {}) {
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
        <p class="safety-note"><strong>Safety:</strong> Check with a doctor before starting an exercise program. Stop if you feel pain, dizziness, or chest discomfort.</p>
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
    case "plan":
      root.innerHTML = renderPlan();
      bindNavOnly();
      break;
    case "progress":
      root.innerHTML = renderProgress();
      bindNavOnly();
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

function bindNavOnly() {}

function renderOnboarding() {
  const today = new Date().toISOString().slice(0, 10);
  const dayChecks = DAY_NAMES.map(
    (name, i) =>
      `<label class="chip"><input type="checkbox" name="day" value="${i}" ${[1, 3, 5].includes(i) ? "checked" : ""}> ${name}</label>`
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
        <legend>Training days per week</legend>
        <div class="radio-row">
          <label><input type="radio" name="days" value="3" checked> 3 days (12 weeks)</label>
          <label><input type="radio" name="days" value="4"> 4 days (10 weeks)</label>
          <label><input type="radio" name="days" value="5"> 5 days (8 weeks)</label>
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>Preferred training days</legend>
        <div class="chip-row">${dayChecks}</div>
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

function bindOnboarding() {
  const form = $("#onboard-form");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const days = Number(fd.get("days"));
    const level = fd.get("level");
    const startDateISO = fd.get("start");
    const name = String(fd.get("name") || "").trim();
    const preferredDays = [...form.querySelectorAll('input[name="day"]:checked')].map((el) =>
      Number(el.value)
    );
    if (preferredDays.length < days) {
      alert(`Pick at least ${days} training days.`);
      return;
    }
    const plan = generatePlan({
      daysPerWeek: days,
      level,
      preferredDays: preferredDays.slice(0, days),
      startDateISO,
      name,
    });
    setState({
      ...plan,
      completed: [],
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
  if (!workout) {
    return shell(
      `<div class="card card-celebrate">
        <h2>You did it!</h2>
        <p>You finished all ${meta.totalSessions} sessions of Doing a 5K. Celebrate your first 5K.</p>
        <a class="btn btn-primary btn-block" href="#progress">See your progress</a>
      </div>`,
      { title: "Today" }
    );
  }
  const when = scheduledDateForWorkout(meta.startDateISO, workout, state.workouts, meta.daysPerWeek);
  const total = formatDuration(workoutTotalSeconds(workout));
  return shell(
    `
    <p class="today-greet">${greeting}</p>
    <div class="card today-card">
      <p class="today-date">${formatDate(when)}</p>
      <h2 class="today-title">${workout.title}</h2>
      <p class="today-summary">${workout.summary}</p>
      <p class="today-meta">${total} total · Week ${workout.weekIndex + 1} of ${meta.weeks}</p>
      <button type="button" id="start-workout" class="btn btn-primary btn-block btn-start">Start</button>
    </div>
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
    location.hash = "workout";
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
    { showNav: false, title: "Workout" }
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

function renderPlan() {
  const weeks = state.meta.weeks;
  let html = "";
  for (let w = 0; w < weeks; w++) {
    const items = state.workouts
      .filter((x) => x.weekIndex === w)
      .map((workout) => {
        const done = isWorkoutComplete(state, workout.id);
        return `<li class="plan-item ${done ? "is-done" : ""}">
          <span class="plan-check" aria-hidden="true">${done ? "✓" : ""}</span>
          <span>${workout.title}<br><small>${workout.summary}</small></span>
        </li>`;
      })
      .join("");
    html += `<section class="plan-week"><h2>Week ${w + 1}</h2><ul>${items}</ul></section>`;
  }
  return shell(`<div class="plan-scroll">${html}</div>`, { title: "Plan" });
}

function renderProgress() {
  const s = stats(state);
  const meta = state.meta;
  const finish = s.allDone
    ? `<div class="card card-celebrate"><h2>Finish line</h2><p>You completed Doing a 5K — ${meta.weeks} weeks, ${s.workoutsDone} workouts. Your 5K day is in the books.</p></div>`
    : `<p class="muted">Keep going — your finish line is week ${meta.weeks}.</p>`;

  return shell(
    `
    <div class="stats-grid">
      <div class="stat"><span class="stat-num">${s.streak}</span><span class="stat-label">Day streak</span></div>
      <div class="stat"><span class="stat-num">${s.workoutsDone}</span><span class="stat-label">Workouts done</span></div>
      <div class="stat"><span class="stat-num">${s.totalMinutes}</span><span class="stat-label">Total minutes</span></div>
    </div>
    ${finish}
    `,
    { title: "Progress" }
  );
}

function renderSettings() {
  const voice = getSettings(state).voice;
  return shell(
    `
    <div class="card settings-card">
      <h2>Training schedule</h2>
      <p>Change days per week (re-plans from your current week onward).</p>
      <div class="radio-row" id="days-setting">
        <label><input type="radio" name="sdays" value="3" ${state.meta.daysPerWeek === 3 ? "checked" : ""}> 3 / week</label>
        <label><input type="radio" name="sdays" value="4" ${state.meta.daysPerWeek === 4 ? "checked" : ""}> 4 / week</label>
        <label><input type="radio" name="sdays" value="5" ${state.meta.daysPerWeek === 5 ? "checked" : ""}> 5 / week</label>
      </div>
      <button type="button" class="btn btn-secondary btn-block" id="apply-days">Apply &amp; re-plan</button>
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
    const meta = { ...state.meta, daysPerWeek: val };
    const temp = { ...state, meta };
    const replanned = replanFromWeek(
      { ...temp, meta: { ...meta, preferredDays: state.meta.preferredDays.slice(0, val) } },
      fromWeek
    );
    setState(replanned);
    alert(`Plan updated: ${weeksForDaysPerWeek(val)} weeks at ${val} days per week.`);
    route();
  });
}

init();

// Test hooks
window.__doingA5K = {
  generatePlan,
  weeksForDaysPerWeek,
  loadState,
  resetState,
  nextWorkout,
};
