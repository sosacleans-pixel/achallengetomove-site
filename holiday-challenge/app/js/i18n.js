// Language selection. EN and ES bundles have the same keys (checked by tests/verify.mjs).
// Default = browser language when it is Spanish; the user's EN/ES choice is stored on this device only.
import { CONFIG } from "./config.js";
import { S as S_EN } from "./strings.en.js";
import { S as S_ES } from "./strings.es.js";
import { PROGRAM as P_EN } from "./program.en.js";
import { PROGRAM as P_ES } from "./program.es.js";

export const BUNDLES = {
  en: { S: S_EN, PROGRAM: P_EN, locale: "en-US" },
  es: { S: S_ES, PROGRAM: P_ES, locale: "es-419" },
};
export const PROGRAM_EN = P_EN;

export function storedLang() {
  try { const v = localStorage.getItem(CONFIG.langKey); return CONFIG.languages.includes(v) ? v : null; } catch (e) { return null; }
}
export function browserLang() {
  const l = (navigator.languages && navigator.languages[0]) || navigator.language || "";
  return /^es\b/i.test(l) ? "es" : "en";
}
export function detectLang() { return storedLang() || browserLang(); }
export function storeLang(l) {
  try { localStorage.setItem(CONFIG.langKey, l); } catch (e) { /* storage blocked */ }
}
