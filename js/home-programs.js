/**
 * Homepage Programs — sourced from /js/products.json (catalogSection: programs).
 * All programs render as equal-size cards in the responsive grid.
 */
(function () {
  const layout = document.getElementById("home-programs-layout");
  if (!layout) return;

  const NOTIFY_EMAIL = "coachsalimheyaime@gmail.com";

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function mailtoNotify(subject) {
    const q = new URLSearchParams({ subject });
    return "mailto:" + NOTIFY_EMAIL + "?" + q.toString();
  }

  /* Stripe badge + refund line from /js/buy-trust.js (shared component). */
  const BUY_TRUST_HTML = (window.ACTM_BUY_TRUST && window.ACTM_BUY_TRUST.html) || "";

  function isBuyAction(action) {
    return (
      action.kind === "checkout_pending" ||
      (action.kind === "link" && /^https:\/\/buy\.stripe\.com\//.test(action.href || ""))
    );
  }

  /* Placeholder buy button: visibly disabled, not clickable, not a buy.stripe.com link (so no GA hit). */
  function renderPendingCheckout(action, product, btnCls) {
    return (
      '<span class="checkout-pending-wrap">' +
      '<a class="' + btnCls + ' btn-checkout-soon btn-checkout-pending" href="' +
      escapeHtml(action.href || "#") +
      '" data-product="' + escapeHtml(product.id || "") +
      '" aria-disabled="true" tabindex="-1" title="Checkout link pending">' +
      escapeHtml(action.label) +
      "</a>" +
      '<small class="checkout-pending-note">' + escapeHtml(action.pendingNote || "Checkout link pending") + "</small>" +
      "</span>"
    );
  }

  function badge(status) {
    if (status === "coming_soon") {
      return '<span class="badge badge-soon">Coming soon</span>';
    }
    if (status === "checkout_pending") {
      return '<span class="badge badge-soon">Checkout pending</span>';
    }
    return '<span class="badge badge-live">Available now</span>';
  }

  function renderFooter(product) {
    if (product.status === "coming_soon") {
      const subject = product.notifySubject || "Notify me: new program";
      const learnMore = product.learnMoreHref
        ? '<a class="text-link learn-more-link" href="' +
          escapeHtml(product.learnMoreHref) +
          '">Learn more<span class="visually-hidden"> about ' +
          escapeHtml(product.title) +
          "</span></a>"
        : "";
      return (
        '<div class="program-card-footer' +
        (learnMore ? " program-card-footer--with-link" : "") +
        '">' +
        '<a class="btn btn-primary btn-small" href="' +
        escapeHtml(mailtoNotify(subject)) +
        '">Notify me</a>' +
        learnMore +
        "</div>"
      );
    }

    if (!product.actions || !product.actions.length) return "";

    const parts = [];
    product.actions.forEach(function (action) {
      if (action.kind === "link") {
        const cls =
          action.variant === "secondary"
            ? "btn btn-secondary btn-small"
            : "btn btn-primary btn-small";
        const rel = action.newTab ? ' rel="noopener noreferrer"' : "";
        const target = action.newTab ? ' target="_blank"' : "";
        parts.push(
          '<a class="' +
            cls +
            '" href="' +
            escapeHtml(action.href) +
            '"' +
            (isBuyAction(action) ? ' data-product="' + escapeHtml(product.id || "") + '"' : "") +
            target +
            rel +
            ">" +
            escapeHtml(action.label) +
            "</a>"
        );
      } else if (action.kind === "checkout_pending") {
        parts.push(
          renderPendingCheckout(
            action,
            product,
            action.variant === "secondary" ? "btn btn-secondary btn-small" : "btn btn-primary btn-small"
          )
        );
      } else if (action.kind === "checkout_placeholder") {
        parts.push(
          '<a class="btn btn-primary btn-small btn-checkout-soon" href="#" aria-disabled="true" title="Checkout coming soon" tabindex="-1">' +
            escapeHtml(action.label) +
            "</a>"
        );
      }
    });

    if (!parts.length) return "";

    const hasBuy = product.actions.some(isBuyAction);
    return (
      '<div class="program-card-footer"><div class="card-actions">' +
      parts.join("") +
      "</div>" +
      (hasBuy ? BUY_TRUST_HTML : "") +
      "</div>"
    );
  }

  function renderProgram(product) {
    const tagline = product.tagline
      ? '<p class="tagline">' + escapeHtml(product.tagline) + "</p>"
      : "";
    const price = product.price
      ? '<p class="program-price" aria-label="Price">' + escapeHtml(product.price) + "</p>"
      : "";
    const note = product.note
      ? '<p class="program-note">' + escapeHtml(product.note) + "</p>"
      : "";

    return (
      '<article class="program-card program-card--tier" data-program-id="' +
      escapeHtml(product.id) +
      '">' +
      '<div class="program-card-main">' +
      badge(product.status) +
      price +
      "<h3>" +
      escapeHtml(product.title) +
      "</h3>" +
      tagline +
      '<p class="desc">' +
      escapeHtml(product.description) +
      "</p>" +
      note +
      "</div>" +
      renderFooter(product) +
      "</article>"
    );
  }

  fetch("/js/products.json")
    .then(function (res) {
      if (!res.ok) throw new Error("load failed");
      return res.json();
    })
    .then(function (data) {
      const programs = (data.products || []).filter(function (p) {
        return p.catalogSection === "programs";
      });
      if (!programs.length) {
        layout.innerHTML = '<p class="store-error">Programs could not be loaded.</p>';
        return;
      }

      layout.classList.add("program-grid", "program-grid--apps");
      layout.innerHTML = programs.map(renderProgram).join("");
    })
    .catch(function () {
      layout.innerHTML =
        '<p class="store-error" role="alert">Programs could not be loaded. Please refresh the page.</p>';
    });
})();
