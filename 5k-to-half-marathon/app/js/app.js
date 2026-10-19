/**
 * 5K to Half Marathon app (standalone PWA). Same shell and conventions as /doing-a-5k/app/:
 * hash routes, on-device storage only, offline service worker, no analytics, open URL (no access gate,
 * same as Doing a 5K today). Adds a one-time Health and safety screen and English/Spanish.
 */
import {
  weeksForHalfPlan,
  formatDistance,
  formatRaceDistance,
  startDateFromRace,
  longRunProgressionKm,
  parseDateOnly,
  resolveHalfPlacement,
  resolveRunLevelMethodA,
  resolveRunLevelMethodB,
  strengthLevelFromPushUps,
  generateHalfPlan,
  replanHalfFromWeek,
  normalizeHalfEquipment,
  COACH_EFFORT_GUIDE,
} from "./halfPlan.js";
import { DAY_NAMES, defaultStrengthDays, scheduledDateForWorkout, formatDate, formatDuration, workoutTotalSeconds } from "./schedule.js";
import {
  loadState,
  saveState,
  resetState,
  exportState,
  getSettings,
  updateSettings,
  markWorkoutComplete,
  markStrengthComplete,
  unmarkWorkout,
  unmarkStrength,
  isWorkoutComplete,
  isStrengthComplete,
  repeatWeek,
  nextWorkout,
  strengthForWeek,
  stats,
} from "./storage.js";
import { WorkoutTimer } from "./timer.js";
import { StrengthTimer } from "./strength-timer.js";
import { getLang, setLang, makeT } from "./i18n.js";
import { HS_VERSION, HS_LINKS, HS_TEXT } from "./health-ack-text.js";

const E2E = new URLSearchParams(location.search).has("e2e");
const APP_ID = "5k-to-half-marathon";
const ACK_KEY = "actm.healthAck." + APP_ID;
/* Same consent version as the shared screen (/js/health-ack.js); text in ./health-ack-text.js. */
const ACK_VERSION = HS_VERSION;
const DAY_NAMES_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

let lang = getLang();
let t = makeT(lang);
let state = loadState();
let activeTimer = null;
let activeWorkoutId = null;

const $ = (sel, root = document) => root.querySelector(sel);
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dayName = (i) => (lang === "es" ? DAY_NAMES_ES : DAY_NAMES)[i];
const units = () => getSettings(state).units || "mi";
const lvl = (v) => t(v === "average" ? "average" : "beginner");

function ackDone() {
  try {
    const v = JSON.parse(localStorage.getItem(ACK_KEY) || "null");
    return !!(v && v.version === ACK_VERSION);
  } catch {
    return false;
  }
}

function speak(text, enabled) {
  if (!enabled || !text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "es" ? "es-US" : "en-US";
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

function switchLang(next) {
  const q = new URLSearchParams(location.search);
  if (q.has("lang")) {
    q.delete("lang");
    const qs = q.toString().replace(/=(&|$)/g, "$1");
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }
  lang = next;
  t = makeT(lang);
  setLang(lang);
  route();
}

function shell(content, { showNav = true, title = t("appName"), extraFooter = "" } = {}) {
  const cur = location.hash.replace("#", "") || "today";
  const navBtn = (id, key) =>
    `<button type="button" data-nav="${id}" class="app-nav-btn ${cur === id ? "is-active" : ""}">${t(key)}</button>`;
  const nav =
    showNav && state
      ? `<nav class="app-nav" aria-label="App">${navBtn("today", "navToday")}${navBtn("plan", "navPlan")}${navBtn("progress", "navProgress")}${navBtn("settings", "navSettings")}</nav>`
      : "";
  const other = lang === "es" ? "en" : "es";
  return `
    <div class="app-screen">
      <header class="app-header app-header--lang">
        <div class="app-header-text">
          <p class="app-eyebrow">${t("eyebrow")}</p>
          <h1 class="app-title">${title}</h1>
        </div>
        <button type="button" class="lang-btn" id="lang-btn" data-lang="${other}" lang="${other}" aria-label="${esc(t("langToggleLabel"))}">${t("langToggle")}</button>
      </header>
      ${content}
      ${nav}
      <footer class="app-footer">
        <p class="safety-note">${t("safety")} ${extraFooter}</p>
        <p>&copy; ${new Date().getFullYear()} Coach Salim Heyaime LLC</p>
      </footer>
    </div>`;
}

function render(view) {
  const root = $("#app");
  if (!root) return;
  document.documentElement.lang = lang;
  activeTimer?.stop?.();
  if (!ackDone()) {
    root.innerHTML = renderAck();
    bindAck();
    bindCommon();
    return;
  }
  if (view === "onboarding" || !state) {
    root.innerHTML = renderOnboarding();
    bindOnboarding();
    bindCommon();
    return;
  }
  const views = {
    today: [renderToday, bindToday],
    workout: [renderWorkout, bindWorkout],
    complete: [renderComplete, bindComplete],
    "strength-overview": [renderStrengthOverview, bindStrengthOverview],
    "strength-workout": [renderStrengthWorkout, bindStrengthWorkout],
    "strength-complete": [renderStrengthComplete, bindStrengthComplete],
    plan: [renderPlan, () => {}],
    progress: [renderProgress, () => {}],
    settings: [renderSettings, bindSettings],
  };
  const v = views[view];
  if (!v) {
    location.hash = "today";
    return;
  }
  const html = v[0]();
  if (!html) return;
  root.innerHTML = html;
  v[1]();
  bindCommon();
  window.scrollTo(0, 0);
}

function bindCommon() {
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = btn.dataset.nav;
    });
  });
  $("#lang-btn")?.addEventListener("click", (e) => switchLang(e.currentTarget.dataset.lang));
}

/* ---------- Health and safety + App Terms consent (one time, before first use) ----------
 * Same design and text as the shared screen in /js/health-ack.js (Salim approved, Oct 18):
 * bold short label, then the full consent sentence ALWAYS visible inside the label (never in the
 * expander), "Read the full text" collapsed below, Continue disabled until ticked. Links open in a
 * new tab so the screen stays put; clicking a link does not tick the box. */

function hsText() {
  return HS_TEXT[lang] || HS_TEXT.en;
}

function hsSentence(h) {
  const sfx = lang === "es" ? "#es" : "";
  let out = esc(h.ack);
  [[h.ackLinks[0], HS_LINKS.safety], [h.ackLinks[1], HS_LINKS.terms]].forEach(([label, href]) => {
    out = out.replace(esc(label), `<a href="${href}${sfx}" target="_blank" rel="noopener" data-hs-doc>${esc(label)}</a>`);
  });
  return out;
}

function renderAck() {
  const h = hsText();
  const sfx = lang === "es" ? "#es" : "";
  const para = (head, body) => `<h3>${esc(head)}</h3><p>${esc(body)}</p>`;
  const full =
    `<p>${esc(h.lead)}</p>` +
    h.sections.map((x) => para(x[1], x[2])).join("") +
    `<h3 class="hs-ack-sub">${esc(h.termsHeading)}</h3>` +
    h.terms.map((x) => para(x[0], x[1])).join("") +
    `<p class="hs-ack-links">${esc(h.fullPages)} <a href="${HS_LINKS.safety}${sfx}" target="_blank" rel="noopener">${esc(h.links[0])}</a> · ` +
    `<a href="${HS_LINKS.terms}${sfx}" target="_blank" rel="noopener">${esc(h.links[1])}</a></p>`;
  const other = lang === "es" ? "en" : "es";
  return shell(
    `
    <div class="card ack-card hs-ack-lang" data-screen="health-ack" lang="${lang}">
      <h2 id="ack-title">${esc(h.ackTitle)}</h2>
      <label class="hs-ack-check" for="ack-tick">
        <input type="checkbox" id="ack-tick" data-hs="tick" aria-describedby="ack-sentence">
        <span>
          <strong class="hs-ack-label">${esc(h.ackLabel)}</strong>
          <span class="hs-ack-sentence" id="ack-sentence">${hsSentence(h)}</span>
        </span>
      </label>
      <details class="hs-ack-more">
        <summary>${esc(h.readFull)}</summary>
        <div class="hs-ack-full" tabindex="0" role="region" aria-label="${esc(h.readFull)}">${full}</div>
      </details>
      <div class="hs-ack-actions">
        <button type="button" class="btn btn-primary" id="ack-go" data-hs="go" disabled>${esc(h.btn)}</button>
        <button type="button" class="hs-ack-lang-btn" id="ack-lang" data-lang="${other}" lang="${other}">${esc(h.langBtn)}</button>
      </div>
    </div>`,
    { showNav: false, title: esc(h.screenTitle) }
  );
}

function bindAck() {
  $("#ack-tick")?.addEventListener("change", (e) => {
    $("#ack-go").disabled = !e.target.checked;
  });
  $("#ack-lang")?.addEventListener("click", (e) => switchLang(e.currentTarget.dataset.lang));
  $("#ack-go")?.addEventListener("click", () => {
    if (!$("#ack-tick").checked) return;
    const h = hsText();
    // Kept on the device, same record as the shared screen: version, SHA-256 of the exact screen
    // text, language, short label, full sentence agreed to, ISO time.
    const rec = { version: ACK_VERSION, textHash: h.hash, lang, label: h.ackLabel, accepted: h.ack, at: new Date().toISOString() };
    try {
      localStorage.setItem(ACK_KEY, JSON.stringify(rec));
    } catch {}
    route();
  });
}

/* ---------- Onboarding ---------- */

function radio(name, value, label, checked) {
  return `<label><input type="radio" name="${name}" value="${value}" ${checked ? "checked" : ""}> ${label}</label>`;
}

function renderOnboarding() {
  const today = localISO(new Date());
  const defaultRun = [2, 4, 6];
  const dayChecks = DAY_NAMES.map(
    (_, i) => `<label class="chip"><input type="checkbox" name="day" value="${i}" ${defaultRun.includes(i) ? "checked" : ""}> ${dayName(i)}</label>`
  ).join("");
  const kit = [
    ["none", "eqNone"],
    ["dumbbells", "eqDumbbells"],
    ["kettlebells_and_essentials", "eqKettle"],
  ]
    .map(([v, k], i) => `<label class="chip chip--wide"><input type="radio" name="equipment" value="${v}" ${i === 0 ? "checked" : ""}> ${t(k)}</label>`)
    .join("");
  const optional = [
    ["foam_roller", "optFoam"],
    ["pullup_bar", "optPullup"],
    ["trx", "optTrx"],
  ]
    .map(([v, k]) => `<label class="chip"><input type="checkbox" name="equipmentOptional" value="${v}"> ${t(k)}</label>`)
    .join("");

  return shell(
    `
    <p class="app-tagline">${t("tagline")}</p>
    <form id="onboard-form" class="card" novalidate>
      <label class="field">
        <span>${t("obName")}</span>
        <input name="name" type="text" autocomplete="given-name" placeholder="${esc(t("obNamePh"))}">
      </label>
      <fieldset class="field">
        <legend>${t("obDays")}</legend>
        <div class="radio-row">${radio("days", 3, t("obDays3"), true)}${radio("days", 4, t("obDays4"), false)}</div>
        <p class="muted">${t("obDaysNote")}</p>
      </fieldset>
      <fieldset class="field">
        <legend>${t("obEquip")}</legend>
        <p class="muted">${t("obEquipNote")}</p>
        <div class="chip-row">${kit}</div>
        <p class="muted section-mini">${t("obOptional")}</p>
        <div class="chip-row">${optional}</div>
      </fieldset>
      <fieldset class="field" id="run-level-field">
        <legend>${t("obRunLevel")}</legend>
        <p class="muted">${t("obRunLevelNote")}</p>
        <div class="radio-row">${radio("runLevelMethod", "a", t("methodA"), true)}${radio("runLevelMethod", "b", t("methodB"), false)}</div>
        <div id="run-level-method-a">
          <p class="muted">${t("methodARules")}</p>
          <label class="field">
            <span>${t("contMin")}</span>
            <input name="continuousMin" type="number" min="0" max="45" value="25" inputmode="numeric">
          </label>
          <label class="check-row">
            <input type="checkbox" name="can30RunWalk">
            <span>${t("can30")}</span>
          </label>
          <fieldset class="field">
            <legend>${t("q3days")}</legend>
            <div class="radio-row">${radio("runs3Days", "yes", t("yes"), false)}${radio("runs3Days", "no", t("no"), true)}</div>
          </fieldset>
          <fieldset class="field">
            <legend>${t("q4mi")}</legend>
            <div class="radio-row">${radio("recent4Mi", "yes", t("yes"), false)}${radio("recent4Mi", "no", t("no"), true)}</div>
          </fieldset>
        </div>
        <div id="run-level-method-b" class="hidden">
          <fieldset class="field">
            <legend>${t("qCont")}</legend>
            <div class="radio-row">${radio("continuousRange", "lt20", t("qLt20"), false)}${radio("continuousRange", "m20_39", t("q20"), true)}${radio("continuousRange", "m40plus", t("q40"), false)}</div>
          </fieldset>
          <fieldset class="field">
            <legend>${t("qDaysNow")}</legend>
            <div class="radio-row">${radio("runDaysNow", "d0_1", t("qD01"), false)}${radio("runDaysNow", "d2", t("qD2"), false)}${radio("runDaysNow", "d3plus", t("qD3"), true)}</div>
          </fieldset>
        </div>
        <div class="card card-note hidden" id="not-ready-card" role="status"><p>${t("notReady")}</p></div>
        <p class="muted" id="run-level-preview"></p>
      </fieldset>
      <fieldset class="field">
        <legend>${t("obStrength")}</legend>
        <p class="muted">${t("obStrengthNote")}</p>
        <label class="field">
          <span>${t("pushTest")}</span>
          <small class="muted">${t("pushRules")}</small>
          <input name="pushups" type="number" min="0" max="100" value="5" inputmode="numeric">
        </label>
        <p class="muted" id="strength-level-preview"></p>
      </fieldset>
      <fieldset class="field">
        <legend>${t("obRunDays")}</legend>
        <div class="chip-row" id="run-day-chips">${dayChecks}</div>
      </fieldset>
      <details class="card card-note">
        <summary>${t("obDisclaimer")}</summary>
        <p class="disclaimer-text">${t("disclaimer")}</p>
      </details>
      <label class="field">
        <span>${t("obRace")}</span>
        <input name="race" type="date" value="">
      </label>
      <label class="field">
        <span>${t("obStart")}</span>
        <input name="start" type="date" value="${today}" required>
      </label>
      <p class="form-error hidden" id="form-error" role="alert"></p>
      <button type="submit" class="btn btn-primary btn-block" id="build-plan">${t("obBuild")}</button>
    </form>
    `,
    { showNav: false, title: t("appName") }
  );
}

function runInputFromForm(form) {
  const method = form.querySelector('input[name="runLevelMethod"]:checked')?.value || "a";
  if (method === "b") {
    return {
      method,
      runInput: {
        continuousRange: form.querySelector('input[name="continuousRange"]:checked')?.value || "m20_39",
        runDays: form.querySelector('input[name="runDaysNow"]:checked')?.value || "d0_1",
      },
    };
  }
  return {
    method,
    runInput: {
      continuousMin: form.querySelector('input[name="continuousMin"]')?.value ?? 0,
      can30RunWalk: !!form.querySelector('input[name="can30RunWalk"]')?.checked,
      runs3Days: form.querySelector('input[name="runs3Days"]:checked')?.value === "yes",
      recent4Mi: form.querySelector('input[name="recent4Mi"]:checked')?.value === "yes",
    },
  };
}

function placementFromForm(form) {
  const pushups = Number(form.querySelector('input[name="pushups"]')?.value ?? 0);
  return { ...resolveHalfPlacement({ ...runInputFromForm(form), pushups }), pushups };
}

function syncOnboarding(form) {
  const method = form.querySelector('input[name="runLevelMethod"]:checked')?.value || "a";
  $("#run-level-method-a", form).classList.toggle("hidden", method !== "a");
  $("#run-level-method-b", form).classList.toggle("hidden", method !== "b");
  const p = placementFromForm(form);
  $("#not-ready-card", form).classList.toggle("hidden", p.ok);
  $("#run-level-preview", form).textContent = p.ok ? t(p.runLevel === "average" ? "runLevelAvg" : "runLevelBeg") : "";
  $("#strength-level-preview", form).textContent = t(p.strengthLevel === "average" ? "strAvg" : "strBeg");
  $("#build-plan", form).disabled = !p.ok;
  const race = form.querySelector('input[name="race"]')?.value;
  if (race && p.ok) form.querySelector('input[name="start"]').value = startDateFromRace(race, weeksForHalfPlan(p.runLevel));
}

function showFormError(form, msg) {
  const el = $("#form-error", form);
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
}

function bindOnboarding() {
  const form = $("#onboard-form");
  if (!form) return;
  syncOnboarding(form);
  form.addEventListener("change", () => syncOnboarding(form));
  form.addEventListener("input", () => syncOnboarding(form));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const p = placementFromForm(form);
    if (!p.ok) {
      showFormError(form, t("notReady"));
      return;
    }
    const days = Number(fd.get("days") || 3);
    const preferredDays = [...form.querySelectorAll('input[name="day"]:checked')].map((el) => Number(el.value));
    if (preferredDays.length < days) {
      showFormError(form, t("errDays", { n: days }));
      return;
    }
    const runDays = preferredDays.slice(0, days);
    const raceDateISO = fd.get("race") || "";
    let startDateISO = fd.get("start") || localISO(new Date());
    if (raceDateISO) startDateISO = startDateFromRace(raceDateISO, weeksForHalfPlan(p.runLevel));
    const equipment = {
      kit: fd.get("equipment") || "none",
      optional: [...form.querySelectorAll('input[name="equipmentOptional"]:checked')].map((el) => el.value),
    };
    const rl = runInputFromForm(form);
    const plan = generateHalfPlan({
      daysPerWeek: days,
      runLevel: p.runLevel,
      strengthLevel: p.strengthLevel,
      preferredDays: runDays,
      startDateISO,
      raceDateISO,
      name: String(fd.get("name") || "").trim(),
      strengthPreferredDays: defaultStrengthDays(runDays, 2),
      equipment,
      units: "mi",
      pushups: p.pushups,
    });
    plan.meta.runLevelMethod = rl.method;
    plan.meta.runLevelInput = rl.runInput;
    setState({ ...plan, completed: [], strengthCompleted: [], settings: { voice: true, units: "mi" } });
    location.hash = "today";
    route();
  });
}

/* ---------- Labels (localized at render time) ---------- */

function workoutTitle(w) {
  const wk = w.weekIndex + 1;
  if (w.runRole === "race") return t("titleRace");
  if (w.runRole === "long") return t("titleLong", { w: wk });
  if (w.runRole === "workout" || w.runRole === "strides") return t("titleWorkout", { w: wk, name: lang === "es" ? t("workout") : w.sessionName || t("workout") });
  if (w.runRole === "recovery") return t("titleRecovery", { w: wk });
  return t("titleEasy", { w: wk });
}

function workoutSummary(w) {
  const lead = w.longRunKm ? formatDistance(w.longRunKm, units()) : `${w.durationMin || Math.round(workoutTotalSeconds(w) / 60)} min`;
  const rpe = w.rpe ? ` · RPE ${String(w.rpe).split(" ")[0]}` : "";
  const talk = lang === "en" && w.talkTest ? ` · ${w.talkTest}` : "";
  return lead + rpe + talk;
}

function stepLabel(s) {
  if (lang === "en") {
    if (s.part === "main" && /^(easy|recovery)$/.test(s.label)) return s.label === "easy" ? "Easy run" : "Recovery run";
    if (s.part === "long" || s.part === "race") return s.distanceKm ? (s.part === "race" ? `Race · ${formatRaceDistance(units())}` : `Long run · ${formatDistance(s.distanceKm, units())}`) : s.label;
    return s.label;
  }
  if (s.part === "warmup") return t("partWarmup");
  if (s.part === "cooldown") return t("partCooldown");
  if (s.part === "long") return t("partLong", { d: formatDistance(s.distanceKm || 0, units()) });
  if (s.part === "race") return t("partRace", { d: formatRaceDistance(units()) });
  if (s.mode === "rest") return t("rest");
  if (s.label === "Coach warm-up") return t("coachWarmup");
  if (s.label === "Cool-down stretch") return t("cooldown");
  if (s.part === "main") return t("partMain");
  return s.label;
}

function stepDetail(s) {
  if (lang !== "es") return "";
  if (s.part && !/^(easy|recovery)$/.test(s.label) && s.part !== "long" && s.part !== "race") return s.label;
  return "";
}

function strengthTitle(s) {
  return t("strengthTitle", { x: s.sessionType });
}

function equipmentLabel(meta) {
  const eq = normalizeHalfEquipment({ kit: meta.equipment, optional: meta.equipmentOptional || [] });
  const base = { none: "eqLabelNone", dumbbells: "eqLabelDb", kettlebells_and_essentials: "eqLabelKb" }[eq.kit] || "eqLabelNone";
  const opt = { foam_roller: "optFoam", pullup_bar: "optPullup", trx: "optTrx" };
  return t(base) + (eq.optional?.length ? ` · ${eq.optional.map((o) => t(opt[o] || o)).join(", ")}` : "");
}

/* ---------- Today ---------- */

function renderToday() {
  const workout = nextWorkout(state);
  const meta = state.meta;
  const greeting = meta.name ? t("hi", { name: esc(meta.name) }) : t("nextSession");
  const weekIndex = workout?.weekIndex ?? meta.weeks - 1;
  const strengthSessions = strengthForWeek(state, weekIndex);
  let runCard;
  if (!workout) {
    runCard = `<div class="card card-celebrate"><h2>${t("doneTitle")}</h2><p>${t("doneMsg", { n: meta.totalSessions })}</p><a class="btn btn-primary btn-block" href="#progress">${t("seeProgress")}</a></div>`;
  } else {
    const when = scheduledDateForWorkout(meta.startDateISO, workout, state.workouts);
    runCard = `
    <div class="card today-card" data-workout-id="${workout.id}">
      <p class="today-date">${formatDate(when, lang)}</p>
      <h2 class="today-title">${workoutTitle(workout)}</h2>
      <p class="today-summary">${esc(workoutSummary(workout))}</p>
      <p class="today-meta">${t("total", { t: formatDuration(workoutTotalSeconds(workout)) })} · ${t("weekOf", { w: workout.weekIndex + 1, n: meta.weeks })}</p>
      <button type="button" id="start-workout" class="btn btn-primary btn-block btn-start">${t("startRun")}</button>
      <button type="button" id="check-off-run" class="btn btn-secondary btn-block">${t("markDone")}</button>
    </div>`;
  }
  const strengthCards = strengthSessions
    .map((s) => {
      const done = isStrengthComplete(state, s.id);
      return `
    <div class="card today-card today-card--strength ${done ? "is-done" : ""}" data-strength-id="${s.id}">
      <h2 class="today-title">${strengthTitle(s)}</h2>
      <p class="today-meta">${dayName(s.weekday)} · ${t("optional")} · ${t("week", { w: s.weekIndex + 1 })}</p>
      ${
        done
          ? `<p class="done-pill">&#10003; ${t("markedDone")}</p><button type="button" class="btn btn-small btn-undo-strength" data-strength-id="${s.id}">${t("undo")}</button>`
          : `<button type="button" class="btn btn-secondary btn-block btn-start-strength" data-strength-id="${s.id}">${t("startStrength")}</button>
             <button type="button" class="btn btn-small btn-block btn-check-strength" data-strength-id="${s.id}">${t("markDone")}</button>`
      }
    </div>`;
    })
    .join("");
  return shell(
    `
    <p class="today-greet">${greeting}</p>
    ${runCard}
    ${strengthCards ? `<h2 class="section-mini">${t("strengthWeek")}</h2>${strengthCards}` : ""}
    ${state.repeatWeekBanner != null ? `<p class="banner">${t("repeatBanner", { w: state.repeatWeekBanner + 1 })}</p>` : ""}
    ${lang === "es" ? `<p class="muted coach-en-note">${t("coachEnNote")}</p>` : ""}
    `,
    { title: t("navToday") }
  );
}

function bindToday() {
  $("#start-workout")?.addEventListener("click", () => {
    const w = nextWorkout(state);
    if (!w) return;
    activeWorkoutId = w.id;
    location.hash = "workout";
  });
  $("#check-off-run")?.addEventListener("click", () => {
    const w = nextWorkout(state);
    if (!w) return;
    setState(markWorkoutComplete(state, w.id, { feel: "ok" }));
    route();
  });
  document.querySelectorAll(".btn-start-strength").forEach((btn) =>
    btn.addEventListener("click", () => {
      activeWorkoutId = btn.dataset.strengthId;
      location.hash = "strength-overview";
    })
  );
  document.querySelectorAll(".btn-check-strength").forEach((btn) =>
    btn.addEventListener("click", () => {
      setState(markStrengthComplete(state, btn.dataset.strengthId, {}));
      route();
    })
  );
  document.querySelectorAll(".btn-undo-strength").forEach((btn) =>
    btn.addEventListener("click", () => {
      setState(unmarkStrength(state, btn.dataset.strengthId));
      route();
    })
  );
}

/* ---------- Run workout ---------- */

function stepsForWorkout(workout) {
  if (!E2E) return workout.steps;
  return workout.steps.map((s) => ({ ...s, durationSeconds: 2 }));
}

function cueText(kind) {
  return { start: t("cueStart"), run: t("cueRun"), walk: t("cueWalk"), cooldown: t("cueCooldown"), halfway: t("cueHalfway"), complete: t("cueComplete") }[kind] || "";
}

function renderWorkout() {
  const workout = state.workouts.find((w) => w.id === activeWorkoutId) || nextWorkout(state);
  if (!workout) {
    location.hash = "today";
    return "";
  }
  activeWorkoutId = workout.id;
  const steps = stepsForWorkout(workout);
  const list = steps
    .map((s, i) => `<li class="step-preview ${i === 0 ? "is-current" : ""}" data-step="${i}">${esc(stepLabel(s))} · ${formatDuration(s.durationSeconds)}${s.effort ? ` · ${esc(s.effort)}` : ""}${stepDetail(s) ? `<br><small lang="en">${esc(stepDetail(s))}</small>` : ""}</li>`)
    .join("");
  return shell(
    `
    <div class="card timer-card" data-screen="timer">
      <p class="timer-phase" id="timer-phase">${esc(stepLabel(steps[0]))}</p>
      <p class="timer-countdown" id="timer-countdown" aria-live="polite">${formatDuration(steps[0].durationSeconds)}</p>
      <p class="timer-next">${t("next")}: <span id="timer-next">${esc(steps[1] ? stepLabel(steps[1]) : t("finish"))}</span></p>
      <div class="progress-bar" aria-hidden="true"><div class="progress-fill" id="timer-progress" style="width:0%"></div></div>
      <ul class="step-list">${list}</ul>
      <div class="timer-actions">
        <button type="button" class="btn btn-secondary" id="timer-pause">${t("pause")}</button>
        <button type="button" class="btn btn-secondary" id="timer-skip">${t("skip")}</button>
        <button type="button" class="btn btn-small" id="timer-exit">${t("exit")}</button>
      </div>
    </div>`,
    { showNav: false, title: t("runWorkout") }
  );
}

function bindWorkout() {
  const workout = state.workouts.find((w) => w.id === activeWorkoutId);
  if (!workout) return;
  const steps = stepsForWorkout(workout);
  const voice = getSettings(state).voice;
  activeTimer = new WorkoutTimer({
    steps,
    onTick: ({ step, remainingSeconds, overallProgress, stepIndex }) => {
      $("#timer-phase").textContent = stepLabel(step);
      $("#timer-countdown").textContent = formatDuration(remainingSeconds);
      $("#timer-progress").style.width = `${overallProgress * 100}%`;
      document.querySelectorAll(".step-preview").forEach((el, i) => el.classList.toggle("is-current", i === stepIndex));
      $("#timer-next").textContent = steps[stepIndex + 1] ? stepLabel(steps[stepIndex + 1]) : t("finish");
    },
    onComplete: () => {
      activeTimer = null;
      location.hash = "complete";
    },
    onCue: (kind) => speak(cueText(kind), voice),
  });
  activeTimer.start();
  let paused = false;
  $("#timer-pause").addEventListener("click", (e) => {
    paused ? activeTimer.resume() : activeTimer.pause();
    paused = !paused;
    e.currentTarget.textContent = paused ? t("resume") : t("pause");
  });
  $("#timer-skip").addEventListener("click", () => activeTimer.skipStep());
  $("#timer-exit").addEventListener("click", () => {
    activeTimer.stop();
    location.hash = "today";
  });
}

function renderComplete() {
  const workout = state.workouts.find((w) => w.id === activeWorkoutId);
  if (!workout) {
    location.hash = "today";
    return "";
  }
  return shell(
    `
    <div class="card">
      <h2>${t("niceWork")}</h2>
      <p>${t("saveNote", { title: workoutTitle(workout) })}</p>
      <form id="complete-form">
        <fieldset class="field">
          <legend>${t("feel")}</legend>
          <div class="radio-row">${radio("feel", "easy", t("easy"), false)}${radio("feel", "ok", t("ok"), true)}${radio("feel", "hard", t("hard"), false)}</div>
        </fieldset>
        <label class="field"><span>${t("notes")}</span><textarea name="notes" rows="3" placeholder="${esc(t("notesPh"))}"></textarea></label>
        <label class="check-row"><input type="checkbox" name="repeat"><span>${t("repeatWeek")}</span></label>
        <button type="submit" class="btn btn-primary btn-block">${t("saveContinue")}</button>
      </form>
    </div>`,
    { showNav: false, title: t("complete") }
  );
}

function bindComplete() {
  $("#complete-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    let next = markWorkoutComplete(state, activeWorkoutId, { feel: fd.get("feel"), notes: fd.get("notes") });
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

/* ---------- Strength ---------- */

function strengthWorkout() {
  return (state.strengthWorkouts || []).find((w) => w.id === activeWorkoutId);
}

function stepsForStrength(workout) {
  if (!E2E) return workout.steps;
  return workout.steps.slice(0, 3).map((s) => (s.mode === "reps" ? s : { ...s, durationSeconds: 2 }));
}

function renderStrengthOverview() {
  const workout = strengthWorkout();
  if (!workout) {
    location.hash = "today";
    return "";
  }
  const seen = new Set();
  const items = [];
  workout.steps.forEach((s) => {
    if (s.mode !== "reps" || seen.has(s.label)) return;
    seen.add(s.label);
    items.push(s);
  });
  const rounds = Math.max(1, ...workout.steps.map((s) => s.round || 1));
  const list = items
    .map(
      (ex, i) => `
      <li class="strength-exercise-item">
        <button type="button" class="strength-exercise-btn" aria-expanded="false" aria-controls="ex-${i}">
          <span class="strength-exercise-name">${esc(ex.label)}</span>
          <span class="strength-exercise-amount">${t("reps", { n: ex.reps })}</span>
        </button>
        <div class="strength-exercise-detail" id="ex-${i}" hidden lang="en">
          <p>${esc(ex.description || "")}</p>
          ${ex.easier ? `<p><strong>${t("easier")}:</strong> ${esc(ex.easier)}</p>` : ""}
          ${ex.harder ? `<p><strong>${t("harder")}:</strong> ${esc(ex.harder)}</p>` : ""}
        </div>
      </li>`
    )
    .join("");
  const phase = workout.phase ? workout.phase.charAt(0).toUpperCase() + workout.phase.slice(1) : "";
  return shell(
    `
    <div class="card strength-overview-card">
      <h2>${strengthTitle(workout)}</h2>
      <p class="strength-overview-meta">${t("strengthMeta", { eq: equipmentLabel(state.meta), phase })}</p>
      <div class="strength-outline">
        <p class="strength-outline-block"><strong>${t("warmup")}</strong> · 5 min</p>
        <div class="strength-outline-block">
          <p><strong>${t("circuit")}</strong> · ${t("rounds", { n: rounds })}</p>
          <ul class="strength-preview-list">${list}</ul>
          <p class="strength-rest-note">${t("restNote", { s: 45 })}</p>
        </div>
        <p class="strength-outline-block"><strong>${t("cooldown")}</strong> · 2 min</p>
      </div>
      <button type="button" id="begin-strength" class="btn btn-primary btn-block btn-start">${t("begin")}</button>
      <button type="button" id="back-today" class="btn btn-small btn-block">${t("back")}</button>
    </div>`,
    { showNav: false, title: t("strength"), extraFooter: t("strengthFooter") }
  );
}

function bindStrengthOverview() {
  document.querySelectorAll(".strength-exercise-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const panel = document.getElementById(btn.getAttribute("aria-controls"));
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      if (panel) panel.hidden = open;
    })
  );
  $("#begin-strength")?.addEventListener("click", () => (location.hash = "strength-workout"));
  $("#back-today")?.addEventListener("click", () => (location.hash = "today"));
}

function renderStrengthWorkout() {
  const workout = strengthWorkout();
  if (!workout) {
    location.hash = "today";
    return "";
  }
  const steps = stepsForStrength(workout);
  return shell(
    `
    <div class="card timer-card timer-card--strength" data-screen="strength-timer">
      <p class="timer-phase" id="timer-phase"></p>
      <p class="timer-desc" id="timer-desc" lang="en"></p>
      <p class="timer-countdown" id="timer-countdown" aria-live="polite"></p>
      <p class="timer-variant muted" id="timer-variant" lang="en"></p>
      <p class="timer-next">${t("next")}: <span id="timer-next">${esc(steps[1] ? stepLabel(steps[1]) : t("finish"))}</span></p>
      <div class="progress-bar" aria-hidden="true"><div class="progress-fill progress-fill--strength" id="timer-progress" style="width:0%"></div></div>
      <div class="timer-actions">
        <button type="button" class="btn btn-primary" id="strength-done" hidden>${t("done")}</button>
        <button type="button" class="btn btn-secondary" id="timer-pause">${t("pause")}</button>
        <button type="button" class="btn btn-secondary" id="timer-skip">${t("skip")}</button>
        <button type="button" class="btn btn-small" id="timer-exit">${t("exit")}</button>
      </div>
    </div>`,
    { showNav: false, title: t("strength"), extraFooter: t("strengthFooter") }
  );
}

function bindStrengthWorkout() {
  const workout = strengthWorkout();
  if (!workout) return;
  const steps = stepsForStrength(workout);
  const voice = getSettings(state).voice;
  const updateUi = ({ step, remainingSeconds, overallProgress, stepIndex }) => {
    $("#timer-phase").textContent = stepLabel(step);
    $("#timer-desc").textContent = step.mode === "rest" ? t("breathe") : step.description || "";
    const doneBtn = $("#strength-done");
    if (step.mode === "reps") {
      $("#timer-countdown").textContent = t("reps", { n: step.reps });
      doneBtn.hidden = false;
    } else {
      $("#timer-countdown").textContent = formatDuration(Math.max(0, remainingSeconds ?? step.durationSeconds));
      doneBtn.hidden = true;
    }
    $("#timer-variant").textContent = step.easier && step.harder ? `${t("easier")}: ${step.easier} · ${t("harder")}: ${step.harder}` : "";
    $("#timer-progress").style.width = `${(overallProgress || 0) * 100}%`;
    $("#timer-next").textContent = steps[stepIndex + 1] ? stepLabel(steps[stepIndex + 1]) : t("finish");
  };
  activeTimer = new StrengthTimer({
    steps,
    onTick: updateUi,
    onComplete: () => {
      activeTimer = null;
      location.hash = "strength-complete";
    },
    onCue: (kind, text) => {
      if (kind === "custom") speak(lang === "es" ? (/^Rest/.test(text) ? t("cueRest") : "") : text, voice);
      else if (kind === "complete") speak(t("cueStrengthDone"), voice);
      else if (kind === "halfway") speak(t("cueHalfway"), voice);
    },
  });
  activeTimer.start();
  updateUi({ step: steps[0], stepIndex: 0, remainingSeconds: steps[0].durationSeconds, overallProgress: 0 });
  let paused = false;
  $("#timer-pause").addEventListener("click", (e) => {
    paused ? activeTimer.resume() : activeTimer.pause();
    paused = !paused;
    e.currentTarget.textContent = paused ? t("resume") : t("pause");
  });
  $("#strength-done").addEventListener("click", () => activeTimer.completeRepStep());
  $("#timer-skip").addEventListener("click", () => activeTimer.skipStep());
  $("#timer-exit").addEventListener("click", () => {
    activeTimer.stop();
    location.hash = "today";
  });
}

function renderStrengthComplete() {
  const workout = strengthWorkout();
  if (!workout) {
    location.hash = "today";
    return "";
  }
  return shell(
    `
    <div class="card">
      <h2>${t("strengthSave")}</h2>
      <p>${t("strengthSaveMsg", { title: strengthTitle(workout) })}</p>
      <form id="strength-complete-form">
        <button type="submit" class="btn btn-primary btn-block">${t("markComplete")}</button>
        <button type="button" id="skip-strength-save" class="btn btn-secondary btn-block">${t("skipSave")}</button>
      </form>
    </div>`,
    { showNav: false, title: t("complete") }
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

/* ---------- Plan / Progress / Settings ---------- */

function daysUntilRace(meta) {
  if (!meta.raceDateISO) return null;
  const race = parseDateOnly(meta.raceDateISO);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((race - today) / 86400000);
}

function renderPlan() {
  const meta = state.meta;
  const longRuns = state.longRunProgressionKm || longRunProgressionKm(meta.runLevel || "beginner", meta.daysPerWeek);
  const peakLong = longRuns?.length ? Math.max(...longRuns.slice(0, Math.max(0, meta.weeks - 2))) : null;
  const countdown = daysUntilRace(meta);
  const effortRows = (COACH_EFFORT_GUIDE?.scale || [])
    .slice(0, 6)
    .map((r) => `<tr><td>${esc(r.rpe)}</td><td lang="en">${esc(r.label)}</td><td lang="en">${esc(r.talk_test)}</td></tr>`)
    .join("");
  let weeksHtml = "";
  for (let w = 0; w < meta.weeks; w++) {
    const runs = state.workouts
      .filter((x) => x.weekIndex === w)
      .map((x) => {
        const done = isWorkoutComplete(state, x.id);
        return `<li class="plan-item ${done ? "is-done" : ""}"><span class="plan-check" aria-hidden="true">${done ? "&#10003;" : "&#9675;"}</span><span>${workoutTitle(x)}<br><small>${esc(workoutSummary(x))}</small></span></li>`;
      });
    const strengths = (state.strengthWorkouts || [])
      .filter((x) => x.weekIndex === w)
      .map((x) => {
        const done = isStrengthComplete(state, x.id);
        return `<li class="plan-item plan-item--strength ${done ? "is-done" : ""}"><span class="plan-check" aria-hidden="true">${done ? "&#10003;" : "&#9675;"}</span><span>${strengthTitle(x)}<br><small>${dayName(x.weekday)} · ${t("optional")}</small></span></li>`;
      });
    const longNote = longRuns?.[w] ? ` · ${t("longNote", { d: formatDistance(longRuns[w], units()) })}` : "";
    weeksHtml += `<section class="plan-week" data-week="${w + 1}"><h2>${t("week", { w: w + 1 })}${longNote}</h2><ul>${[...runs, ...strengths].join("")}</ul></section>`;
  }
  return shell(
    `<div class="plan-scroll">
      <div class="card plan-overview-card">
        <h2>${t("yourPlan")}</h2>
        <p><strong>${t("goal")}:</strong> ${t("goalVal", { d: formatRaceDistance(units()), lvl: lvl(meta.runLevel) })}</p>
        <p><strong>${t("length")}:</strong> ${t("lengthVal", { w: meta.weeks, d: meta.daysPerWeek, s: lvl(meta.strengthLevel) })}</p>
        <p><strong>${t("equipment")}:</strong> ${equipmentLabel(meta)}</p>
        <details class="plan-effort-guide"><summary>${t("effortGuide")}</summary>
          <table class="effort-table"><thead><tr><th>${t("rpe")}</th><th>${t("feelCol")}</th><th>${t("talk")}</th></tr></thead><tbody>${effortRows}</tbody></table>
        </details>
        <details><summary>${t("obDisclaimer")}</summary><p class="disclaimer-text">${t("disclaimer")}</p></details>
        ${countdown != null ? `<p class="plan-countdown">${t("countdown", { n: countdown, d: meta.raceDateISO })}</p>` : `<p class="muted">${t("addRace")}</p>`}
        ${peakLong ? `<p class="muted">${t("peak", { d: formatDistance(peakLong, units()) })}</p>` : ""}
      </div>
      ${weeksHtml}
    </div>`,
    { title: t("navPlan") }
  );
}

function renderProgress() {
  const s = stats(state);
  const meta = state.meta;
  const finish = s.allDone
    ? `<div class="card card-celebrate"><h2>${t("finishLine")}</h2><p>${t("finishMsg", { w: meta.weeks, r: s.workoutsDone, s: s.strengthDone })}</p></div>`
    : `<p class="muted">${t("keepGoing", { w: meta.weeks })}</p>`;
  return shell(
    `
    <div class="stats-grid">
      <div class="stat"><span class="stat-num">${s.streak}</span><span class="stat-label">${t("streak")}</span></div>
      <div class="stat"><span class="stat-num">${s.workoutsDone}</span><span class="stat-label">${t("runsDone")}</span></div>
      <div class="stat"><span class="stat-num">${s.strengthDone}</span><span class="stat-label">${t("strengthDone")}</span></div>
    </div>
    <div class="stats-grid stats-grid--secondary">
      <div class="stat"><span class="stat-num">${s.totalMinutes}</span><span class="stat-label">${t("runMin")}</span></div>
      <div class="stat"><span class="stat-num">${s.strengthMinutes}</span><span class="stat-label">${t("strengthMin")}</span></div>
      <div class="stat"><span class="stat-num">${s.totalStrength}</span><span class="stat-label">${t("strengthPlanned")}</span></div>
    </div>
    ${finish}`,
    { title: t("navProgress") }
  );
}

function renderSettings() {
  const { voice } = getSettings(state);
  const u = units();
  const d = state.meta.daysPerWeek;
  return shell(
    `
    <div class="card settings-card">
      <h2>${t("language")}</h2>
      <div class="radio-row" id="lang-setting">${radio("slang", "en", "English", lang === "en")}${radio("slang", "es", "Español", lang === "es")}</div>
    </div>
    <div class="card settings-card">
      <h2>${t("units")}</h2>
      <div class="radio-row" id="units-setting">${radio("sunits", "mi", t("miles"), u === "mi")}${radio("sunits", "km", t("km"), u === "km")}</div>
      <button type="button" class="btn btn-secondary btn-block" id="apply-units">${t("saveUnits")}</button>
    </div>
    <div class="card settings-card">
      <h2>${t("raceDay")}</h2>
      <label class="field"><span>${t("raceOpt")}</span><input type="date" id="race-date-input" value="${state.meta.raceDateISO || ""}"></label>
      <button type="button" class="btn btn-secondary btn-block" id="apply-race">${t("saveRace")}</button>
    </div>
    <div class="card settings-card">
      <h2>${t("schedule")}</h2>
      <p>${t("scheduleNote")}</p>
      <div class="radio-row" id="days-setting">${radio("sdays", 3, t("perWeek", { n: 3 }), d === 3)}${radio("sdays", 4, t("perWeek", { n: 4 }), d === 4)}</div>
      <button type="button" class="btn btn-secondary btn-block" id="apply-days">${t("applyDays")}</button>
    </div>
    <div class="card settings-card">
      <label class="check-row"><input type="checkbox" id="voice-toggle" ${voice ? "checked" : ""}><span>${t("voice")}</span></label>
    </div>
    <div class="card settings-card">
      <p class="muted">${t("dataNote")}</p>
      <button type="button" class="btn btn-secondary btn-block" id="export-btn">${t("export")}</button>
      <button type="button" class="btn btn-secondary btn-block" id="reset-btn">${t("reset")}</button>
    </div>
    <div class="card settings-card refund-card">
      <h2>${t("refundTitle")}</h2>
      <p>${t("refund")}</p>
    </div>`,
    { title: t("settings") }
  );
}

function bindSettings() {
  document.querySelectorAll('#lang-setting input[name="slang"]').forEach((el) =>
    el.addEventListener("change", (e) => switchLang(e.target.value))
  );
  $("#voice-toggle")?.addEventListener("change", (e) => setState(updateSettings(state, { voice: e.target.checked })));
  $("#export-btn")?.addEventListener("click", () => {
    const blob = new Blob([exportState()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "5k-to-half-marathon-backup.json";
    a.click();
  });
  $("#reset-btn")?.addEventListener("click", () => {
    if (!confirm(t("resetConfirm"))) return;
    resetState();
    state = null;
    location.hash = "onboarding";
    route();
  });
  $("#apply-units")?.addEventListener("click", () => {
    const val = document.querySelector('#units-setting input[name="sunits"]:checked')?.value || "mi";
    setState(updateSettings(state, { units: val }));
    route();
  });
  $("#apply-race")?.addEventListener("click", () => {
    const raceDateISO = $("#race-date-input")?.value || "";
    let meta = { ...state.meta, raceDateISO };
    if (raceDateISO) meta = { ...meta, startDateISO: startDateFromRace(raceDateISO, meta.weeks) };
    setState({ ...state, meta });
    route();
  });
  $("#apply-days")?.addEventListener("click", () => {
    const val = Number(document.querySelector('#days-setting input[name="sdays"]:checked')?.value);
    if (!val || val === state.meta.daysPerWeek) return;
    const fromWeek = nextWorkout(state)?.weekIndex ?? 0;
    const preferred = state.meta.preferredDays.slice(0, val);
    while (preferred.length < val) preferred.push(defaultStrengthDays(preferred, 1)[0] ?? 0);
    const replanned = replanHalfFromWeek({ ...state, meta: { ...state.meta, daysPerWeek: val, preferredDays: preferred } }, fromWeek);
    setState({ ...replanned, settings: getSettings(state) });
    alert(t("planUpdated", { w: replanned.meta.weeks, n: val }));
    route();
  });
}

function init() {
  setLang(lang);
  window.addEventListener("hashchange", route);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
  route();
}

init();

window.__halfApp = {
  weeksForHalfPlan,
  resolveHalfPlacement,
  resolveRunLevelMethodA,
  resolveRunLevelMethodB,
  strengthLevelFromPushUps,
  loadState: () => loadState(),
  nextWorkout: () => (state ? nextWorkout(state) : null),
  unmarkWorkout: (id) => setState(unmarkWorkout(state, id)),
  lang: () => lang,
};
