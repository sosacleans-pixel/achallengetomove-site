// Static checks for the App Terms holiday section and the pricing copy rule (Attorney rulings, Oct 18, 2026).
// Run: node tests/app-terms-holiday.mjs   (no browser needed)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, ok, info = "") => { results.push([name, !!ok]); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !info ? "" : `  -> ${info}`}`); };

const html = readFileSync(join(root, "purchase-terms", "index.html"), "utf8");
const section = (id, endRe) => { const a = html.indexOf(`id="${id}"`); if (a < 0) return ""; const rest = html.slice(a); const m = rest.slice(10).search(endRe); return m < 0 ? rest : rest.slice(0, m + 10); };
const en = section("app-holiday", /<section id="es"/);
const es = section("app-holiday-es", /<\/section>/);
const text = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

check("EN holiday section found", en.length > 0);
check("ES holiday section found", es.length > 0);
check("EN: Attorney rolling-start line", text(en).includes("Start your 30 days whenever you like. You can begin a new 30-day round as often as you want for the rest of your 12-month Access Period."));
check("ES: Attorney rolling-start line", text(es).includes("Empieza tus 30 días cuando quieras. Puedes comenzar una nueva ronda de 30 días cuantas veces quieras durante el resto de tu Periodo de acceso de 12 meses."));
check("EN: 'Sales end December 5, 2026.'", text(en).includes("Sales end December 5, 2026."));
check("ES: 'Las ventas terminan el 5 de diciembre de 2026.'", text(es).includes("Las ventas terminan el 5 de diciembre de 2026."));
const FIXED = /Nov(ember)? 25|Dec(ember)? 24|self-paced|own dates|25 de noviembre|24 de diciembre|a tu ritmo|propias fechas|en vivo/i;
const page = text(html);
check("no fixed live dates (Nov 25 to Dec 24) or self-paced edition anywhere on the App Terms page", !FIXED.test(page), (page.match(FIXED) || [])[0]);
check("no em or en dashes in the holiday sections", !/[\u2013\u2014]/.test(en + es));

// Pricing copy rule: no "% off", "was $", or strikethrough near a price, anywhere in the site's shipped files.
const PRICE_BANNED = /\d*\s*%\s*off\b|\bwas\s*\$|% de descuento|antes\s*\$/i;
const strikeNearPrice = (t) => { const out = []; const re = /<s[\s>]|<del[\s>]|<strike[\s>]|line-through/gi; let m; while ((m = re.exec(t))) { const w = t.slice(Math.max(0, m.index - 120), m.index + 120); if (/\$\s?\d|\d\s?\$|USD|price|precio/i.test(w)) out.push(w.replace(/\s+/g, " ").slice(0, 90)); } return out; };
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); if ([".git", "node_modules", "tests", "fonts", "icons", "images", "img"].includes(f)) return; statSync(p).isDirectory() ? walk(p) : /\.(html|js|css|json|webmanifest|xml|txt)$/.test(f) && files.push(p); });
walk(root);
const hits = [];
for (const f of files) { const t = readFileSync(f, "utf8"); const m = t.match(PRICE_BANNED); if (m) hits.push(`${f.slice(root.length + 1)}: ${m[0]}`); strikeNearPrice(t).forEach((s) => hits.push(`${f.slice(root.length + 1)}: ${s}`)); }
check(`pricing rule: no '% off', 'was $' or strikethrough near a price in ${files.length} site files`, hits.length === 0, hits.slice(0, 5).join(" | "));
check("pricing rule self-test", PRICE_BANNED.test("Now 30% off") && PRICE_BANNED.test("was $9.99") && strikeNearPrice("<s>$9.99</s>").length && strikeNearPrice("<del>$9.99</del>").length && strikeNearPrice('<b style="text-decoration:line-through">$9.99</b>').length && !strikeNearPrice(".x{text-decoration:line-through}").length && !PRICE_BANNED.test("$9.99 one-time payment"));

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
