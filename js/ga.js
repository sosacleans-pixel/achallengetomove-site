/* achallengetomove.com: Google Analytics 4 tag + event tracking (the ONLY GA file for this site).
 * Measurement ID: G-CZNZSJ2290 (set in GA_ID below). If GA_ID is ever reset to a
 * G-XXXX... placeholder, gtag.js is not loaded and nothing is sent.
 *
 * Consent gate (Attorney, privacy-coverage/gaps-and-fixes.md M-3):
 *   - GA never loads when the browser sends Global Privacy Control (navigator.globalPrivacyControl === true)
 *     or Do Not Track ('1' or 'yes'). The banner is not shown then; the choice is treated as "No".
 *   - Otherwise GA loads ONLY after the visitor chooses "Accept analytics" (opt-in for everyone:
 *     region cannot be detected reliably in the browser, so WA/NV/CT/Quebec rules are applied to all).
 *     The choice is kept in localStorage 'actm.analytics.consent' = 'granted' | 'denied'.
 *   - "Cookie settings" in every footer reopens the banner.
 *   - config: allow_google_signals:false, allow_ad_personalization_signals:false.
 *   - No GA at all on the holiday challenge or its checkout path, or on any page with <html data-ga="off">.
 */
(function () {
  'use strict';
  var GA_ID = 'G-CZNZSJ2290'; // <-- GA4 Measurement ID goes here
  var KEY = 'actm.analytics.consent';

  var NO_GA_PATHS = [
    /^\/holiday-challenge(\/|$)/i,
    /^\/(store|buy|checkout|thank-?you|thanks|success|gift)\/(holiday|30-days-before-x-?mas|xmas)/i,
    /^\/(holiday|30-days-before-x-?mas|xmas)[^/]*(\/|$)/i
  ];
  var HOLIDAY = /holiday|x-?mas|30-days-before/i;
  var html = document.documentElement;
  var noGaPage = (html && html.getAttribute('data-ga') === 'off') || NO_GA_PATHS.some(function (re) { return re.test(location.pathname); });

  function privacySignal() {
    try {
      if (navigator.globalPrivacyControl === true) return true;
      var d = String(navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack || '').toLowerCase();
      return d === '1' || d === 'yes';
    } catch (e) { return false; }
  }
  function getConsent() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setConsent(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  var optOut = privacySignal();
  window.actmAnalytics = { optOut: optOut, consent: getConsent };

  var loaded = false;
  function loadGA() {
    if (loaded || noGaPage || optOut || getConsent() !== 'granted' || /^G-XXXX/i.test(GA_ID)) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
  }
  function disableGA() {
    window['ga-disable-' + GA_ID] = true; // stops a loaded gtag from sending anything else on this page
    try {
      document.cookie.split(';').forEach(function (c) {
        var n = c.split('=')[0].trim();
        if (/^_ga/.test(n)) {
          var host = location.hostname.replace(/^www\./, '');
          ['', '; domain=.' + host, '; domain=' + host].forEach(function (d) { document.cookie = n + '=; Max-Age=0; path=/' + d; });
        }
      });
    } catch (e) {}
  }

  if (noGaPage) { window.gaEvent = function () {}; return; }
  loadGA();

  /* ---- Consent banner (Attorney's EN/ES wording, M-3). Equal-weight buttons, nothing pre-selected. ---- */
  var TEXT = {
    en: { title: 'Analytics cookies?', body: 'With your OK, we use Google Analytics to count visits and see which pages and buttons are used. This can show which fitness programs you looked at, which some state laws treat as health data. Google processes it for us as a service provider; we never send your name, email or anything you enter in an app. Analytics stays off unless you choose Accept, and you can change your choice any time in Cookie settings.',
      accept: 'Accept analytics', decline: 'No thanks', privacy: 'Privacy', chd: 'Consumer Health Data Privacy Policy', settings: 'Cookie settings',
      signal: 'Your browser sends a Global Privacy Control or Do Not Track signal, so Google Analytics stays off on this site.', close: 'Close' },
    es: { title: '\u00bfCookies de anal\u00edtica?', body: 'Con tu permiso, usamos Google Analytics para contar visitas y ver qu\u00e9 p\u00e1ginas y botones se usan. Esto puede mostrar qu\u00e9 programas de ejercicio miraste, algo que algunas leyes estatales consideran datos de salud. Google los procesa para nosotros como proveedor de servicios; nunca enviamos tu nombre, tu correo ni nada de lo que escribes en una app. La anal\u00edtica est\u00e1 desactivada a menos que elijas Aceptar, y puedes cambiar tu elecci\u00f3n cuando quieras en Configuraci\u00f3n de cookies.',
      accept: 'Aceptar anal\u00edtica', decline: 'No, gracias', privacy: 'Privacidad', chd: 'Pol\u00edtica de privacidad de datos de salud del consumidor', settings: 'Configuraci\u00f3n de cookies',
      signal: 'Tu navegador env\u00eda una se\u00f1al de Global Privacy Control o de Do Not Track, as\u00ed que Google Analytics se mantiene desactivado en este sitio.', close: 'Cerrar' }
  };
  function lang() { return /^es/i.test(html.getAttribute('lang') || '') ? 'es' : 'en'; }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) { if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  /* Keep page content reachable above the banner: pad the page bottom while it is open. */
  function pad() { var b = document.getElementById('actm-consent'); document.body.style.paddingBottom = b ? (b.offsetHeight + 24) + 'px' : ''; }
  function closeBanner() { var b = document.getElementById('actm-consent'); if (b) b.remove(); pad(); }
  function showBanner(focus) {
    closeBanner();
    var t = TEXT[lang()];
    var box;
    if (optOut) {
      var c = el('button', { type: 'button', class: 'btn btn-secondary btn-small', 'data-consent': 'close', text: t.close });
      c.addEventListener('click', closeBanner);
      box = el('div', { id: 'actm-consent', class: 'consent-banner', role: 'region', 'aria-label': t.settings }, [
        el('p', { class: 'consent-body', text: t.signal }), el('div', { class: 'consent-actions' }, [c])
      ]);
    } else {
      var yes = el('button', { type: 'button', class: 'btn btn-consent', 'data-consent': 'accept', text: t.accept });
      var no = el('button', { type: 'button', class: 'btn btn-consent', 'data-consent': 'decline', text: t.decline });
      yes.addEventListener('click', function () { setConsent('granted'); closeBanner(); loadGA(); });
      no.addEventListener('click', function () { var was = getConsent() === 'granted'; setConsent('denied'); closeBanner(); if (was || loaded) disableGA(); });
      box = el('div', { id: 'actm-consent', class: 'consent-banner', role: 'region', 'aria-labelledby': 'actm-consent-title' }, [
        el('p', { class: 'consent-title', id: 'actm-consent-title', text: t.title }),
        el('p', { class: 'consent-body', text: t.body }),
        el('div', { class: 'consent-actions' }, [yes, no]),
        el('p', { class: 'consent-links' }, [el('a', { href: '/privacy/', text: t.privacy }), ' \u00b7 ', el('a', { href: '/privacy/consumer-health-data/', text: t.chd })])
      ]);
    }
    document.body.appendChild(box);
    pad();
    if (focus) { var f = box.querySelector('button'); if (f) f.focus(); }
  }
  function addSettingsLinks() {
    var t = TEXT[lang()];
    document.querySelectorAll('.footer-nav').forEach(function (nav) {
      if (nav.querySelector('[data-consent="settings"]')) return;
      var a = el('a', { href: '#cookie-settings', 'data-consent': 'settings', role: 'button', text: t.settings });
      a.addEventListener('click', function (e) { e.preventDefault(); showBanner(true); });
      nav.appendChild(a);
    });
  }
  function initUI() {
    addSettingsLinks();
    if (!optOut && getConsent() === null) showBanner(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI); else initUI();

  /* ---- GA4 events (sent only when GA is loaded, i.e. after opt-in) ----
     amazon_click  : link to amazon.com / a.co / amzn.to -> link_url, link_text, asin, page_location
     buy_app_click : link to buy.stripe.com              -> NOTHING that names the product: no product, no link_url,
                                                           no link text, and page_location / page_referrer / page_title
                                                           are the neutral site root. Holiday links are never tracked.
     generate_lead : <form data-ga-lead="form_name"> submitted (after the site's own validation)
     No names, emails or other personal data are ever sent. Links keep working as normal:
     we never call preventDefault, and transport_type 'beacon' lets the hit survive navigation. */
  function send(name, params) {
    try { if (loaded && typeof window.gtag === 'function') window.gtag('event', name, params); } catch (e) {}
  }
  window.gaEvent = send;

  function label(a) {
    var img = a.querySelector('img[alt]');
    var t = a.getAttribute('aria-label') || (a.textContent || '').trim() || (img && img.alt) || a.title || '';
    return t.replace(/\s+/g, ' ').trim().slice(0, 100);
  }
  var AMAZON = /(^|\.)(amazon\.com|a\.co|amzn\.to)$/i;
  function neutralBuyParams() {
    var root = location.origin + '/';
    return { page_location: root, page_referrer: root, page_title: 'A Challenge to Move', transport_type: 'beacon' };
  }

  // One delegated listener (capture phase, so other handlers can't swallow it).
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (AMAZON.test(u.hostname)) {
      var m = u.pathname.match(/\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i);
      send('amazon_click', {
        link_url: u.href,
        link_text: label(a),
        asin: m ? m[1].toUpperCase() : (a.getAttribute('data-asin') || '(none)'),
        page_location: location.href,
        transport_type: 'beacon'
      });
    } else if (u.hostname === 'buy.stripe.com') {
      if (a.getAttribute('data-ga') === 'off' || HOLIDAY.test(a.getAttribute('data-product') || '') || HOLIDAY.test(label(a))) return;
      send('buy_app_click', neutralBuyParams());
    }
  }, true);

  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || !f.getAttribute || !f.getAttribute('data-ga-lead') || e.defaultPrevented) return;
    send('generate_lead', { form_name: f.getAttribute('data-ga-lead'), transport_type: 'beacon' });
  });
})();
