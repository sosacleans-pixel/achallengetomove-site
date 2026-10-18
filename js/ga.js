/* achallengetomove.com: Google Analytics 4 tag + event tracking (the ONLY GA file for this site).
 *
 * >>> To turn GA on: replace the placeholder below with the real Measurement ID (G-...). <<<
 * While GA_ID is still the placeholder, gtag.js is NOT loaded and nothing is sent anywhere.
 */
(function () {
  'use strict';
  var GA_ID = 'G-XXXXXXXXXX'; // <-- GA4 Measurement ID goes here

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
     buy_app_click : link to buy.stripe.com              -> link_url, product
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
      send('buy_app_click', {
        link_url: u.href,
        product: a.getAttribute('data-product') || label(a),
        transport_type: 'beacon'
      });
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
