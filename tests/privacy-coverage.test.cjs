// achallengetomove.com preview/privacy-coverage: GA gate (GPC, DNT, opt-in), no product param, CHD page, notify form, layout, links.
// node site-ga-gate.test.js <siteDir>     serves on :8795; GA requests are answered with a stub (nothing reaches Google).
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require("/workspace/pptr-tools/node_modules/puppeteer-core");
const ROOT = path.resolve(process.argv[2]); const PORT = +(process.env.PORT || 8795), BASE = `http://localhost:${PORT}`;
const OUT = "/workspace/privacy-coverage/screens";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, BASE).pathname); let f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || f.includes("/.git")) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) { if (!p.endsWith("/")) { res.writeHead(301, { Location: p + "/" }); return res.end(); } f = path.join(f, "index.html"); }
  if (!fs.existsSync(f)) { res.writeHead(404, { "Content-Type": "text/html" }); return res.end(fs.readFileSync(path.join(ROOT, "404.html"))); }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); res.end(fs.readFileSync(f));
});
const results = []; const check = (n, ok, d) => { results.push({ n, ok: !!ok }); console.log((ok ? "PASS " : "FAIL ") + n + (d ? "  :: " + d : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GA = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com/;
let browser;
async function open(url, { gpc = false, dnt = null, consent = undefined, width = 390 } = {}) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  await page.setViewport({ width, height: width < 500 ? 844 : 900, deviceScaleFactor: 1, isMobile: width < 500, hasTouch: width < 500 });
  const log = { ga: [], forms: [], bad: [], errors: [] };
  page.on("pageerror", (e) => log.errors.push(String(e)));
  page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) log.bad.push(r.status() + " " + r.url()); });
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = r.url();
    if (u.startsWith(BASE) || u.startsWith("data:")) return r.continue();
    if (GA.test(u)) { log.ga.push(u); return r.respond({ status: 200, contentType: "text/javascript", body: "/* GA stub for tests */" }); }
    if (/formsubmit\.co/.test(u) && r.method() === "OPTIONS") return r.respond({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } });
    if (/formsubmit\.co/.test(u)) { log.forms.push(r.postData() || ""); return r.respond({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: '{"success":"true"}' }); }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return r.continue();
    return r.abort();
  });
  await page.evaluateOnNewDocument((gpc, dnt, consent) => {
    if (gpc) Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true, configurable: true });
    if (dnt !== null) Object.defineProperty(Navigator.prototype, "doNotTrack", { get: () => dnt, configurable: true });
    if (consent !== undefined && !sessionStorage.getItem("__s")) { localStorage.setItem("actm.analytics.consent", consent); sessionStorage.setItem("__s", "1"); }
  }, gpc, dnt, consent === undefined ? undefined : consent);
  await page.goto(BASE + url, { waitUntil: "networkidle0" }); await sleep(300);
  return { ctx, page, log };
}
const state = (page) => page.evaluate(() => ({ banner: !!document.getElementById("actm-consent"), bannerText: (document.getElementById("actm-consent") || {}).innerText || "", gtag: typeof window.gtag, dl: (window.dataLayer || []).map((a) => JSON.stringify(Array.from(a))), sw: document.documentElement.scrollWidth, vw: innerWidth, settings: !!document.querySelector('[data-consent="settings"]') }));
(async () => {
  await new Promise((r) => server.listen(PORT, r));
  browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
  // 1. Default visitor: banner, no GA before opt-in
  let t = await open("/"); let s = await state(t.page);
  check("default: banner shown, GA not loaded before opt-in", s.banner && t.log.ga.length === 0 && s.gtag === "undefined", `ga=${t.log.ga.length}`);
  check("banner text is Attorney's EN wording", /Analytics cookies\?/.test(s.bannerText) && /Analytics stays off unless you choose Accept/.test(s.bannerText) && /Accept analytics/i.test(s.bannerText) && /No thanks/i.test(s.bannerText), s.bannerText.slice(0, 120));
  check("footer has Cookie settings + CHD link", s.settings && await t.page.$('footer a[href="/privacy/consumer-health-data/"]') !== null);
  const eq = await t.page.evaluate(() => { const b = [...document.querySelectorAll("#actm-consent button")].map((x) => { const c = getComputedStyle(x); return [c.backgroundColor, c.color, c.fontSize, c.fontWeight, Math.round(x.getBoundingClientRect().height)].join("|"); }); return b; });
  check("Accept and No thanks have equal visual weight", eq.length === 2 && eq[0] === eq[1], eq.join(" vs "));
  await t.page.screenshot({ path: `${OUT}/A-site-home-banner-390.png` });
  // 2. Accept: GA loads with signals off
  await t.page.click('[data-consent="accept"]'); await sleep(800); s = await state(t.page);
  const cfg = s.dl.find((x) => x.startsWith('["config"'));
  check("accept: gtag.js loads", t.log.ga.some((u) => /gtag\/js\?id=G-CZNZSJ2290/.test(u)) && !s.banner);
  check("config sets allow_google_signals:false and allow_ad_personalization_signals:false", cfg && /"allow_google_signals":false/.test(cfg) && /"allow_ad_personalization_signals":false/.test(cfg), cfg);
  // B. buy click: no product param
  await t.page.evaluate(() => { const a = document.querySelector('a[href^="https://buy.stripe.com"]'); a.addEventListener("click", (e) => e.preventDefault()); a.click(); });
  await sleep(200); s = await state(t.page);
  const buy = s.dl.filter((x) => /buy_app_click/.test(x));
  check("buy_app_click sent with no product / link_url / product page", buy.length === 1 && !/product|link_url|buy\.stripe|22-day|doing-a-5k|whole-food/.test(buy[0]), buy[0]);
  await t.ctx.close();
  t = await open("/", { consent: "granted" }); s = await state(t.page);
  check("returning visitor who accepted: GA loads, no banner", t.log.ga.length > 0 && !s.banner); await t.ctx.close();
  t = await open("/", { consent: "denied" }); s = await state(t.page);
  check("visitor who declined: no GA, no banner", t.log.ga.length === 0 && !s.banner && s.gtag === "undefined"); await t.ctx.close();
  // Decline flow
  t = await open("/store/"); await t.page.click('[data-consent="decline"]'); await sleep(500); s = await state(t.page);
  check("No thanks: GA not loaded, banner closed", t.log.ga.length === 0 && !s.banner);
  await t.page.click('[data-consent="settings"]'); await sleep(200); s = await state(t.page);
  check("Cookie settings reopens the banner", s.banner); await t.ctx.close();
  // 3. GPC / DNT
  for (const [label, o] of [["GPC on", { gpc: true }], ["DNT '1'", { dnt: "1" }], ["DNT 'yes'", { dnt: "yes" }], ["GPC on + stored consent granted", { gpc: true, consent: "granted" }], ["DNT '1' + stored consent granted", { dnt: "1", consent: "granted" }]]) {
    t = await open("/", o); s = await state(t.page);
    check(`${label}: GA never loads, no banner`, t.log.ga.length === 0 && s.gtag === "undefined" && !s.banner, `ga=${t.log.ga.length}`);
    if (label === "GPC on") { await t.page.click('[data-consent="settings"]'); await sleep(200); s = await state(t.page); check("GPC on: Cookie settings explains signal is honored", /Global Privacy Control or Do Not Track signal/.test(s.bannerText)); await t.page.screenshot({ path: `${OUT}/A-site-gpc-settings-390.png` }); }
    await t.ctx.close();
  }
  // Holiday: no GA at all even with consent
  t = await open("/holiday-challenge/", { consent: "granted" }); s = await state(t.page);
  check("holiday page: no GA even with consent, no banner", t.log.ga.length === 0 && s.gtag === "undefined" && !s.banner); await t.ctx.close();
  // E. Notify form
  t = await open("/", { consent: "denied" });
  const hint = await t.page.evaluate(() => { const h = document.getElementById("notify-hint"); const c = getComputedStyle(h); return { text: h.innerText, visible: h.offsetHeight > 10 && c.position !== "absolute" && c.clip === "auto", optin: document.getElementById("notify-marketing").checked }; });
  check("notify: purpose text visible (not visually-hidden)", hint.visible, hint.text);
  check("notify: withdraw line, reviewed sender line, no brackets, no home address", /withdraw your consent/.test(hint.text) && hint.text.includes("Coach Salim Heyaime LLC (coachsalimheyaime@gmail.com) will send occasional launch emails.") && !/\[|TBD|mailing address/i.test(hint.text) && !/Herriman|\d{3}[-. ]\d{3}[-. ]\d{4}/.test(hint.text), hint.text);
  check("notify: marketing box not pre-ticked", hint.optin === false);
  await t.page.evaluate(() => document.getElementById("notify").scrollIntoView());
  await sleep(200); await t.page.screenshot({ path: `${OUT}/E-site-notify-390.png` });
  await t.page.type("#notify-email", "test@example.com"); await t.page.click('#notify-form button[type="submit"]'); await sleep(800);
  const body = t.log.forms[0] || "";
  check("notify payload carries consent text, version, language, marketing state, time", /consent_text/.test(body) && /notify-2026-10-18\.3/.test(body) && /"consent_language":"en"/.test(body) && /"marketing_optin":"no"/.test(body) && /consent_at/.test(body), body.slice(0, 200));
  await t.ctx.close();
  // Layout and screenshots
  for (const url of ["/", "/privacy/", "/privacy/consumer-health-data/", "/store/", "/holiday-challenge/", "/22-day-7-minute-workout/"]) {
    for (const w of [390, 1280]) {
      t = await open(url, { consent: "denied", width: w }); s = await state(t.page);
      check(`${url} @${w}: no sideways scroll, no 404s, no errors`, s.sw <= w && t.log.bad.length === 0 && t.log.errors.length === 0, `sw=${s.sw} bad=${t.log.bad.join(",")} err=${t.log.errors.join("|")}`);
      if (/privacy/.test(url)) await t.page.screenshot({ path: `${OUT}/CD-site${url.replace(/\//g, "_")}${w}.png`, fullPage: w === 390 ? false : false });
      await t.ctx.close();
    }
  }
  // Banner at 1280
  t = await open("/", { width: 1280 }); await t.page.screenshot({ path: `${OUT}/A-site-home-banner-1280.png` }); s = await state(t.page); check("banner @1280 no sideways scroll", s.sw <= 1280); await t.ctx.close();
  // Links not 404
  t = await open("/", { consent: "denied" });
  const links = new Set();
  for (const url of ["/", "/privacy/", "/privacy/consumer-health-data/", "/store/"]) {
    await t.page.goto(BASE + url, { waitUntil: "networkidle0" });
    (await t.page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href))).forEach((h) => { if (h.startsWith("http://localhost:" + PORT + "")) links.add(h.split("#")[0]); });
  }
  const dead = [];
  for (const l of links) { const r = await t.page.goto(l, { waitUntil: "domcontentloaded" }); if (!r || r.status() >= 400) dead.push(l); }
  check(`internal links resolve (${links.size} checked)`, dead.length === 0, dead.join(", "));
  await t.ctx.close();
  // Copy rules on new pages
  const priv = fs.readFileSync(path.join(ROOT, "privacy/index.html"), "utf8") + fs.readFileSync(path.join(ROOT, "privacy/consumer-health-data/index.html"), "utf8") + fs.readFileSync(path.join(ROOT, "js/ga.js"), "utf8");
  check("no em/en dashes, no workforcewellness, no santosh, no Herriman", !/[\u2014\u2013]|workforcewellness|santosh|Herriman/i.test(priv));
  check("privacy page has effective date, DNT, changes, rights, Quebec, officer, US-storage", ["Effective date", "Do Not Track", "Changes to this notice", "Your privacy rights", "Quebec.", "Person in charge of privacy", "Where your information is stored", "only if you agree, your energy and mood ratings"].every((k) => priv.includes(k)) && !/used only to give you access to the app/.test(priv));
  // Attorney answers + diff review (B-1, B-2, B-3, m-1 to m-5, m-11) and the ES versions
  for (const url of ["/", "/privacy/", "/privacy/consumer-health-data/", "/privacy/?lang=es", "/privacy/consumer-health-data/?lang=es"]) {
    t = await open(url, { consent: "denied" });
    const txt = await t.page.evaluate(() => document.body.innerText);
    check(`${url}: no visible brackets or placeholders`, !/\[[A-Z]|TBD|PLACEHOLDER|EFFECTIVE DATE/.test(txt));
    await t.ctx.close();
  }
  for (const [url, en, es] of [["/privacy/", "Effective date: October 18, 2026.", "Fecha de entrada en vigor: 18 de octubre de 2026."], ["/privacy/consumer-health-data/", "Effective date: October 18, 2026.", "Fecha de entrada en vigor: 18 de octubre de 2026."]]) {
    t = await open(url, { consent: "denied" });
    let v = await t.page.evaluate(() => ({ txt: document.body.innerText, lang: document.documentElement.lang, toggle: !document.querySelector(".lang-toggle").hidden }));
    check(`${url} EN: effective date shown, conflict line, toggle visible, no ES text`, v.txt.includes(en) && v.txt.includes("If the English and Spanish versions conflict, the English version controls.") && v.toggle && v.lang === "en" && !v.txt.includes(es));
    await t.page.click('.lang-btn[data-lang="es"]'); await sleep(200);
    v = await t.page.evaluate(() => ({ txt: document.body.innerText, lang: document.documentElement.lang, url: location.search, title: document.title }));
    check(`${url} toggle to ES: ES date, ES conflict line, EN hidden, lang=es, URL ?lang=es`, v.txt.includes(es) && v.txt.includes("Si las versiones en inglés y español no coinciden, prevalece la versión en inglés.") && !v.txt.includes(en) && v.lang === "es" && v.url === "?lang=es", v.title);
    await t.page.screenshot({ path: `${OUT}/ES-site${url.replace(/\//g, "_")}390.png` });
    await t.ctx.close();
  }
  t = await open("/privacy/?lang=es"); s = await state(t.page);
  const bt = await t.page.evaluate(() => (document.getElementById("actm-consent") || {}).innerText || "");
  check("?lang=es: analytics banner in Spanish", s.banner && /Cookies de anal/.test(bt), bt.slice(0, 60));
  await t.page.screenshot({ path: `${OUT}/ES-site-privacy-banner-390.png` }); await t.ctx.close();
  t = await open("/privacy/", { consent: "denied", width: 390 }); await t.page.setJavaScriptEnabled(false); await t.page.goto(BASE + "/privacy/", { waitUntil: "load" });
  const nojs = await t.page.evaluate(() => document.body.innerText);
  check("no JavaScript: English shows, Spanish and the date token stay hidden correctly", nojs.includes("Effective date: October 18, 2026.") && !nojs.includes("Fecha de entrada en vigor"));
  await t.ctx.close();
  const P1 = fs.readFileSync(path.join(ROOT, "privacy/index.html"), "utf8"), P2 = fs.readFileSync(path.join(ROOT, "privacy/consumer-health-data/index.html"), "utf8"), H = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  check("B-3: 'contracts ... or by their terms of service' (EN+ES, both pages), old wording gone", [P1, P2].every((x) => x.includes("protected by our contracts with these providers or by their terms of service") && x.includes("por sus condiciones de servicio")) && !/protected by our agreements/.test(P1 + P2));
  check("m-1: provider lists", P1.includes("(Supabase, Resend, Stripe, Google, FormSubmit and GitHub)") && P2.includes("(Stripe, Google, FormSubmit and GitHub)") && !P2.includes("Supabase, Resend"));
  check("m-2 / m-3: no app GA mention on site; 'challenge apps on this site' sentence", !/signed-out welcome screen/.test(P1 + P2) && P1.includes("The challenge apps on this site (such as the 5K and whole-food plan apps) never load Google Analytics."));
  check("m-4: no checkout-checkbox claim", !/At checkout, we send marketing/.test(P2) && P2.includes("Buying from us does not add you to our marketing list; we send marketing email only if you sign up with a separate, unticked checkbox"));
  check("m-5: retention line", P1.includes("How long we keep it.</strong> Notify-me sign-ups: until you unsubscribe or ask us to delete them. Messages you send us: up to 3 years. Purchase records: as long as tax law requires (generally up to 7 years). Analytics data: Google Analytics keeps it for 2 months."));
  check("answer (1): ask-everyone sentence EN+ES", P1.includes("We ask every visitor before loading Google Analytics, wherever you are, and we don't load it at all if your browser sends a Global Privacy Control or Do Not Track signal. You can change your choice any time with Cookie settings.") && P1.includes("Pedimos permiso a cada visitante antes de cargar Google Analytics"));
  check("B-2: officer line is 'Contact: email.'", />coachsalimheyaime@gmail.com<\/a>\.<\/p>/.test(P1) && !/MAILING ADDRESS|TODO\(address\)/.test(P1 + P2 + H));
  check("m-11: no internal notes in page source", !/<!--[^>]*(Attorney|home address|gaps-and-fixes|preview\/|NEVER Salim)/.test(P1 + P2 + H));
  const PAGES_SRC = ["privacy/index.html", "privacy/consumer-health-data/index.html", "index.html", "store/index.html", "holiday-challenge/index.html"].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  check("m-11: no HTML comments, TODO or DRAFT notes in the source of privacy, CHD, home, store and holiday pages", !/<!--|TODO|\bDRAFT\b|\[(MAILING|EFFECTIVE|POSTAL|CONFIRM|PENDING|DATE)/.test(PAGES_SRC));
  check("no street address published; no app GA parenthetical", !/Herriman|\bP\.?O\.? Box\b|app\.coachsalimheyaime\.com\)? only if you choose/i.test(P1 + P2 + H) && !/signed-out welcome screen of app\.coachsalimheyaime\.com/.test(P1 + P2));
  check("effective-date tokens present and filled", [P1, P2].every((x) => (x.match(/data-effective-date="2026-10-18"/g) || []).length === 2));
  check("ES copy: no em/en dashes", !/[\u2014\u2013]/.test(P1 + P2));
  await browser.close(); server.close();
  const failed = results.filter((r) => !r.ok).length; console.log(failed ? `${failed} FAILED of ${results.length}` : `ALL ${results.length} PASSED`); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
