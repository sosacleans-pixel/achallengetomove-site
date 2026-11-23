/* Ladder UI (PREVIEW, Coach Fit spec v6). Routes start with "l-". Nothing here is live.
 * Level names come from config.js (one-line swap). Legal copy comes from copy.js (Attorney memo, word for word). */
import { WorkoutTimer, SPEECH_CUES } from "../timer.js";
import { todayISO, addDays, daysBetween, pretty, prettyFull, mmss, parseMmss, setPreviewOffset } from "./dates.js";
import {
  CONFIG, LEVEL_IDS, DISPLAY_NAMES, DEFAULT_TRAIN_DAYS, REMINDERS, CORE_SESSIONS, applyIndex, applyLevels, emptyState, loadLadder, saveLadder, resetLadder,
  currentRun, grantPurchase, windowStatus, completeSlot, logRepeat, addLog, saveCheckin, getCheckin, setChdConsent,
  requestDaysPerWeek, fitsAfterChange, totalSessions, weekOf, dpw, accessEnd, accessWeeks, planWeeks,
  computeStreak, repairOffer, inactiveDays, cantFinish, windowWarning, pickReminder, reminderText, badges, recap, fill,
} from "./engine.js";
import { todayStatus, projectSchedule, validTrainDays, levelData, isRunning, keyDayConflict } from "./scheduler.js";
import { CHECKOUT, buyTrustHtml, disclosureFor, isPreviewCheckout, previewAllowed } from "./checkout.js";
import { createGift, getGift, updateGift, giftStatus, canRefund, redeemable, markRedeemed, giftReminderDates, giftReminderEmail } from "./gifts.js";
import { t as copy } from "./copy.js";
import { NAMES, TIMER_CAPS, PREVIEW_PLACEHOLDER_NOTE } from "./config.js";

const E2E = new URLSearchParams(location.search).has("e2e");
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const $ = (sel, root = document) => root.querySelector(sel);
const DN = (id) => DISPLAY_NAMES[id];

let L = loadLadder() || emptyState();
setPreviewOffset(previewAllowed() ? L.previewOffsetDays || 0 : 0);
let LEVELS = null;
let activeTimer = null;
let session = null; // { levelId, slot, mode: "new"|"repeat"|"repair"|"manual", openResult, partial, seconds }

function setL(next) {
  L = next;
  saveLadder(L);
}

async function loadLevels() {
  if (LEVELS) return LEVELS;
  const index = await fetch("./data/ladder/index.json").then((r) => r.json());
  applyIndex(index);
  const entries = await Promise.all(
    index.files.map((f) => fetch(`./data/ladder/${f.file}`).then((r) => r.json()).then((j) => [`${j.id}-${j.daysPerWeek}x`, j]))
  );
  LEVELS = Object.fromEntries(entries);
  applyLevels(LEVELS);
  return LEVELS;
}

const lvl = (levelId, days) => levelData(L, levelId, LEVELS, days);

function esc(t) {
  return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function speak(text) {
  if (L.settings?.voice === false || !text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function params() {
  return new URLSearchParams(location.hash.split("?")[1] || "");
}

/* ---------------- copy ----------------
 * Legal: copy.js (Attorney memo §11 for v6, §7.5 and §7.7 unchanged). Non-legal: Coach Fit v6 §4, §5, §10. */
const RESULT_LINE = (level) => copy("resultLine", { level });
/* The existing in-app acknowledgment sentence (js/health-ack.js), used for a gift recipient's personal acceptance. */
const ACK_SENTENCE =
  'I am 18 or older. I have read the <a class="text-link" href="../../health-safety/" target="_blank" rel="noopener">Health and safety information</a>, and I agree to the <a class="text-link" href="../../purchase-terms/" target="_blank" rel="noopener">App Terms</a>, including the Assumption of Risk and the Release of Liability, which includes claims based on negligence.';
const QUESTIONS = [
  "Can you walk briskly for 30 minutes and still feel comfortable?",
  "Can you jog 12 minutes nonstop while still able to talk in full sentences?",
  "Have you run 5K (3.1 miles) or 30 minutes nonstop in the last 2 months?",
];
const LEVEL_SUMMARY = {
  "walk-to-5k": "Walk with short jogs, building to your first continuous 5K.",
  "5k-faster": "Add speed play, hills and tempo runs for a smoother, quicker 5K.",
  "10k": "Build your long run step by step, all the way to 10K.",
};
const HIGHER_START = { "5k-faster": "a 5K run", "10k": "40-minute long runs" };
const accessThrough = (end) => `Access through ${prettyFull(end)}. No automatic renewal.`;

/* Attorney §11.4: 10K safety block (product page, 10K setup, check-in, Health and safety page). */
function tenKSafety() {
  const p = copy("tenKSafety");
  return `<div class="ladder-safety ladder-10k-safety">${p.map((x) => `<p><small>${esc(x)}</small></p>`).join("")}</div>`;
}

/* Attorney §11.7 access line, with the exact end date. */
function accessLineFor(days, start = todayISO()) {
  return copy("accessLine", { endDate: prettyFull(accessEnd(start, days)), accessWeeks: accessWeeks(days), planWeeks: planWeeks(days) });
}

/* ---------------- shell ---------------- */
function shell(content, { title = NAMES.house, nav = true, eyebrow = NAMES.house } = {}) {
  const hash = location.hash.split("?")[0];
  const navBtn = (to, label) => `<button type="button" data-lnav="${to}" class="app-nav-btn ${hash === "#" + to ? "is-active" : ""}">${label}</button>`;
  const hasRun = L.activeLevel && currentRun(L, L.activeLevel) && L.settings;
  return `
  ${previewAllowed() ? `<p class="ladder-ribbon" role="note">Preview build. Not live. No real payments.${L.previewOffsetDays ? ` Preview date: ${pretty(todayISO())}.` : ""} ${esc(PREVIEW_PLACEHOLDER_NOTE)}</p>` : ""}
  <div class="app-screen">
    <header class="app-header">
      <p class="app-eyebrow">${esc(eyebrow)}</p>
      <h1 class="app-title">${title}</h1>
    </header>
    ${content}
    ${nav && hasRun ? `<nav class="app-nav" aria-label="App sections">${navBtn("l-today", "Today")}${navBtn("l-plan", "Plan")}${navBtn("l-progress", "Progress")}${navBtn("l-settings", "Settings")}</nav>` : ""}
    <footer class="app-footer">
      <p>General education only, not medical advice. Coach Salim Heyaime LLC.</p>
      <p><a class="text-link" href="../../health-safety/" target="_blank" rel="noopener">Health and safety</a> · <a class="text-link" href="../../purchase-terms/#app-5k-ladder" target="_blank" rel="noopener">Purchase terms</a> · <a class="text-link" href="../../privacy/" target="_blank" rel="noopener">Privacy</a></p>
      <p>&copy; ${new Date().getFullYear()} Coach Salim Heyaime LLC</p>
    </footer>
  </div>`;
}

function bindNav() {
  document.querySelectorAll("[data-lnav]").forEach((b) => b.addEventListener("click", () => (location.hash = b.dataset.lnav)));
}

/* opts carries days, so the disclosure shows the exact plan length, access length and end date. */
function buyBlock({ id, label, kind, levelId, price, resumeAt = 1, disabled = false, days = dpw(L) }) {
  const usable = !isPreviewCheckout() || previewAllowed();
  const btn = usable
    ? `<button type="button" class="btn btn-primary btn-block ladder-buy" id="${id}" ${disabled ? "disabled" : ""}>${esc(label)}</button>`
    : `<button type="button" class="btn btn-primary btn-block ladder-buy" disabled aria-disabled="true">${esc(label)} (checkout coming soon)</button>`;
  const vars = { days, planWeeks: planWeeks(days), accessWeeks: accessWeeks(days), endDate: prettyFull(accessEnd(todayISO(), days)) };
  return `<div class="ladder-buy-wrap">${btn}${buyTrustHtml({ kind, price, levelId, resumeAt, ...vars })}</div>`;
}

/* Every self-purchase, restart and repeat goes through the days-a-week screen first. */
function daysHref(levelId, kind, from = "resume", extra = "") {
  return `#l-days?level=${levelId}&kind=${kind}&from=${from}${extra}`;
}

/* ---------------- placement (Q1 to Q4) ---------------- */
function renderStart() {
  const p = params();
  const step = Number(p.get("q") || 1);
  const gift = p.get("gift");
  const giftQ = gift ? `&gift=${encodeURIComponent(gift)}` : "";
  if (p.get("q1") === "no") {
    return shell(`
      <div class="card ladder-card">
        <h2>${esc(copy("placementTitle"))}</h2>
        <p class="ladder-warn">${esc(copy("q1No"))}</p>
        <p class="ladder-result">${esc(RESULT_LINE(DN("walk-to-5k")))}</p>
        <a class="btn btn-primary btn-block" href="${gift ? `#l-redeem?code=${encodeURIComponent(gift)}&pick=walk-to-5k` : "#l-levels?suggest=walk-to-5k"}">Continue with ${esc(DN("walk-to-5k"))}</a>
        <a class="btn btn-secondary btn-block" href="#l-start${gift ? `?gift=${encodeURIComponent(gift)}` : ""}">Not now</a>
      </div>`, { title: "Starting level", nav: false });
  }
  const body = step === 4
    ? `<p class="ladder-q-count">Question 4 of 4</p>
      <p class="ladder-q">${esc(copy("q4"))}</p>
      <div class="ladder-yesno">
        <button type="button" class="btn btn-primary" id="q4-faster">${esc(copy("q4Options")[0])}</button>
        <button type="button" class="btn btn-secondary" id="q4-farther">${esc(copy("q4Options")[1])}</button>
      </div>`
    : `<p class="ladder-q-count">Question ${step} of 4</p>
      <p class="ladder-q">${esc(QUESTIONS[step - 1])}</p>
      <div class="ladder-yesno">
        <button type="button" class="btn btn-primary" id="q-yes">Yes</button>
        <button type="button" class="btn btn-secondary" id="q-no">No</button>
      </div>`;
  return shell(`
    <div class="card ladder-card">
      <h2>${esc(copy("placementTitle"))}</h2>
      <p>${esc(copy("placementSub"))}</p>
      <p class="ladder-safety"><small>${esc(copy("safetyPara"))}</small></p>
      ${body}
      ${step === 2 ? `<p class="ladder-alt"><a class="text-link" href="#l-check12?x=1${giftQ}">Not sure? Try the 12-minute check</a> (free, before you buy)</p>` : ""}
    </div>
    ${step === 1 && !gift ? `<p class="ladder-legacy"><small>Buying for someone else? <a class="text-link" href="#l-gift">Give a running plan as a gift</a>. Got a gift code? <a class="text-link" href="#l-redeem">Redeem it</a>.</small></p>` : ""}
  `, { title: "Starting level", nav: false });
}

function bindStart() {
  const p = params();
  const step = Number(p.get("q") || 1);
  const gift = p.get("gift");
  const giftQ = gift ? `&gift=${encodeURIComponent(gift)}` : "";
  $("#q-yes")?.addEventListener("click", () => (location.hash = `l-start?q=${step + 1}${giftQ}`));
  $("#q-no")?.addEventListener("click", () => {
    if (step === 1) location.hash = `l-start?q1=no${giftQ}`;
    else if (step === 2) setPlacementAndGo("walk-to-5k", { q2: "no" }, gift);
    else setPlacementAndGo("walk-to-5k", { q3: "no" }, gift, true);
  });
  $("#q4-faster")?.addEventListener("click", () => setPlacementAndGo("5k-faster", { q3: "yes", q4: "faster" }, gift));
  $("#q4-farther")?.addEventListener("click", () => setPlacementAndGo("10k", { q3: "yes", q4: "farther" }, gift));
}

function setPlacementAndGo(levelId, answers, gift, headStart = false) {
  setL({ ...L, placement: { suggested: levelId, headStart, answers, at: todayISO() } });
  const hs = headStart ? "&hs=1" : "";
  location.hash = gift ? `l-redeem?code=${encodeURIComponent(gift)}&suggest=${levelId}${hs}` : `l-levels?suggest=${levelId}${hs}`;
}

/* ---------------- 12-minute check (free, counts toward nothing, starts no window) ---------------- */
function check12Steps() {
  const d = E2E ? [2, 4, 2] : [300, 720, 300];
  return [
    { type: "walk", label: "Brisk walk", durationSeconds: d[0], phase: "warmup" },
    { type: "run", label: "Easy jog, up to 12:00", durationSeconds: d[1], open: true, phase: "main" },
    { type: "walk", label: "Easy walk", durationSeconds: d[2], cue: "cooldown", phase: "cooldown" },
  ];
}

function renderCheck12() {
  if (params().get("run") !== "1") {
    return shell(`
      <div class="card ladder-card">
        <h2>The 12-minute check</h2>
        <p class="ladder-safety">${esc(copy("check12"))}</p>
        <ol class="ladder-steps">
          <li>5:00 walk.</li>
          <li>Then an easy jog for up to 12:00. Tap Stop to walk.</li>
          <li>Then a 5:00 walk.</li>
        </ol>
        <p><small>${esc(copy("check12Routing"))}</small></p>
        <label class="check-row"><input type="checkbox" id="c12-adult"> I am 18 or older.</label>
        <button type="button" class="btn btn-primary btn-block" id="c12-start" disabled>Start the check</button>
        <a class="btn btn-secondary btn-block" href="#l-start?q=2">Back</a>
      </div>`, { title: "12-minute check", nav: false });
  }
  return timerMarkup(check12Steps(), { title: "12-minute check", stopLabel: "Stop" });
}

function bindCheck12() {
  const gift = params().get("gift");
  if (params().get("run") !== "1") {
    $("#c12-adult")?.addEventListener("change", (e) => ($("#c12-start").disabled = !e.target.checked));
    $("#c12-start")?.addEventListener("click", () => (location.hash = `l-check12?run=1${gift ? `&gift=${encodeURIComponent(gift)}` : ""}`));
    return;
  }
  runTimer(check12Steps(), {
    onDone: (t) => {
      const full = E2E ? 4 : 720;
      const jog = t.openResult ? t.openResult.seconds : 0;
      const reached = t.openResult?.capped || jog >= full;
      // The 12-minute check only routes within Walk to 5K (week 1 or the week-6 head start).
      setPlacementAndGo("walk-to-5k", { check12: reached ? "12:00+" : mmss(jog) }, gift, reached);
    },
    exitTo: "l-start?q=2",
  });
}

/* ---------------- level choice ---------------- */
function renderLevels() {
  const p = params();
  const suggest = p.get("suggest") || L.placement?.suggested || "walk-to-5k";
  const hs = p.get("hs") === "1";
  const sIdx = LEVEL_IDS.indexOf(suggest);
  const confirmId = p.get("confirm");
  if (confirmId) {
    return shell(`
      <div class="card ladder-card">
        <h2>${esc(DN(confirmId))}</h2>
        <p>This level starts with ${HIGHER_START[confirmId]}. Sure you want to start here?</p>
        ${confirmId === "10k" ? tenKSafety() : ""}
        <a class="btn btn-primary btn-block" href="${daysHref(confirmId, "new")}">Yes, start here</a>
        <a class="btn btn-secondary btn-block" href="${daysHref(suggest, "new", "resume", hs ? "&hs=1" : "")}">Use ${esc(DN(suggest))}</a>
      </div>`, { title: "Starting level", nav: false });
  }
  const cards = LEVEL_IDS.map((id, i) => {
    const l = lvl(id, 3);
    const isS = id === suggest;
    const harder = i > sIdx;
    const href = harder ? `#l-levels?suggest=${suggest}${hs ? "&hs=1" : ""}&confirm=${id}` : daysHref(id, "new");
    let actions;
    if (isS && hs) {
      actions = `<a class="btn btn-primary btn-block" href="${daysHref(id, "new", "resume", "&hs=1")}">Start at week 6</a>
        <a class="btn btn-secondary btn-block" href="${daysHref(id, "new")}">Start at week 1</a>`;
    } else {
      const label = i < sIdx ? (suggest === "10k" && id === "5k-faster" ? "Sharpen your 5K first?" : "Start easier here") : `Choose ${DN(id)}`;
      actions = `<a class="btn ${isS ? "btn-primary" : "btn-secondary"} btn-block" href="${href}">${esc(label)}</a>`;
    }
    return `
      <div class="card ladder-level ${isS ? "is-suggested" : ""}">
        ${isS ? `<p class="ladder-tag">Suggested</p>` : ""}
        <h2>${esc(DN(id))}</h2>
        <p class="ladder-sub-left">Level ${l.level} · ${CORE_SESSIONS} core sessions</p>
        <p class="ladder-price">$${CHECKOUT.prices[id].amount} one-time <span class="muted"><small>(preview price)</small></span></p>
        <p>${esc(LEVEL_SUMMARY[id])}</p>
        <p class="muted"><small>Start: ${esc(l.entry)} Finish: ${esc(l.exit)}</small></p>
        ${actions}
      </div>`;
  }).join("");
  const result = suggest === "walk-to-5k" && hs ? copy("headStart") : RESULT_LINE(DN(suggest));
  return shell(`
    <p class="ladder-result">${esc(result)}</p>
    ${suggest === "walk-to-5k" && hs ? "" : `<p class="ladder-lede">${esc(LEVEL_SUMMARY[suggest])}</p>`}
    ${cards}
    <p><small>${esc(copy("levelsFooter"))}</small></p>
  `, { title: "Pick your level", nav: false });
}

/* ---------------- days a week (before checkout, before gift redemption, and mid-plan) ---------------- */
function daysOptionsHtml(cur, name = "dpw") {
  const opts = copy("daysOptions");
  return CONFIG.days_per_week_options.map((n, i) => `<label class="check-row"><input type="radio" name="${name}" value="${n}" ${n === cur ? "checked" : ""}> ${esc(opts[i])}</label>`).join("");
}

function whichDaysHtml(days, n) {
  return `<fieldset class="field"><legend>Which days? <span id="days-hint" class="muted">(pick ${n})</span></legend>
      <div class="chip-row">${DAY_NAMES.map((d, i) => `<label class="chip"><input type="checkbox" name="day" value="${i}" ${days.includes(i) ? "checked" : ""}> ${d}</label>`).join("")}</div>
      <p class="muted" id="key-conflict" hidden><small>${esc(copy("keyConflict"))}</small></p>
    </fieldset>`;
}

function renderDays() {
  const p = params();
  const change = p.get("change") === "1";
  const levelId = change ? L.activeLevel : p.get("level");
  if (!DN(levelId)) return shell(`<p>Level not found.</p>`);
  const kind = p.get("kind") || "new";
  const cur = Number(p.get("days") || (L.settings?.daysPerWeek || 3));
  const days = p.get("td") ? p.get("td").split(",").map(Number) : (cur === L.settings?.daysPerWeek && L.settings?.trainDays) || DEFAULT_TRAIN_DAYS[cur];
  const run = change ? currentRun(L, levelId) : null;
  let notice;
  if (change) {
    const fits = fitsAfterChange(L, cur);
    notice = `<p class="banner ladder-banner">${esc(copy("midPlanChange", { endDate: prettyFull(run.windowEnd) }))}</p>
      ${!fits && cur !== dpw(L) ? `<p class="ladder-warn"><small>${esc(copy("midPlanNoFit", { n: cur, date: prettyFull(run.windowEnd) }))}</small></p>` : ""}`;
  } else {
    notice = `<p class="ladder-access"><strong>${esc(accessLineFor(cur))}</strong></p>
      ${cur === 2 ? `<p class="ladder-warn"><small>${esc(copy("twoDay", { endDate: prettyFull(accessEnd(todayISO(), 2)) }))}</small></p>` : ""}`;
  }
  return shell(`
    <form class="card ladder-card" id="days-form">
      <h2>${esc(copy("daysTitle"))}</h2>
      <p class="ladder-sub-left">${esc(DN(levelId))}</p>
      <fieldset class="field">${daysOptionsHtml(cur)}</fieldset>
      <p class="muted"><small>${esc(copy("daysHelper"))}</small></p>
      ${whichDaysHtml(days, cur)}
      ${notice}
      ${levelId === "10k" && !change ? tenKSafety() : ""}
      <p class="ladder-error" id="days-error" role="alert"></p>
      <button type="submit" class="btn btn-primary btn-block">${change ? "Save days a week" : "Continue to checkout"}</button>
      <a class="btn btn-secondary btn-block" href="${change ? "#l-settings" : kind === "new" ? "#l-levels" : "#l-progress"}">Back</a>
    </form>`, { title: change ? "Days a week" : "Your plan", nav: change });
}

function bindDaysForm(form, onDays) {
  const conflict = () => {
    const n = Number(form.dpw.value);
    const picked = [...form.querySelectorAll('input[name="day"]:checked')].map((c) => Number(c.value));
    const levelId = params().get("change") === "1" ? L.activeLevel : params().get("level") || params().get("pick") || "walk-to-5k";
    const lv = lvl(levelId, n);
    $("#key-conflict").hidden = !(lv && keyDayConflict(lv, picked));
    $("#days-hint").textContent = `(pick ${n})`;
  };
  form.querySelectorAll('input[name="dpw"]').forEach((r) =>
    r.addEventListener("change", () => {
      const n = Number(form.dpw.value);
      form.querySelectorAll('input[name="day"]').forEach((c) => (c.checked = DEFAULT_TRAIN_DAYS[n].includes(Number(c.value))));
      onDays?.(n);
    })
  );
  form.querySelectorAll('input[name="day"]').forEach((c) => c.addEventListener("change", conflict));
  conflict();
}

function readDays(form) {
  const n = Number(form.dpw.value);
  const days = [...form.querySelectorAll('input[name="day"]:checked')].map((c) => Number(c.value));
  return { n, days, ok: validTrainDays(days, n) };
}

function bindDays() {
  const form = $("#days-form");
  const p = params();
  const change = p.get("change") === "1";
  const keep = (n) => {
    const q = new URLSearchParams(p);
    q.set("days", n);
    q.delete("td");
    location.hash = `l-days?${q.toString()}`;
  };
  bindDaysForm(form, keep);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const { n, days, ok } = readDays(form);
    if (!ok) { $("#days-error").textContent = `Pick exactly ${n} days.`; return; }
    if (change) {
      setL(requestDaysPerWeek(L, n, days));
      location.hash = "l-today";
      return;
    }
    location.hash = `l-checkout?level=${p.get("level")}&kind=${p.get("kind") || "new"}&from=${p.get("from") || "resume"}&days=${n}&td=${days.join(",")}${p.get("hs") === "1" ? "&hs=1" : ""}`;
  });
}

/* ---------------- checkout (preview) + receipt ---------------- */
function priceFor(levelId, kind) {
  return kind === "new" || kind === "gift" ? CHECKOUT.prices[levelId].amount : CHECKOUT.prices[kind].amount;
}

function renderCheckout() {
  const p = params();
  const levelId = p.get("level");
  const kind = p.get("kind") || "new";
  const from = p.get("from") || "resume";
  const days = Number(p.get("days"));
  if (!DN(levelId)) return shell(`<p>Level not found.</p>`);
  if (!days) { location.hash = daysHref(levelId, kind, from).slice(1); return ""; }
  const hs = kind === "new" && p.get("hs") === "1";
  const price = priceFor(levelId, kind);
  const prevRun = currentRun(L, levelId);
  const resumeAt = kind === "restart" && from === "resume" && prevRun ? (prevRun.coreDone || 0) + 1 : 1;
  const plan = `${days} days a week, ${planWeeks(days)} weeks, ${accessWeeks(days)} weeks of access`;
  const what =
    kind === "new" ? `${DN(levelId)}: ${plan}${hs ? ", starting at week 6" : ""}`
    : kind === "restart" ? `Restart ${DN(levelId)}: ${plan}, ${resumeAt > 1 ? `continue from core session ${resumeAt}` : "start from session 1"}`
    : `Repeat ${DN(levelId)}: ${plan}, starts at session 1`;
  const label = kind === "new" ? `Buy ${DN(levelId)}, $${price}` : kind === "restart" ? `Restart ${DN(levelId)}, $${price}` : `Repeat ${DN(levelId)}, $${price}`;
  return shell(`
    <div class="card ladder-card">
      <h2>Checkout</h2>
      ${previewAllowed() && isPreviewCheckout() ? `<p class="ladder-preview-note"><strong>Preview checkout.</strong> No payment is taken and no card is asked for. In the live version this button opens a fresh Stripe Checkout page (one-time payment, no saved card, no automatic charge).</p>` : ""}
      <p class="ladder-order">${esc(what)}</p>
      <p class="ladder-price">$${price} one-time</p>
      <p class="ladder-access"><strong>${esc(accessLineFor(days))}</strong></p>
      ${days === 2 ? `<p class="ladder-warn"><small>${esc(copy("twoDay", { endDate: prettyFull(accessEnd(todayISO(), 2)) }))}</small></p>` : ""}
      <label class="check-row"><input type="checkbox" id="co-adult"> I am 18 or older.</label>
      ${buyBlock({ id: "co-buy", label, kind, levelId, price, resumeAt, disabled: true, days })}
      <a class="btn btn-secondary btn-block" href="${daysHref(levelId, kind, from, `&days=${days}${hs ? "&hs=1" : ""}`)}">Back</a>
    </div>`, { title: "Checkout", nav: false });
}

function bindCheckout() {
  const p = params();
  const levelId = p.get("level");
  const kind = p.get("kind") || "new";
  const from = p.get("from") || "resume";
  const days = Number(p.get("days"));
  const trainDays = (p.get("td") || "").split(",").filter(Boolean).map(Number);
  const startCoreIndex = kind === "new" && p.get("hs") === "1" ? CONFIG.head_start_core_index : 1;
  $("#co-adult")?.addEventListener("change", (e) => { const b = $("#co-buy"); if (b) b.disabled = !e.target.checked; });
  $("#co-buy")?.addEventListener("click", () => {
    if (!isPreviewCheckout()) return; // live: the server creates a one-time Checkout Session, then redirects
    if (!previewAllowed()) return;
    setL(grantPurchase(L, { levelId, kind, price: priceFor(levelId, kind), daysPerWeek: days, trainDays: trainDays.length === days ? trainDays : null, startFrom: from, startCoreIndex, mode: "preview" }));
    location.hash = `l-receipt?level=${levelId}`;
  });
}

function renderReceipt() {
  const levelId = params().get("level") || L.activeLevel;
  const run = currentRun(L, levelId);
  if (!run) return shell(`<p>No purchase yet.</p>`);
  const kindLabel = { new: "Purchase", restart: "Restart", repeat: "Repeat", gift: "Gift redeemed" }[run.kind];
  const days = run.daysPerWeekAtPurchase;
  const line = copy("accessLine", { endDate: prettyFull(run.windowEnd), accessWeeks: run.accessWeeks, planWeeks: planWeeks(days) });
  return shell(`
    <div class="card ladder-card">
      <h2>Receipt${run.mode === "preview" ? " (preview, no charge)" : ""}</h2>
      <dl class="ladder-dl">
        <dt>Item</dt><dd>${kindLabel}: ${esc(DN(levelId))}</dd>
        <dt>Amount</dt><dd>${run.kind === "gift" ? "Gift" : `$${run.price} one-time`}</dd>
        <dt>${run.kind === "gift" ? "Redeemed" : "Purchased"}</dt><dd>${prettyFull(run.purchasedAt)}</dd>
        <dt>Plan</dt><dd>${days} days a week, ${planWeeks(days)} weeks</dd>
        <dt>Access ends</dt><dd>${prettyFull(run.windowEnd)}</dd>
        <dt>Renewal</dt><dd>No automatic renewal</dd>
        <dt>Starts at</dt><dd>${run.headStart ? "Week 6, " : ""}Session ${run.pointer + 1}</dd>
      </dl>
      <p><strong>${esc(line)}</strong></p>
      ${run.kind === "gift" ? "" : `<p class="buy-refund"><small>${esc(disclosureFor({ kind: run.kind, price: run.price, levelId, resumeAt: run.coreDone + 1, days, planWeeks: planWeeks(days), accessWeeks: run.accessWeeks, endDate: prettyFull(run.windowEnd) }))}</small></p>`}
      <a class="btn btn-primary btn-block" href="${L.settings?.setupDone ? "#l-today" : "#l-setup"}">${L.settings?.setupDone ? "Go to today" : "Finish setting up"}</a>
    </div>`, { title: "You're in", nav: false });
}

/* ---------------- setup (name, voice, CHD consent; days a week was chosen before checkout) ---------------- */
function renderSetup() {
  const s = L.settings || {};
  const levelId = L.activeLevel;
  const CHD_TEXT = copy("chdText");
  return shell(`
    <form class="card ladder-card" id="setup-form">
      <h2>Your week</h2>
      <p>${s.daysPerWeek} days a week: ${(s.trainDays || []).map((d) => DAY_NAMES[d]).join(", ")}. <a class="text-link" href="#l-days?change=1">Change</a></p>
      <label class="field"><span>First name (optional)</span><input type="text" name="name" value="${esc(s.name || "")}" maxlength="40"></label>
      <label class="check-row"><input type="checkbox" name="voice" ${s.voice === false ? "" : "checked"}> Voice cues during sessions</label>
      <fieldset class="field ladder-chd"><legend>Optional energy check-ins</legend>
        <p><small>${esc(CHD_TEXT).replace("Consumer Health Data Privacy Policy", '<a class="text-link" href="../../privacy/consumer-health-data/" target="_blank" rel="noopener">Consumer Health Data Privacy Policy</a>')}</small></p>
        <label class="check-row"><input type="checkbox" name="chd" ${s.chdConsent ? "checked" : ""}> ${esc(copy("chdBox"))}</label>
      </fieldset>
      ${levelId === "10k" ? tenKSafety() : ""}
      <button type="submit" class="btn btn-primary btn-block">Save</button>
    </form>`, { title: "Set up", nav: !!s.setupDone });
}

function bindSetup() {
  const form = $("#setup-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let next = { ...L, settings: { ...L.settings, name: form.name.value.trim(), voice: form.voice.checked, setupDone: true } };
    next = setChdConsent(next, form.chd.checked);
    setL(next);
    location.hash = "l-today";
  });
}
/* ---------------- today ---------------- */
/* Count-up sessions (5K or 10K at your pace): the open step and its cap from config.js. */
function openStepOf(d) {
  return d?.steps.find((s) => s.type === "5k-open" || s.type === "10k-open") || null;
}
function capFor(levelId, type) {
  return TIMER_CAPS[type]?.[levelId] ?? null;
}
/* Estimate count-up sessions with a typical time instead of the cap: 5K about 30 min, 10K about 65 min. */
function minutesOf(d) {
  const o = openStepOf(d);
  if (!o) return Math.round(d.totalSeconds / 60);
  const rest = d.steps.filter((s) => s !== o).reduce((a, s) => a + s.durationSeconds, 0);
  return Math.round(rest / 60) + (o.type === "10k-open" ? 65 : 30);
}

/* Titles already carry the ⚡ for key sessions. */
function slotLabel(d) {
  return `Week ${d.week} · Session ${d.slot}: ${esc(d.title)}`;
}

function progressLine(run) {
  const total = totalSessions(L);
  const n = Math.min(total, run.pointer + 1);
  return `Week ${weekOf(L, n)} · Session ${n} of ${total} · ${run.coreDone || 0} of ${CORE_SESSIONS} core sessions done`;
}

function renderToday() {
  const levelId = L.activeLevel;
  const level = lvl(levelId);
  const ws = windowStatus(L, levelId);
  if (ws.status === "finished") { location.hash = "l-finish"; return ""; }
  if (ws.status === "expired") { location.hash = "l-expired"; return ""; }
  const run = ws.run;
  const st = computeStreak(L);
  const ts = todayStatus(L, levelId, LEVELS);
  const next = level.slots[run.pointer];
  const v = { level: DN(levelId), n: run.pointer + 1, minutes: next ? minutesOf(next) : 30 };
  const banners = [];
  const warn = windowWarning(L, levelId);
  if (warn) banners.push(`<p class="banner ladder-banner">${esc(fill(reminderText(`warn_${warn}`, uiLang()), v))}</p>`);
  if (cantFinish(L, levelId)) banners.push(`<p class="banner ladder-banner">${esc(reminderText("cant_finish", uiLang()))}</p>`);
  const rep = repairOffer(L);
  if (rep) banners.push(`<div class="card ladder-card"><h2>Keep your streak</h2><p>You missed ${pretty(rep.brokenOn)}. Do a short Repair session within 48 hours to bring back your ${rep.prevStreak}-day streak.</p><button type="button" class="btn btn-secondary btn-block" id="do-repair">Start Repair session (15 min easy)</button></div>`);
  if (inactiveDays(L) >= CONFIG.reminder_stop_after_inactive_days) banners.push(`<p class="banner ladder-banner">${esc(reminderText("paused", uiLang()))}</p>`);

  let card = "";
  if (ts.state === "ready") {
    const d = ts.slotDef;
    card = `
      <div class="card today-card ladder-today">
        <p class="today-date">${pretty(todayISO())}${ts.planned ? "" : " · extra day"}</p>
        <h2 class="today-title">${slotLabel(d)}</h2>
        <p class="today-summary">${esc(d.summary)}</p>
        <p class="today-meta">${openStepOf(d) ? `Count-up timer, up to ${mmss(capFor(levelId, openStepOf(d).type))}` : `About ${minutesOf(d)} min`}${d.core ? "" : " · easy extra (counts toward your streak, not the 36 core sessions)"}</p>
        ${d.kind === "10K" ? tenKSafety() : ""}
        <button type="button" class="btn btn-primary btn-block btn-start" id="start-slot">Start session ${d.slot}</button>
        <button type="button" class="btn btn-secondary btn-block" id="manual-slot">Log it (done without the app)</button>
      </div>`;
  } else if (ts.state === "rest") {
    const msg = ts.reason === "rest-after-2"
      ? `Rest day. You've run 2 days in a row, so today is for rest. Session ${run.pointer + 1} unlocks tomorrow.`
      : `Key sessions are never on back-to-back days. Session ${run.pointer + 1} unlocks tomorrow. An easy repeat from your plan is fine today.`;
    card = `<div class="card today-card"><h2 class="today-title">Planned rest</h2><p>${msg}</p><a class="btn btn-secondary btn-block" href="#l-plan">Repeat a past session</a></div>`;
  } else if (ts.state === "done-today") {
    card = `<div class="card today-card"><h2 class="today-title">Done for today</h2><p>Nice work. Session ${run.pointer + 1} unlocks tomorrow. A repeat keeps your streak going but doesn't count as a program session.</p><a class="btn btn-secondary btn-block" href="#l-plan">Repeat a session</a></div>`;
  }

  const sched = projectSchedule(L, levelId, LEVELS);
  const finishDate = sched.length ? sched[sched.length - 1].date : todayISO();
  const fit = finishDate <= run.windowEnd
    ? `At ${dpw(L)} days a week you'll finish around ${pretty(finishDate)}, inside your access window.`
    : `At ${dpw(L)} days a week the plan runs past ${prettyFull(run.windowEnd)}. Add an extra day some weeks to catch up.`;
  const rem = pickReminder(L, levelId, { minutes: v.minutes });
  const remEs = rem ? pickReminder(L, levelId, { minutes: v.minutes, lang: "es" }) : null;
  const total = totalSessions(L);
  return shell(`
    <p class="today-greet">${L.settings?.name ? `Hi, ${esc(L.settings.name)}` : "Your next session"}</p>
    <div class="ladder-stats">
      <div class="stat"><span class="stat-num">${run.coreDone || 0}/${CORE_SESSIONS}</span><span class="stat-label">Core sessions</span></div>
      <div class="stat"><span class="stat-num">🔥 ${st.current}</span><span class="stat-label">Streak</span></div>
      <div class="stat"><span class="stat-num">${st.savesBanked}</span><span class="stat-label">Streak saves</span></div>
      <div class="stat"><span class="stat-num">${ws.daysLeft}</span><span class="stat-label">Days of access left</span></div>
    </div>
    <div class="progress-bar" aria-label="${progressLine(run)}"><div class="progress-fill" style="width:${(run.pointer / total) * 100}%"></div></div>
    <p class="ladder-sub">${progressLine(run)}</p>
    ${banners.join("")}
    ${card}
    <p class="ladder-fit"><small>${esc(fit)}</small></p>
    ${previewAllowed() && rem ? `<div class="card ladder-reminder"><p class="ladder-tag">Reminder preview</p><p>${esc(rem.text)}</p>${remEs ? `<p lang="es"><small><strong>Español:</strong> ${esc(remEs.text)}</small></p>` : ""}<p class="muted"><small>Max one message a day. Push and email need sign-in and Salim's approval; this preview shows the in-app copy only.${rem.offer ? " Offers go by email only with the marketing opt-in." : ""}</small></p></div>` : ""}
  `, { title: "Today", eyebrow: DN(levelId) });
}

function bindToday() {
  $("#start-slot")?.addEventListener("click", () => {
    session = { levelId: L.activeLevel, slot: currentRun(L, L.activeLevel).pointer + 1, mode: "new" };
    location.hash = "l-session";
  });
  $("#manual-slot")?.addEventListener("click", () => {
    session = { levelId: L.activeLevel, slot: currentRun(L, L.activeLevel).pointer + 1, mode: "manual", openResult: null };
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
    // Placeholder Repair session until Coach Fit writes one: about half a session, low intensity.
    return [{ type: "walk", label: "Easy walk or very easy jog (RPE 2 to 3)", durationSeconds: E2E ? 2 : 900, phase: "main" }];
  }
  const def = lvl(sess.levelId).slots[sess.slot - 1];
  const steps = def.steps.map((s) => (s.type === "5k-open" || s.type === "10k-open" ? { ...s, durationSeconds: capFor(sess.levelId, s.type) ?? s.durationSeconds } : s));
  if (!E2E) return steps;
  return steps.map((s) => ({ ...s, durationSeconds: s.type === "5k-open" || s.type === "10k-open" ? 4 : 1, capSeconds: s.durationSeconds }));
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
      const prev = steps[idx - 1];
      if (t.openResult?.capped && t.openResult.stepIndex === idx - 1 && (prev.type === "5k-open" || prev.type === "10k-open")) {
        const n = $("#timer-capnote");
        n.hidden = false;
        n.textContent = capText(prev.capSeconds ?? prev.durationSeconds);
      }
      if (step.type === "5k-open") speak("Your 5K, go at your pace.");
      if (step.type === "10k-open") speak("Your 10K, go at your pace.");
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

/* Attorney §11.5 auto-stop lines (45, 60 and 90 minutes). */
function capText(capSeconds) {
  const m = Math.round(capSeconds / 60);
  return copy(m >= 90 ? "cap90" : m >= 60 ? "cap60" : "cap45");
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
      const def = session.slot ? lvl(session.levelId).slots[session.slot - 1] : null;
      if (openStepOf(def) && t.openResult) {
        session.openResult = t.openResult;
        location.hash = "l-done";
        return true;
      }
      const done = mainDone(t, steps);
      if (!openStepOf(def) && mainTotal && done >= 0.8 * mainTotal) {
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
const CHECKIN_KEY = { day1: "first", final: "final" };

function renderDone() {
  if (!session) { location.hash = "l-today"; return ""; }
  if (session.mode === "repair") {
    return shell(`<div class="card card-celebrate"><h2>Streak repaired</h2><p>Nice comeback. Your streak is back.</p><button class="btn btn-primary btn-block" id="done-save">Save</button></div>`, { title: "Repair done", nav: false });
  }
  const level = lvl(session.levelId);
  const def = level.slots[session.slot - 1];
  const isRepeat = session.mode === "repeat";
  const r = session.openResult;
  let fiveK = "";
  const o = openStepOf(def);
  if (o) {
    const dist = o.type === "10k-open" ? "10K" : "5K";
    const cap = capFor(session.levelId, o.type) ?? o.durationSeconds;
    // Never call a capped run a finished 5K or 10K (Attorney §11.5).
    const shown = r ? (r.capped ? "" : mmss(r.seconds)) : "";
    fiveK = `
      <div class="ladder-5k">
        <p class="ladder-5k-label">${r?.capped ? esc(copy("timeOnFeet")) : `Your ${dist} time`}</p>
        <p class="ladder-5k-time">${r?.capped ? `${mmss(cap)}` : shown || "Not recorded"}</p>
        ${r?.capped ? `<p>${esc(capText(cap))}</p>` : ""}
        <button type="button" class="text-link ladder-linkbtn" id="edit-time">Edit time</button>
        <label class="field" id="edit-wrap" ${shown && session.mode !== "manual" ? "hidden" : ""}><span>${dist} time (mm:ss)</span><input type="text" id="fivek-input" inputmode="numeric" placeholder="${dist === "10K" ? "68:30" : "32:10"}" value="${r && !r.capped ? mmss(r.seconds) : ""}"></label>
      </div>`;
  }
  const which = CHECKIN_KEY[def.checkin];
  const wantsCheckin = which && !isRepeat;
  const chd = !!L.settings?.chdConsent;
  const opts = (n) => Array.from({ length: n }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
  const checkin = wantsCheckin ? `
    <fieldset class="field ladder-checkin"><legend>${which === "first" ? "First-session" : "Last-session"} check-in (optional, personal markers only)</legend>
      <label class="field"><span>How hard did today's session feel? (1 to 10)</span><select id="ci-effort"><option value="">Skip</option>${opts(10)}</select></label>
      ${chd ? `<label class="field"><span>Energy before (1 to 5)</span><select id="ci-eb"><option value="">Skip</option>${opts(5)}</select></label>
      <label class="field"><span>Energy after (1 to 5)</span><select id="ci-ea"><option value="">Skip</option>${opts(5)}</select></label>` : ""}
      ${level.level === 1 ? `<label class="field"><span>Longest you jogged without walking today? (mm:ss)</span><input type="text" id="ci-longest" placeholder="12:00"></label>` : ""}
    </fieldset>` : "";
  const run = currentRun(L, session.levelId);
  const last = !isRepeat && def.core && (run?.coreDone || 0) === CORE_SESSIONS - 1;
  return shell(`
    <div class="card ${last && !isRepeat ? "card-celebrate" : ""} ladder-card">
      <h2>${session.partial ? "Most of it counts" : isRepeat ? "Repeat done" : "Session done"}</h2>
      <p>${slotLabel(def)}</p>
      ${session.partial ? `<p>You did at least 80% of the main set, so this session counts as done.</p>` : ""}
      ${session.mode === "manual" ? `<p>Logging a session you did without the app.</p>` : ""}
      ${isRepeat ? `<p>Repeats keep your streak going. They don't count as program sessions.</p>` : ""}
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
    const def = lvl(session.levelId).slots[session.slot - 1];
    let fiveK = null;
    if (openStepOf(def)) {
      const typed = $("#fivek-input")?.value?.trim();
      if (typed) {
        const secs = parseMmss(typed);
        if (secs == null) { $("#done-error").textContent = "Enter the time as mm:ss, for example 32:10."; return; }
        fiveK = { seconds: secs, capped: false, edited: !session.openResult || secs !== session.openResult.seconds };
      } else if (session.openResult) fiveK = { ...session.openResult, edited: false };
    }
    if (fiveK) fiveK.distance = openStepOf(def).type === "10k-open" ? "10K" : "5K";
    const entry = { seconds: session.seconds || def.totalSeconds, fiveK, partial: !!session.partial, key: !!def.key, running: isRunning(def) };
    if (session.mode === "repeat") {
      setL(logRepeat(L, session.levelId, session.slot, entry));
      session = null;
      location.hash = "l-today";
      return;
    }
    const res = completeSlot(L, session.levelId, { ...entry, kind: session.mode === "manual" ? "manual" : "slot" });
    if (!res.ok) {
      $("#done-error").textContent = res.reason === "one-per-day" ? "You already logged a new session today. The next one unlocks tomorrow." : "This access window isn't open.";
      return;
    }
    let next = res.state;
    const which = CHECKIN_KEY[def.checkin];
    if (which) {
      next = saveCheckin(next, session.levelId, which, {
        effort: $("#ci-effort")?.value || null,
        ...(L.settings?.chdConsent ? { energyBefore: $("#ci-eb")?.value || null, energyAfter: $("#ci-ea")?.value || null } : {}),
        longestJog: $("#ci-longest")?.value || null,
        fiveK,
      });
    }
    setL(next);
    session = null;
    location.hash = res.finished ? "l-finish" : "l-today";
  });
}

/* ---------------- plan ---------------- */
function renderPlan() {
  const levelId = L.activeLevel;
  const level = lvl(levelId);
  const run = currentRun(L, levelId);
  const sched = new Map(projectSchedule(L, levelId, LEVELS).map((x) => [x.slot, x.date]));
  const open = windowStatus(L, levelId).status === "active";
  let lastWeek = 0;
  const items = level.slots.map((d) => {
    const done = d.slot <= run.pointer;
    const date = sched.get(d.slot);
    const head = d.week !== lastWeek ? `<li class="ladder-week-head">Week ${d.week}</li>` : "";
    lastWeek = d.week;
    return `${head}<li class="plan-item ladder-plan-item ${done ? "is-done" : ""}">
      <span class="plan-check" aria-hidden="true">${done ? "✓" : d.slot}</span>
      <div><strong>${esc(d.title)}</strong>${d.core ? "" : ' <span class="muted"><small>(easy extra)</small></span>'}<br><small>${esc(d.summary)}</small>${!done && date ? `<br><small class="muted">Planned ${pretty(date)}</small>` : ""}</div>
      ${done && open ? `<button type="button" class="btn btn-small btn-secondary ladder-repeat" data-slot="${d.slot}">Repeat</button>` : ""}
    </li>`;
  }).join("");
  return shell(`
    <p class="ladder-sub">${dpw(L)} days a week · ${totalSessions(L)} sessions over ${planWeeks(dpw(L))} weeks (${CORE_SESSIONS} core sessions${totalSessions(L) > CORE_SESSIONS ? ` plus ${totalSessions(L) - CORE_SESSIONS} easy extras` : ""})</p>
    <p class="ladder-sub"><small>${esc(level.cues)}</small></p>
    <ul class="ladder-plan">${items}</ul>
    <p><small>Repeats keep your streak alive but don't count as program sessions or move you to the next session.</small></p>
  `, { title: "Plan", eyebrow: DN(levelId) });
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
      <p class="muted"><small>Streak milestones: ${CONFIG.milestones.join(", ")} days in a row. Earn 1 streak save for every 7 days in a row (bank up to 3).</small></p></div>
    <div class="card ladder-card"><h2>Your access</h2>
      ${purchases.map((p) => `<p><strong>${esc(DN(p.levelId))}</strong> (${p.kind}${p.kind === "gift" ? "" : `, $${p.price}`}${p.mode === "preview" ? ", preview" : ""})<br><small>${p.daysPerWeekAtPurchase} days a week. ${esc(accessThrough(p.windowEnd))}</small></p>`).join("")}
      ${ws.status === "active" ? `<p><small>${progressLine(ws.run)} · ${ws.daysLeft} days of access left.</small></p>` : ""}
      ${ws.status === "finished" ? `<a class="btn btn-secondary btn-block" href="#l-finish">See your recap</a>` : ""}
      ${ws.status === "expired" ? `<a class="btn btn-secondary btn-block" href="#l-expired">Pick up where you left off</a>` : ""}
    </div>
  `, { title: "Progress", eyebrow: DN(levelId) });
}
/* ---------------- finish screens (after core session 36), Coach Fit v6 §10 ---------------- */
/* Attorney memo §12.5: only claim "You ran a 5K" or "10K. Done." when an uncapped time was logged. */
function askHtml(lines) {
  const bold = (x) => esc(x).replace(/^([^:]+:)/, "<strong>$1</strong>");
  return lines.map(bold).join("<br>");
}
function finishCopy(levelId, rc, tm, lang = "en") {
  const c = (k) => copy(`finish_${k}`, {}, lang);
  const timed = !!tm(rc.final?.fiveK);
  if (levelId === "walk-to-5k") {
    return { head: c(timed ? "walkHeadTimed" : "walkHead"), body: c("walkBody"), ask: askHtml(c("walkAsk")), next: ["5k-faster", "10k"] };
  }
  if (levelId === "5k-faster") {
    const fin = tm(rc.final?.fiveK);
    const base = tm(rc.first?.fiveK);
    return {
      head: fin && base ? copy("finish_fasterHeadTimed", { fin, base }, lang) : c("fasterHead"),
      body: "",
      ask: askHtml([c("fasterAsk")]).replace(/^<strong>([^<]*)<\/strong>/, "$1").replace(/^([^?]+\?)/, "<strong>$1</strong>"),
      next: ["10k"],
    };
  }
  return {
    head: c(timed ? "tenHeadTimed" : "tenHead"),
    body: "",
    ask: esc(c("tenAsk")).replace(/^([^?¿]*¿?[^?]+\?)/, "<strong>$1</strong>"),
    next: ["5k-faster"],
    notify: true,
  };
}

/* The app UI language. The app renders English today; Spanish copy is stored and shown in previews. */
function uiLang() {
  return L.settings?.lang === "es" ? "es" : "en";
}

function renderFinish(lang = uiLang()) {
  const levelId = L.activeLevel;
  const rc = recap(L, levelId, lvl(levelId));
  const tm = (x) => (x && !x.capped ? mmss(x.seconds) : null);
  const { head, body, ask, next, notify } = finishCopy(levelId, rc, tm, lang);
  const other = lang === "es" ? "en" : "es";
  const alt = previewAllowed() ? finishCopy(levelId, rc, tm, other) : null;
  const markers = levelId === "walk-to-5k"
    ? `<tr><td>Longest nonstop jog</td><td>${esc(rc.first?.longestJog || "not entered")}</td><td>${esc(rc.final?.longestJog || "not entered")}</td></tr>`
    : `<tr><td>${levelId === "10k" ? "10K check-in time" : "5K time"}</td><td>${tm(rc.first?.fiveK) || "not entered"}</td><td>${tm(rc.final?.fiveK) || "not entered"}</td></tr>`;
  const effort = `<tr><td>How hard it felt (1 to 10)</td><td>${esc(rc.first?.effort || "not entered")}</td><td>${esc(rc.final?.effort || "not entered")}</td></tr>`;
  const energy = L.settings?.chdConsent && (rc.first?.energyAfter || rc.final?.energyAfter)
    ? `<tr><td>Energy after (1 to 5)</td><td>${esc(rc.first?.energyAfter || "")}</td><td>${esc(rc.final?.energyAfter || "")}</td></tr>` : "";
  const nextBuys = next.map((id) => buyBlock({ id: `fin-next-${id}`, label: `Start ${DN(id)}, $${CHECKOUT.prices[id].amount}`, kind: "new", levelId: id, price: CHECKOUT.prices[id].amount })).join("");
  const repeat = buyBlock({ id: "fin-repeat", label: `Repeat ${DN(levelId)}, $${CHECKOUT.prices.repeat.amount}`, kind: "repeat", levelId, price: CHECKOUT.prices.repeat.amount });
  const restNext = next.length === 1 ? DN(next[0]) : "Your next level";
  return shell(`
    <div class="card card-celebrate ladder-finisher">
      <p class="ladder-badge ladder-badge--big">${esc(DN(levelId))} Finisher</p>
      <h2>${esc(head)}</h2>
      ${body ? `<p>${esc(body)}</p>` : ""}
    </div>
    ${alt ? `<div class="card ladder-reminder" lang="${other}"><p class="ladder-tag">Preview: ${other === "es" ? "Español" : "English"}</p><p><strong>${esc(alt.head)}</strong></p>${alt.body ? `<p>${esc(alt.body)}</p>` : ""}<p><small>${alt.ask}</small></p></div>` : ""}
    <div class="card ladder-card"><h2>Your recap</h2>
      <dl class="ladder-dl">
        <dt>Core sessions</dt><dd>${rc.coreDone}/${CORE_SESSIONS}</dd>
        <dt>All sessions</dt><dd>${rc.sessions}/${rc.total}</dd>
        <dt>Calendar days</dt><dd>${rc.calendarDays}</dd>
        <dt>Longest streak</dt><dd>${rc.longestStreak} days</dd>
        <dt>Total minutes</dt><dd>${rc.totalMinutes}</dd>
        <dt>Streak saves used</dt><dd>${rc.savesUsed}</dd>
        ${rc.favorite ? `<dt>Most repeated</dt><dd>${esc(rc.favorite)}</dd>` : ""}
      </dl>
      <table class="effort-table"><thead><tr><th></th><th>First session</th><th>Last session</th></tr></thead><tbody>${markers}${effort}${energy}</tbody></table>
    </div>
    <div class="card ladder-card">
      <p>${ask}</p>
      ${levelId === "10k" ? repeat + nextBuys : nextBuys + repeat}
      ${notify ? `<button type="button" class="btn btn-secondary btn-block" id="fin-notify">${L.flags?.notifyHalf ? "You're on the list: 5K to Half Marathon" : "Notify me: 5K to Half Marathon"}</button>` : ""}
      <button type="button" class="btn btn-secondary btn-block" id="fin-rest">Take a rest week first</button>
      <a class="btn btn-small btn-block" href="#l-progress">Not now</a>
    </div>
    ${L.restWeek ? `<p class="banner ladder-banner">Take the week. Walk, stretch, enjoy the energy. ${esc(restNext)} is ready when you are.</p>` : ""}
  `, { title: "Level complete", eyebrow: DN(levelId) });
}

function bindFinish() {
  const levelId = L.activeLevel;
  document.querySelectorAll('[id^="fin-next-"]').forEach((b) => b.addEventListener("click", () => (location.hash = daysHref(b.id.slice(9), "new").slice(1))));
  $("#fin-repeat")?.addEventListener("click", () => (location.hash = daysHref(levelId, "repeat").slice(1)));
  $("#fin-notify")?.addEventListener("click", () => {
    setL({ ...L, flags: { ...L.flags, notifyHalf: true } }); // preview: stored on this device only
    render("l-finish");
  });
  $("#fin-rest")?.addEventListener("click", () => {
    setL({ ...L, restWeek: { startedAt: todayISO() } });
    render("l-finish");
  });
}

/* ---------------- expired / restart ---------------- */
function renderExpired() {
  const levelId = L.activeLevel;
  const ws = windowStatus(L, levelId);
  if (ws.status !== "expired") { location.hash = "l-today"; return ""; }
  const n = ws.run.coreDone || 0;
  const from = params().get("from") || "resume";
  const v = { level: DN(levelId), n, accessWeeks: accessWeeks(dpw(L)) };
  let offer;
  if (ws.restartOpen) {
    offer = `
      <p>${esc(fill(reminderText("restart_day0", uiLang()), v))}</p>
      ${ws.offerDay >= CONFIG.restart_reminder_day ? `<p class="banner ladder-banner">${esc(fill(reminderText("restart_day25", uiLang()), v))}</p>` : ""}
      <p class="muted"><small>Restart offer open through ${prettyFull(addDays(ws.run.windowEnd, CONFIG.restart_offer_days))}.</small></p>
      <fieldset class="field"><legend>Where do you want to start?</legend>
        <label class="check-row"><input type="radio" name="from" value="resume" ${from === "resume" ? "checked" : ""}> Continue from core session ${n + 1}</label>
        <label class="check-row"><input type="radio" name="from" value="start" ${from === "start" ? "checked" : ""}> Start from session 1</label>
      </fieldset>
      ${buyBlock({ id: "ex-restart", label: `Restart ${DN(levelId)}, $${CHECKOUT.prices.restart.amount}`, kind: "restart", levelId, price: CHECKOUT.prices.restart.amount, resumeAt: from === "resume" ? n + 1 : 1 })}`;
  } else {
    offer = `
      <p>Welcome back. Your ${esc(DN(levelId))} window closed at session ${n}. Your history, badges and streak record stay visible.</p>
      ${buyBlock({ id: "ex-full", label: `Buy ${DN(levelId)} again, $${CHECKOUT.prices[levelId].amount}`, kind: "new", levelId, price: CHECKOUT.prices[levelId].amount })}`;
  }
  return shell(`<div class="card ladder-card"><h2>Pick up where you left off</h2>${offer}<a class="btn btn-small btn-block" href="#l-progress">Not now</a></div>`, { title: "Window closed", eyebrow: DN(levelId) });
}

function bindExpired() {
  const levelId = L.activeLevel;
  document.querySelectorAll('input[name="from"]').forEach((r) => r.addEventListener("change", () => (location.hash = `l-expired?from=${r.value}`)));
  $("#ex-restart")?.addEventListener("click", () => {
    const from = document.querySelector('input[name="from"]:checked')?.value || "resume";
    location.hash = daysHref(levelId, "restart", from).slice(1);
  });
  $("#ex-full")?.addEventListener("click", () => (location.hash = daysHref(levelId, "new").slice(1)));
}

/* ---------------- gifting: buyer side (Attorney §11.2 gift text, §7.6 rules; spec v6 §8) ---------------- */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function renderGift() {
  const levelId = params().get("level") || "walk-to-5k";
  const price = CHECKOUT.prices[levelId].amount;
  return shell(`
    <form class="card ladder-card" id="gift-form">
      <h2>Give a running plan as a gift</h2>
      ${previewAllowed() && isPreviewCheckout() ? `<p class="ladder-preview-note"><strong>Preview checkout.</strong> No payment is taken and no card is asked for. In the live version this opens a fresh Stripe Checkout page (one-time payment).</p>` : ""}
      <fieldset class="field"><legend>Pick the level</legend>
        ${LEVEL_IDS.map((id) => `<label class="check-row"><input type="radio" name="level" value="${id}" ${id === levelId ? "checked" : ""}> ${esc(DN(id))}, $${CHECKOUT.prices[id].amount}${id === "walk-to-5k" ? " (a safe choice if you're not sure)" : ""}</label>`).join("")}
        <p class="muted"><small>Not sure? Have them take the placement check. They can switch to a lower level when they redeem, at no cost. There's no partial refund. They choose 2, 3, 4 or 5 days a week when they redeem.</small></p>
      </fieldset>
      <label class="field"><span>Your first name</span><input type="text" name="buyer" maxlength="40"></label>
      <label class="field"><span>Recipient's first name</span><input type="text" name="rname" maxlength="40"></label>
      <label class="field"><span>Recipient's email <span class="muted" id="remail-opt"></span></span><input type="text" name="remail" inputmode="email" maxlength="120" aria-describedby="remail-help"></label>
      <p class="muted" id="remail-help"><small>We'll use this only to deliver the gift and send redemption reminders.</small></p>
      <label class="check-row"><input type="checkbox" name="share"> I'll share the link myself</label>
      <label class="field"><span>Short message (optional, up to 300 characters)</span><textarea name="msg" maxlength="300" rows="3"></textarea></label>
      <label class="field"><span>Deliver on (leave empty to send now)</span><input type="date" name="when" min="${todayISO()}"></label>
      <label class="check-row"><input type="checkbox" name="adult" id="gift-adult"> The recipient is 18 or older.</label>
      <p class="ladder-error" id="gift-error" role="alert"></p>
      ${buyBlock({ id: "gift-buy", label: `Buy gift: ${DN(levelId)}, $${price}`, kind: "gift", levelId, price, disabled: true })}
      <a class="btn btn-secondary btn-block" href="#l-start">Back</a>
    </form>`, { title: "Gift", nav: false });
}

function bindGift() {
  const form = $("#gift-form");
  form.querySelectorAll('input[name="level"]').forEach((r) => r.addEventListener("change", () => (location.hash = `l-gift?level=${r.value}`)));
  form.share.addEventListener("change", () => ($("#remail-opt").textContent = form.share.checked ? "(optional)" : ""));
  $("#gift-adult").addEventListener("change", (e) => { const b = $("#gift-buy"); if (b) b.disabled = !e.target.checked; });
  $("#gift-buy")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (!isPreviewCheckout() || !previewAllowed()) return;
    const levelId = form.level.value;
    const share = form.share.checked;
    const email = form.remail.value.trim();
    if (!form.buyer.value.trim() || !form.rname.value.trim()) { $("#gift-error").textContent = "Add your first name and the recipient's first name."; return; }
    if (!share && !EMAIL_RE.test(email)) { $("#gift-error").textContent = "Add the recipient's email, or choose to share the link yourself."; return; }
    if (!form.adult.checked) { $("#gift-error").textContent = "Confirm the recipient is 18 or older."; return; }
    if (email && !EMAIL_RE.test(email)) { $("#gift-error").textContent = "Check the recipient's email."; return; }
    const g = createGift({ levelId, price: CHECKOUT.prices[levelId].amount, buyerName: form.buyer.value.trim(), recipientName: form.rname.value.trim(), recipientEmail: email, shareMyself: share, message: form.msg.value, deliverOn: form.when.value });
    location.hash = `l-gift-status?code=${g.code}&new=1`;
  });
}

function renderGiftStatus() {
  const g = getGift(params().get("code"));
  if (!g) return shell(`<div class="card ladder-card"><p>Gift not found.</p></div>`, { nav: false });
  const isNew = params().get("new") === "1";
  const reminders = giftReminderDates(g);
  const link = `${location.origin}${location.pathname}#l-redeem?code=${g.code}`;
  return shell(`
    <div class="card ladder-card">
      <h2>${isNew ? "Gift receipt" : "Gift status"}${g.mode === "preview" ? " (preview, no charge)" : ""}</h2>
      <dl class="ladder-dl">
        <dt>Gift</dt><dd>${esc(DN(g.levelId))}</dd>
        <dt>Amount</dt><dd>$${g.price} one-time</dd>
        <dt>Purchased</dt><dd>${prettyFull(g.purchasedAt)}</dd>
        <dt>Gift code</dt><dd class="ladder-code">${esc(g.code)}</dd>
        <dt>Redeem by</dt><dd>${prettyFull(g.redeemBy)}</dd>
        <dt>Delivery</dt><dd>${g.shareMyself ? "You share the link" : `${prettyFull(g.deliverOn)} to ${esc(g.recipientEmail)}`}</dd>
        <dt>Status</dt><dd>${giftStatus(g)}</dd>
      </dl>
      <p><small>Redeem link: <a class="text-link" href="#l-redeem?code=${esc(g.code)}">${esc(link)}</a></small></p>
      <p class="buy-refund"><small>${esc(disclosureFor({ kind: "gift", price: g.price, levelName: DN(g.levelId) }))}</small></p>
      ${canRefund(g) ? "" : `<p class="muted"><small>This gift is no longer refundable.</small></p>`}
      ${g.shareMyself ? `<div class="card ladder-giftcard"><p class="ladder-tag">Share this card</p><p><strong>${esc(g.buyerName)} gave you ${esc(DN(g.levelId))}</strong></p>${g.message ? `<p>"${esc(g.message)}"</p>` : ""}<p>Code: <strong>${esc(g.code)}</strong><br>Redeem by ${prettyFull(g.redeemBy)}</p></div>` : ""}
      ${!g.redeemedAt && !g.shareMyself ? `<label class="field"><span>Fix the recipient's email</span><input type="text" id="gs-email" value="${esc(g.recipientEmail)}"></label><button type="button" class="btn btn-secondary btn-block" id="gs-save">Save and resend</button>` : ""}
      ${reminders.length && !g.redeemedAt ? `<p class="muted"><small>Reminder emails to the recipient before redemption: ${reminders.map(prettyFull).join(", ")}. Then none.</small></p>${reminderPreview(g, link)}` : ""}
      <p class="muted"><small>You'll see Scheduled, Sent or Redeemed here, never the recipient's progress.</small></p>
      <a class="btn btn-secondary btn-block" href="#l-start">Done</a>
    </div>`, { title: "Gift", nav: false });
}

/* Preview of the gift reminder email (sending needs the server and Salim's approval). */
function reminderPreview(g, link) {
  const one = (lang) => {
    const m = giftReminderEmail(g, { lang, levelName: DN(g.levelId), link });
    return `<p><small><strong>${lang === "es" ? "Asunto" : "Subject"}:</strong> ${esc(m.subject)}</small></p><pre class="ladder-email">${esc(m.text)}</pre>`;
  };
  return `<details class="ladder-email-preview"><summary>Reminder email preview (not sent)</summary>${one("en")}<p class="ladder-tag">Español</p>${one("es")}</details>`;
}

function bindGiftStatus() {
  $("#gs-save")?.addEventListener("click", () => {
    const code = params().get("code");
    const email = $("#gs-email").value.trim();
    if (!EMAIL_RE.test(email)) return;
    updateGift(code, { recipientEmail: email, deliverOn: todayISO() });
    render(`l-gift-status?code=${code}`);
  });
}

/* ---------------- gifting: recipient side ---------------- */
function renderRedeem() {
  const p = params();
  const code = (p.get("code") || "").toUpperCase();
  const g = code ? getGift(code) : null;
  if (!g) {
    return shell(`<form class="card ladder-card" id="code-form"><h2>Redeem a gift</h2><label class="field"><span>Gift code</span><input type="text" name="code" value="${esc(code)}" placeholder="5K-XXXX-XXXX"></label>${code ? `<p class="ladder-error">That code wasn't found.</p>` : ""}<button class="btn btn-primary btn-block" type="submit">Continue</button></form>`, { title: "Gift", nav: false });
  }
  if (!redeemable(g)) {
    const why = g.redeemedAt ? "This gift has already been redeemed." : g.refunded ? "This gift code is no longer active." : todayISO() > g.redeemBy ? "This gift code's redeem-by date has passed." : `This gift becomes available on ${prettyFull(g.deliverOn)}.`;
    return shell(`<div class="card ladder-card"><h2>Redeem a gift</h2><p>${why}</p></div>`, { title: "Gift", nav: false });
  }
  const gIdx = LEVEL_IDS.indexOf(g.levelId);
  const suggest = p.get("suggest");
  const pick = p.get("pick") || (suggest && LEVEL_IDS.indexOf(suggest) < gIdx ? suggest : g.levelId);
  const hs = p.get("hs") === "1" && pick === "walk-to-5k";
  const cur = Number(p.get("days") || 3);
  const tdays = p.get("td") ? p.get("td").split(",").map(Number) : DEFAULT_TRAIN_DAYS[cur];
  return shell(`
    <div class="card ladder-card">
      <h2>${esc(g.buyerName)} gave you ${esc(DN(g.levelId))}</h2>
      ${g.message ? `<p class="ladder-gift-msg">"${esc(g.message)}"</p>` : ""}
      <p class="muted"><small>Redeem by ${prettyFull(g.redeemBy)}. Your access starts when you redeem and lasts the length of your plan plus 2 extra weeks.</small></p>
      <label class="check-row"><input type="checkbox" id="rd-adult"> I am 18 or older.</label>
      <p><a class="text-link" href="#l-start?gift=${esc(g.code)}">Take the placement check</a> (optional, recommended).</p>
      ${suggest ? `<p class="ladder-result">${esc(suggest === "walk-to-5k" && hs ? copy("headStart") : RESULT_LINE(DN(suggest)))}</p>` : ""}
      <fieldset class="field"><legend>Level to start</legend>
        ${LEVEL_IDS.slice(0, gIdx + 1).map((id) => `<label class="check-row"><input type="radio" name="pick" value="${id}" ${id === pick ? "checked" : ""}> ${esc(DN(id))}${id === g.levelId ? " (your gift)" : " (switch to a lower level)"}</label>`).join("")}
      </fieldset>
      ${hs ? `<label class="check-row"><input type="checkbox" id="rd-hs" checked> Start at week 6 (uncheck to start at week 1)</label>` : ""}
      ${pick === "10k" ? tenKSafety() : ""}
      <form id="days-form">
        <h3>${esc(copy("daysTitle"))}</h3>
        <fieldset class="field">${daysOptionsHtml(cur)}</fieldset>
        <p class="muted"><small>${esc(copy("daysHelper"))}</small></p>
        ${whichDaysHtml(tdays, cur)}
      </form>
      <p class="ladder-access"><strong>${esc(accessLineFor(cur))}</strong></p>
      ${cur === 2 ? `<p class="ladder-warn"><small>${esc(copy("twoDayGift", { endDate: prettyFull(accessEnd(todayISO(), 2)) }))}</small></p>` : ""}
      <p class="ladder-error" id="rd-error" role="alert"></p>
      <p class="ladder-preview-note"><small>In the live app you sign in or create your own account here, so your access window and progress belong to you. In this preview they stay on this device.</small></p>
      <label class="check-row"><input type="checkbox" id="rd-ack"> <span>${ACK_SENTENCE}</span></label>
      <button type="button" class="btn btn-primary btn-block" id="rd-go" disabled>Redeem</button>
    </div>`, { title: "Your gift", nav: false });
}

function bindRedeem() {
  $("#code-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    location.hash = `l-redeem?code=${encodeURIComponent(e.target.code.value.trim().toUpperCase())}`;
  });
  const gate = () => ($("#rd-go").disabled = !($("#rd-adult").checked && $("#rd-ack").checked));
  $("#rd-adult")?.addEventListener("change", gate);
  $("#rd-ack")?.addEventListener("change", gate);
  const form = $("#days-form");
  if (form) {
    const p = params();
    bindDaysForm(form, (n) => {
      const q = new URLSearchParams(p);
      q.set("days", n);
      q.delete("td");
      location.hash = `l-redeem?${q.toString()}`;
    });
    document.querySelectorAll('input[name="pick"]').forEach((r) => r.addEventListener("change", () => {
      const q = new URLSearchParams(p);
      q.set("pick", r.value);
      location.hash = `l-redeem?${q.toString()}`;
    }));
  }
  $("#rd-go")?.addEventListener("click", () => {
    const g = getGift(params().get("code"));
    if (!g || !redeemable(g)) return;
    const { n, days, ok } = readDays(form);
    if (!ok) { $("#rd-error").textContent = `Pick exactly ${n} days.`; return; }
    const levelId = document.querySelector('input[name="pick"]:checked')?.value || g.levelId;
    const startCoreIndex = levelId === "walk-to-5k" && $("#rd-hs")?.checked ? CONFIG.head_start_core_index : 1;
    markRedeemed(g.code, levelId);
    setL(grantPurchase(L, { levelId, kind: "gift", price: g.price, daysPerWeek: n, trainDays: days, startCoreIndex, mode: g.mode, giftCode: g.code }));
    location.hash = `l-redeemed?level=${levelId}`;
  });
}

function renderRedeemed() {
  const levelId = params().get("level") || L.activeLevel;
  const run = currentRun(L, levelId);
  return shell(`
    <div class="card card-celebrate ladder-card">
      <h2>${esc(DN(levelId))}</h2>
      <p><strong>Your access starts today and ends on ${prettyFull(run.windowEnd)}.</strong></p>
      <p>${esc(copy("accessLine", { endDate: prettyFull(run.windowEnd), accessWeeks: run.accessWeeks, planWeeks: planWeeks(run.daysPerWeekAtPurchase) }))}</p>
      <a class="btn btn-primary btn-block" href="#l-setup">Finish setting up</a>
    </div>`, { title: "Gift redeemed", nav: false });
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
        <button type="button" class="btn btn-small btn-secondary" data-tool="left28">28 days left</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="left14">14 days left</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="left5">5 days left</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="left0">Day after expiry</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="leftm24">Restart offer day 25</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="fillhalf">Fill to halfway</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="filllast">Fill to the last session</button>
        <button type="button" class="btn btn-small btn-secondary" data-tool="today">Back to real date</button>
      </div>
    </div>` : "";
  const s = L.settings;
  return shell(`
    <div class="card ladder-card">
      <h2>Settings</h2>
      <p>${s ? `${s.daysPerWeek} days a week: ${s.trainDays.map((d) => DAY_NAMES[d]).join(", ")}` : ""}</p>
      <p><small>Energy check-ins: ${s?.chdConsent ? "on" : "off"}</small></p>
      <a class="btn btn-secondary btn-block" href="#l-days?change=1">Change days a week</a>
      <a class="btn btn-secondary btn-block" href="#l-setup">Name, voice and energy check-ins</a>
      <a class="btn btn-secondary btn-block" href="#l-start">Find your starting level again</a>
      <a class="btn btn-secondary btn-block" href="#l-gift">Give a running plan as a gift</a>
      <button type="button" class="btn btn-small btn-block" id="ladder-reset">Clear running plan data on this device</button>
    </div>
    ${tools}`, { title: "Settings" });
}

function bindSettings() {
  $("#ladder-reset")?.addEventListener("click", () => {
    if (!confirm("Clear your running plan progress on this device?")) return;
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
      setPreviewOffset(0);
      const realToday = todayISO();
      setPreviewOffset(off);
      if (tool === "day+1") off += 1;
      else if (tool === "day+7") off += 7;
      else if (tool === "today") off = 0;
      else if (tool.startsWith("left") && run) {
        const left = tool === "leftm24" ? -24 : Number(tool.slice(4));
        off = daysBetween(realToday, run.windowEnd) - left + 1; // daysLeft counts today
      } else if (tool.startsWith("fill") && run) {
        const level = lvl(L.activeLevel);
        const target = tool === "fillhalf" ? Math.floor(level.slots.length / 2) : level.slots.length - 1;
        let s = L;
        for (let i = 0; currentRun(s, L.activeLevel).pointer < target && i < 100; i++) {
          const r = currentRun(s, L.activeLevel);
          const def = level.slots[r.pointer];
          const date = addDays(todayISO(), -(target - r.pointer) * 2);
          s = addLog(s, { date, levelId: L.activeLevel, runId: r.runId, slot: r.pointer + 1, kind: "slot", seconds: def.totalSeconds, key: !!def.key, core: !!def.core, running: isRunning(def), preview: true });
          const ls = s.levels[L.activeLevel];
          s = { ...s, levels: { ...s.levels, [L.activeLevel]: { ...ls, runs: ls.runs.map((x) => (x.runId === r.runId ? { ...x, pointer: x.pointer + 1, ...(def.core ? { doneCore: [...(x.doneCore || []), def.coreIndex], coreDone: (x.doneCore || []).length + 1 } : {}) } : x)) } } };
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
  "l-days": [renderDays, bindDays],
  "l-checkout": [renderCheckout, bindCheckout],
  "l-receipt": [renderReceipt, null],
  "l-setup": [renderSetup, bindSetup],
  "l-today": [renderToday, bindToday],
  "l-session": [renderSession, bindSession],
  "l-done": [renderDone, bindDone],
  "l-plan": [renderPlan, bindPlan],
  "l-progress": [renderProgress, null],
  "l-finish": [renderFinish, bindFinish],
  "l-expired": [renderExpired, bindExpired],
  "l-settings": [renderSettings, bindSettings],
  "l-gift": [renderGift, bindGift],
  "l-gift-status": [renderGiftStatus, bindGiftStatus],
  "l-redeem": [renderRedeem, bindRedeem],
  "l-redeemed": [renderRedeemed, null],
};
const NEEDS_RUN = new Set(["l-setup", "l-today", "l-session", "l-done", "l-plan", "l-progress", "l-finish", "l-expired", "l-settings", "l-redeemed", "l-receipt"]);

export async function render(hashName) {
  await loadLevels();
  const root = $("#app");
  document.body.classList.add("ladder-theme");
  const view = hashName.split("?")[0];
  if (view !== "l-session" && view !== "l-check12") activeTimer?.stop();
  if (NEEDS_RUN.has(view) && !(L.activeLevel && currentRun(L, L.activeLevel))) { location.hash = "l-start"; return; }
  if (["l-today", "l-plan", "l-progress", "l-settings"].includes(view) && !L.settings?.setupDone) { location.hash = "l-setup"; return; }
  if (view === "l-days" && params().get("change") === "1" && !(L.activeLevel && currentRun(L, L.activeLevel))) { location.hash = "l-start"; return; }
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
