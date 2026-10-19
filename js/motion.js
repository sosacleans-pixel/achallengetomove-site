/* Homepage motion (design preview): scroll reveal, button tap ripple, Day 1 to 22 strip fill,
 * and the optional lazy hero video. Vanilla JS, no libraries.
 * Everything is skipped under prefers-reduced-motion: content simply shows, static.
 * Never cancels clicks, never changes link hrefs or data attributes, so buy links and the
 * GA4 click events in /js/ga.js behave exactly as before. */
(function () {
  "use strict";
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var reduced = !!(mq && mq.matches);

  /* ---- Day 1 to 22 strip: mark the days as done (static when reduced motion) ---- */
  function fillStrip(strip) {
    if (!strip || strip.classList.contains("is-filled")) return;
    strip.classList.add("is-filled");
  }

  if (reduced || !("IntersectionObserver" in window)) {
    Array.prototype.forEach.call(document.querySelectorAll(".journey"), fillStrip);
    return;
  }

  /* ---- Scroll reveal ---- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add("is-in");
      if (en.target.classList.contains("journey")) fillStrip(en.target);
      io.unobserve(en.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

  function watch(scope) {
    var els = (scope || document).querySelectorAll("[data-reveal], .program-card, .journey");
    Array.prototype.forEach.call(els, function (el, i) {
      if (el.__actmSeen) return;
      el.__actmSeen = true;
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92 && r.bottom > 0) {
        el.classList.add("is-in"); // already on screen: never hide it
        if (el.classList.contains("journey")) setTimeout(function () { fillStrip(el); }, 250);
        return;
      }
      el.classList.add("reveal");
      if (el.classList.contains("program-card")) el.style.setProperty("--reveal-delay", (i % 3) * 70 + "ms");
      io.observe(el);
    });
  }
  watch(document);
  root.classList.add("motion-ok");

  /* Program cards are re-rendered from /js/products.json; watch the new ones too. */
  var layout = document.getElementById("home-programs-layout");
  if (layout && "MutationObserver" in window) {
    new MutationObserver(function () { watch(layout); }).observe(layout, { childList: true });
  }

  /* ---- Tap ripple on buttons (visual only) ---- */
  document.addEventListener("pointerdown", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".btn, .nav-cta") : null;
    if (!btn || btn.getAttribute("aria-disabled") === "true") return;
    var r = btn.getBoundingClientRect();
    var size = Math.max(r.width, r.height) * 2;
    var ink = document.createElement("span");
    ink.className = "tap-ripple";
    ink.setAttribute("aria-hidden", "true");
    ink.style.width = ink.style.height = size + "px";
    ink.style.left = (e.clientX - r.left - size / 2) + "px";
    ink.style.top = (e.clientY - r.top - size / 2) + "px";
    btn.appendChild(ink);
    setTimeout(function () { if (ink.parentNode) ink.parentNode.removeChild(ink); }, 650);
  }, { passive: true });

  /* ---- Lazy hero video: only after the page has loaded, never on Save-Data ---- */
  var vid = document.querySelector("video[data-lazy-hero]");
  var saveData = navigator.connection && navigator.connection.saveData;
  if (vid && !saveData) {
    var start = function () {
      Array.prototype.forEach.call(vid.querySelectorAll("source[data-src]"), function (s) {
        s.src = s.getAttribute("data-src");
      });
      vid.load();
      var p = vid.play();
      if (p && p.catch) p.catch(function () {});
      vid.addEventListener("playing", function () { vid.classList.add("is-playing"); }, { once: true });
    };
    var later = function () {
      if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 1500 });
      else setTimeout(start, 300);
    };
    if (document.readyState === "complete") later(); else window.addEventListener("load", later, { once: true });
  }
})();
