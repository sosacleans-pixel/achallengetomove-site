/* EN/ES toggle for the privacy pages.
   Same rule as the holiday page: ?lang=es|en in the URL, else the visitor's saved choice, else the browser
   language (Spanish browsers get ES). Without JavaScript the English version shows and the toggle stays hidden.
   Each page holds both versions: [data-lang-block="en"] and [data-lang-block="es"]. */
(function () {
  "use strict";
  var KEY = "actm-lang";
  var html = document.documentElement;
  function pick() {
    try {
      var q = new URLSearchParams(location.search).get("lang");
      if (q === "en" || q === "es") return q;
    } catch (e) {}
    try {
      var v = localStorage.getItem(KEY) || localStorage.getItem("holiday-30-lang");
      if (v === "en" || v === "es") return v;
    } catch (e) {}
    var l = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    return /^es\b/i.test(l) ? "es" : "en";
  }
  var lang = pick();
  html.lang = lang; // set early so the analytics banner (js/ga.js) uses the same language

  function apply(l, scroll) {
    lang = l;
    html.lang = l;
    var t = html.getAttribute("data-title-" + l);
    if (t) document.title = t;
    Array.prototype.forEach.call(document.querySelectorAll("[data-lang-block]"), function (b) {
      b.hidden = b.getAttribute("data-lang-block") !== l;
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-text-es]"), function (el) {
      if (!el.hasAttribute("data-text-en")) el.setAttribute("data-text-en", el.textContent);
      el.textContent = el.getAttribute("data-text-" + l);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-lang") === l ? "true" : "false");
    });
    // Keep links like /privacy/#analytics working in both versions (the ES copies use an "es-" prefix).
    if (scroll && location.hash.length > 1) {
      var id = decodeURIComponent(location.hash.slice(1)).replace(/^es-/, "");
      var el = document.getElementById(l === "es" ? "es-" + id : id);
      if (el) el.scrollIntoView();
    }
  }

  function init() {
    var box = document.querySelector(".lang-toggle");
    if (box) box.hidden = false;
    apply(lang, true);
    Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function (b) {
      b.addEventListener("click", function () {
        var l = b.getAttribute("data-lang");
        try { localStorage.setItem(KEY, l); } catch (e) {}
        try {
          var u = new URL(location.href);
          u.searchParams.set("lang", l);
          history.replaceState(null, "", u.pathname + u.search + u.hash);
        } catch (e) {}
        apply(l, false);
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
