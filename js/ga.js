/* achallengetomove.com: Google Analytics 4 tag + event tracking (the ONLY GA file for this site).
 *
 * >>> To turn GA on: replace the placeholder below with the real Measurement ID (G-...). <<<
 * While GA_ID is still the placeholder, gtag.js is NOT loaded and nothing is sent anywhere.
 */
(function () {
  'use strict';

  /* ---- No GA on the holiday challenge or its checkout path (consumer health data, see /privacy/consumer-health-data/) ----
     GA (gtag.js, config and every event) is skipped entirely on:
       - /holiday-challenge/ (landing page, app and anything under it)
       - any holiday sales, store entry, buy, checkout or thank-you page (paths below), and
       - any page whose <html> has data-ga="off".
     Add new holiday checkout/thank-you pages under one of these paths, or mark them data-ga="off". */
  var NO_GA_PATHS = [
    /^\/holiday-challenge(\/|$)/i,
    /^\/(store|buy|checkout|thank-?you|thanks|success|gift)\/(holiday|30-days-before-x-?mas|xmas)/i,
    /^\/(holiday|30-days-before-x-?mas|xmas)[^/]*(\/|$)/i
  ];
  var html = document.documentElement;
  if ((html && html.getAttribute('data-ga') === 'off') || NO_GA_PATHS.some(function (re) { return re.test(location.pathname); })) {
    window.gaEvent = function () {};
    return;
  }
  // Holiday buy/checkout links on general pages (e.g. a store entry) are never tracked.
  var HOLIDAY = /holiday|x-?mas|30-days-before/i;

  var GA_ID = 'G-CZNZSJ2290'; // <-- GA4 Measurement ID goes here

  if (!/^G-XXXX/i.test(GA_ID)) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  }

  /* ---- GA4 events (same names and params on every Coach Salim site) ----
     amazon_click  : link to amazon.com / a.co / amzn.to -> link_url, link_text, asin, page_location
     buy_app_click : link to buy.stripe.com              -> NOTHING that names the product (site-wide): no link_url,
                                                           no link text, and page_location / page_title / page_referrer
                                                           are overridden with the neutral site root, so neither the
                                                           page path nor a query string can reveal which app it was.
                                                           Holiday links and links marked data-ga="off" are not tracked.
                                                           An Amazon link that buys an app (data-ga-buy="app") is sent
                                                           as amazon_click with the same neutral params; Amazon book
                                                           and gear clicks are unchanged.
     generate_lead : <form data-ga-lead="form_name"> submitted (after the site's own validation)
     No names, emails or other personal data are ever sent. Links keep working as normal:
     we never call preventDefault, and transport_type 'beacon' lets the hit survive navigation. */
  function send(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params); } catch (e) {}
  }
  window.gaEvent = send;

  function label(a) {
    var img = a.querySelector('img[alt]');
    var t = a.getAttribute('aria-label') || (a.textContent || '').trim() || (img && img.alt) || a.title || '';
    return t.replace(/\s+/g, ' ').trim().slice(0, 100);
  }
  var AMAZON = /(^|\.)(amazon\.com|a\.co|amzn\.to)$/i;
  // Params for buy-the-app clicks: GA records THAT a checkout button was clicked, never which product.
  // gtag attaches the current page URL/title/referrer to every hit by default; these overrides replace them.
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
    if (AMAZON.test(u.hostname) && a.getAttribute('data-ga-buy') === 'app') {
      if (a.getAttribute('data-ga') === 'off') return;
      send('amazon_click', neutralBuyParams());
    } else if (AMAZON.test(u.hostname)) {
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

  // generate_lead on forms marked data-ga-lead. Bubble phase on document, so it runs after the
  // form's own submit handler; skipped if that handler blocked the submit (failed validation).
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || !f.getAttribute || !f.getAttribute('data-ga-lead') || e.defaultPrevented) return;
    send('generate_lead', { form_name: f.getAttribute('data-ga-lead'), transport_type: 'beacon' });
  });
})();
