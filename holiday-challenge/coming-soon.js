/* 30 Days Before X-mas Challenge: coming-soon page, EN/ES.
   Language: ?lang=es|en in the URL, else the visitor's saved choice, else the browser language
   (Spanish browsers get ES). Same rule and same storage key as the holiday app (holiday-30-lang),
   so the choice carries over at launch. The choice is stored on this device only.
   No analytics, no tracking. */
(function () {
  "use strict";
  var KEY = "holiday-30-lang";
  var T = {
    en: {
      pageTitle: "30 Days Before X-mas Challenge: Coming Soon | A Challenge to Move",
      skip: "Skip to content",
      brandTag: "Books & apps for daily wellness",
      navStore: "Store",
      back: "\u2190 Back to home",
      langLabel: "Language",
      title: "30 Days Before X-mas Challenge",
      soon: "Coming soon. Start Day 1 the day you get it.",
      price: "$9.99",
      dates: "Available through December 5, 2026.",
      tagline: "Feel strong into the holidays.",
      lead: "Get through the busiest weeks of the year still moving: a little strength, a little mobility, a little walking, every day, for 30 days.",
      signupTitle: "Get notified when it opens",
      emailLabel: "Email address",
      submit: "Get notified",
      consentPurpose: "Email me when the 30 Days Before X-mas Challenge opens.",
      consentSender: "Coach Salim Heyaime LLC (coachsalimheyaime@gmail.com) will send occasional emails about this challenge.",
      consentWithdraw: "You can withdraw your consent and unsubscribe at any time with the link in every email, or by emailing coachsalimheyaime@gmail.com.",
      privacyNotice: "Privacy notice",
      privacy: "Privacy",
      fineprint: "General wellness education. Not medical advice.",
      msgInvalid: "Please enter a valid email address.",
      msgSending: "Sending...",
      msgOk: "Thank you! You're on the list. We'll email you when the 30 Days Before X-mas Challenge opens.",
      msgError: "Sorry, something went wrong. Please try again, or email coachsalimheyaime@gmail.com."
    },
    es: {
      pageTitle: "Reto 30 D\u00edas Antes de X-mas: Pr\u00f3ximamente | A Challenge to Move",
      skip: "Ir al contenido",
      brandTag: "Libros y apps para tu bienestar diario",
      navStore: "Tienda",
      back: "\u2190 Volver al inicio",
      langLabel: "Idioma",
      title: "Reto 30 D\u00edas Antes de X-mas",
      soon: "Pr\u00f3ximamente. Empiezas el D\u00eda 1 el mismo d\u00eda que lo recibes.",
      price: "$9.99",
      dates: "Disponible hasta el 5 de diciembre de 2026.",
      tagline: "Llega fuerte a las fiestas.",
      lead: "Pasa las semanas m\u00e1s ocupadas del a\u00f1o sin dejar de moverte: un poco de fuerza, un poco de movilidad y un poco de caminata, todos los d\u00edas, durante 30 d\u00edas.",
      signupTitle: "Recibe un aviso cuando abra",
      emailLabel: "Correo electr\u00f3nico",
      submit: "Av\u00edsame",
      consentPurpose: "Av\u00edsame por correo cuando abra el Reto 30 D\u00edas Antes de X-mas.",
      consentSender: "Coach Salim Heyaime LLC (coachsalimheyaime@gmail.com) te enviar\u00e1 correos ocasionales sobre este reto.",
      consentWithdraw: "Puedes retirar tu consentimiento y darte de baja en cualquier momento con el enlace que incluye cada correo, o escribiendo a coachsalimheyaime@gmail.com.",
      privacyNotice: "Aviso de privacidad (en ingl\u00e9s)",
      privacy: "Privacidad",
      fineprint: "Educaci\u00f3n general de bienestar. No es consejo m\u00e9dico.",
      msgInvalid: "Escribe un correo electr\u00f3nico v\u00e1lido.",
      msgSending: "Enviando...",
      msgOk: "\u00a1Gracias! Ya est\u00e1s en la lista. Te escribiremos cuando abra el Reto 30 D\u00edas Antes de X-mas.",
      msgError: "Lo sentimos, algo sali\u00f3 mal. Int\u00e9ntalo de nuevo o escribe a coachsalimheyaime@gmail.com."
    }
  };
  window.HCS_STRINGS = T;

  function pick() {
    try {
      var q = new URLSearchParams(location.search).get("lang");
      if (q === "en" || q === "es") return q;
    } catch (e) {}
    try {
      var v = localStorage.getItem(KEY);
      if (v === "en" || v === "es") return v;
    } catch (e) {}
    var l = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    return /^es\b/i.test(l) ? "es" : "en";
  }

  function apply(lang) {
    var S = T[lang] || T.en;
    document.documentElement.lang = lang;
    document.title = S.pageTitle;
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (el) {
      var k = el.getAttribute("data-i18n");
      if (S[k] != null) el.textContent = S[k];
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-aria]"), function (el) {
      var k = el.getAttribute("data-i18n-aria");
      if (S[k] != null) el.setAttribute("aria-label", S[k]);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".hcs-lang-btn"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-lang") === lang ? "true" : "false");
    });
    // Messages used by /js/notify.js (the site's shared sign-up script).
    var form = document.getElementById("notify-form");
    if (form) {
      form.setAttribute("data-msg-invalid", S.msgInvalid);
      form.setAttribute("data-msg-sending", S.msgSending);
      form.setAttribute("data-msg-ok", S.msgOk);
      form.setAttribute("data-msg-error", S.msgError);
      var lf = form.querySelector('input[name="lang"]');
      if (lf) lf.value = lang;
    }
  }

  function init() {
    apply(pick());
    Array.prototype.forEach.call(document.querySelectorAll(".hcs-lang-btn"), function (b) {
      b.addEventListener("click", function () {
        var l = b.getAttribute("data-lang");
        try { localStorage.setItem(KEY, l); } catch (e) {}
        apply(l);
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
