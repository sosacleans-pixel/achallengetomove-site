import { CONFIG } from "./config.js";
import { BUNDLES, PROGRAM_EN, detectLang, storeLang } from "./i18n.js";
import { initDateOverride, overrideActive, now, dateKey, countdown, fmtDate, parseKey, setLocale } from "./dates.js";
import { loadState, saveState, clearState, defaultState } from "./storage.js";
import { HABITS, todayN as todayNFor, joinDay, editable, statusOf, counts, target, deadline, streaks, totalPoints, badges, isComplete, modeOf, startOf, endOf, dateFor, phaseOf, selfOnlyNow, startSelfRound } from "./rules.js";

initDateOverride();

/* ---------- language ---------- */
let lang = detectLang();
let S = BUNDLES[lang].S;
let PROGRAM = BUNDLES[lang].PROGRAM;
function applyLang(l) {
  lang = BUNDLES[l] ? l : "en";
  ({ S, PROGRAM } = BUNDLES[lang]);
  setLocale(BUNDLES[lang].locale);
  document.documentElement.lang = lang;
  document.title = S.ui.pageTitle;
  const set = (sel, txt) => { const el = document.querySelector(sel); if (el) el.textContent = txt; };
  set(".skip-link", S.ui.skip);
  const bt = document.querySelector("#brand-title"); if (bt) bt.innerHTML = escT(S.appShort);
  set("#brand-sub", S.houseMark);
  set("#app-footer-text", S.footer);
}
function setLang(l) { storeLang(l); applyLang(l); render(); }
function langSwitch(id) {
  const L = S.langSwitch;
  return `<div class="lang-switch" role="group" aria-label="${esc(L.label)}" id="${id}"><span class="lang-label">${esc(L.label)}</span>
    <button type="button" class="lang-btn ${lang === "en" ? "is-active" : ""}" data-lang="en" aria-pressed="${lang === "en"}" lang="en" title="${esc(L.enName)}">${esc(L.en)}</button>
    <button type="button" class="lang-btn ${lang === "es" ? "is-active" : ""}" data-lang="es" aria-pressed="${lang === "es"}" lang="es" title="${esc(L.esName)}">${esc(L.es)}</button></div>`;
}
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-lang]"); if (b) { e.preventDefault(); setLang(b.dataset.lang); } });

const main = document.getElementById("app-main");
const nav = document.getElementById("bottom-nav");
let state = loadState();
let draft = null; // setup in progress
let countdownTimer = null;
const previewPrefs = { level: "b", equipment: "none" }; // used before setup (not saved)

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Titles: keep "X-mas" on one line (never break at the hyphen).
const escT = (v) => esc(v).replace(/X-mas/g, '<span class="nowrap">X-mas</span>');
applyLang(lang);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const dayData = (n) => PROGRAM.days[n - 1];
const setupDone = () => !!(state && state.setupDone);
const ctxState = () => (setupDone() ? state : null); // null = visitor (live, or self-paced preview after Dec 24)
const todayN = () => todayNFor(ctxState());
const isSelf = () => modeOf(ctxState()) === "self";

function persist() { saveState(state); }

function toast(msg) {
  const host = document.getElementById("toast-host");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

/* ---------- shell ---------- */
function renderChrome(route) {
  const o = overrideActive();
  const rib = document.getElementById("debug-ribbon");
  if (o) { rib.textContent = S.debugRibbon(o.replace("T", " ")); rib.classList.remove("hidden"); } else rib.classList.add("hidden");
  const inSetup = route.startsWith("setup");
  nav.classList.toggle("hidden", inSetup);
  const items = [["today", S.nav.today, "◉"], ["plan", S.nav.plan, "▦"], ["progress", S.nav.progress, "▲"], ["moves", S.nav.moves, "✚"], ["more", S.nav.more, "≡"]];
  const active = route.split("/")[0] === "day" ? "today" : route.split("/")[0] === "legal" ? "more" : route.split("/")[0];
  nav.innerHTML = items.map(([id, label, ic]) => `<a href="#/${id}" class="${active === id ? "is-active" : ""}" ${active === id ? 'aria-current="page"' : ""}><span aria-hidden="true">${ic}</span><br>${esc(label)}</a>`).join("");
}

function render() {
  clearInterval(countdownTimer);
  const route = (location.hash || "#/today").replace(/^#\/?/, "") || "today";
  renderChrome(route);
  const [r, a] = route.split("/");
  const views = { today: viewToday, day: () => viewDay(Number(a)), plan: viewPlan, progress: viewProgress, moves: viewMoves, more: viewMore, legal: () => viewLegal(a), setup: () => viewSetup(Number(a) || 1), done: viewDone, welcome: viewWelcome };
  (views[r] || viewToday)();
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/* ---------- welcome / countdown ---------- */
function countdownHTML() {
  const c = countdown(now());
  return `<div class="countdown" id="countdown" aria-live="off">
    <div class="cd-label">${esc(S.welcome.startsIn)}</div>
    <div class="cd-row"><div><b id="cd-d">${c.days}</b><span>${S.welcome.days}</span></div><div><b id="cd-h">${c.hours}</b><span>${S.welcome.hours}</span></div><div><b id="cd-m">${c.mins}</b><span>${S.welcome.mins}</span></div></div>
    <p class="cd-sub">${esc(S.welcome.startsOn)}</p></div>`;
}
function tickCountdown() {
  countdownTimer = setInterval(() => {
    const c = countdown(now());
    if (!$("#cd-d")) return clearInterval(countdownTimer);
    $("#cd-d").textContent = c.days; $("#cd-h").textContent = c.hours; $("#cd-m").textContent = c.mins;
    if (c.ms <= 0) { clearInterval(countdownTimer); render(); }
  }, 30000);
}

function viewWelcome() {
  const selfOnly = selfOnlyNow();
  const ph = selfOnly ? "self" : phaseOf(null);
  const t = todayN();
  const W = S.welcome;
  const SP = S.self;
  let status = "";
  let cta = `<a class="btn btn-primary btn-block" id="start-setup" href="#/setup/1">${esc(W.startBtn)}</a>`;
  const offerSelf = CONFIG.selfPaced.enabled && CONFIG.selfPaced.offerChoice;
  let selfChoice = offerSelf ? `<div class="card self-choice" id="self-choice"><p class="small">${esc(SP.choiceLead)}</p><a class="btn btn-secondary btn-block" id="start-self" href="#/setup/1">${esc(SP.choiceBtn)}</a></div>` : "";
  if (ph === "pre") status = countdownHTML();
  else if (ph === "live") {
    if (t === 1 || CONFIG.lateJoin) status = `<div class="card late-card"><h2>${esc(W.lateTitle(t))}</h2><p>${esc(W.lateLead(31 - t))}</p></div>`;
    else { status = `<div class="card"><p>${esc(W.lateClosed)}</p></div>`; cta = ""; }
  } else {
    // After Dec 24: self-paced edition only. Day 1 = the day they finish setup.
    status = `<div class="card"><h2>${esc(W.postTitle)}</h2><p>${esc(W.postLead)}</p></div>
      <div class="card self-card" id="self-start-card"><p class="kicker">${esc(SP.label)}</p><h2>${esc(SP.welcomeTitle)}</h2><p>${esc(SP.welcomeLead)}</p></div>`;
    cta = `<a class="btn btn-primary btn-block" id="start-self" href="#/setup/1">${esc(SP.startBtn)}</a>`;
    selfChoice = "";
  }
  main.innerHTML = `
    ${langSwitch("lang-welcome")}
    <section class="hero">
      <p class="kicker">${esc(W.kicker)}</p>
      <h1 class="hero-title">${escT(W.title)}</h1>
      <p class="hero-desc">${esc(S.descriptor)}${ph === "self" ? "" : ` · ${esc(S.dates)}`}</p>
      <p class="tagline">${esc(S.tagline)}</p>
    </section>
    ${status}
    <div class="card"><p>${esc(W.lead)}</p><ul class="rules-list">${W.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
      <p class="why-banner">${esc(W.coachQuote)}</p></div>
    <div class="btn-stack">${cta}
      ${ph === "pre" ? `<a class="btn btn-secondary btn-block" id="preview-day1" href="#/day/1">${esc(W.previewBtn)}</a>` : ""}
      <a class="btn btn-secondary btn-block" href="#/plan">${esc(W.planBtn)}</a></div>
    ${cta ? selfChoice : ""}
    <p class="muted small center">${esc(W.purchase)}</p>
    ${legalLinks()}`;
  $("#start-setup")?.addEventListener("click", () => { draft = newDraft("live"); });
  $("#start-self")?.addEventListener("click", () => { draft = newDraft("self"); });
  if (ph === "pre") tickCountdown();
}

function legalLinks() {
  return `<p class="legal-links small center"><a href="#/legal/disclaimer">${esc(S.legal.disclaimerTitle)}</a> · <a href="#/legal/safety">${esc(S.setup.readSafety)}</a> · <a href="#/legal/terms">${esc(S.legal.termsTitle)}</a> · <a href="#/legal/refund">${esc(S.legal.refundTitle)}</a> · <a href="#/legal/privacy">${esc(S.setup.readPrivacy)}</a></p>`;
}

/* ---------- today ---------- */
function viewToday() {
  if (!state || !state.setupDone) return viewWelcome();
  const ph = phaseOf(state);
  if (ph === "pre") {
    main.innerHTML = `<h1 class="page-title">${escT(S.appShort)}</h1>${countdownHTML()}
      <div class="card"><p><strong>${esc(S.levels[state.level])}</strong> · ${esc(S.equip[state.equipment])}</p><p class="muted">${esc(S.levelCap[state.level])}</p></div>
      <div class="btn-stack"><a class="btn btn-primary btn-block" id="preview-day1" href="#/day/1">${esc(S.welcome.previewBtn)}</a>
      <a class="btn btn-secondary btn-block" href="#/plan">${esc(S.welcome.planBtn)}</a></div>
      <p class="why-banner">${esc(S.welcome.coachQuote)}</p>`;
    return tickCountdown();
  }
  if (ph === "post") return viewDone();
  viewDay(todayN());
}

/* ---------- day ---------- */
function fmtBlock(b) {
  const [id, sets, reps, time, ex, note] = b;
  const lib = PROGRAM.library[id];
  const testNames = { "TEST-PU": S.tests.pu, "TEST-STS": S.tests.sts, "TEST-WALK": S.tests.walk, "TEST-BAL": S.tests.bal };
  const name = lib ? lib.name : testNames[id] || id;
  let dose = "";
  if (sets && reps) dose = `${sets} × ${reps}`;
  else if (sets && time) dose = `${sets} × ${time}`;
  else if (time) dose = time;
  else if (reps) dose = reps;
  const details = lib ? `<details class="move-details"><summary>${esc(S.day.moveDetails)}</summary>
      ${lib.cues ? `<p><strong>${esc(S.moves.cues)}:</strong> ${esc(lib.cues)}</p>` : ""}
      ${lib.adapt ? `<p><strong>${esc(S.moves.adapt)}:</strong> ${esc(lib.adapt)}</p>` : ""}
      ${lib.optional ? `<p><strong>${esc(S.moves.optional)}:</strong> ${esc(lib.optional)}</p>` : ""}</details>` : "";
  return `<li class="block"><div class="block-head"><span class="code">${esc(id.replace("TEST-", ""))}</span><strong>${esc(name)}</strong>${dose ? `<span class="dose">${esc(dose)}</span>` : ""}</div>
    ${ex ? `<div class="block-ex">${esc(ex)}</div>` : ""}${note ? `<div class="block-note muted">${esc(note)}</div>` : ""}${details}</li>`;
}

function viewDay(n) {
  if (!(n >= 1 && n <= 30)) return viewToday();
  const D = dayData(n);
  const L = state?.level || previewPrefs.level;
  const E = state?.equipment || previewPrefs.equipment;
  const sess = D.lv[L];
  const cs = ctxState();
  const ph = phaseOf(cs);
  const self = isSelf();
  const setup = setupDone();
  const dateK = dateFor(cs, n);
  const canLog = editable(state, n);
  const st = setup ? statusOf(state, n) : "future";
  const rec = (state && state.days[n]) || {};
  const t = todayN();
  const weekday = parseKey(dateK).getDay();
  let banner = "";
  if (!setup && ph === "pre" && n === 1) banner = `<div class="notice">${esc(S.day.previewDay1)}</div>`;
  else if (!setup && self) banner = `<div class="notice">${esc(S.day.preview)}</div>`;
  else if (setup && ph === "pre") banner = `<div class="notice">${esc(n === 1 ? S.day.previewDay1 : S.day.preview)}</div>`;
  else if (!canLog && st === "future") banner = `<div class="notice">${esc(S.day.future)}</div>`;
  else if (!canLog && st === "before") banner = `<div class="notice">${esc(S.day.beforeJoin)}</div>`;
  else if (!canLog && setup) banner = `<div class="notice">${esc(S.day.locked)}</div>`;
  else if (canLog && n === t - 1) banner = `<div class="notice">${esc(S.day.backlogNote)}</div>`;
  const nudges = [];
  if (setup && canLog && state.busyDays.includes(weekday)) nudges.push(`<div class="notice notice-busy" id="busy-nudge">${esc(S.day.busyNudge)}</div>`);
  if (setup && state.setup.readiness.some(Boolean)) nudges.push(`<div class="notice notice-gentle">${esc(S.day.gentleNudge)}</div>`);
  const done = isComplete(rec);
  const statusLine = rec.status === "core" ? S.day.completeCore : rec.status === "floor" ? S.day.completeFloor : rec.status === "protected" ? (self ? S.self.protectedDay : S.day.protectedDay) : "";
  const isCircuit = /Circuit/.test(PROGRAM_EN.days[n - 1].type);
  const focus = (self && S.self.focus[n]) || D.focus;
  const flexNote = self ? "" : D.flexNote;
  const tabs = `<div class="tabs" role="tablist">
      <button role="tab" class="tab is-active" data-tab="core" aria-selected="true">${esc(S.day.core)}</button>
      <button role="tab" class="tab" data-tab="floor" aria-selected="false">${esc(S.day.floor)}</button></div>`;
  const coreHTML = `<div class="tabpanel" data-panel="core">
      <p class="muted">${esc(S.day.coreAbout(sess.core.min))}${sess.core.theme ? ` · <strong>${esc(sess.core.theme)}</strong>` : ""}</p>
      ${sess.core.fmt ? `<p class="fmt">${esc(sess.core.fmt)}</p>` : ""}
      <ol class="block-list">${sess.core.eq[E].map(fmtBlock).join("")}</ol>
      ${isCircuit ? `<p class="muted small">${esc(S.day.bookSwap)}</p>` : ""}
      <p class="muted small">${esc(S.day.split)}</p></div>`;
  const floorHTML = `<div class="tabpanel hidden" data-panel="floor">
      <p class="muted">${esc(S.day.floorAbout(sess.floor.min))}</p>
      <p class="fmt">${esc(sess.floor.text)}</p>
      <ol class="block-list">${sess.floor.eq[E].map(fmtBlock).join("")}</ol></div>`;
  const actions = canLog ? (rec.status
      ? `<div class="card status-card ${rec.status}"><p><strong>${esc(statusLine)}</strong></p><button class="btn btn-secondary btn-small" id="undo-day">${esc(S.day.undo)}</button></div>`
      : `<div class="log-actions"><button class="btn btn-primary btn-block" id="log-core">${esc(S.day.doneCore)}</button>
         <button class="btn btn-floor btn-block" id="log-floor">${esc(S.day.doneFloor)}</button>
         <div class="row-2"><button class="btn btn-stop btn-small" id="stop-log">${esc(S.day.stopLog)}</button>
         <button class="btn btn-secondary btn-small" id="mark-protected">${esc(S.day.markProtected)}</button></div></div>`)
    : (statusLine ? `<div class="card status-card ${rec.status}"><p><strong>${esc(statusLine)}</strong></p></div>` : "");
  const habits = setup ? `<section class="card"><h2>${esc(S.day.habitsTitle)}</h2><p class="muted small">${esc(S.day.habitsNote)}</p>
      <div class="task-tiles">${HABITS.map((h) => `<button class="task-tile ${rec.habits?.[h] ? "done" : ""}" data-habit="${h}" ${canLog ? "" : "disabled"} aria-pressed="${!!rec.habits?.[h]}">
        <span class="check" aria-hidden="true"></span><span><span class="task-tile-label">${esc(S.habits[h].label)}</span><br><span class="muted small">${esc(S.habits[h].text)}</span></span></button>`).join("")}</div>
      ${canLog ? `<label class="field mt"><span>${esc(S.habits.stepsInput)}</span><input type="number" inputmode="numeric" min="0" max="100000" id="steps-input" value="${esc(rec.steps ?? "")}"></label>` : ""}</section>` : "";
  const feel = setup && canLog && done ? `<section class="card"><h2>${esc(S.day.howItFelt)}</h2>
      <label class="field"><span>${esc(S.day.rpeLabel)}</span><select id="rpe-input"><option value=""></option>${[1,2,3,4,5,6,7,8,9,10].map((v) => `<option ${Number(rec.rpe) === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="check-line"><input type="checkbox" id="pain-input" ${rec.pain ? "checked" : ""}> ${esc(S.day.painLabel)}</label>
      <p class="muted small ${rec.pain ? "" : "hidden"}" id="pain-note">${esc(S.day.painNote)}</p></section>` : "";
  const isTestDay = CONFIG.testDays.includes(n) || (setup && n === joinDay(state) && joinDay(state) > 1 && !hasTest(1));
  const testKey = n === 30 ? 30 : 1;
  const tests = setup && isTestDay ? testsForm(testKey, canLog) : "";
  const check15 = setup && n === CONFIG.optionalCheckDay ? check15Form(canLog) : "";
  const checkin = setup && CONFIG.checkinDays.includes(n) ? `<section class="card"><h2>${esc(n === 30 ? S.day.reflectionTitle : S.day.checkinTitle)}</h2>
      <label class="field"><span>${esc(S.day.checkinQ1)}</span><textarea id="ci-q1" rows="2" ${canLog ? "" : "disabled"}>${esc(rec.checkin?.q1 || "")}</textarea></label>
      <label class="field"><span>${esc(S.day.checkinQ2)}</span><textarea id="ci-q2" rows="2" ${canLog ? "" : "disabled"}>${esc(rec.checkin?.q2 || "")}</textarea></label>
      ${canLog ? `<button class="btn btn-secondary btn-small" id="ci-save">${esc(S.day.save)}</button>` : ""}</section>` : "";
  const book = CONFIG.bookTieInDays.includes(n) ? `<div class="card book-card"><p>📖 ${esc(S.day.bookCard)}</p></div>` : "";
  const extras = [];
  if (n === 2 && !self) extras.push(S.day.thanksgiving);
  if (n === 28) extras.push(self ? S.self.pickRetest : S.day.pickRetest);
  if (n === 30) extras.push(self ? S.self.retestMove : S.day.retestMove);
  main.innerHTML = `
    <div class="day-nav">${n > 1 ? `<a href="#/day/${n - 1}" class="btn btn-secondary btn-small" aria-label="${esc(S.ui.prevDay)}">‹</a>` : "<span></span>"}
      <span class="muted small">${esc(S.day.week(D.week))}</span>
      ${n < 30 ? `<a href="#/day/${n + 1}" class="btn btn-secondary btn-small" aria-label="${esc(S.ui.nextDay)}">›</a>` : "<span></span>"}</div>
    <header class="day-head ${D.flex ? "is-flex" : ""}">
      <p class="kicker">${esc(S.day.of30(n))} · ${esc(fmtDate(dateK))}${self && setup ? ` · ${esc(S.self.label)}` : ""}</p>
      <h1 class="page-title">${esc(D.type)}${D.flex ? ` <span class="flex-badge">⚑ ${esc(S.day.flex)}</span>` : ""}</h1>
      ${flexNote ? `<p class="muted">${esc(flexNote)}</p>` : ""}
      <p class="why-banner">${esc(focus)}</p>
    </header>
    ${banner}${nudges.join("")}
    <div class="chip-row picker">
      <label class="field-inline">${esc(S.day.level)} <select id="lvl-pick">${["b", "a"].map((k) => `<option value="${k}" ${L === k ? "selected" : ""}>${esc(S.levels[k])}</option>`).join("")}</select></label>
      <label class="field-inline">${esc(S.day.equipment)} <select id="eq-pick">${["none", "dumbbell", "kettlebell"].map((k) => `<option value="${k}" ${E === k ? "selected" : ""}>${esc(S.equip[k])}</option>`).join("")}</select></label>
    </div>
    <section class="card session-card">${tabs}${coreHTML}${floorHTML}
      <p class="effort"><strong>${esc(S.day.effort)}:</strong> RPE ${esc(sess.rpe)} · <strong>${esc(S.day.talk)}:</strong> ${esc(sess.talk)}</p>
      <p class="muted small">${esc(S.day.swap)}</p></section>
    ${extras.map((x) => `<p class="muted small">${esc(x)}</p>`).join("")}
    ${actions}${tests}${check15}${feel}${habits}${checkin}${book}
    <p class="small center"><a href="#/legal/safety">${esc(S.legal.safetyTitle)}</a></p>`;
  bindDay(n, canLog);
}

function hasTest(k) { const t = state?.tests?.[k]; return !!(t && (t.pu != null || t.puSkipped || t.sts != null || t.wall != null)); }

function testsForm(k, canLog) {
  const T = S.tests; const t = state.tests[k] || {};
  const dis = canLog ? "" : "disabled";
  const num = (name, label, how, val, extra = "") => `<label class="field"><span>${esc(label)}</span>${how ? `<small class="muted">${esc(how)}</small>` : ""}<input type="number" inputmode="numeric" min="0" name="${name}" value="${esc(val ?? "")}" ${dis} ${extra}></label>`;
  return `<section class="card tests-card"><h2>${esc(k === 30 ? T.d30 : T.d1)}</h2><p class="muted small">${esc(T.lead)}</p>
    <form id="tests-form" data-key="${k}">
      ${num("pu", T.pu, T.puHow, t.pu)}
      <label class="check-line"><input type="checkbox" name="puSkipped" ${t.puSkipped ? "checked" : ""} ${dis}> ${esc(T.puSkipped)}</label>
      <p class="muted small">${esc(T.level8)}</p>
      <div class="row-2">${num("puIncline", T.puIncline, "", t.puIncline)}<label class="field"><span>${esc(T.puInclineH)}</span><input name="puInclineH" value="${esc(t.puInclineH || "")}" ${dis}></label></div>
      ${num("sts", T.sts, T.stsHow, t.sts)}
      <label class="check-line"><input type="checkbox" name="stsHands" ${t.stsHands ? "checked" : ""} ${dis}> ${esc(T.stsHands)}</label>
      ${num("wall", T.wall, T.wallHow, t.wall, 'max="90"')}
      <div class="row-2">${num("walk", T.walk, T.walkHow, t.walk)}<label class="field"><span>${esc(T.walkUnit)}</span><input name="walkUnit" value="${esc(t.walkUnit || "")}" ${dis}></label></div>
      ${num("bal", T.bal, T.balHow, t.bal, 'max="30"')}
      ${num("energy", T.energy, "", t.energy, 'min="1" max="5"')}
      ${canLog ? `<button class="btn btn-primary" type="submit">${esc(T.save)}</button>` : ""}
    </form><p class="muted small">${esc(S.tests.anyoneDrop)}</p></section>`;
}

function check15Form(canLog) {
  const t = state.tests[15] || {};
  const lvlUp = state.level === "b" && Number(t.pu) >= 8;
  return `<section class="card"><h2>${esc(S.tests.d15)}</h2><p class="muted small">${esc(S.tests.puHow)}</p>
    <form id="check15-form"><label class="field"><span>${esc(S.tests.pu)}</span><input type="number" min="0" name="pu" value="${esc(t.pu ?? "")}" ${canLog ? "" : "disabled"}></label>
    ${canLog ? `<button class="btn btn-secondary btn-small" type="submit">${esc(S.day.save)}</button>` : ""}</form>
    ${lvlUp ? `<div class="notice mt"><p>${esc(S.tests.switchUp(t.pu))}</p><button class="btn btn-primary btn-small" id="switch-up">${esc(S.tests.switchBtn)}</button></div>` : ""}</section>`;
}

function dayRec(n) { state.days[n] = state.days[n] || { habits: {} }; state.days[n].habits = state.days[n].habits || {}; return state.days[n]; }

function bindDay(n, canLog) {
  $$(".tab").forEach((b) => b.addEventListener("click", () => {
    $$(".tab").forEach((x) => { x.classList.toggle("is-active", x === b); x.setAttribute("aria-selected", x === b); });
    $$(".tabpanel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== b.dataset.tab));
  }));
  const pick = (key, val) => {
    if (state) { state[key] = val; if (key === "level") state.levelLog.push({ at: dateKey(now()), level: val }); persist(); }
    else previewPrefs[key] = val;
    render();
  };
  $("#lvl-pick")?.addEventListener("change", (e) => pick("level", e.target.value));
  $("#eq-pick")?.addEventListener("change", (e) => pick("equipment", e.target.value));
  if (!canLog) return;
  const setStatus = (status) => { const r = dayRec(n); r.status = status; r.at = new Date().toISOString(); persist(); toast(status === "protected" ? S.toast.protected : S.toast.logged); render(); };
  $("#log-core")?.addEventListener("click", () => setStatus("core"));
  $("#log-floor")?.addEventListener("click", () => setStatus("floor"));
  $("#mark-protected")?.addEventListener("click", () => setStatus("protected"));
  $("#stop-log")?.addEventListener("click", () => openStop(() => setStatus("protected")));
  $("#undo-day")?.addEventListener("click", () => { const r = dayRec(n); delete r.status; persist(); toast(S.toast.undone); render(); });
  $$("[data-habit]").forEach((b) => b.addEventListener("click", () => { const r = dayRec(n); r.habits[b.dataset.habit] = !r.habits[b.dataset.habit]; persist(); b.classList.toggle("done"); b.setAttribute("aria-pressed", !!r.habits[b.dataset.habit]); }));
  $("#steps-input")?.addEventListener("change", (e) => { const r = dayRec(n); r.steps = e.target.value === "" ? null : Number(e.target.value); persist(); toast(S.toast.saved); });
  $("#rpe-input")?.addEventListener("change", (e) => { dayRec(n).rpe = e.target.value ? Number(e.target.value) : null; persist(); });
  $("#pain-input")?.addEventListener("change", (e) => { dayRec(n).pain = e.target.checked; persist(); $("#pain-note").classList.toggle("hidden", !e.target.checked); });
  $("#ci-save")?.addEventListener("click", () => { dayRec(n).checkin = { q1: $("#ci-q1").value, q2: $("#ci-q2").value }; persist(); toast(S.toast.saved); });
  $("#tests-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target); const k = e.target.dataset.key;
    const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
    const t = { pu: numOrNull(f.get("pu")), puSkipped: !!f.get("puSkipped"), puIncline: numOrNull(f.get("puIncline")), puInclineH: f.get("puInclineH") || "", sts: numOrNull(f.get("sts")), stsHands: !!f.get("stsHands"), wall: numOrNull(f.get("wall")), walk: numOrNull(f.get("walk")), walkUnit: f.get("walkUnit") || "", bal: numOrNull(f.get("bal")), energy: numOrNull(f.get("energy")), at: dateKey(now()) };
    state.tests[k] = t;
    if (k === "1" && (t.pu != null || t.puSkipped)) {
      // Level rule: under 8 (or skipped) = Beginner, 8+ = Average. Readiness "Yes" keeps Beginner.
      state.level = state.setup.readiness.some(Boolean) || t.puSkipped || t.pu < 8 ? "b" : "a";
      state.levelLog.push({ at: dateKey(now()), level: state.level, from: "day1-test" });
    }
    persist(); toast(S.toast.saved); render();
  });
  $("#check15-form")?.addEventListener("submit", (e) => { e.preventDefault(); const v = new FormData(e.target).get("pu"); state.tests[15] = { pu: v === "" ? null : Number(v), at: dateKey(now()) }; persist(); toast(S.toast.saved); render(); });
  $("#switch-up")?.addEventListener("click", () => { state.level = "a"; state.levelLog.push({ at: dateKey(now()), level: "a" }); persist(); render(); });
}

function openStop(onConfirm) {
  const dlg = document.createElement("div");
  dlg.className = "modal-backdrop";
  dlg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="stop-title"><h2 id="stop-title">${esc(S.day.stopTitle)}</h2>
    <p><strong>${esc(S.day.stopText)}</strong></p><p class="small">${esc(S.day.stopSigns)}</p><p class="muted small">${esc(S.day.protectedReason)}</p>
    <div class="btn-stack"><button class="btn btn-stop btn-block" id="stop-confirm">${esc(S.day.stopConfirm)}</button><button class="btn btn-secondary btn-block" id="stop-cancel">${esc(S.legal.back)}</button></div></div>`;
  document.body.appendChild(dlg);
  $("#stop-confirm", dlg).focus();
  $("#stop-confirm", dlg).addEventListener("click", () => { dlg.remove(); onConfirm(); });
  $("#stop-cancel", dlg).addEventListener("click", () => dlg.remove());
}

/* ---------- plan ---------- */
function viewPlan() {
  const t = todayN();
  const cs = ctxState();
  const setup = setupDone();
  const self = isSelf();
  const weeks = [["1", 1, 7], ["2", 8, 14], ["3", 15, 21], ["4", 22, 28], ["Finish", 29, 30]];
  main.innerHTML = `<h1 class="page-title">${esc(S.plan.title)}</h1><p class="muted">${esc(self ? S.self.planLead : S.plan.lead)}</p>
    ${self && setup ? `<p class="muted small" id="self-window">${esc(S.self.window(fmtDate(startOf(cs)), fmtDate(endOf(cs))))}</p>` : ""}
    ${weeks.map(([w, a, b]) => `<section class="card"><h2>${esc(S.day.week(w))} <span class="muted small">${esc(fmtDate(dateFor(cs, a), { month: "short", day: "numeric" }))}–${esc(fmtDate(dateFor(cs, b), { month: "short", day: "numeric" }))}</span></h2>
      <ul class="plan-list">${Array.from({ length: b - a + 1 }, (_, i) => a + i).map((n) => {
        const D = dayData(n); const st = setup ? statusOf(state, n) : "future";
        const lbl = S.plan.status[st] || "";
        return `<li class="plan-item st-${st} ${n === t ? "is-today" : ""}"><a href="#/day/${n}"><span class="pn">${n}</span><span class="pt"><strong>${esc(D.type)}${D.flex ? " ⚑" : ""}</strong><br><span class="muted small">${esc(fmtDate(dateFor(cs, n)))}${n === t ? ` · ${esc(S.plan.today)}` : ""}</span></span><span class="ps">${esc(lbl)}</span></a></li>`;
      }).join("")}</ul></section>`).join("")}`;
}

/* ---------- progress ---------- */
function testCompare() {
  const a = state.tests[1], b = state.tests[30];
  if (!a && !b) return `<p class="muted">${esc(S.tests.noTests)}</p>`;
  const rows = [["pu", S.tests.pu], ["sts", S.tests.sts], ["wall", S.tests.wall], ["walk", S.tests.walk], ["bal", S.tests.bal]];
  return `<table class="cmp"><thead><tr><th></th><th>${esc(S.day.dayN(1))}</th><th>${esc(S.day.dayN(30))}</th></tr></thead><tbody>${rows.filter(([k]) => (a && a[k] != null) || (b && b[k] != null) || (k === "pu" && (a?.puSkipped || b?.puSkipped))).map(([k, label]) => {
    const v1 = a ? (k === "pu" && a.puSkipped ? "—" : a[k]) : null; const v2 = b ? (k === "pu" && b.puSkipped ? "—" : b[k]) : null;
    const down = v1 != null && v2 != null && Number(v2) < Number(v1);
    return `<tr><td>${esc(label.split(" (")[0])}</td><td>${esc(v1 ?? "")}</td><td>${down ? esc(S.tests.logged) : esc(v2 ?? "")}${!down && v1 != null && v2 != null && Number(v2) > Number(v1) ? " ⬆" : ""}</td></tr>`;
  }).join("")}</tbody></table>${b ? `<p class="muted small">${esc(S.tests.nice)}</p>` : ""}`;
}

function badgeText(k) { return k === "holidayFloor" && isSelf() ? S.self.holidayFloor : S.badges[k]; }

function viewProgress() {
  if (!state || !state.setupDone) return viewWelcome();
  const c = counts(state); const tgt = target(state); const s = streaks(state); const P = S.progress;
  const pct = Math.min(100, Math.round((c.complete / tgt) * 100));
  const t = todayN();
  main.innerHTML = `<h1 class="page-title">${esc(P.title)}</h1>
    <section class="card progress-hero"><div class="ring" style="--p:${pct}"><div><b id="complete-count">${c.complete}</b><span>/ ${tgt}</span></div></div>
      <div><h2>${esc(P.complete)}</h2><p>${esc(P.target(tgt))}</p><p class="stat-pill">${esc(P.left(tgt - c.complete))}</p>
      ${c.protected ? `<p class="muted small">${esc(P.extension(c.protected, fmtDate(deadline(state))))}</p>` : ""}</div></section>
    <div class="stat-grid">
      <div class="stat"><b id="streak-now">${s.current}</b><span>${esc(P.streak)}</span></div>
      <div class="stat"><b>${s.best}</b><span>${esc(P.best)}</span></div>
      <div class="stat"><b id="points">${totalPoints(state)}</b><span>${esc(P.points)}</span></div>
      <div class="stat"><b>${c.core}</b><span>${esc(P.coreDays)}</span></div>
      <div class="stat"><b>${c.floor}</b><span>${esc(P.floorDays)}</span></div>
      <div class="stat"><b>${c.protected}</b><span>${esc(P.protectedDays)}</span></div></div>
    <p class="muted small">${esc(P.streakNote)}</p>
    <section class="card"><h2>${esc(P.calendar)}</h2><div class="cal-grid">${Array.from({ length: 30 }, (_, i) => i + 1).map((n) => {
      const st = statusOf(state, n);
      return `<a href="#/day/${n}" class="cal-dot st-${st} ${n === t ? "is-today" : ""}" title="${esc(fmtDate(dateFor(state, n)))}: ${esc(S.plan.status[st] || "")}">${n}</a>`; }).join("")}</div>
      <p class="legend small"><span class="lg st-core"></span>${esc(S.plan.status.core)} <span class="lg st-floor"></span>${esc(S.plan.status.floor)} <span class="lg st-protected"></span>${esc(S.plan.status.protected)} <span class="lg st-missed"></span>${esc(S.plan.status.missed)}</p></section>
    <section class="card"><h2>${esc(P.badges)}</h2><ul class="badge-grid">${badges(state).map(([k, got]) => { const B = badgeText(k); return `<li class="badge ${got ? "got" : ""}"><span class="b-ic" aria-hidden="true">${got ? "★" : "☆"}</span><strong>${esc(B[0])}</strong><span class="small muted">${esc(B[1])}</span></li>`; }).join("")}</ul>
      <label class="check-line mt"><input type="checkbox" id="unbroken-opt" ${state.unbrokenOptIn ? "checked" : ""}> ${esc(P.unbrokenOpt)}</label></section>
    <section class="card"><h2>${esc(S.tests.cardTitle)}</h2>${testCompare()}</section>`;
  $("#unbroken-opt").addEventListener("change", (e) => { state.unbrokenOptIn = e.target.checked; persist(); render(); });
}

/* ---------- completion ---------- */
function viewDone() {
  if (!state || !state.setupDone) return viewWelcome();
  const c = counts(state); const tgt = target(state); const s = streaks(state); const D = S.done;
  const fin = c.complete >= tgt;
  const today = dateKey(now());
  const dl = deadline(state);
  const self = isSelf();
  const keepGoing = !fin && c.protected > 0 && today > endOf(state) && today <= dl;
  const madeToday = (state.makeup || []).includes(today);
  const selfOffer = CONFIG.selfPaced.enabled && phaseOf(state) === "post";
  main.innerHTML = `<section class="card card-celebrate done-hero"><p class="kicker">${escT(S.appShort)}${self ? ` · ${esc(S.self.label)}` : ""}</p><h1 class="page-title">${esc(self ? S.self.doneTitle : D.title)}</h1>
      <p class="done-big">${fin ? "🏁 " + esc(D.finisher) : esc(D.notYet)}</p>
      ${fin ? `<p>${esc(D.keepGoing)}</p>` : `<p>${esc(self ? S.self.restart : D.restart)}</p>`}</section>
    ${keepGoing ? `<div class="card"><p>${esc(D.keepGoingWeek(fmtDate(dl)))}</p>${madeToday ? `<p><strong>${esc(D.makeupLogged)}</strong></p>` : `<button class="btn btn-primary btn-block" id="log-makeup">${esc(D.logMakeup)}</button>`}</div>` : ""}
    <section class="card"><h2>${esc(D.summary)}</h2><div class="stat-grid">
      <div class="stat"><b id="done-complete">${c.complete}</b><span>${esc(S.progress.complete)}</span></div>
      <div class="stat"><b>${c.core}</b><span>${esc(S.progress.coreDays)}</span></div>
      <div class="stat"><b>${c.floor}</b><span>${esc(S.progress.floorDays)}</span></div>
      <div class="stat"><b>${s.best}</b><span>${esc(S.progress.best)}</span></div>
      <div class="stat"><b>${totalPoints(state)}</b><span>${esc(S.progress.points)}</span></div>
      <div class="stat"><b>${badges(state).filter(([, g]) => g).length}</b><span>${esc(S.progress.badges)}</span></div></div></section>
    <section class="card"><h2>${esc(S.tests.cardTitle)}</h2>${testCompare()}</section>
    ${selfOffer ? `<section class="card self-card" id="keep-going-self-card"><h2>${esc(S.self.keepGoingTitle)}</h2><p>${esc(S.self.keepGoingLead)}</p><button class="btn btn-primary btn-block" id="keep-going-self">${esc(S.self.keepGoingBtn)}</button></section>` : ""}
    <div class="card book-card"><p>📖 ${esc(D.book)}</p></div>
    <p class="muted small">${esc(D.experiences)}</p>
    <div class="btn-stack"><a class="btn btn-secondary btn-block" href="#/progress">${esc(D.seeProgress)}</a><a class="btn btn-secondary btn-block" href="#/day/30">${esc(S.day.dayN(30))}</a></div>`;
  $("#log-makeup")?.addEventListener("click", () => { state.makeup = [...(state.makeup || []), today]; persist(); toast(S.toast.logged); render(); });
  $("#keep-going-self")?.addEventListener("click", () => { state = startSelfRound(state, today); persist(); go("#/today"); });
}

/* ---------- moves ---------- */
function viewMoves() {
  const M = S.moves;
  main.innerHTML = `<h1 class="page-title">${esc(M.title)}</h1><p class="muted">${esc(M.lead)}</p>
    <section class="card"><h2>${esc(M.effortTitle)}</h2><table class="cmp"><tbody>${PROGRAM.rpe.map((r) => `<tr><td><strong>RPE ${esc(r.rpe)}</strong></td><td>${esc(r.talk)}</td></tr>`).join("")}</tbody></table><p class="muted small">${esc(M.effortNote)}</p></section>
    ${Object.entries(PROGRAM.library).map(([id, m]) => `<details class="card move-card" id="move-${esc(id)}"><summary><span class="code">${esc(id)}</span> <strong>${esc(m.name)}</strong></summary>
      <dl>${["none", "dumbbell", "kettlebell", "optional", "adapt", "cues"].filter((k) => m[k]).map((k) => `<dt>${esc(M[k])}</dt><dd>${esc(m[k])}</dd>`).join("")}</dl></details>`).join("")}
    <section class="card"><h2>${esc(M.jointTitle)}</h2><p><strong>${esc(M.jointNote)}</strong></p><ul class="rules-list compact">${M.joint.map((j) => `<li>${esc(j)}</li>`).join("")}</ul></section>`;
}

/* ---------- more / settings ---------- */
function viewMore() {
  const Mo = S.more;
  const setup = state && state.setupDone;
  main.innerHTML = `<h1 class="page-title">${esc(Mo.title)}</h1>
    <section class="card" id="settings-language"><h2>${esc(setup ? Mo.settings : Mo.language)}</h2>${langSwitch("lang-settings")}</section>
    ${setup ? `<section class="card"><h2>${esc(Mo.settings)}</h2><form id="settings-form">
      <label class="field"><span>${esc(Mo.level)}</span><select name="level">${["b", "a"].map((k) => `<option value="${k}" ${state.level === k ? "selected" : ""}>${esc(S.levels[k])}</option>`).join("")}</select></label>
      <label class="field"><span>${esc(Mo.equipment)}</span><select name="equipment">${["none", "dumbbell", "kettlebell"].map((k) => `<option value="${k}" ${state.equipment === k ? "selected" : ""}>${esc(S.equip[k])}</option>`).join("")}</select></label>
      <fieldset class="field"><legend>${esc(Mo.busy)}</legend><div class="chip-row">${S.weekdays.map((w, i) => `<label class="chip"><input type="checkbox" name="busy" value="${i}" ${state.busyDays.includes(i) ? "checked" : ""}> ${esc(w)}</label>`).join("")}</div></fieldset>
      <label class="field"><span>${esc(Mo.reminder)}</span><input type="time" name="reminder" value="${esc(state.reminderTime)}"></label>
      <button class="btn btn-primary" type="submit">${esc(Mo.saveSettings)}</button></form></section>
    <section class="card"><button class="btn btn-secondary btn-block" id="ics-btn">${esc(Mo.calendarBtn)}</button><p class="muted small">${esc(Mo.calendarNote)}</p></section>` : ""}
    <section class="card"><p class="small">${esc(Mo.install)}</p></section>
    <section class="card"><h2>${esc(Mo.legal)}</h2><ul class="link-list">
      <li><a href="#/legal/disclaimer">${esc(S.legal.disclaimerTitle)}</a></li><li><a href="#/legal/safety">${esc(S.legal.safetyTitle)}</a></li>
      <li><a href="#/legal/terms">${esc(S.legal.termsTitle)}</a></li><li><a href="#/legal/refund">${esc(S.legal.refundTitle)}</a></li><li><a href="#/legal/privacy">${esc(S.legal.privacyTitle)}</a></li></ul>
      <p class="muted small">${esc(S.welcome.purchase)}</p></section>
    ${setup ? `<section class="card"><h2>${esc(Mo.data)}</h2><div class="btn-stack"><button class="btn btn-secondary btn-block" id="export-btn">${esc(Mo.exportBtn)}</button><button class="btn btn-stop btn-block" id="delete-btn">${esc(Mo.deleteBtn)}</button></div></section>` : ""}
    <section class="card"><h2>${esc(Mo.about)}</h2><p class="small">${esc(Mo.aboutText)}</p><p class="muted small">${esc(Mo.version(PROGRAM.version))}</p></section>`;
  $("#settings-form")?.addEventListener("submit", (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    state.level = f.get("level"); state.equipment = f.get("equipment"); state.busyDays = f.getAll("busy").map(Number); state.reminderTime = f.get("reminder") || "07:00";
    persist(); toast(S.toast.saved);
  });
  $("#ics-btn")?.addEventListener("click", downloadICS);
  $("#export-btn")?.addEventListener("click", () => download("holiday-challenge-my-data.json", JSON.stringify(state, null, 2), "application/json"));
  $("#delete-btn")?.addEventListener("click", () => { if (confirm(S.more.deleteConfirm)) { clearState(); state = null; toast(S.more.deleted); go("#/today"); } });
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildICS(s) {
  const [hh, mm] = (s.reminderTime || "07:00").split(":");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Coach Salim Heyaime LLC//30 Days Before X-mas//EN", "CALSCALE:GREGORIAN"];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const from = Math.max(joinDay(s), 1);
  const startK = startOf(s).replace(/-/g, "");
  for (let n = from; n <= 30; n++) {
    const D = dayData(n); const dk = dateFor(s, n); const ymd = dk.replace(/-/g, "");
    const busy = s.busyDays.includes(parseKey(dk).getDay());
    lines.push("BEGIN:VEVENT", `UID:holiday30-${startK}-day${n}@achallengetomove`, `DTSTAMP:${stamp}`, `DTSTART:${ymd}T${hh}${mm}00`, "DURATION:PT15M",
      `SUMMARY:${S.day.dayN(n)}: ${D.type} (${S.calendar.summary})`.replace(/,/g, "\\,"),
      `DESCRIPTION:${(busy ? S.calendar.busy : S.calendar.normal).replace(/,/g, "\\,")}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${S.calendar.reminder}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function downloadICS() { download("30-days-before-xmas-reminders.ics", buildICS(state), "text/calendar"); }

/* ---------- legal ---------- */
function viewLegal(which) {
  const Lg = S.legal;
  const back = `<a class="btn btn-secondary btn-small" href="javascript:history.back()">‹ ${esc(Lg.back)}</a>`;
  const sections = (arr) => arr.map(([h, p]) => `<h2 class="legal-h">${esc(h)}</h2><p>${esc(p)}</p>`).join("");
  const foot = `<p class="muted small">${esc(Lg.contact(CONFIG.contactEmail))}<br>${esc(Lg.company)}<br>${esc(Lg.updated)}</p>`;
  let body = "";
  if (which === "terms") body = `<h1 class="page-title">${esc(Lg.termsTitle)}</h1><p class="notice">${esc(Lg.draft)}</p>${sections(Lg.terms)}`;
  else if (which === "refund") body = `<h1 class="page-title">${esc(Lg.refundTitle)}</h1><p class="notice">${esc(Lg.draft)}</p>${sections(Lg.refund)}`;
  else if (which === "privacy") body = `<h1 class="page-title">${esc(Lg.privacyTitle)}</h1>${sections(Lg.privacy)}
    <p class="chd" id="chd-link-wrap">${esc(Lg.chdLead)} <a class="chd-link" id="chd-link" href="${esc(CONFIG.consumerHealthPolicyUrl)}">${esc(Lg.chdLink)}</a></p>`;
  else if (which === "safety") body = `<h1 class="page-title">${esc(Lg.safetyTitle)}</h1>${Lg.disclaimer.map((p) => `<p><strong>${esc(p)}</strong></p>`).join("")}<ul class="rules-list">${Lg.safety.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
  else body = `<h1 class="page-title">${esc(Lg.disclaimerTitle)}</h1>${Lg.disclaimer.map((p) => `<p>${esc(p)}</p>`).join("")}<p><a href="#/legal/safety">${esc(Lg.safetyTitle)}</a></p>`;
  main.innerHTML = `${back}<article class="card legal" id="legal-${esc(which || "disclaimer")}">${body}${foot}</article>`;
}

/* ---------- setup ---------- */
function newDraft(mode = "live") {
  return { mode, age: false, readiness: [], gentleAck: false, level: "b", pu: null, puSkip: false, equipment: "none", busyDays: [], reminderTime: "07:00", terms: false };
}
function viewSetup(step) {
  draft = draft || newDraft(selfOnlyNow() ? "self" : "live");
  if (selfOnlyNow()) draft.mode = "self";
  const ph = phaseOf(null);
  if (draft.mode !== "self" && (ph === "post" || (ph === "live" && !CONFIG.lateJoin && todayN() > 1))) return viewWelcome();
  const St = S.setup; const total = 5;
  const head = `<p class="kicker">${esc(St.stepOf(step, total))}</p><div class="step-bar"><span style="width:${(step / total) * 100}%"></span></div>`;
  const navBtns = (nextLabel = St.next) => `<p class="err hidden" id="setup-err" role="alert"></p><div class="row-2">${step > 1 ? `<a class="btn btn-secondary" href="#/setup/${step - 1}">${esc(St.back)}</a>` : `<a class="btn btn-secondary" href="#/today">${esc(St.back)}</a>`}<button class="btn btn-primary" id="setup-next" type="submit">${esc(nextLabel)}</button></div>`;
  let body = "";
  if (step === 1) body = `<h1 class="page-title">${esc(St.ageTitle)}</h1>${draft.mode === "self" ? `<p class="notice" id="self-setup-note">${esc(S.self.setupNote)}</p>` : ""}<form id="setup-form"><div class="card"><label class="check-line big"><input type="checkbox" id="age-ok" ${draft.age ? "checked" : ""}> ${esc(St.ageLabel)}</label><p class="muted small">${esc(St.ageNo)}</p></div>${navBtns()}</form>`;
  if (step === 2) body = `<h1 class="page-title">${esc(St.readinessTitle)}</h1><p class="muted">${esc(St.readinessLead)}</p><form id="setup-form">${St.readiness.map((q, i) => `<fieldset class="card rq"><legend>${esc(q)}</legend><div class="chip-row">
      <label class="chip"><input type="radio" name="q${i}" value="yes" ${draft.readiness[i] === true ? "checked" : ""}> ${esc(St.yes)}</label>
      <label class="chip"><input type="radio" name="q${i}" value="no" ${draft.readiness[i] === false ? "checked" : ""}> ${esc(St.no)}</label></div>
      <p class="muted small rq-hint ${draft.readiness[i] ? "" : "hidden"}">${esc(St.readinessHints[i])}</p></fieldset>`).join("")}
      <div class="card notice-gentle ${draft.readiness.some(Boolean) ? "" : "hidden"}" id="anyyes"><p><strong>${esc(St.anyYes)}</strong></p><label class="check-line"><input type="checkbox" id="gentle-ack" ${draft.gentleAck ? "checked" : ""}> ${esc(St.anyYesAck)}</label></div>
      ${navBtns()}</form>`;
  if (step === 3) body = `<h1 class="page-title">${esc(St.levelTitle)}</h1><form id="setup-form"><div class="card"><p>${esc(St.levelLead)}</p><p class="muted small">${esc(S.tests.puHow)}</p>
      <label class="field"><span>${esc(St.puLabel)}</span><input type="number" min="0" inputmode="numeric" id="pu-now" value="${esc(draft.pu ?? "")}"></label>
      <label class="check-line"><input type="checkbox" id="pu-skip" ${draft.puSkip ? "checked" : ""}> ${esc(St.puSkip)}</label><p class="muted small">${esc(St.puSkipReason)}</p>
      <label class="field"><span>${esc(St.levelPick)}</span><select id="lvl-now">${["b", "a"].map((k) => `<option value="${k}" ${draft.level === k ? "selected" : ""}>${esc(S.levels[k])}</option>`).join("")}</select></label>
      <p class="muted small" id="lvl-cap">${esc(S.levelCap[draft.level])}</p><p class="muted small">${esc(St.overrideNote)}</p>
      ${draft.readiness.some(Boolean) ? `<p class="notice small">${esc(S.day.gentleNudge)}</p>` : ""}</div>${navBtns()}</form>`;
  if (step === 4) body = `<h1 class="page-title">${esc(St.equipTitle)}</h1><form id="setup-form"><div class="card"><p class="muted">${esc(St.equipLead)}</p><div class="mode-grid">
      ${["none", "dumbbell", "kettlebell"].map((k) => `<label class="mode-card ${draft.equipment === k ? "sel" : ""}"><input type="radio" name="eq" value="${k}" ${draft.equipment === k ? "checked" : ""}> <strong>${esc(S.equip[k])}</strong></label>`).join("")}</div>
      <p class="muted small mt">${esc(St.loadTip)}</p></div>
      <fieldset class="card"><legend><strong>${esc(St.busyTitle)}</strong></legend><p class="muted small">${esc(St.busyLead)}</p><div class="chip-row">${S.weekdays.map((w, i) => `<label class="chip"><input type="checkbox" name="busy" value="${i}" ${draft.busyDays.includes(i) ? "checked" : ""}> ${esc(w)}</label>`).join("")}</div></fieldset>
      <div class="card"><label class="field"><span>${esc(St.reminderLabel)}</span><input type="time" id="rem-time" value="${esc(draft.reminderTime)}"></label><p class="muted small">${esc(St.reminderNote)}</p></div>${navBtns()}</form>`;
  if (step === 5) body = `<h1 class="page-title">${esc(St.termsTitle)}</h1><form id="setup-form"><div class="card"><p>${esc(St.termsLead)}</p>
      ${S.legal.disclaimer.map((p) => `<p class="small">${esc(p)}</p>`).join("")}
      <p class="legal-links small"><a href="#/legal/safety">${esc(St.readSafety)}</a> · <a href="#/legal/terms">${esc(St.readTerms)}</a> · <a href="#/legal/privacy">${esc(St.readPrivacy)}</a> · <a href="#/legal/refund">${esc(St.readRefund)}</a></p>
      <label class="check-line big"><input type="checkbox" id="terms-ok" ${draft.terms ? "checked" : ""}> ${esc(St.termsLabel)}</label>
      <p class="muted small">${esc(S.welcome.purchase)}</p></div>${navBtns(St.finish)}</form>`;
  main.innerHTML = head + body;
  const err = (m) => { const e = $("#setup-err"); e.textContent = m; e.classList.remove("hidden"); };
  if (step === 2) {
    $$("input[type=radio]").forEach((r) => r.addEventListener("change", () => {
      const i = Number(r.name.slice(1)); draft.readiness[i] = r.value === "yes";
      r.closest("fieldset").querySelector(".rq-hint").classList.toggle("hidden", !draft.readiness[i]);
      $("#anyyes").classList.toggle("hidden", !draft.readiness.some(Boolean));
    }));
  }
  if (step === 3) {
    const sync = () => {
      const v = $("#pu-now").value; draft.puSkip = $("#pu-skip").checked; draft.pu = v === "" ? null : Number(v);
      if (draft.puSkip || draft.readiness.some(Boolean)) draft.level = "b";
      else if (draft.pu != null) draft.level = draft.pu >= 8 ? "a" : "b";
      $("#lvl-now").value = draft.level; $("#lvl-cap").textContent = S.levelCap[draft.level];
    };
    $("#pu-now").addEventListener("input", sync); $("#pu-skip").addEventListener("change", sync);
    $("#lvl-now").addEventListener("change", (e) => { draft.level = e.target.value; $("#lvl-cap").textContent = S.levelCap[draft.level]; });
  }
  if (step === 4) $$("input[name=eq]").forEach((r) => r.addEventListener("change", () => $$(".mode-card").forEach((c) => c.classList.toggle("sel", c.contains(r) ? r.checked : false))));
  $("#setup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (step === 1) { draft.age = $("#age-ok").checked; if (!draft.age) return err(St.ageRequired); }
    if (step === 2) {
      for (let i = 0; i < St.readiness.length; i++) if (typeof draft.readiness[i] !== "boolean") return err(St.answerAll);
      draft.gentleAck = $("#gentle-ack").checked;
      if (draft.readiness.some(Boolean) && !draft.gentleAck) return err(St.ackRequired);
    }
    if (step === 4) { draft.equipment = ($("input[name=eq]:checked") || {}).value || "none"; draft.busyDays = $$("input[name=busy]:checked").map((x) => Number(x.value)); draft.reminderTime = $("#rem-time").value || "07:00"; }
    if (step === 5) {
      draft.terms = $("#terms-ok").checked; if (!draft.terms) return err(St.termsRequired);
      const s = defaultState();
      const today = dateKey(now());
      s.setupDone = true;
      if (draft.mode === "self" || selfOnlyNow()) { s.mode = "self"; s.startDate = today; s.joinedDate = today; }
      else { s.mode = "live"; s.joinedDate = today < CONFIG.start ? CONFIG.start : today; }
      s.setup = { age: true, readiness: draft.readiness.slice(), gentleAck: draft.gentleAck, terms: true, termsAt: new Date().toISOString() };
      s.level = draft.level; s.equipment = draft.equipment; s.busyDays = draft.busyDays; s.reminderTime = draft.reminderTime;
      if (draft.pu != null || draft.puSkip) s.tests[0] = { pu: draft.pu, puSkipped: draft.puSkip, at: today, note: "setup" };
      s.levelLog.push({ at: today, level: s.level });
      state = s; draft = null; persist(); go("#/today"); return;
    }
    go(`#/setup/${step + 1}`);
  });
}

/* ---------- boot ---------- */
window.addEventListener("hashchange", render);
window.addEventListener("storage", () => { state = loadState(); render(); });
render();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
// Test hook (read-only helpers for automated checks).
window.__HC = { get state() { return state; }, todayN, buildICS: () => buildICS(state), get lang() { return lang; } };
