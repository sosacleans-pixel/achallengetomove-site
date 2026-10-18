import {
  loadState,
  saveState,
  resetState,
  exportStateJson,
  createState,
  processDayLocks,
  confirmRestart,
  switchToAllIn,
  toggleTask,
  addWater,
  logWorkout,
  updateReading,
  updateCheckin,
  setPhotoRef,
  setRecoveryDone,
  updateSettings,
  updateAdaptive,
  setWeatherException,
  ensureDay,
  updateJourney,
  setStartDate,
  markDayClosed,
  honestyRestart,
  setDay0Photo,
  updateDay0,
  startKeepGoing,
  defaultAdaptive,
} from "./storage.js";
import {
  activeWorkDate,
  programDayNumber,
  isDateEditable,
  formatShortDate,
  dateKey,
  getClockNow,
  addDays,
} from "./dates.js";
import {
  taskListForMode,
  taskCompletion,
  dayFullyComplete,
  dayCompletionRatio,
  weekConsistency,
  currentStreak,
  defaultWaterTarget,
  dayHasWeatherException,
  isWorkoutDay,
} from "./tasks.js";
import { SUGGESTED_WORKOUTS, SEVEN_MIN_APP_URL, workoutOptionsHtml, findWorkout } from "./workouts.js";
import { compressImage, savePhotoThumb, getPhotoThumb } from "./photos.js";
import { programIntro, dailyRules, PREP_ITEMS, KEEP_GOING_HABITS, MILESTONE_DAYS } from "./rules.js";
import {
  programDayIndex,
  isProgramActive,
  isPrepDay,
  pendingMilestone,
  shouldShowWeeklyRecap,
  weekRecapStats,
  computeProgramStats,
  dateForProgramDay,
  dayClosed,
} from "./program.js";
import { renderCompletionCard } from "./completion-card.js";

let state = loadState();
let draftMode = null;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function commit(next, { skipLocks = false } = {}) {
  state = skipLocks ? next : processDayLocks(next);
  saveState(state);
  syncBranding();
  render();
}

function syncBranding() {
  const mode = state?.mode || "all-in";
  const prefix = mode === "adaptive" ? "75-adaptive" : "75-all-in";
  const title = mode === "adaptive" ? "75 Adaptive" : "75 All-In";
  const icon = $("#app-header-icon");
  const fav = $("#app-favicon");
  const apple = $("#app-apple-icon");
  const ht = $("#app-header-title");
  if (icon) icon.src = `./icons/${prefix}-192.png`;
  if (fav) fav.href = `./icons/${prefix}.svg`;
  if (apple) apple.href = `./icons/${prefix}-180.png`;
  if (ht) ht.textContent = title;
}

function toast(msg) {
  const host = $("#toast-host");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function routeParts() {
  const raw = location.hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean);
  return { view: parts[0] || "", sub: parts[1] || "" };
}

function navigate(path) {
  const hash = path.startsWith("#") ? path : `#/${path}`;
  if (location.hash !== hash) location.hash = hash;
  else render();
}

function workKey() {
  return activeWorkDate();
}

function waterIncrementMl() {
  return state?.settings?.units === "imperial" ? 237 : 250;
}

function formatWater(ml) {
  if (state?.settings?.units === "imperial") {
    return `${Math.round(ml / 29.5735)} oz`;
  }
  return `${Math.round(ml)} ml`;
}

function hideNav() {
  $("#bottom-nav")?.classList.add("hidden");
}

function showNav() {
  const nav = $("#bottom-nav");
  if (!nav) return;
  nav.classList.remove("hidden");
  const view = routeParts().view;
  const items = [
    ["today", "Today"],
    ["workout", "Workout"],
    ["water", "Water"],
    ["progress", "Progress"],
    ["settings", "Settings"],
  ];
  if (state?.mode === "all-in") items.splice(2, 0, ["photos", "Photos"]);
  nav.innerHTML = items
    .map(
      ([id, label]) =>
        `<a href="#/${id}" class="${view === id ? "is-active" : ""}" ${view === id ? 'aria-current="page"' : ""}>${label}</a>`
    )
    .join("");
}

function onboardingDone() {
  return !!state?.journey?.onboardingComplete;
}

function render() {
  const main = $("#app-main");
  if (!main) return;

  state = loadState();
  if (state) state = processDayLocks(state);
  if (state) saveState(state);

  if (state?.pendingRestart) {
    hideNav();
    main.innerHTML = renderRestart();
    bindRestart();
    return;
  }

  if (!state) {
    hideNav();
    if (routeParts().view === "setup-adaptive") {
      main.innerHTML = renderAdaptiveSetup();
      bindAdaptiveSetup();
      return;
    }
    main.innerHTML = renderPicker();
    bindPicker();
    return;
  }

  const { view, sub } = routeParts();

  if (!onboardingDone()) {
    hideNav();
    if (view === "setup-adaptive" || (draftMode === "adaptive" && !state)) {
      main.innerHTML = renderAdaptiveSetup();
      bindAdaptiveSetup();
      return;
    }
    const step = view.startsWith("onboarding") ? sub || state.journey.onboardingStep : state.journey.onboardingStep;
    switch (step || "intro") {
      case "intro":
        main.innerHTML = renderOnboardingIntro();
        bindOnboardingIntro();
        break;
      case "rules":
        main.innerHTML = renderOnboardingRules();
        bindOnboardingRules();
        break;
      case "commitment":
        main.innerHTML = renderOnboardingCommitment();
        bindOnboardingCommitment();
        break;
      case "start":
        main.innerHTML = renderOnboardingStart();
        bindOnboardingStart();
        break;
      case "day0":
        main.innerHTML = renderOnboardingDay0();
        bindOnboardingDay0();
        break;
      default:
        navigate("onboarding/intro");
    }
    return;
  }

  if (state.journey?.keepGoing?.active && view === "keep-going") {
    showNav();
    main.innerHTML = renderKeepGoing();
    bindKeepGoing();
    return;
  }

  if (view === "finish" || (programDayIndex(state.startDate, workKey()) >= 75 && dayClosed(state, dateForProgramDay(state.startDate, 75)) && !state.journey.finishSeen)) {
    hideNav();
    main.innerHTML = renderFinish();
    bindFinish();
    return;
  }

  if (view === "whats-next") {
    hideNav();
    main.innerHTML = renderWhatsNext();
    bindWhatsNext();
    return;
  }

  if (view === "milestone") {
    hideNav();
    main.innerHTML = renderMilestone();
    bindMilestone();
    return;
  }

  if (view === "weekly-recap") {
    hideNav();
    main.innerHTML = renderWeeklyRecap();
    bindWeeklyRecap();
    return;
  }

  if (view === "day-complete") {
    hideNav();
    main.innerHTML = renderDayComplete();
    bindDayComplete();
    return;
  }

  if (view === "honesty") {
    hideNav();
    main.innerHTML = renderHonesty();
    bindHonesty();
    return;
  }

  if (isPrepDay(state)) {
    hideNav();
    main.innerHTML = renderPrep();
    bindPrep();
    return;
  }

  showNav();

  switch (view) {
    case "picker":
      main.innerHTML = renderPicker();
      bindPicker();
      hideNav();
      break;
    case "setup-adaptive":
      main.innerHTML = renderAdaptiveSetup();
      bindAdaptiveSetup();
      hideNav();
      break;
    case "today":
      main.innerHTML = renderToday();
      bindToday();
      maybePromptDayClose();
      break;
    case "workout":
      main.innerHTML = renderWorkout();
      bindWorkout();
      break;
    case "water":
      main.innerHTML = renderWater();
      bindWater();
      break;
    case "reading":
      main.innerHTML = renderReading();
      bindReading();
      break;
    case "photos":
      main.innerHTML = renderPhotos();
      bindPhotos();
      break;
    case "progress":
      main.innerHTML = renderProgress();
      break;
    case "settings":
      main.innerHTML = renderSettings();
      bindSettings();
      break;
    default:
      navigate("today");
  }
}

function maybePromptDayClose() {
  const key = workKey();
  if (!isProgramActive(state)) return;
  if (dayClosed(state, key)) return;
  if (!dayFullyComplete(state, key)) return;
  if (routeParts().view !== "today") return;
  navigate("day-complete");
}

function renderPicker() {
  return `
    <h1 class="page-title">Choose your path</h1>
    <p class="muted">One app, two modes. Original rules, your device, your data.</p>
    <div class="mode-grid" id="mode-picker">
      <button type="button" class="mode-card" data-mode="all-in" id="mode-all-in">
        <img src="./icons/75-all-in-192.png" alt="" width="64" height="64">
        <h2>75 All-In</h2>
        <p class="muted">75 consecutive days. Every task, every day. Miss one and you restart at Day 1.</p>
      </button>
      <button type="button" class="mode-card" data-mode="adaptive" id="mode-adaptive">
        <img src="./icons/75-adaptive-192.png" alt="" width="64" height="64">
        <h2>75 Adaptive</h2>
        <p class="muted">75 days on your schedule. No restart — build consistency with weekly scores.</p>
      </button>
    </div>`;
}

function bindPicker() {
  $$("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      draftMode = mode;
      if (mode === "adaptive") navigate("setup-adaptive");
      else {
        commit(createState("all-in"), { skipLocks: true });
        navigate("onboarding/intro");
      }
    });
  });
}

function renderAdaptiveSetup() {
  const ad = defaultAdaptive();
  return `
    <h1 class="page-title">75 Adaptive setup</h1>
    <p class="muted">Default: 45-minute workouts daily with one active-recovery day per week. Mostly whole foods; one flexible meal weekly; alcohol only at social occasions.</p>
    <form class="card" id="adaptive-form">
      <fieldset class="field">
        <legend>Workout days per week (6 + 1 recovery is default)</legend>
        <div class="chip-row">
          ${[3, 4, 5, 6, 7]
            .map((n) => `<label class="chip"><input type="radio" name="wpw" value="${n}" ${n === ad.workoutDaysPerWeek ? "checked" : ""}> ${n}</label>`)
            .join("")}
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>Minutes per workout</legend>
        <div class="chip-row">
          ${[20, 30, 45]
            .map((n) => `<label class="chip"><input type="radio" name="mins" value="${n}" ${n === ad.workoutMinutes ? "checked" : ""}> ${n}</label>`)
            .join("")}
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>Fitness level</legend>
        <select name="level">
          <option value="beginner">Beginner</option>
          <option value="moderate" selected>Moderate</option>
          <option value="advanced">Advanced</option>
        </select>
      </fieldset>
      <label class="field"><input type="checkbox" name="rest" checked> Weekly active-recovery day (Sundays)</label>
      <button type="submit" class="btn btn-primary btn-block">Continue</button>
    </form>`;
}

function bindAdaptiveSetup() {
  $("#adaptive-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const s = createState("adaptive");
    s.adaptive = {
      workoutDaysPerWeek: Number(fd.get("wpw") || 6),
      workoutMinutes: Number(fd.get("mins") || 45),
      fitnessLevel: fd.get("level") || "moderate",
      weeklyRestDay: !!fd.get("rest"),
      flexibleMealsUsed: {},
    };
    s.settings.waterTargetMl = 3000;
    commit(s, { skipLocks: true });
    navigate("onboarding/intro");
  });
}

function renderOnboardingIntro() {
  const intro = programIntro(state.mode);
  return `
    <h1 class="page-title">${intro.title}</h1>
    <div class="card"><p>${intro.body}</p></div>
    <button type="button" class="btn btn-primary btn-block" id="ob-next">See daily rules</button>`;
}

function bindOnboardingIntro() {
  $("#ob-next")?.addEventListener("click", () => {
    commit(updateJourney(state, { onboardingStep: "rules" }), { skipLocks: true });
    navigate("onboarding/rules");
  });
}

function renderOnboardingRules() {
  const rules = dailyRules(state.mode);
  return `
    <h1 class="page-title">Daily rules</h1>
    <p class="muted">These are your non-negotiables for each program day.</p>
    <ol class="rules-list">${rules.map((r) => `<li>${r}</li>`).join("")}</ol>
    <button type="button" class="btn btn-primary btn-block" id="ob-rules-next">Continue to commitment</button>`;
}

function bindOnboardingRules() {
  $("#ob-rules-next")?.addEventListener("click", () => {
    commit(updateJourney(state, { onboardingStep: "commitment" }), { skipLocks: true });
    navigate("onboarding/commitment");
  });
}

function renderOnboardingCommitment() {
  const label = state.mode === "all-in" ? "I'm all in" : "I'm in";
  return `
    <h1 class="page-title">Your commitment</h1>
    <p class="muted">Read the rules again mentally. This is a promise to yourself.</p>
    <div class="card commitment-card" id="commitment-step">
      <ul class="rules-list compact">${dailyRules(state.mode).map((r) => `<li>${r}</li>`).join("")}</ul>
      <label class="field">My why (optional — shown on Today)
        <input type="text" id="my-why" maxlength="120" placeholder="I'm doing this because…" value="${state.journey?.myWhy || ""}">
      </label>
      <button type="button" class="btn btn-primary btn-block" id="commit-btn">${label}</button>
    </div>`;
}

function bindOnboardingCommitment() {
  $("#commit-btn")?.addEventListener("click", () => {
    const why = $("#my-why")?.value?.trim() || "";
    commit(
      updateJourney(state, {
        onboardingStep: "start",
        myWhy: why,
        committedAt: getClockNow().toISOString(),
      }),
      { skipLocks: true }
    );
    navigate("onboarding/start");
  });
}

function renderOnboardingStart() {
  const today = dateKey(getClockNow());
  const tomorrow = addDays(today, 1);
  return `
    <h1 class="page-title">Start date</h1>
    <p class="muted">Starting tomorrow gives you time to prepare (recommended).</p>
    <div class="card">
      <button type="button" class="btn btn-primary btn-block" data-start="${tomorrow}" id="start-tomorrow">Start tomorrow (${formatShortDate(tomorrow)}) — recommended</button>
      <button type="button" class="btn btn-secondary btn-block" data-start="${today}" id="start-today">Start today (${formatShortDate(today)})</button>
    </div>`;
}

function bindOnboardingStart() {
  $$("[data-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const start = btn.dataset.start;
      let next = setStartDate(state, start);
      next = updateJourney(next, { onboardingStep: "day0" });
      commit(next, { skipLocks: true });
      navigate("onboarding/day0");
    });
  });
}

function renderOnboardingDay0() {
  const d0 = state.journey?.day0 || {};
  return `
    <h1 class="page-title">Day 0 baseline</h1>
    <p class="muted">Before Day 1: photos (front / side / back) stay on-device only. Optional weight &amp; waist.</p>
    <form class="card" id="day0-form">
      <div class="photo-row">
        ${["front", "side", "back"]
          .map(
            (a) => `<label class="field">Photo: ${a}
          <input type="file" accept="image/*" capture="environment" data-angle="${a}" class="day0-photo">
          <span class="muted" id="d0-${a}">${d0.photos?.[a] ? "Saved" : "Not yet"}</span></label>`
          )
          .join("")}
      </div>
      <label class="field">Weight (optional)<input name="weight" type="number" step="0.1" value="${d0.weight ?? ""}"></label>
      <label class="field">Waist (optional, in/cm)<input name="waist" type="number" step="0.1" value="${d0.waist ?? ""}"></label>
      <label class="field">Energy (1–10)<input name="energy" type="number" min="1" max="10" required value="${d0.energy ?? ""}"></label>
      <label class="field">Mood (1–10)<input name="mood" type="number" min="1" max="10" required value="${d0.mood ?? ""}"></label>
      <button type="submit" class="btn btn-primary btn-block">Save baseline &amp; continue</button>
    </form>`;
}

function bindOnboardingDay0() {
  $$(".day0-photo").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const angle = input.dataset.angle;
      const blob = await compressImage(file);
      const id = `day0-${angle}-${Date.now()}`;
      await savePhotoThumb(id, blob);
      commit(setDay0Photo(state, angle, id), { skipLocks: true });
      const el = $(`#d0-${angle}`);
      if (el) el.textContent = "Saved on device";
    });
  });
  $("#day0-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    let next = updateDay0(state, {
      weight: fd.get("weight") ? Number(fd.get("weight")) : null,
      waist: fd.get("waist") ? Number(fd.get("waist")) : null,
      energy: Number(fd.get("energy")),
      mood: Number(fd.get("mood")),
    });
    next = updateJourney(next, { onboardingStep: "done", onboardingComplete: true });
    commit(next, { skipLocks: true });
    if (isPrepDay(next)) navigate("prep");
    else navigate("today");
  });
}

function renderPrep() {
  const prep = state.journey?.prepChecklist || {};
  return `
    <h1 class="page-title">Prep day</h1>
    <p class="muted">Day 1 begins ${formatShortDate(state.startDate)}. Use today to get ready.</p>
    <div class="card" id="prep-checklist">
      ${PREP_ITEMS.map(
        (item) => `<label class="field prep-item"><input type="checkbox" data-prep="${item.id}" ${prep[item.id] ? "checked" : ""}> ${item.label}</label>`
      ).join("")}
    </div>
    <button type="button" class="btn btn-primary btn-block" id="prep-done">I'm ready</button>`;
}

function bindPrep() {
  $$("[data-prep]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const prep = { ...(state.journey.prepChecklist || {}) };
      prep[cb.dataset.prep] = cb.checked;
      commit(updateJourney(state, { prepChecklist: prep }), { skipLocks: true });
    });
  });
  $("#prep-done")?.addEventListener("click", () => navigate("today"));
}

function renderToday() {
  const key = workKey();
  const dayNum = programDayIndex(state.startDate, key);
  const tasks = taskListForMode(state.mode);
  const target = defaultWaterTarget(state);
  const day = state.days?.[key] || {};
  const editable = isDateEditable(key);
  const streak = currentStreak(state, key);
  const weekPct = state.mode === "adaptive" ? weekConsistency(state, key) : null;
  const why = state.journey?.myWhy;

  const tiles = tasks
    .map((t) => {
      const done = taskCompletion(state, key, t.id);
      const extra =
        t.id === "nutrition" && state.mode === "all-in"
          ? `<p class="muted small">Recommended: <a href="/whole-food-plan/app/">30-Day Whole Food Plan</a></p>`
          : t.id === "nutrition" && state.mode === "adaptive"
            ? `<p class="muted small">Mostly whole foods · 1 flexible meal/week</p>`
            : "";
      return `<button type="button" class="task-tile ${done ? "done" : ""}" data-task="${t.id}" ${!editable ? "disabled" : ""}>
        <span class="check" aria-hidden="true"></span>
        <span><span class="task-tile-label">${t.label}</span>${extra}</span>
      </button>`;
    })
    .join("");

  const closeBtn =
    dayFullyComplete(state, key) && !dayClosed(state, key)
      ? `<button type="button" class="btn btn-primary btn-block" id="close-day">Finish Day ${dayNum}</button>`
      : "";

  return `
    <h1 class="page-title">Day ${dayNum} of 75</h1>
    ${why ? `<p class="why-banner">"${why}"</p>` : ""}
    <p class="muted">${formatShortDate(key)} · Attempt ${state.attemptNumber || 1}</p>
    <div class="stat-row">
      <span class="stat-pill">Streak: ${streak}</span>
      ${state.bestStreak ? `<span class="stat-pill">Best: ${state.bestStreak}</span>` : ""}
    </div>
    ${state.mode === "adaptive" ? `<p class="muted">Weekly consistency: <strong>${weekPct}%</strong></p>` : ""}
    <div class="card">
      <h2>Checklist</h2>
      <div class="task-tiles" id="task-tiles">${tiles}</div>
      ${closeBtn}
    </div>
    <div class="card">
      <h2>Water</h2>
      <p class="muted">${formatWater(day.waterMl || 0)} / ${formatWater(target)}</p>
      <div class="water-bar"><div class="water-bar-fill" style="width:${Math.min(100, ((day.waterMl || 0) / target) * 100)}%"></div></div>
      <button type="button" class="btn btn-secondary btn-small" id="water-quick" ${!editable ? "disabled" : ""}>+ ${state.settings?.units === "imperial" ? "8 oz" : "250 ml"}</button>
    </div>`;
}

function bindToday() {
  const key = workKey();
  $("#task-tiles")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-task]");
    if (!btn || btn.disabled) return;
    const id = btn.dataset.task;
    if (id === "workouts" || id === "movement") return navigate("workout");
    if (id === "water") return navigate("water");
    if (id === "reading" || id === "checkin") return navigate("reading");
    if (id === "photo") return navigate("photos");
    commit(toggleTask(state, key, id));
  });
  $("#water-quick")?.addEventListener("click", () => commit(addWater(state, key, waterIncrementMl())));
  $("#close-day")?.addEventListener("click", () => navigate("day-complete"));
}

function renderDayComplete() {
  const key = workKey();
  const dayNum = programDayIndex(state.startDate, key);
  const pct = Math.round(dayCompletionRatio(state, key) * 100);
  return `
    <div class="card card-celebrate" id="day-complete-screen">
      <h1 class="page-title">Day ${dayNum} complete</h1>
      <p>You showed up. ${state.mode === "adaptive" ? `Today: ${pct}% of tasks.` : "Every box checked."}</p>
      <button type="button" class="btn btn-primary btn-block" id="day-complete-continue">${state.mode === "all-in" ? "Continue" : "Onward"}</button>
    </div>`;
}

function bindDayComplete() {
  $("#day-complete-continue")?.addEventListener("click", () => {
    if (state.mode === "all-in") navigate("honesty");
    else finishDayAdaptive();
  });
}

function finishDayAdaptive() {
  const key = workKey();
  const dayNum = programDayIndex(state.startDate, key);
  let next = markDayClosed(state, key, { honesty: true });
  commit(next);
  afterDayClosed(dayNum);
}

function renderHonesty() {
  const dayNum = programDayIndex(state.startDate, workKey());
  return `
    <div class="card" id="honesty-screen">
      <h1 class="page-title">Honest check</h1>
      <p>Did you complete <strong>every</strong> task today — honestly?</p>
      <button type="button" class="btn btn-primary btn-block" id="honesty-yes">Yes — I earned Day ${dayNum}</button>
      <button type="button" class="btn btn-secondary btn-block" id="honesty-no">No — I need to restart</button>
    </div>`;
}

function bindHonesty() {
  const key = workKey();
  $("#honesty-yes")?.addEventListener("click", () => {
    let next = markDayClosed(state, key, { honesty: true });
    const dayNum = programDayIndex(state.startDate, key);
    commit(next);
    afterDayClosed(dayNum);
  });
  $("#honesty-no")?.addEventListener("click", () => {
    commit(honestyRestart(state, key));
  });
}

function afterDayClosed(dayNum) {
  const ms = pendingMilestone(state, dayNum);
  if (ms) {
    commit(updateJourney(state, { pendingMilestone: ms }), { skipLocks: true });
    navigate("milestone");
    return;
  }
  if (shouldShowWeeklyRecap(state, dayNum)) {
    navigate("weekly-recap");
    return;
  }
  if (dayNum >= 75) navigate("finish");
  else navigate("today");
}

function renderMilestone() {
  const ms = state.journey?.pendingMilestone || pendingMilestone(state, programDayIndex(state.startDate, workKey()));
  const day = ms?.day || 7;
  return `
    <div class="card card-celebrate" id="milestone-screen">
      <h1 class="page-title">${ms?.title || "Milestone"}</h1>
      <p>Day ${day} — keep building.</p>
      <button type="button" class="btn btn-primary btn-block" id="milestone-ok">Continue</button>
    </div>`;
}

function bindMilestone() {
  $("#milestone-ok")?.addEventListener("click", () => {
    const ms = state.journey?.pendingMilestone;
    const day = ms?.day;
    const seen = [...(state.journey.milestonesSeen || [])];
    if (day && !seen.includes(day)) seen.push(day);
    let next = updateJourney(state, { milestonesSeen: seen, pendingMilestone: null });
    commit(next, { skipLocks: true });
    if (day && shouldShowWeeklyRecap(state, day)) navigate("weekly-recap");
    else if (day >= 75) navigate("finish");
    else navigate("today");
  });
}

function renderWeeklyRecap() {
  const dayNum = programDayIndex(state.startDate, workKey());
  const stats = weekRecapStats(state, dayNum);
  return `
    <div class="card" id="weekly-recap">
      <h1 class="page-title">Week recap</h1>
      <p>Days ${stats.fromDay}–${stats.toDay}</p>
      <ul class="recap-list">
        <li>Tasks completed: <strong>${stats.taskPct}%</strong></li>
        <li>Workouts: <strong>${stats.workouts}</strong> (${stats.minutes} min)</li>
        <li>Water daily avg: <strong>${formatWater(stats.waterAvgMl)}</strong></li>
        <li>Pages read: <strong>${stats.pages}</strong></li>
      </ul>
      <button type="button" class="btn btn-primary btn-block" id="recap-ok">Keep going</button>
    </div>`;
}

function bindWeeklyRecap() {
  $("#recap-ok")?.addEventListener("click", () => {
    const dayNum = programDayIndex(state.startDate, workKey());
    const id = `week-${dayNum}`;
    const seen = [...(state.journey.weeklyRecapsSeen || [])];
    if (!seen.includes(id)) seen.push(id);
    commit(updateJourney(state, { weeklyRecapsSeen: seen }), { skipLocks: true });
    navigate("today");
  });
}

function renderWorkout() {
  const key = workKey();
  const day = ensureDay(state, key);
  const editable = isDateEditable(key);
  const list = (day.workouts || [])
    .map((w) => `<li>${w.type || "Workout"} · ${w.minutes} min · ${w.outdoor ? "outdoors" : "indoors"}</li>`)
    .join("");

  const weatherBlock =
    state.mode === "all-in"
      ? `<div class="weather-toggle">
        <label>
          <input type="checkbox" id="weather-exception" ${day.weatherException ? "checked" : ""} ${!editable ? "disabled" : ""}>
          <span><strong>Bad weather</strong> (snow, ice, extreme cold or heat, storms). When checked, your normally outdoor workout may be done indoors today. Only <em>one</em> of your two workouts is normally outdoors.</span>
        </label>
      </div>`
      : "";

  const recovery =
    state.mode === "adaptive" && !isWorkoutDay(state, key)
      ? `<label class="field"><input type="checkbox" id="recovery-done" ${day.recovery?.done ? "checked" : ""}> Active recovery (walk or stretching) done</label>`
      : "";

  return `
    <h1 class="page-title">Workout log</h1>
    ${weatherBlock}
    <ul class="workout-list">${list || "<li class='muted'>No workouts logged yet.</li>"}</ul>
    ${recovery}
    <form class="card" id="workout-form">
      <label class="field"><span>Suggested</span><select name="preset" id="workout-preset">${workoutOptionsHtml()}</select></label>
      <label class="field"><span>Type</span><input name="type" id="workout-type" required></label>
      <label class="field"><span>Minutes</span><input name="minutes" type="number" min="5" max="180" value="45" required></label>
      <label class="field"><input type="checkbox" name="outdoor" id="workout-outdoor"> Outdoors</label>
      <button type="submit" class="btn btn-primary btn-block" ${!editable ? "disabled" : ""}>Log workout</button>
    </form>
    <p class="muted"><a href="${SEVEN_MIN_APP_URL}" target="_blank" rel="noopener">22-Day 7-Minute Workout</a> app</p>`;
}

function bindWorkout() {
  const key = workKey();
  $("#weather-exception")?.addEventListener("change", (e) => commit(setWeatherException(state, key, e.target.checked)));
  $("#recovery-done")?.addEventListener("change", (e) => commit(setRecoveryDone(state, key, e.target.checked)));
  const preset = $("#workout-preset");
  const applyPreset = () => {
    const w = findWorkout(preset?.value);
    if (!w) return;
    if ($("#workout-type")) $("#workout-type").value = w.label;
    const mins = $("input[name=minutes]");
    if (mins) mins.value = w.minutes;
    if ($("#workout-outdoor")) $("#workout-outdoor").checked = w.outdoor;
  };
  preset?.addEventListener("change", applyPreset);
  applyPreset();
  $("#workout-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    commit(
      logWorkout(state, key, {
        type: fd.get("type"),
        minutes: Number(fd.get("minutes")),
        outdoor: !!fd.get("outdoor"),
        loggedAt: getClockNow().getTime(),
      })
    );
    toast("Workout logged");
  });
}

function renderWater() {
  const key = workKey();
  const day = ensureDay(state, key);
  const target = defaultWaterTarget(state);
  const label = state.settings?.units === "imperial" ? "+8 oz" : "+250 ml";
  return `
    <h1 class="page-title">Water</h1>
    <div class="card">
      <p><strong>${formatWater(day.waterMl || 0)}</strong> of ${formatWater(target)}</p>
      <div class="water-bar"><div class="water-bar-fill" style="width:${Math.min(100, ((day.waterMl || 0) / target) * 100)}%"></div></div>
      <button type="button" class="btn btn-primary" id="water-add">${label}</button>
      <button type="button" class="btn btn-secondary" id="water-reset">Reset today</button>
    </div>`;
}

function bindWater() {
  const key = workKey();
  $("#water-add")?.addEventListener("click", () => commit(addWater(state, key, waterIncrementMl())));
  $("#water-reset")?.addEventListener("click", () => {
    const next = { ...state, days: { ...state.days } };
    const day = ensureDay(next, key);
    next.days[key] = { ...day, waterMl: 0 };
    commit(next);
  });
}

function renderReading() {
  const key = workKey();
  const day = ensureDay(state, key);
  const r = day.reading || {};
  const c = day.checkin || {};
  const checkin =
    state.mode === "adaptive"
      ? `<h2>Check-in</h2>
      <label class="field">Energy (1–5)<input type="number" name="energy" min="1" max="5" value="${c.energy ?? ""}"></label>
      <label class="field">Mood (1–5)<input type="number" name="mood" min="1" max="5" value="${c.mood ?? ""}"></label>
      <label class="field">Note<textarea name="note" rows="2">${c.note || ""}</textarea></label>`
      : "";
  return `
    <h1 class="page-title">Reading &amp; mind</h1>
    <form class="card" id="reading-form">
      <label class="field">Book or topic<input name="title" value="${r.title || ""}"></label>
      <label class="field">Pages<input type="number" name="pages" min="0" value="${r.pages || ""}"></label>
      <label class="field">Minutes<input type="number" name="minutes" min="0" value="${r.minutes || ""}"></label>
      ${checkin}
      <button type="submit" class="btn btn-primary btn-block">Save</button>
    </form>`;
}

function bindReading() {
  const key = workKey();
  $("#reading-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    let next = updateReading(state, key, {
      title: fd.get("title"),
      pages: Number(fd.get("pages") || 0),
      minutes: Number(fd.get("minutes") || 0),
    });
    if (state.mode === "adaptive") {
      next = updateCheckin(next, key, {
        energy: Number(fd.get("energy")),
        mood: Number(fd.get("mood")),
        note: fd.get("note"),
      });
    }
    commit(next);
    toast("Saved");
  });
}

function renderPhotos() {
  return `
    <h1 class="page-title">Progress photos</h1>
    <p class="muted">On-device only — compressed thumbnails in your browser. Nothing is uploaded.</p>
    <label class="btn btn-primary btn-block">
      Take or choose photo
      <input type="file" accept="image/*" capture="environment" id="photo-input" hidden>
    </label>
    <div id="photo-timeline" class="card muted">Loading…</div>`;
}

async function bindPhotos() {
  const key = workKey();
  $("#photo-input")?.addEventListener("change", async () => {
    const file = $("#photo-input").files?.[0];
    if (!file) return;
    const blob = await compressImage(file);
    const id = `${key}-${Date.now()}`;
    await savePhotoThumb(id, blob);
    commit(setPhotoRef(state, key, id));
    showTimeline();
  });
  showTimeline();
}

async function showTimeline() {
  const host = $("#photo-timeline");
  if (!host || !state) return;
  const entries = Object.entries(state.days || {}).filter(([, d]) => d.photoThumbId);
  if (!entries.length) {
    host.textContent = "No photos yet.";
    return;
  }
  host.innerHTML = "";
  for (const [k, d] of entries.sort((a, b) => a[0].localeCompare(b[0]))) {
    const blob = await getPhotoThumb(d.photoThumbId);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    const fig = document.createElement("figure");
    fig.innerHTML = `<img src="${url}" alt="${formatShortDate(k)}" style="max-width:100%;border-radius:8px"><figcaption class="muted">${formatShortDate(k)}</figcaption>`;
    host.appendChild(fig);
  }
}

function renderProgress() {
  const key = workKey();
  const cur = programDayIndex(state.startDate, key);
  const dots = [];
  for (let i = 1; i <= 75; i++) {
    const dk = dateForProgramDay(state.startDate, i);
    const ratio = dayCompletionRatio(state, dk);
    let cls = "progress-dot";
    if (ratio >= 1 && dayClosed(state, dk)) cls += " done";
    else if (ratio > 0) cls += " partial";
    const day = state.days?.[dk];
    if (day && dayHasWeatherException(day)) cls += " weather";
    dots.push(`<div class="${cls}" id="grid-day-${i}" title="Day ${i}">${i <= cur ? i : ""}</div>`);
  }
  return `
    <h1 class="page-title">75-day grid</h1>
    <p class="muted">❄ = bad-weather exception logged.</p>
    <div class="progress-grid" id="progress-grid">${dots.join("")}</div>`;
}

function renderFinish() {
  const stats = computeProgramStats(state);
  const d0 = state.journey?.day0 || {};
  return `
    <h1 class="page-title">Day 75 finish</h1>
    <div class="card" id="finish-summary">
      <h2>Your 75 days</h2>
      <ul class="recap-list">
        <li>Workouts: ${stats.workouts} (${stats.minutes} min)</li>
        <li>Pages: ${stats.pages}</li>
        <li>Water logged: ${formatWater(stats.waterTotal)}</li>
        <li>Best streak: ${stats.bestStreak}</li>
        <li>Attempts: ${stats.attempts + 1} (current #${stats.attemptNumber})</li>
      </ul>
    </div>
    <div class="card" id="finish-compare">
      <h2>Before / after (on-device)</h2>
      <div class="compare-row" id="compare-photos">Loading photos…</div>
    </div>
    <form class="card" id="finish-rating">
      <h2>Re-rate yourself</h2>
      <label class="field">Energy (1–10)<input name="energy" type="number" min="1" max="10" value="${d0.finishEnergy ?? ""}"></label>
      <label class="field">Mood (1–10)<input name="mood" type="number" min="1" max="10" value="${d0.finishMood ?? ""}"></label>
      <label class="field"><input type="checkbox" name="include-photo" id="include-photo-card"> Add a photo to shareable card (optional)</label>
      <button type="submit" class="btn btn-primary btn-block">Generate completion card</button>
    </form>
    <canvas id="completion-canvas" class="hidden" width="1080" height="1350"></canvas>
    <a id="card-download" class="btn btn-secondary btn-block hidden" download="75-complete.png">Download card</a>
    <button type="button" class="btn btn-primary btn-block" id="finish-whats-next">What&apos;s next?</button>`;
}

async function bindFinish() {
  const row = $("#compare-photos");
  if (row) {
    row.innerHTML = "";
    const frontId = state.journey?.day0?.photos?.front;
    const lastDay = dateForProgramDay(state.startDate, 75);
    const afterId = state.days?.[lastDay]?.photoThumbId;
    const addImg = async (label, id) => {
      const div = document.createElement("div");
      div.className = "compare-cell";
      if (!id) {
        div.innerHTML = `<p class="muted">${label}<br>No photo</p>`;
        return div;
      }
      const blob = await getPhotoThumb(id);
      const url = blob ? URL.createObjectURL(blob) : "";
      div.innerHTML = `<p>${label}</p>${url ? `<img src="${url}" alt="${label}">` : ""}`;
      return div;
    };
    row.appendChild(await addImg("Before", frontId));
    row.appendChild(await addImg("After", afterId));
  }

  $("#finish-rating")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    let photoBlob = null;
    if (fd.get("include-photo")) {
      const lastDay = dateForProgramDay(state.startDate, 75);
      const id = state.days?.[lastDay]?.photoThumbId;
      if (id) photoBlob = await getPhotoThumb(id);
    }
    const stats = computeProgramStats(state);
    const blob = await renderCompletionCard({
      name: state.journey?.myWhy || "",
      mode: state.mode,
      stats,
      includePhotoBlob: photoBlob,
    });
    const url = URL.createObjectURL(blob);
    const link = $("#card-download");
    if (link) {
      link.href = url;
      link.classList.remove("hidden");
    }
    commit(updateDay0(state, { finishEnergy: Number(fd.get("energy")), finishMood: Number(fd.get("mood")) }), { skipLocks: true });
    toast("Card ready");
  });

  $("#finish-whats-next")?.addEventListener("click", () => {
    commit(updateJourney(state, { finishSeen: true }), { skipLocks: true });
    navigate("whats-next");
  });
}

function renderWhatsNext() {
  return `
    <h1 class="page-title">What&apos;s next?</h1>
    <div class="card">
      <button type="button" class="btn btn-primary btn-block" id="opt-keep-going">30-day Keep Going phase (extra daily habits)</button>
      <button type="button" class="btn btn-secondary btn-block" id="opt-all-in">Switch to 75 All-In (starts Day 1)</button>
      <button type="button" class="btn btn-secondary btn-block" id="opt-restart">Start the 75 again</button>
    </div>`;
}

function bindWhatsNext() {
  $("#opt-keep-going")?.addEventListener("click", () => {
    commit(startKeepGoing(state), { skipLocks: true });
    navigate("keep-going");
  });
  $("#opt-all-in")?.addEventListener("click", () => {
    if (confirm("Start 75 All-In at Day 1?")) {
      commit(switchToAllIn(state), { skipLocks: true });
      navigate("today");
    }
  });
  $("#opt-restart")?.addEventListener("click", () => {
    resetState();
    state = null;
    navigate("picker");
    render();
  });
}

function renderKeepGoing() {
  const habits = KEEP_GOING_HABITS;
  const today = dateKey(getClockNow());
  const done = state.journey.keepGoing?.days?.[today] || {};
  return `
    <h1 class="page-title">Keep Going</h1>
    <p class="muted">Optional 30-day add-on habits.</p>
    <div class="task-tiles">
      ${habits
        .map(
          (h) => `<button type="button" class="task-tile ${done[h.id] ? "done" : ""}" data-habit="${h.id}">
        <span class="check"></span><span class="task-tile-label">${h.label}</span></button>`
        )
        .join("")}
    </div>`;
}

function bindKeepGoing() {
  $$("[data-habit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.habit;
      const today = dateKey(getClockNow());
      const kg = state.journey.keepGoing || {};
      const days = { ...(kg.days || {}) };
      const day = { ...(days[today] || {}) };
      day[id] = !day[id];
      days[today] = day;
      commit(updateJourney(state, { keepGoing: { ...kg, days } }), { skipLocks: true });
    });
  });
}

function renderSettings() {
  const s = state.settings || {};
  return `
    <h1 class="page-title">Settings</h1>
    <form class="card" id="settings-form">
      <label class="field">Units<select name="units">
        <option value="imperial" ${s.units === "imperial" ? "selected" : ""}>lb / oz</option>
        <option value="metric" ${s.units === "metric" ? "selected" : ""}>kg / ml</option>
      </select></label>
      <label class="field">Body weight<input name="weight" type="number" value="${s.units === "metric" ? s.bodyWeightKg || "" : s.bodyWeightLb || ""}"></label>
      <label class="field">Water target (ml)<input name="water" type="number" value="${s.waterTargetMl || ""}"></label>
      <label class="field">Reminder (note only)<input name="reminder" type="time" value="${s.reminderTime || "07:00"}"></label>
      <button type="submit" class="btn btn-primary btn-block">Save</button>
    </form>
    <button type="button" class="btn btn-secondary btn-block" id="export-json">Export JSON</button>
    ${state.mode === "adaptive" ? `<button type="button" class="btn btn-secondary btn-block" id="switch-all-in">Switch to All-In</button>` : ""}
    <button type="button" class="btn btn-secondary btn-block" id="reset-app">Reset all data</button>
    <div class="card refund-card">
      <h2>Refunds for the 75-Day Challenge</h2>
      <p>You can request a full refund within 3 days (72 hours) of purchase by emailing <a href="mailto:coachsalimheyaime@gmail.com?subject=Refund+request">coachsalimheyaime@gmail.com</a>. After that, all sales are final. Refunds go to the original payment method.</p>
      <p><a href="/purchase-terms/" target="_blank" rel="noopener">Purchase terms</a> · <a href="/health-safety/" target="_blank" rel="noopener">Health and safety</a> · <a href="/purchase-terms/#es" target="_blank" rel="noopener" lang="es" hreflang="es">Términos de compra</a> · <a href="/health-safety/#es" target="_blank" rel="noopener" lang="es" hreflang="es">Salud y seguridad</a></p>
    </div>`;
}

function bindSettings() {
  $("#settings-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const units = fd.get("units");
    const w = Number(fd.get("weight") || 0);
    const patch = { units, waterTargetMl: Number(fd.get("water")), reminderTime: fd.get("reminder") };
    if (units === "metric") patch.bodyWeightKg = w;
    else patch.bodyWeightLb = w;
    commit(updateSettings(state, patch));
  });
  $("#export-json")?.addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([exportStateJson()], { type: "application/json" }));
    a.download = "seventy-five-export.json";
    a.click();
  });
  $("#switch-all-in")?.addEventListener("click", () => {
    if (confirm("Switch to All-In at Day 1?")) commit(switchToAllIn(state), { skipLocks: true });
  });
  $("#reset-app")?.addEventListener("click", () => {
    if (confirm("Erase all data?")) {
      resetState();
      state = null;
      navigate("picker");
      render();
    }
  });
}

function renderRestart() {
  const p = state.pendingRestart;
  return `
    <div class="card restart-panel" id="restart-screen">
      <h1 class="page-title">Fresh start</h1>
      <p>${p?.message || ""}</p>
      <p class="muted">Attempt ${state.attemptNumber || 1} ended at Day ${p?.daysReached || 0}. Best streak: ${state.bestStreak || 0}.</p>
      <button type="button" class="btn btn-primary btn-block" id="confirm-restart">Begin again — Attempt ${(state.attemptNumber || 1) + 1}</button>
    </div>`;
}

function bindRestart() {
  $("#confirm-restart")?.addEventListener("click", () => {
    commit(confirmRestart(state));
    navigate("today");
  });
}

function init() {
  if (state) {
    state = processDayLocks(state);
    saveState(state);
    syncBranding();
  }
  window.addEventListener("hashchange", render);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
  }
  if (!location.hash) location.hash = state ? "#/today" : "#/picker";
  render();
}

init();
