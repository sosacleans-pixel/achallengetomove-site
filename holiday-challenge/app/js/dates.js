import { CONFIG } from "./config.js";

const OVERRIDE_KEY = "holiday-30-debug-now";

/** Read ?date= / ?now= once on load and keep it for this tab (so hash navigation keeps it). */
export function initDateOverride() {
  if (!CONFIG.allowDateOverride) return;
  try {
    const p = new URLSearchParams(location.search);
    const v = p.get("now") || p.get("date");
    if (v === "clear" || v === "off") sessionStorage.removeItem(OVERRIDE_KEY);
    else if (v && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(v)) {
      sessionStorage.setItem(OVERRIDE_KEY, v.length === 10 ? `${v}T09:00:00` : v);
    }
  } catch (e) { /* storage blocked: ignore */ }
}

export function overrideActive() {
  if (typeof window !== "undefined" && window.__HC_MOCK_NOW) return window.__HC_MOCK_NOW;
  if (!CONFIG.allowDateOverride) return null;
  try { return sessionStorage.getItem(OVERRIDE_KEY); } catch (e) { return null; }
}

export function now() {
  const o = overrideActive();
  if (o) {
    const [dp, tp = "09:00:00"] = o.split("T");
    const [y, m, d] = dp.split("-").map(Number);
    const [hh, mm, ss = 0] = tp.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, ss);
  }
  return new Date();
}

export function dateKey(d = now()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function diffDays(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

// No shared challenge calendar (rolling start): day numbers and dates come from the user's own start date,
// see rules.js dayNum(state, key) / dateFor(state, n).

let LOCALE = "en-US";
/** Set the locale used by fmtDate (i18n.js: "en-US" or "es-419"). */
export function setLocale(l) { LOCALE = l; }

export function fmtDate(k, opts = { weekday: "short", month: "short", day: "numeric" }) {
  return parseKey(k).toLocaleDateString(LOCALE, opts);
}
