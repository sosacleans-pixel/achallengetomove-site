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

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!email.value || !email.checkValidity()) {
      email.setAttribute("aria-invalid", "true");
      say("Please enter a valid email address.");
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
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    say("Sending…");

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
        form.hidden = true;
        say("Thank you! You're on the list. We'll email you when new challenges launch.");
        status.focus();
      })
      .catch(function () {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        say("Sorry, something went wrong. Please try again, or email coachsalimheyaime@gmail.com.");
      });
  });
})();
