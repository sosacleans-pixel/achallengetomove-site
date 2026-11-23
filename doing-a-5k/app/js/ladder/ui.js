/* Doing a 5K ladder UI (PREVIEW). Routes start with "l-". Level names are working names
 * pending the Attorney's sign-off; nothing here is live. */
import { WorkoutTimer, SPEECH_CUES } from "../timer.js";
import { todayISO, addDays, daysBetween, pretty, mmss, parseMmss, setPreviewOffset } from "./dates.js";
import {
  CONFIG, LEVEL_IDS, LEVEL_NAMES, DEFAULT_TRAIN_DAYS, REMINDERS, emptyState, loadLadder, saveLadder, resetLadder,
  currentRun, grantPurchase, windowStatus, completeSlot, logRepeat, addLog, saveCheckin, getCheckin,
  computeStreak, repairOffer, inactiveDays, cantFinish, windowWarning, pickReminder, badges, recap, fill,
} from "./engine.js";
import { todayStatus, projectSchedule, validTrainDays } from "./scheduler.js";
import { CHECKOUT, buyTrustHtml, disclosureFor, isPreviewCheckout, previewAllowed } from "./checkout.js";

const E2E = new URLSearchParams(location.search).has("e2e");
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const $ = (sel, root = document) => root.querySelector(sel);

let L = loadLadder() || emptyState();
setPreviewOffset(previewAllowed() ? L.previewOffsetDays || 0 : 0);
let LEVELS = null;
let activeTimer = null;
let session = null; // { levelId, slot, mode: "new"|"repeat"|"repair"|"manual", openResult, mainElapsed, partialOk }
let check12Result = null;

function setL(next) {
  L = next;
  saveLadder(L);
}

async function loadLevels() {
  if (LEVELS) return LEVELS;
  const entries = await Promise.all(
    LEVEL_IDS.map((id) => fetch(`./data/ladder/${id}.json`).then((r) => r.json()).then((j) => [id, j]))
  );
  LEVELS = Object.fromEntries(entries);
  return LEVELS;
}

function esc(t) {
  return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function speak(text) {
  if (L.settings?.voice === false || !text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function params() {
  const q = location.hash.split("?")[1] || "";
  return new URLSearchParams(q);
}

/* ---------------- copy (Attorney §4.6, §4.7 word for word; Coach Fit §7) ---------------- */
const PLACEMENT_SUB =
  "Three quick questions to suggest a starting level. This is not a medical screening or a medical clearance, and it does not decide whether running is safe for you. You can always start at an easier level.";
const SAFETY_PARA =
  "This program is general fitness education from Coach Salim Heyaime LLC, not medical advice. It is for healthy adults 18 and older. Check with your doctor or a qualified healthcare provider before you start, especially if you are new to exercise, returning after time off, pregnant or postpartum, or have a heart, breathing, joint or other health condition. Stop right away if you feel pain, chest pain or pressure, unusual shortness of breath, dizziness, fainting, or an irregular heartbeat, and get medical help if symptoms are severe or don't settle with rest. The Health and safety information and the App Terms, including the Assumption of Risk and the Release of Liability in favor of Coach Salim Heyaime LLC, apply.";
const Q1_NO =
  "If brisk walking for 30 minutes is not comfortable right now, this program may not be a fit yet. Check with your doctor before you start. If you still want to begin, Walk-to-Run 30 starts with mostly walking, and you can repeat any session as often as you like. This suggestion is not a medical clearance.";
const RESULT_LINE = (level) =>
  `Suggested starting point: ${level}. This is only a suggestion, not a medical clearance. You can start at an easier level.`;
const CHECK12_SAFETY =
  "This is an optional fitness check, not a medical test or clearance. Adults 18 and older only. Check with your doctor before you try it. Walk and jog at an easy pace. Stop right away if you feel pain, chest pain or pressure, unusual shortness of breath, dizziness, fainting, or an irregular heartbeat. Tap Stop if you need to walk or can't speak in full sentences.";
const QUESTIONS = [
  "Can you walk briskly for 30 minutes and still feel comfortable?",
  "Can you jog 12 minutes nonstop while still able to talk in full sentences?",
  "Have you run 5K (3.1 miles) or 30 minutes nonstop in the last 2 months?",
];
const LEVEL_SUMMARY = {
  "walk-to-run-30": "Walk with short jogs, building to 12 minutes of nonstop running.",
  "5k-30": "Build from 12-minute runs to your first 5K.",
  "faster-5k-30": "Add speed play, hills and tempo runs for a smoother, quicker 5K.",
};
const HIGHER_START = { "5k-30": "12-minute runs", "faster-5k-30": "5K runs" };
const SETUP_DAYS = "How many days a week? Pick 3, 4 or 5. 3+ days a week keeps you on track to finish inside 90 days.";

/* ---------------- shell ---------------- */
function shell(content, { title = "Doing a 5K", nav = true, eyebrow = "Doing a 5K" } = {}) {
  const hash = location.hash.split("?")[0];
  const navBtn = (to, label) =>
    `<button type="button" data-lnav="${to}" class="app-nav-btn ${hash === "#" + to ? "is-active" : ""}">${label}</button>`;
  const hasRun = L.activeLevel && currentRun(L, L.activeLevel);
  return `
  ${previewAllowed() ? `<p class="ladder-ribbon" role="note">Preview build. Not live. No real payments.${L.previewOffsetDays ? ` Preview date: ${pretty(todayISO())}.` : ""}</p>` : ""}
  <div class="app-screen">
    <header class="app-header">
      <p class="app-eyebrow">${esc(eyebrow)}</p>
      <h1 class="app-title">${title}</h1>
    </header>
    ${content}
    ${nav && hasRun ? `<nav class="app-nav" aria-label="App sections">${navBtn("l-today", "Today")}${navBtn("l-plan", "Plan")}${navBtn("l-progress", "Progress")}${navBtn("l-settings", "Settings")}</nav>` : ""}
    <footer class="app-footer">
      <p>General education only, not medical advice.</p>
      <p><a class="text-link" href="../../health-safety/" target="_blank" rel="noopener">Health and safety</a> · <a class="text-link" href="../../purchase-terms/#app-5k-ladder" target="_blank" rel="noopener">Purchase terms</a> · <a class="text-link" href="../../privacy/" target="_blank" rel="noopener">Privacy</a></p>
      <p>&copy; ${new Date().getFullYear()} Coach Salim Heyaime LLC</p>
    </footer>
  </div>`;
}

function bindNav() {
  document.querySelectorAll("[data-lnav]").forEach((b) => b.addEventListener("click", () => (location.hash = b.dataset.lnav)));
}

function buyBlock({ id, label, kind, levelId, price, resumeAt = 1, disabled = false }) {
  const live = !isPreviewCheckout();
  const canPreview = previewAllowed();
  const btn = live || canPreview
    ? `<button type="button" class="btn btn-primary btn-block ladder-buy" id="${id}" ${disabled ? "disabled" : ""}>${esc(label)}</button>`
    : `<button type="button" class="btn btn-primary btn-block ladder-buy" disabled aria-disabled="true">${esc(label)} (checkout coming soon)</button>`;
  return `<div class="ladder-buy-wrap">${btn}${buyTrustHtml({ kind, price, levelName: LEVEL_NAMES[levelId], resumeAt })}</div>`;
}

function checkoutHref(levelId, kind, from = "resume") {
  return `#l-checkout?level=${levelId}&kind=${kind}&from=${from}`;
}

/* ---------------- placement ---------------- */
function renderStart() {
  const step = Number(params().get("q") || 1);
  const q1no = params().get("q1") === "no";
  if (q1no) {
    return shell(`
      <div class="card ladder-card">
        <h2>Find your starting level.</h2>
        <p class="ladder-warn">${Q1_NO}</p>
        <p class="ladder-result">${esc(RESULT_LINE("Walk-to-Run 30"))}</p>
        <a class="btn btn-primary btn-block" href="#l-levels?suggest=walk-to-run-30">Continue with Walk-to-Run 30</a>
        <a class="btn btn-secondary btn-block" href="#l-start">Not now</a>
      </div>`, { title: "Starting level", nav: false });
  }
  return shell(`
    <div class="card ladder-card">
      <h2>Find your starting level.</h2>
      <p>${PLACEMENT_SUB}</p>
      <p class="ladder-safety"><small>${SAFETY_PARA}</small></p>
      <p class="ladder-q-count">Question ${step} of 3</p>
      <p class="ladder-q">${esc(QUESTIONS[step - 1])}</p>
      <div class="ladder-yesno">
        <button type="button" class="btn btn-primary" id="q-yes">Yes</button>
        <button type="button" class="btn btn-secondary" id="q-no">No</button>
      </div>
      ${step === 2 ? `<p class="ladder-alt"><a class="text-link" href="#l-check12">Not sure? Try the 12-minute check</a> (free, before you buy)</p>` : ""}
    </div>
    ${step === 1 ? `<p class="ladder-legacy"><small>Bought Doing a 5K for $6.99 before the levels? <a class="text-link" href="#legacy" id="open-legacy">Open your original plan</a>.</small></p>` : ""}
  `, { title: "Starting level", nav: false });
}

function bindStart() {
  const step = Number(params().get("q") || 1);
  $("#q-yes")?.addEventListener("click", () => {
    if (step < 3) location.hash = `l-start?q=${step + 1}`;
    else setPlacementAndGo("faster-5k-30", { q3: "yes" });
  });
  $("#q-no")?.addEventListener("click", () => {
    if (step === 1) location.hash = "l-start?q1=no";
    else if (step === 2) setPlacementAndGo("walk-to-run-30", { q2: "no" });
    else setPlacementAndGo("5k-30", { q3: "no" });
  });
  $("#open-legacy")?.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.setItem("doing-a-5k-legacy", "1");
    location.hash = "onboarding";
  });
}

function setPlacementAndGo(levelId, answers) {
  setL({ ...L, placement: { suggested: levelId, answers, at: todayISO(), check12: check12Result } });
  location.hash = `l-levels?suggest=${levelId}`;
}

/* ---------------- 12-minute check ---------------- */
function check12Steps() {
  if (E2E) {
    return [
      { type: "walk", label: "Brisk walk", durationSeconds: 2, phase: "warmup" },
      { type: "run", label: "Easy jog, up to 12:00", durationSeconds: 4, open: true, phase: "main" },
      { type: "walk", label: "Easy walk", durationSeconds: 2, cue: "cooldown", phase: "cooldown" },
    ];
  }
  return [
    { type: "walk", label: "Brisk walk", durationSeconds: 300, phase: "warmup" },
    { type: "run", label: "Easy jog, up to 12:00", durationSeconds: 720, open: true, phase: "main" },
    { type: "walk", label: "Easy walk", durationSeconds: 300, cue: "cooldown", phase: "cooldown" },
  ];
}

function renderCheck12() {
  if (params().get("run") !== "1") {
    return shell(`
      <div class="card ladder-card">
        <h2>The 12-minute check</h2>
        <p class="ladder-safety">${CHECK12_SAFETY}</p>
        <ol class="ladder-steps">
          <li>5:00 brisk walk.</li>
          <li>Then jog easily for up to 12:00. Tap Stop if you need to walk or can't speak in full sentences.</li>
          <li>Then a 5:00 walk.</li>
        </ol>
        <p><small>Under 12:00 suggests Walk-to-Run 30. 12:00 or more suggests 5K 30. The check is free, counts toward nothing and starts no window.</small></p>
        <label class="check-row"><input type="checkbox" id="c12-adult"> I am 18 or older.</label>
        <button type="button" class="btn btn-primary btn-block" id="c12-start" disabled>Start the check</button>
        <a class="btn btn-secondary btn-block" href="#l-start?q=2">Back</a>
      </div>`, { title: "12-minute check", nav: false });
  }
  return timerMarkup(check12Steps(), { title: "12-minute check", stopLabel: "Stop" });
}

function bindCheck12() {
  if (params().get("run") !== "1") {
    $("#c12-adult")?.addEventListener("change", (e) => ($("#c12-start").disabled = !e.target.checked));
    $("#c12-start")?.addEventListener("click", () => (location.hash = "l-check12?run=1"));
    return;
  }
  runTimer(check12Steps(), {
    onDone: (t) => {
      const jog = t.openResult ? t.openResult.seconds : 0;
      const full = E2E ? 4 : 720;
      check12Result = { seconds: jog, reached: t.openResult?.capped || jog >= full };
      const lvl = check12Result.reached ? "5k-30" : "walk-to-run-30";
      setPlacementAndGo(lvl, { check12: check12Result.reached ? "12:00+" : mmss(jog) });
    },
    exitTo: "l-start?q=2",
  });
}

/* ---------------- level choice ---------------- */
function renderLevels() {
  const suggest = params().get("suggest") || L.placement?.suggested || "walk-to-run-30";
  const sIdx = LEVEL_IDS.indexOf(suggest);
  const confirmId = params().get("confirm");
  if (confirmId) {
    return shell(`
      <div class="card ladder-card">
        <p>This level starts with ${HIGHER_START[confirmId]}. Sure you want to start here?</p>
        <a class="btn btn-primary btn-block" href="${checkoutHref(confirmId, "new")}">Yes, start here</a>
        <a class="btn btn-secondary btn-block" href="${checkoutHref(suggest, "new")}">Use suggested level</a>
      </div>`, { title: "Starting level", nav: false });
  }
  const cards = LEVEL_IDS.map((id, i) => {
    const lvl = LEVELS[id];
    const isS = id === suggest;
    const href = i > sIdx ? `#l-levels?suggest=${suggest}&confirm=${id}` : checkoutHref(id, "new");
    return `
      <div class="card ladder-level ${isS ? "is-suggested" : ""}">
        ${isS ? `<p class="ladder-tag">Suggested</p>` : ""}
        <h2>Level ${lvl.level}: ${esc(lvl.name)}</h2>
        <p class="ladder-price">$${CHECKOUT.prices[id].amount} one-time</p>
        <p>${esc(LEVEL_SUMMARY[id])}</p>
        <p class="muted"><small>Start: ${esc(lvl.entry)} Finish: ${esc(lvl.exit)}</small></p>
        <a class="btn ${isS ? "btn-primary" : "btn-secondary"} btn-block" href="${href}">${i < sIdx ? "Start easier here" : "Choose " + esc(lvl.name)}</a>
      </div>`;
  }).join("");
  return shell(`
    <p class="ladder-result">${esc(RESULT_LINE(LEVEL_NAMES[suggest]))}</p>
    <p class="ladder-lede"><strong>Your starting point: ${esc(LEVEL_NAMES[suggest])}.</strong> ${esc(LEVEL_SUMMARY[suggest])}</p>
    ${cards}
    <p><small>Each level is 30 sessions, one at a time, with 90 days from purchase to finish.</small></p>
  `, { title: "Pick your level", nav: false });
}

/* ---------------- checkout (preview) + receipt ---------------- */
function renderCheckout() {
  const p = params();
  const levelId = p.get("level");
  const kind = p.get("kind") || "new";
  const from = p.get("from") || "resume";
  const lvl = LEVELS[levelId];
  if (!lvl) return shell(`<p>Level not found.</p>`);
  const price = kind === "new" ? CHECKOUT.prices[levelId].amount : CHECKOUT.prices[kind].amount;
  const prevRun = currentRun(L, levelId);
  const resumeAt = kind === "restart" && from === "resume" && prevRun ? prevRun.pointer + 1 : 1;
  const what =
    kind === "new" ? `${lvl.name}, 30 sessions, 90 days from today`
    : kind === "restart" ? `Restart ${lvl.name}: new 90-day window, ${resumeAt > 1 ? `continue from session ${resumeAt}` : "start from session 1"}`
    : `Repeat ${lvl.name}: new 90-day window, starts at session 1`;
  const label = kind === "new" ? `Buy ${lvl.name}, $${price}` : kind === "restart" ? `Restart ${lvl.name}, $${price}` : `Repeat ${lvl.name}, $${price}`;
  return shell(`
    <div class="card ladder-card">
      <h2>Checkout</h2>
      ${previewAllowed() && isPreviewCheckout() ? `<p class="ladder-preview-note"><strong>Preview checkout.</strong> No payment is taken and no card is asked for. In the live version this button opens a fresh Stripe Checkout page (one-time payment, no saved card, no automatic charge).</p>` : ""}
      <p class="ladder-order">${esc(what)}</p>
      <p class="ladder-price">$${price} one-time</p>
      <p class="muted"><small>Access ends ${pretty(addDays(todayISO(), CONFIG.access_window_days - 1))} if bought today. No automatic renewal.</small></p>
      <label class="check-row"><input type="checkbox" id="co-adult"> I am 18 or older.</label>
      ${buyBlock({ id: "co-buy", label, kind, levelId, price, resumeAt, disabled: true })}
      <a class="btn btn-secondary btn-block" href="#l-levels">Back</a>
    </div>`, { title: "Checkout", nav: false });
}

function bindCheckout() {
  const p = params();
  const levelId = p.get("level");
  const kind = p.get("kind") || "new";
  const from = p.get("from") || "resume";
  $("#co-adult")?.addEventListener("change", (e) => {
    const b = $("#co-buy");
    if (b) b.disabled = !e.target.checked;
  });
  $("#co-buy")?.addEventListener("click", () => {
    if (!isPreviewCheckout()) {
      // Live path (after approval): POST to CHECKOUT.sessionEndpoint to create a one-time Checkout Session, then redirect.
      return;
    }
    if (!previewAllowed()) return;
    const price = kind === "new" ? CHECKOUT.prices[levelId].amount : CHECKOUT.prices[kind].amount;
    setL(grantPurchase(L, { levelId, kind, price, startFrom: from, mode: "preview" }));
    location.hash = `l-receipt?level=${levelId}`;
  });
}

function renderReceipt() {
  const levelId = params().get("level") || L.activeLevel;
  const run = currentRun(L, levelId);
  if (!run) return shell(`<p>No purchase yet.</p>`);
  const kindLabel = run.kind === "new" ? "Purchase" : run.kind === "restart" ? "Restart" : "Repeat";
  return shell(`
    <div class="card ladder-card">
      <h2>Receipt${run.mode === "preview" ? " (preview, no charge)" : ""}</h2>
      <dl class="ladder-dl">
        <dt>Item</dt><dd>${kindLabel}: ${esc(LEVEL_NAMES[levelId])}</dd>
        <dt>Amount</dt><dd>$${run.price} one-time</dd>
        <dt>Purchased</dt><dd>${pretty(run.purchasedAt)}</dd>
        <dt>Access ends</dt><dd>${pretty(run.windowEnd)}</dd>
        <dt>Renewal</dt><dd>No automatic renewal</dd>
        <dt>Starts at</dt><dd>Session ${run.pointer + 1} of 30</dd>
      </dl>
      <p class="buy-refund"><small>${esc(disclosureFor({ kind: run.kind, price: run.price, levelName: LEVEL_NAMES[levelId], resumeAt: run.pointer + 1 }))}</small></p>
      <a class="btn btn-primary btn-block" href="${L.settings ? "#l-today" : "#l-setup"}">${L.settings ? "Go to today" : "Set up your week"}</a>
    </div>`, { title: "You're in", nav: false });
}

/* ---------------- setup ---------------- */
function renderSetup() {
  const s = L.settings || {};
  const dpw = s.daysPerWeek || 3;
  const days = s.trainDays || DEFAULT_TRAIN_DAYS[dpw];
  return shell(`
    <form class="card ladder-card" id="setup-form">
      <h2>Your week</h2>
      <label class="field"><span>First name (optional)</span><input type="text" name="name" value="${esc(s.name || "")}" maxlength="40"></label>
      <fieldset class="field"><legend>${SETUP_DAYS}</legend>
        <div class="radio-row">${[3, 4, 5].map((n) => `<label class="chip"><input type="radio" name="dpw" value="${n}" ${n === dpw ? "checked" : ""}> ${n} days</label>`).join("")}</div>
      </fieldset>
      <fieldset class="field"><legend>Which days? <span id="days-hint" class="muted"></span></legend>
        <div class="chip-row">${DAY_NAMES.map((d, i) => `<label class="chip"><input type="checkbox" name="day" value="${i}" ${days.includes(i) ? "checked" : ""}> ${d}</label>`).join("")}</div>
      </fieldset>
      <label class="check-row"><input type="checkbox" name="voice" ${s.voice === false ? "" : "checked"}> Voice cues during sessions</label>
      <fieldset class="field ladder-chd"><legend>Optional energy check-ins</legend>
        <p><small>On Day 1 and Day 30 you can rate your energy before and after the session. Energy ratings are consumer health data. They stay off unless you give consent under our <a class="text-link" href="../../privacy/consumer-health-data/" target="_blank" rel="noopener">Consumer Health Data Privacy Policy</a>. They are stored only on this device and never appear in reminders.</small></p>
        <label class="check-row"><input type="checkbox" name="chd" ${s.chdConsent ? "checked" : ""}> I consent to the collection and use of my energy ratings as described in the Consumer Health Data Privacy Policy.</label>
      </fieldset>
      <p class="ladder-safety"><small>${SAFETY_PARA}</small></p>
      <p class="ladder-error" id="setup-error" role="alert"></p>
      <button type="submit" class="btn btn-primary btn-block">Save my week</button>
    </form>`, { title: "Set up", nav: !!L.settings });
}

function bindSetup() {
  const form = $("#setup-form");
  const hint = () => {
    const dpw = Number(form.dpw.value);
    $("#days-hint").textContent = `(pick ${dpw}${dpw === 5 ? ", no more than 3 in a row" : ""})`;
  };
  form.querySelectorAll('input[name="dpw"]').forEach((r) =>
    r.addEventListener("change", () => {
      const dpw = Number(form.dpw.value);
      form.querySelectorAll('input[name="day"]').forEach((c) => (c.checked = DEFAULT_TRAIN_DAYS[dpw].includes(Number(c.value))));
      hint();
    })
  );
  hint();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const dpw = Number(form.dpw.value);
    const days = [...form.querySelectorAll('input[name="day"]:checked')].map((c) => Number(c.value));
    if (!validTrainDays(days, dpw)) {
      $("#setup-error").textContent = dpw === 5 ? `Pick exactly 5 days, with no more than 3 in a row.` : `Pick exactly ${dpw} days.`;
      return;
    }
    const chd = form.chd.checked;
    const prev = L.settings || {};
    setL({
      ...L,
      settings: {
        ...prev,
        name: form.name.value.trim(),
        daysPerWeek: dpw,
        trainDays: days,
        voice: form.voice.checked,
        chdConsent: chd,
        chdConsentAt: chd ? prev.chdConsentAt || new Date().toISOString() : null,
      },
    });
    location.hash = "l-today";
  });
}

/* ---------------- today ---------------- */
/* For the 4 count-up 5K sessions, estimate with a 30-minute 5K instead of the 45:00 cap. */
function minutesOf(slotDef) {
  if (!slotDef.fiveK) return Math.round(slotDef.totalSeconds / 60);
  const fixed = slotDef.steps.filter((s) => s.type !== "5k-open").reduce((a, s) => a + s.durationSeconds, 0);
  return Math.round(fixed / 60) + 30;
}

function slotLabel(slotDef) {
  return `${slotDef.q ? "⚡ " : ""}Session ${slotDef.slot}: ${esc(slotDef.title)}`;
}

function renderToday() {
  const levelId = L.activeLevel;
  const lvl = LEVELS[levelId];
  const ws = windowStatus(L, levelId);
  if (ws.status === "finished") { location.hash = "l-day30"; return ""; }
  if (ws.status === "expired") { location.hash = "l-expired"; return ""; }
  const run = ws.run;
  const st = computeStreak(L);
  const ts = todayStatus(L, levelId, LEVELS);
  const banners = [];
  const warn = windowWarning(L, levelId);
  if (warn) {
    const key = `window_${warn}`;
    const nextDef = lvl.slots[run.pointer];
    banners.push(`<p class="banner ladder-banner">${esc(fill(REMINDERS[key], { level: lvl.name, n: run.pointer, days_left: ws.daysLeft, minutes: nextDef ? minutesOf(nextDef) : 30 }))}</p>`);
  }
  if (cantFinish(L, levelId)) banners.push(`<p class="banner ladder-banner">${esc(REMINDERS.cant_finish)}</p>`);
  const rep = repairOffer(L);
  if (rep) {
    banners.push(`<div class="card ladder-card"><h2>Keep your streak</h2><p>You missed ${pretty(rep.brokenOn)}. Do today's short Repair session within 48 hours to bring back your ${rep.prevStreak}-day streak.</p><button type="button" class="btn btn-secondary btn-block" id="do-repair">Start Repair session (15 min easy)</button></div>`);
  }
  if (inactiveDays(L) >= CONFIG.reminder_stop_after_inactive_days) banners.push(`<p class="banner ladder-banner">${esc(REMINDERS.paused)}</p>`);

  let card = "";
  if (ts.state === "ready") {
    const d = ts.slotDef;
    card = `
      <div class="card today-card ladder-today">
        <p class="today-date">${pretty(todayISO())}${ts.planned ? "" : " · extra day"}</p>
        <h2 class="today-title">${slotLabel(d)}</h2>
        <p class="today-summary">${esc(d.summary)}</p>
        <p class="today-meta">${d.fiveK ? "Count-up timer, up to 45:00 · " : `About ${minutesOf(d)} min · `}${esc(lvl.name)}</p>
        <button type="button" class="btn btn-primary btn-block btn-start" id="start-slot">Start session ${d.slot}</button>
        <button type="button" class="btn btn-secondary btn-block" id="manual-slot">Log it (done without the app)</button>
      </div>`;
  } else if (ts.state === "rest") {
    const msg = ts.reason === "rest-after-3"
      ? `Rest day. You've run 3 days in a row, so today is for rest. Session ${run.pointer + 1} unlocks tomorrow.`
      : `Key sessions are never on back-to-back days. Session ${run.pointer + 1} unlocks tomorrow. An easy repeat from your plan is fine today.`;
    card = `<div class="card today-card"><h2 class="today-title">Planned rest</h2><p>${msg}</p><a class="btn btn-secondary btn-block" href="#l-plan">Repeat a past session</a></div>`;
  } else if (ts.state === "done-today") {
    card = `<div class="card today-card"><h2 class="today-title">Done for today</h2><p>Nice work. Session ${run.pointer + 1} unlocks tomorrow. A repeat keeps your streak going but doesn't count toward the 30.</p><a class="btn btn-secondary btn-block" href="#l-plan">Repeat a session</a></div>`;
  }

  const sched = projectSchedule(L, levelId, LEVELS);
  const finishDate = sched.length ? sched[sched.length - 1].date : todayISO();
  const onTrack = finishDate <= run.windowEnd;
  const fit = onTrack
    ? `At ${L.settings.daysPerWeek} a week you'll finish around ${pretty(finishDate)}. You're on track.`
    : `At ${L.settings.daysPerWeek} a week the plan runs past ${pretty(run.windowEnd)}. Add one extra day a week to finish in time.`;
  const next = lvl.slots[run.pointer];
  const rem = pickReminder(L, levelId, { minutes: next ? minutesOf(next) : 30 });

  return shell(`
    <p class="today-greet">${L.settings?.name ? `Hi, ${esc(L.settings.name)}` : "Your next session"}</p>
    <div class="ladder-stats">
      <div class="stat"><span class="stat-num">${run.pointer}/30</span><span class="stat-label">Sessions</span></div>
      <div class="stat"><span class="stat-num">🔥 ${st.current}</span><span class="stat-label">Streak</span></div>
      <div class="stat"><span class="stat-num">${st.savesBanked}</span><span class="stat-label">Streak saves</span></div>
      <div class="stat"><span class="stat-num">${ws.daysLeft}</span><span class="stat-label">Days left</span></div>
    </div>
    <div class="progress-bar" aria-label="Session ${run.pointer} of 30"><div class="progress-fill" style="width:${(run.pointer / 30) * 100}%"></div></div>
    <p class="ladder-sub">Session ${Math.min(30, run.pointer + 1)} of 30 · ${esc(lvl.name)} · Day ${ws.day} of 90</p>
    ${banners.join("")}
    ${card}
    <p class="ladder-fit"><small>${esc(fit)}</small></p>
    ${previewAllowed() && rem ? `<div class="card ladder-reminder"><p class="ladder-tag">Reminder preview</p><p>${esc(rem.text)}</p><p class="muted"><small>Max one message a day. Push and email need sign-in and Salim's approval; this preview shows the in-app copy only.${rem.offer ? " Offers go by email only with the marketing opt-in." : ""}</small></p></div>` : ""}
  `, { title: "Today", eyebrow: `Doing a 5K · ${lvl.name}` });
}

function bindToday() {
  $("#start-slot")?.addEventListener("click", () => {
    const run = currentRun(L, L.activeLevel);
    session = { levelId: L.activeLevel, slot: run.pointer + 1, mode: "new" };
    location.hash = "l-session";
  });
  $("#manual-slot")?.addEventListener("click", () => {
    const run = currentRun(L, L.activeLevel);
    session = { levelId: L.activeLevel, slot: run.pointer + 1, mode: "manual", openResult: null };
    location.hash = "l-done";
  });
  $("#do-repair")?.addEventListener("click", () => {
    session = { levelId: L.activeLevel, slot: null, mode: "repair", repairFor: repairOffer(L)?.brokenOn };
    location.hash = "l-session";
  });
}

/* ---------------- session timer ---------------- */
function stepsFor(sess) {
  if (sess.mode === "repair") {
    // Placeholder Repair session until Coach Fit writes it: about half a session, low intensity.
    return E2E
      ? [{ type: "walk", label: "Easy walk or very easy jog", durationSeconds: 2, phase: "main" }]
      : [{ type: "walk", label: "Easy walk or very easy jog (RPE 2 to 3)", durationSeconds: 900, phase: "main" }];
  }
  const def = LEVELS[sess.levelId].slots[sess.slot - 1];
  if (!E2E) return def.steps;
  return def.steps.map((s) => ({ ...s, durationSeconds: s.type === "5k-open" ? 4 : 1 }));
}

function timerMarkup(steps, { title, stopLabel = "Finish" }) {
  const list = steps
    .map((s, i) => `<li class="step-preview ${i === 0 ? "is-current" : ""}">${esc(s.label)} · ${WorkoutTimer.isOpenStep(s) ? `count-up, up to ${mmss(s.durationSeconds)}` : mmss(s.durationSeconds)}${s.effort ? ` · ${esc(s.effort)}` : ""}</li>`)
    .join("");
  return shell(`
    <div class="card timer-card ladder-timer">
      <p class="timer-phase" id="timer-phase">${esc(steps[0].label)}</p>
      <p class="timer-effort" id="timer-effort">${esc(steps[0].effort || "")}</p>
      <p class="timer-countdown" id="timer-countdown" aria-live="polite">${mmss(steps[0].durationSeconds)}</p>
      <p class="timer-next">Next: <span id="timer-next">${esc(steps[1]?.label ?? "Finish")}</span></p>
      <button type="button" class="btn btn-primary btn-block ladder-finish" id="timer-finish" hidden>${stopLabel}</button>
      <p class="ladder-cap-note" id="timer-capnote" hidden></p>
      <div class="progress-bar" aria-hidden="true"><div class="progress-fill" id="timer-progress" style="width:0%"></div></div>
      <ul class="step-list">${list}</ul>
      <div class="timer-actions">
        <button type="button" class="btn btn-secondary" id="timer-pause">Pause</button>
        <button type="button" class="btn btn-secondary" id="timer-skip">Skip step</button>
        <button type="button" class="btn btn-small" id="timer-exit">Exit</button>
      </div>
      <p class="ladder-exit-note" id="exit-note" hidden></p>
    </div>`, { title, nav: false });
}

function runTimer(steps, { onDone, onExit, exitTo = "l-today" }) {
  activeTimer?.stop();
  const t = new WorkoutTimer({
    steps,
    onTick: ({ step, remainingSeconds, elapsedSeconds, open, overallProgress, stepIndex }) => {
      $("#timer-phase").textContent = step.label;
      $("#timer-effort").textContent = step.effort || "";
      $("#timer-countdown").textContent = open ? mmss(elapsedSeconds) : mmss(remainingSeconds);
      $("#timer-finish").hidden = !open;
      $("#timer-progress").style.width = `${overallProgress * 100}%`;
      document.querySelectorAll(".step-preview").forEach((el, i) => el.classList.toggle("is-current", i === stepIndex));
      $("#timer-next").textContent = steps[stepIndex + 1]?.label ?? "Finish";
    },
    onStepChange: (idx, step) => {
      $("#timer-finish").hidden = !WorkoutTimer.isOpenStep(step);
      if (t.openResult?.capped && t.openResult.stepIndex === idx - 1 && steps[idx - 1].type === "5k-open") {
        const n = $("#timer-capnote");
        n.hidden = false;
        n.textContent = "Great work, that's 45 minutes on your feet. Log it as done, or edit your time if you finished.";
      }
      if (step.type === "5k-open") speak("Your 5K, go at your pace.");
    },
    onComplete: () => onDone(t),
    onCue: (kind) => speak(SPEECH_CUES[kind] || ""),
  });
  activeTimer = t;
  t.start();
  let paused = false;
  $("#timer-pause").addEventListener("click", () => {
    paused ? t.resume() : t.pause();
    paused = !paused;
    $("#timer-pause").textContent = paused ? "Resume" : "Pause";
  });
  $("#timer-skip").addEventListener("click", () => t.skipStep());
  $("#timer-finish").addEventListener("click", () => t.finishOpen());
  $("#timer-exit").addEventListener("click", () => {
    t.stop();
    if (onExit && onExit(t)) return;
    location.hash = exitTo;
  });
}

/* Seconds of the main set actually done (for the 80% rule). */
function mainDone(t, steps) {
  let ms = 0;
  steps.forEach((s, i) => {
    if (s.phase !== "main") return;
    if (i < t.stepIndex) ms += Math.min(t.stepElapsedMs[i] ?? s.durationSeconds * 1000, s.durationSeconds * 1000);
    else if (i === t.stepIndex) ms += Math.min(t.getStepElapsedMs(), s.durationSeconds * 1000);
  });
  return ms / 1000;
}

function renderSession() {
  if (!session) { location.hash = "l-today"; return ""; }
  const steps = stepsFor(session);
  const title = session.mode === "repair" ? "Repair session" : `${session.mode === "repeat" ? "Repeat: " : ""}Session ${session.slot}`;
  return timerMarkup(steps, { title });
}

function bindSession() {
  const steps = stepsFor(session);
  const mainTotal = steps.filter((s) => s.phase === "main").reduce((a, s) => a + s.durationSeconds, 0);
  runTimer(steps, {
    onDone: (t) => {
      session.openResult = t.openResult;
      session.seconds = Math.round(steps.reduce((a, s, i) => a + (t.stepElapsedMs[i] ?? s.durationSeconds * 1000), 0) / 1000);
      location.hash = "l-done";
    },
    onExit: (t) => {
      const def = session.slot ? LEVELS[session.levelId].slots[session.slot - 1] : null;
      if (def?.fiveK && t.openResult) {
        session.openResult = t.openResult;
        location.hash = "l-done";
        return true;
      }
      const done = mainDone(t, steps);
      if (!def?.fiveK && mainTotal && done >= 0.8 * mainTotal) {
        session.partial = true;
        session.seconds = Math.round(done);
        location.hash = "l-done";
        return true;
      }
      return false;
    },
  });
}

/* ---------------- done / check-in ---------------- */
function renderDone() {
  if (!session) { location.hash = "l-today"; return ""; }
  if (session.mode === "repair") {
    return shell(`<div class="card card-celebrate"><h2>Streak repaired</h2><p>Nice comeback. Your streak is back.</p><button class="btn btn-primary btn-block" id="done-save">Save</button></div>`, { title: "Repair done", nav: false });
  }
  const lvl = LEVELS[session.levelId];
  const def = lvl.slots[session.slot - 1];
  const isRepeat = session.mode === "repeat";
  const r = session.openResult;
  let fiveK = "";
  if (def.fiveK) {
    const shown = r ? (r.capped ? "45:00+" : mmss(r.seconds)) : "";
    fiveK = `
      <div class="ladder-5k">
        <p class="ladder-5k-label">Your 5K time</p>
        <p class="ladder-5k-time" id="fivek-shown">${shown || "Not recorded"}</p>
        ${r?.capped ? `<p>Great work, that's 45 minutes on your feet. Log it as done, or edit your time if you finished.</p>` : ""}
        <button type="button" class="text-link ladder-linkbtn" id="edit-time">Edit time</button>
        <label class="field" id="edit-wrap" ${shown && session.mode !== "manual" ? "hidden" : ""}><span>5K time (mm:ss)</span><input type="text" id="fivek-input" inputmode="numeric" placeholder="32:10" value="${r && !r.capped ? mmss(r.seconds) : ""}"></label>
      </div>`;
  }
  const wantsCheckin = def.checkin && !isRepeat;
  const chd = !!L.settings?.chdConsent;
  const opts = (n) => Array.from({ length: n }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
  const checkin = wantsCheckin ? `
    <fieldset class="field ladder-checkin"><legend>${def.checkin === "day1" ? "Day-1" : "Day-30"} check-in (personal markers only)</legend>
      <label class="field"><span>How hard did today's session feel? (1 to 10)</span><select id="ci-effort"><option value="">Skip</option>${opts(10)}</select></label>
      ${chd ? `<label class="field"><span>Energy before (1 to 5)</span><select id="ci-eb"><option value="">Skip</option>${opts(5)}</select></label>
      <label class="field"><span>Energy after (1 to 5)</span><select id="ci-ea"><option value="">Skip</option>${opts(5)}</select></label>` : ""}
      ${lvl.level === 1 ? `<label class="field"><span>Longest you jogged without walking today? (mm:ss)</span><input type="text" id="ci-longest" placeholder="12:00"></label>` : ""}
    </fieldset>` : "";
  return shell(`
    <div class="card ${def.slot === 30 && !isRepeat ? "card-celebrate" : ""} ladder-card">
      <h2>${session.partial ? "Most of it counts" : isRepeat ? "Repeat done" : "Session done"}</h2>
      <p>${slotLabel(def)}</p>
      ${session.partial ? `<p>You did at least 80% of the main set, so this session counts as done.</p>` : ""}
      ${session.mode === "manual" ? `<p>Logging a session you did without the app.</p>` : ""}
      ${isRepeat ? `<p>Repeats keep your streak going. They don't count toward the 30.</p>` : ""}
      ${fiveK}
      ${checkin}
      <p class="ladder-error" id="done-error" role="alert"></p>
      <button type="button" class="btn btn-primary btn-block" id="done-save">${isRepeat ? "Save repeat" : "Done"}</button>
      <a class="btn btn-secondary btn-block" href="#l-today">Don't log it</a>
    </div>`, { title: "Nice work", nav: false });
}

function bindDone() {
  $("#edit-time")?.addEventListener("click", () => ($("#edit-wrap").hidden = false));
  $("#done-save")?.addEventListener("click", () => {
    if (session.mode === "repair") {
      setL(addLog(L, { date: todayISO(), levelId: session.levelId, kind: "repair", repairFor: session.repairFor, seconds: 900 }));
      session = null;
      location.hash = "l-today";
      return;
    }
    const lvl = LEVELS[session.levelId];
    const def = lvl.slots[session.slot - 1];
    let fiveK = null;
    if (def.fiveK) {
      const typed = $("#fivek-input")?.value?.trim();
      if (typed) {
        const secs = parseMmss(typed);
        if (secs == null) { $("#done-error").textContent = "Enter the time as mm:ss, for example 32:10."; return; }
        fiveK = { seconds: secs, capped: false, edited: !session.openResult || secs !== session.openResult.seconds };
      } else if (session.openResult) {
        fiveK = { ...session.openResult, edited: false };
      }
    }
    const entry = { seconds: session.seconds || def.totalSeconds, fiveK, partial: !!session.partial, q: !!def.q };
    if (session.mode === "repeat") {
      setL(logRepeat(L, session.levelId, session.slot, entry));
      session = null;
      location.hash = "l-today";
      return;
    }
    const res = completeSlot(L, session.levelId, { ...entry, kind: session.mode === "manual" ? "manual" : "slot" });
    if (!res.ok) {
      $("#done-error").textContent = res.reason === "one-per-day" ? "You already logged a new session today. The next one unlocks tomorrow." : "This window isn't open.";
      return;
    }
    let next = res.state;
    if (def.checkin) {
      const ci = {
        effort: $("#ci-effort")?.value || null,
        energyBefore: L.settings?.chdConsent ? $("#ci-eb")?.value || null : null,
        energyAfter: L.settings?.chdConsent ? $("#ci-ea")?.value || null : null,
        longestJog: $("#ci-longest")?.value || null,
        fiveK,
      };
      next = saveCheckin(next, session.levelId, def.checkin, ci);
    }
    setL(next);
    const finished = res.slot >= 30;
    session = null;
    location.hash = finished ? "l-day30" : "l-today";
  });
}

/* ---------------- plan ---------------- */
function renderPlan() {
  const levelId = L.activeLevel;
  const lvl = LEVELS[levelId];
  const run = currentRun(L, levelId);
  const sched = new Map(projectSchedule(L, levelId, LEVELS).map((x) => [x.slot, x.date]));
  const open = windowStatus(L, levelId).status === "active";
  const items = lvl.slots.map((d) => {
    const done = d.slot <= run.pointer;
    const date = sched.get(d.slot);
    return `<li class="plan-item ladder-plan-item ${done ? "is-done" : ""}">
      <span class="plan-check" aria-hidden="true">${done ? "✓" : d.slot}</span>
      <div><strong>${slotLabel(d)}</strong><br><small>${esc(d.summary)}</small>${!done && date ? `<br><small class="muted">Planned ${pretty(date)}</small>` : ""}</div>
      ${done && open ? `<button type="button" class="btn btn-small btn-secondary ladder-repeat" data-slot="${d.slot}">Repeat</button>` : ""}
    </li>`;
  }).join("");
  return shell(`
    <p class="ladder-sub">${esc(lvl.name)} · ${esc(lvl.cues)}</p>
    <ul class="ladder-plan">${items}</ul>
    <p><small>Repeats keep your streak alive but don't count toward the 30 or move you to the next session.</small></p>
  `, { title: "Plan", eyebrow: `Doing a 5K · ${lvl.name}` });
}

function bindPlan() {
  document.querySelectorAll(".ladder-repeat").forEach((b) =>
    b.addEventListener("click", () => {
      session = { levelId: L.activeLevel, slot: Number(b.dataset.slot), mode: "repeat" };
      location.hash = "l-session";
    })
  );
}

/* ---------------- progress / account ---------------- */
function renderProgress() {
  const levelId = L.activeLevel;
  const st = computeStreak(L);
  const ws = windowStatus(L, levelId);
  const b = badges(L, levelId);
  const purchases = LEVEL_IDS.flatMap((id) => (L.levels[id]?.runs || []).map((r) => ({ ...r, levelId: id })));
  return shell(`
    <div class="ladder-stats">
      <div class="stat"><span class="stat-num">🔥 ${st.current}</span><span class="stat-label">Current streak</span></div>
      <div class="stat"><span class="stat-num">${st.longest}</span><span class="stat-label">Longest streak</span></div>
      <div class="stat"><span class="stat-num">${st.savesBanked}/3</span><span class="stat-label">Saves banked</span></div>
      <div class="stat"><span class="stat-num">${st.savesUsed}</span><span class="stat-label">Saves used</span></div>
    </div>
    <div class="card ladder-card"><h2>Badges</h2><p>${b.length ? b.map((x) => `<span class="ladder-badge">${esc(x)}</span>`).join(" ") : "Your first badge comes with session 1."}</p>
      <p class="muted"><small>Streak milestones: ${CONFIG.milestones.join(", ")} days. Earn 1 streak save for every 7 days in a row (bank up to 3).</small></p></div>
    <div class="card ladder-card"><h2>Your access</h2>
      ${purchases.map((p) => `<p><strong>${esc(LEVEL_NAMES[p.levelId])}</strong> (${p.kind}, $${p.price}${p.mode === "preview" ? ", preview" : ""})<br><small>Purchased ${pretty(p.purchasedAt)} · Access ends ${pretty(p.windowEnd)} · No automatic renewal</small></p>`).join("")}
      ${ws.status === "active" ? `<p><small>Day ${ws.day} of 90 in your current window.</small></p>` : ""}
    </div>
  `, { title: "Progress" });
}

/* ---------------- Day-30 screen ---------------- */
const DAY30 = {
  "walk-to-run-30": {
    head: "30 for 30. You're a runner now.",
    body: "You went from short jogs to 12 minutes nonstop. That's real energy you built, one session at a time.",
    ask: "<strong>Ready for the next 30?</strong> <em>5K 30</em> takes you from 12 minutes to your first 5K, same steady approach.",
    next: "5k-30",
  },
  "5k-30": {
    head: "You did a 5K. Let that sink in.",
    body: "30 sessions, longer runs, stronger legs, and a finish line that's yours.",
    ask: "<strong>Want to keep the momentum?</strong> <em>Faster 5K 30</em> adds speed play, hills and tempo runs to make your 5K feel smoother and quicker.",
    next: "faster-5k-30",
  },
};

function renderDay30() {
  const levelId = L.activeLevel;
  const lvl = LEVELS[levelId];
  const rc = recap(L, levelId, LEVELS);
  let head, body, ask, nextId = null;
  if (levelId === "faster-5k-30") {
    const t30 = rc.day30?.fiveK, t1 = rc.day1?.fiveK;
    const f = (x) => (x ? (x.capped ? "45:00+" : mmss(x.seconds)) : null);
    head = f(t30) && f(t1) ? `Your 5K: ${f(t30)}. Day 1: ${f(t1)}.` : "30 sessions of speed and strength. Nice work.";
    body = "You built speed, strength and confidence.";
    ask = "<strong>What's next?</strong> Run it back, or get on the list for <em>5K to Half Marathon</em>.";
  } else {
    ({ head, body, ask, next: nextId } = DAY30[levelId]);
  }
  const t = (x) => (x ? (x.capped ? "45:00+" : mmss(x.seconds)) : "not entered");
  const markers = levelId === "walk-to-run-30"
    ? `<tr><td>Longest jog</td><td>${esc(rc.day1?.longestJog || "not entered")}</td><td>${esc(rc.day30?.longestJog || "not entered")}</td></tr>`
    : `<tr><td>5K time</td><td>${t(rc.day1?.fiveK)}</td><td>${t(rc.day30?.fiveK)}</td></tr>`;
  const energy = L.settings?.chdConsent && (rc.day1?.energyAfter || rc.day30?.energyAfter)
    ? `<tr><td>Energy after</td><td>${esc(rc.day1?.energyAfter || "")}</td><td>${esc(rc.day30?.energyAfter || "")}</td></tr>` : "";
  const nextBuy = nextId
    ? buyBlock({ id: "d30-next", label: `Start ${LEVEL_NAMES[nextId]}, $${CHECKOUT.prices[nextId].amount}`, kind: "new", levelId: nextId, price: CHECKOUT.prices[nextId].amount })
    : `<a class="btn btn-primary btn-block" href="mailto:coachsalimheyaime@gmail.com?subject=Notify%20me%3A%205K%20to%20Half%20Marathon">Notify me: 5K to Half Marathon</a>`;
  return shell(`
    <div class="card card-celebrate ladder-finisher">
      <p class="ladder-badge ladder-badge--big">${esc(lvl.name)} Finisher</p>
      <h2>${esc(head)}</h2>
      <p>${esc(body)}</p>
    </div>
    <div class="card ladder-card"><h2>Your recap</h2>
      <dl class="ladder-dl">
        <dt>Sessions</dt><dd>${rc.sessions}/30</dd>
        <dt>Calendar days</dt><dd>${rc.calendarDays}</dd>
        <dt>Longest streak</dt><dd>${rc.longestStreak} days</dd>
        <dt>Total minutes</dt><dd>${rc.totalMinutes}</dd>
        <dt>Streak saves used</dt><dd>${rc.savesUsed}</dd>
        ${rc.favorite ? `<dt>Most repeated</dt><dd>${esc(rc.favorite)}</dd>` : ""}
      </dl>
      <table class="effort-table"><thead><tr><th></th><th>Day 1</th><th>Day 30</th></tr></thead><tbody>${markers}${energy}</tbody></table>
    </div>
    <div class="card ladder-card">
      <p>${ask}</p>
      ${nextBuy}
      ${buyBlock({ id: "d30-repeat", label: `Repeat ${lvl.name}, $${CHECKOUT.prices.repeat.amount}`, kind: "repeat", levelId, price: CHECKOUT.prices.repeat.amount })}
      <button type="button" class="btn btn-secondary btn-block" id="d30-rest">Take a rest week first</button>
      <a class="btn btn-small btn-block" href="#l-progress">Not now</a>
    </div>
    ${L.restWeek ? `<p class="banner ladder-banner">Take the week. Walk, stretch, enjoy the energy. ${esc(nextId ? LEVEL_NAMES[nextId] : "Your next challenge")} is ready when you are.</p>` : ""}
  `, { title: "Day 30", eyebrow: `Doing a 5K · ${lvl.name}` });
}

function bindDay30() {
  const levelId = L.activeLevel;
  const nextId = DAY30[levelId]?.next;
  $("#d30-next")?.addEventListener("click", () => (location.hash = checkoutHref(nextId, "new").slice(1)));
  $("#d30-repeat")?.addEventListener("click", () => (location.hash = checkoutHref(levelId, "repeat").slice(1)));
  $("#d30-rest")?.addEventListener("click", () => {
    setL({ ...L, restWeek: { startedAt: todayISO(), next: nextId || null } });
    render("l-day30");
  });
}

/* ---------------- expired / restart ---------------- */
function renderExpired() {
  const levelId = L.activeLevel;
  const lvl = LEVELS[levelId];
  const ws = windowStatus(L, levelId);
  if (ws.status !== "expired") { location.hash = "l-today"; return ""; }
  const n = ws.run.pointer;
  const from = params().get("from") || "resume";
  let offer;
  if (ws.restartOpen) {
    offer = `
      <p>${esc(fill(REMINDERS.restart_day0, { level: lvl.name, n }))}</p>
      ${ws.offerDay >= CONFIG.restart_reminder_day ? `<p class="banner ladder-banner">${esc(fill(REMINDERS.restart_day25, { level: lvl.name }))}</p>` : ""}
      <p class="muted"><small>Restart offer open until ${pretty(addDays(ws.run.windowEnd, CONFIG.restart_offer_days))}.</small></p>
      <fieldset class="field"><legend>Where do you want to start?</legend>
        <label class="check-row"><input type="radio" name="from" value="resume" ${from === "resume" ? "checked" : ""}> Continue from session ${Math.min(30, n + 1)}</label>
        <label class="check-row"><input type="radio" name="from" value="start" ${from === "start" ? "checked" : ""}> Start from session 1</label>
      </fieldset>
      ${buyBlock({ id: "ex-restart", label: `Restart ${lvl.name}, $${CHECKOUT.prices.restart.amount}`, kind: "restart", levelId, price: CHECKOUT.prices.restart.amount, resumeAt: from === "resume" ? n + 1 : 1 })}`;
  } else {
    offer = `
      <p>Welcome back. Your ${esc(lvl.name)} window closed at session ${n} of 30. Your history, badges and streak record stay visible.</p>
      ${buyBlock({ id: "ex-full", label: `Buy ${lvl.name} again, $${CHECKOUT.prices[levelId].amount}`, kind: "new", levelId, price: CHECKOUT.prices[levelId].amount })}`;
  }
  return shell(`<div class="card ladder-card"><h2>Pick up where you left off</h2>${offer}<a class="btn btn-small btn-block" href="#l-progress">Not now</a></div>`, { title: "Window closed", eyebrow: `Doing a 5K · ${lvl.name}` });
}

function bindExpired() {
  const levelId = L.activeLevel;
  document.querySelectorAll('input[name="from"]').forEach((r) => r.addEventListener("change", () => (location.hash = `l-expired?from=${r.value}`)));
  $("#ex-restart")?.addEventListener("click", () => {
    const from = document.querySelector('input[name="from"]:checked')?.value || "resume";
    location.hash = checkoutHref(levelId, "restart", from).slice(1);
  });
  $("#ex-full")?.addEventListener("click", () => (location.hash = checkoutHref(levelId, "new").slice(1)));
}

/* ---------------- settings + preview tools ---------------- */
function renderSettings() {
  const tools = previewAllowed() ? `
    <div class="card ladder-card ladder-tools">
      <h2>Preview tools</h2>
      <p class="muted"><small>Only on the preview. They move the app's date or fill sessions so every screen can be reviewed. Not part of the live app.</small></p>
      <p>Preview date: ${pretty(todayISO())} (offset ${L.previewOffsetDays || 0} days)</p>
      <div class="ladder-tool-row">
        <button type="button" class="btn btn-small btn-secondary" data-tool="day+1">+1 day</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="day+7">+7 days</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="wday60">Window day 60</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="wday75">Window day 75</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="wday85">Window day 85</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="wday91">Day after expiry</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="wday115">Restart offer day 25</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="fill23">Fill to session 23</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="fill29">Fill to session 29</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="today">Back to real date</button>
      </div>
    </div>` : "";
  return shell(`
    <div class="card ladder-card">
      <h2>Settings</h2>
      <p>${L.settings ? `${L.settings.daysPerWeek} days a week: ${L.settings.trainDays.map((d) => DAY_NAMES[d]).join(", ")}` : ""}</p>
      <a class="btn btn-secondary btn-block" href="#l-setup">Change days, voice and check-ins</a>
      <a class="btn btn-secondary btn-block" href="#l-start">Find your starting level again</a>
      <button type="button" class="btn btn-small btn-block" id="ladder-reset">Clear ladder data on this device</button>
    </div>
    ${tools}`, { title: "Settings" });
}

function bindSettings() {
  $("#ladder-reset")?.addEventListener("click", () => {
    if (!confirm("Clear your ladder progress on this device?")) return;
    resetLadder();
    L = emptyState();
    setPreviewOffset(0);
    location.hash = "l-start";
  });
  document.querySelectorAll("[data-tool]").forEach((b) =>
    b.addEventListener("click", () => {
      const tool = b.dataset.tool;
      const run = currentRun(L, L.activeLevel);
      let off = L.previewOffsetDays || 0;
      const realToday = (() => { setPreviewOffset(0); const r = todayISO(); setPreviewOffset(off); return r; })();
      if (tool === "day+1") off += 1;
      else if (tool === "day+7") off += 7;
      else if (tool === "today") off = 0;
      else if (tool.startsWith("wday") && run) off = daysBetween(realToday, run.windowStart) + Number(tool.slice(4)) - 1;
      else if (tool.startsWith("fill") && run) {
        const target = Number(tool.slice(4));
        let s = L;
        const lvl = LEVELS[L.activeLevel];
        // Log past sessions on earlier calendar days so streak math stays realistic.
        let i = 0;
        while (currentRun(s, L.activeLevel).pointer < target && i < 200) {
          const r = currentRun(s, L.activeLevel);
          const date = addDays(todayISO(), -(target - r.pointer) * 2);
          const def = lvl.slots[r.pointer];
          s = addLog(s, { date, levelId: L.activeLevel, runId: r.runId, slot: r.pointer + 1, kind: "slot", seconds: def.totalSeconds, q: !!def.q, preview: true });
          const ls = s.levels[L.activeLevel];
          s = { ...s, levels: { ...s.levels, [L.activeLevel]: { ...ls, runs: ls.runs.map((x) => (x.runId === r.runId ? { ...x, pointer: x.pointer + 1 } : x)) } } };
          i++;
        }
        setL(s);
      }
      setL({ ...L, previewOffsetDays: off });
      setPreviewOffset(off);
      render("l-settings");
    })
  );
}

/* ---------------- router ---------------- */
const VIEWS = {
  "l-start": [renderStart, bindStart],
  "l-check12": [renderCheck12, bindCheck12],
  "l-levels": [renderLevels, null],
  "l-checkout": [renderCheckout, bindCheckout],
  "l-receipt": [renderReceipt, null],
  "l-setup": [renderSetup, bindSetup],
  "l-today": [renderToday, bindToday],
  "l-session": [renderSession, bindSession],
  "l-done": [renderDone, bindDone],
  "l-plan": [renderPlan, bindPlan],
  "l-progress": [renderProgress, null],
  "l-day30": [renderDay30, bindDay30],
  "l-expired": [renderExpired, bindExpired],
  "l-settings": [renderSettings, bindSettings],
};
const NEEDS_RUN = new Set(["l-today", "l-session", "l-done", "l-plan", "l-progress", "l-day30", "l-expired", "l-settings"]);

export async function render(hashName) {
  await loadLevels();
  const root = $("#app");
  document.body.classList.add("ladder-theme");
  if (!hashName.startsWith("l-session") && !hashName.startsWith("l-check12")) activeTimer?.stop();
  const view = hashName.split("?")[0];
  if (NEEDS_RUN.has(view) && !(L.activeLevel && currentRun(L, L.activeLevel))) { location.hash = "l-start"; return; }
  if (["l-today", "l-plan"].includes(view) && !L.settings) { location.hash = "l-setup"; return; }
  const [r, b] = VIEWS[view] || VIEWS["l-start"];
  const html = r();
  if (!html) return;
  root.innerHTML = html;
  bindNav();
  b?.();
  window.scrollTo(0, 0);
}

export function hasLadder() {
  return !!(L.activeLevel && currentRun(L, L.activeLevel));
}
