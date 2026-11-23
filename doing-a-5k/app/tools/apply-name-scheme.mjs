/* Applies NAME_SCHEME (js/ladder/config.js) to the static pages and the in-app Health and safety
 * acknowledgment, using the Attorney's §12.4 and §12.7 strings. Idempotent. Also makes sure the approved
 * 10K safety section (§11.4, EN and ES) is in js/health-ack.js under either name.
 * Run from anywhere: node doing-a-5k/app/tools/apply-name-scheme.mjs [--check] */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { NAME_SCHEME, SITE } from "../js/ladder/config.js";
import { COPY, fillCopy } from "../js/ladder/copy.js";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const CHECK = process.argv.includes("--check");
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const changed = [];

function edit(rel, fn) {
  const p = join(ROOT, rel);
  const before = readFileSync(p, "utf8");
  const after = fn(before);
  if (after !== before) {
    changed.push(rel);
    if (!CHECK) writeFileSync(p, after);
  }
}

function sub(s, re, rep, label) {
  if (!re.test(s)) throw new Error(`pattern not found: ${label}`);
  return s.replace(re, rep);
}

/* App lists: between "22-Day 7-Minute Workout, " and ", 5K to Half Marathon". */
function appLists(s, en, es) {
  s = sub(s, /(the 22-Day 7-Minute Workout, )(.*?)(, 5K to Half Marathon)/, (_, a, __, c) => a + en + c, "app list EN");
  s = sub(s, /(LLC: 22-Day 7-Minute Workout, )(.*?)(, 5K to Half Marathon)/, (_, a, __, c) => a + es + c, "app list ES");
  return s;
}

edit("purchase-terms/index.html", (s) => {
  s = appLists(s, esc(SITE.termsListEn), esc(SITE.termsListEs));
  s = sub(s, /(<h3 id="app-5k-ladder">)[^<]*(<\/h3>\s*<p>)[^<]*(<\/p>)/, (_, a, b, c) => a + esc(SITE.termsHeadingEn) + b + esc(SITE.termsLeadEn) + c, "terms heading EN");
  s = sub(s, /(<h4 id="app-5k-ladder-es">)[^<]*(<\/h4>\s*<p>)[^<]*(<\/p>)/, (_, a, b, c) => a + esc(SITE.termsHeadingEs) + b + esc(SITE.termsLeadEs) + c, "terms heading ES");
  s = sub(s, /(href="#app-5k-ladder">)[^<]*(<\/a>)/, (_, a, b) => a + esc(SITE.termsNavEn) + b, "nav EN");
  s = sub(s, /(href="#app-5k-ladder-es">)[^<]*(<\/a>)/, (_, a, b) => a + esc(SITE.termsNavEs) + b, "nav ES");
  return s;
});

edit("health-safety/index.html", (s) => appLists(s, esc(SITE.hsListEn), esc(SITE.hsListEs)));

edit("privacy/consumer-health-data/index.html", (s) => {
  s = sub(s, /including A Challenge to Move: 30 Days Before X-mas Challenge, .*? the 30-Day Whole Food Plan\./, () => SITE.chd53, "CHD 53");
  s = sub(s, /The 30 Days Before X-mas Challenge[ ,].*?use email sign-in \(.*?\):/, () => SITE.chd65, "CHD 65 (§13.1; ES chd65Es stored, page is English-only)");
  return s;
});

edit("gear/index.html", (s) => {
  s = s.replace(/Gear for [^<|"]*? \| A Challenge to Move/g, `${SITE.gearTitle} | A Challenge to Move`);
  s = sub(s, /<h1>Gear for [^<]*<\/h1>/, `<h1>${esc(SITE.gearTitle)}</h1>`, "gear h1");
  s = sub(s, /(work in )the [^<]*? plans\.(<\/p>)/, (_, a, b) => a + esc(SITE.gearLede) + b, "gear lede");
  // §13.2: back link text by scheme, href stays /doing-a-5k/. The page is English-only; gearBackEs is stored.
  s = sub(s, /(<a class="back-link" href="\/doing-a-5k\/">&larr; )[^<]*(<\/a>)/, (_, a, b) => a + esc(SITE.gearBackEn) + b, "gear back link");
  return s;
});

edit("5k-to-half-marathon/index.html", (s) => {
  const m = SITE.halfLink.match(/^(.*Start with )(.*)\.$/);
  return sub(s, /<p>Not at 5K yet\? Start with .*?<\/p>/, `<p>${esc(m[1])}<a class="text-link" href="/doing-a-5k/">${esc(m[2])}</a>.</p>`, "half link");
});

/* In-app acknowledgment: lead list, plus the 10K section (§11.4) under either name. New text hash. */
edit("js/health-ack.js", (s) => {
  const m = s.match(/var T = (\{.*?\});\n/s);
  const T = JSON.parse(m[1]);
  const ten = { en: ["10k", "The 10K level", fillCopy(COPY.en.tenKSafety).join("\n\n")], es: ["10k", "El nivel de 10K", fillCopy(COPY.es.tenKSafety).join("\n\n")] };
  let any = false;
  for (const lang of ["en", "es"]) {
    const e = T[lang];
    const before = JSON.stringify(e);
    e.lead = lang === "en"
      ? sub(e.lead, /(the 22-Day 7-Minute Workout, )(.*?)(, 5K to Half Marathon)/, (_, a, __, c) => a + SITE.hsListEn + c, "ack lead EN")
      : sub(e.lead, /(LLC: 22-Day 7-Minute Workout, )(.*?)(, 5K to Half Marathon)/, (_, a, __, c) => a + SITE.hsListEs + c, "ack lead ES");
    const i = e.sections.findIndex((x) => x[0] === "10k");
    if (i >= 0) e.sections[i] = ten[lang];
    else e.sections.splice(e.sections.findIndex((x) => x[0] === "stop") + 1, 0, ten[lang]);
    const { hash, ...rest } = e;
    e.hash = createHash("sha256").update(JSON.stringify(rest)).digest("hex");
    if (JSON.stringify(e) !== before) any = true;
  }
  if (!any) return s;
  let out = s.replace(m[1], () => JSON.stringify(T));
  out = out.replace(/var VERSION = "hs-([^"]*?)\.(\d+)";/, (_, d, n) => `var VERSION = "hs-${d}.${Number(n) + 1}";`);
  return out;
});

console.log(`NAME_SCHEME=${NAME_SCHEME}${CHECK ? " (check only)" : ""}. ${changed.length ? "Changed: " + changed.join(", ") : "No changes."}`);
if (CHECK && changed.length) process.exit(1);
