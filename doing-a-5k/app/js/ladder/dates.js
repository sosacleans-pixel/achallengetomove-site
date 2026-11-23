/* Local-date helpers for the ladder (YYYY-MM-DD in the device's own time zone). */

let previewOffsetDays = 0;

/* Preview tools can move "today" forward to show day 60/75/85, expiry and restart screens. */
export function setPreviewOffset(days) {
  previewOffsetDays = Number(days) || 0;
}

export function now() {
  return new Date(Date.now() + previewOffsetDays * 86400000);
}

export function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return iso(now());
}

export function parse(isoStr) {
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(isoStr, n) {
  const d = parse(isoStr);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function daysBetween(aISO, bISO) {
  return Math.round((parse(bISO) - parse(aISO)) / 86400000);
}

export function weekday(isoStr) {
  return parse(isoStr).getDay();
}

export function pretty(isoStr) {
  return parse(isoStr).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function mmss(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function parseMmss(str) {
  const m = String(str || "").trim().match(/^(\d{1,3}):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/* With the year, for end dates, redeem-by dates and receipts. */
export function prettyFull(isoStr) {
  return parse(isoStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
