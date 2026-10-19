/* Notify-me sign-up: posts to FormSubmit via AJAX and shows an inline thank-you. */
(function () {
  "use strict";
  var form = document.getElementById("notify-form");
  if (!form) return;
  var email = document.getElementById("notify-email");
  var status = document.getElementById("notify-status");
  var button = form.querySelector('button[type="submit"]');
  var ENDPOINT = "https://formsubmit.co/ajax/coachsalimheyaime@gmail.com";

  function say(msg) {
    status.textContent = msg;
  }

  // Optional per-form messages (data-msg-invalid / -sending / -ok / -error), e.g. the ES text on
  // /holiday-challenge/. Forms without them keep the default English messages below.
  function msg(key, fallback) {
    return form.getAttribute("data-msg-" + key) || fallback;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!email.value || !email.checkValidity()) {
      email.setAttribute("aria-invalid", "true");
      say(msg("invalid", "Please enter a valid email address."));
      email.focus();
      return;
    }
    email.removeAttribute("aria-invalid");
    var honey = form.querySelector('input[name="_honey"]');
    var payload = {
      email: email.value.trim(),
      _subject: "A Challenge to Move: notify me",
      _template: "table",
      _honey: honey ? honey.value : ""
    };
    // List tag: a form can name its list and subject with hidden fields (list, lang, _subject),
    // e.g. the 30 Days Before X-mas Challenge sign-up. The homepage form sends the same fields as before.
    ["_subject", "list", "lang"].forEach(function (name) {
      var f = form.querySelector('input[type="hidden"][name="' + name + '"]');
      if (f && f.value) payload[name] = f.value;
    });
    var consentNote = document.getElementById("notify-consent");
    if (consentNote) payload.consent_note = (consentNote.textContent || "").replace(/\s+/g, " ").trim();
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    say(msg("sending", "Sending…"));

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || (data && String(data.success) === "false")) throw new Error("failed");
        });
      })
      .then(function () {
        // GA4: sign_up only after FormSubmit confirms success (no email or other personal data sent).
        // Never on the holiday challenge pages (/holiday-challenge/...): GA stays off there.
        if (typeof window.gtag === "function" && !/^\/holiday-challenge(\/|$)/i.test(location.pathname)) window.gtag("event", "sign_up", { method: "notify_form" });
        form.hidden = true;
        say(msg("ok", "Thank you! You're on the list. We'll email you when new challenges launch."));
        status.focus();
      })
      .catch(function () {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        say(msg("error", "Sorry, something went wrong. Please try again, or email coachsalimheyaime@gmail.com."));
      });
  });
})();
