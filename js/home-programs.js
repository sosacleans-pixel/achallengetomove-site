/**
 * Homepage Programs — sourced from /js/products.json (catalogSection: programs).
 * Coming-soon programs fill the grid; homeFeatured program renders full-width below.
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

  function badge(status) {
    if (status === "coming_soon") {
      return '<span class="badge badge-soon">Coming soon</span>';
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
            target +
            rel +
            ">" +
            escapeHtml(action.label) +
            "</a>"
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

    return '<div class="program-card-footer"><div class="card-actions">' + parts.join("") + "</div></div>";
  }

  function renderFeaturedIcon(product) {
    const alt = product.image && product.image.alt ? escapeHtml(product.image.alt) : "";
    const src =
      product.image && product.image.svg ? escapeHtml(product.image.svg) : "/icons/logo.svg";
    return (
      '<img class="program-featured-icon" src="' +
      src +
      '" width="56" height="56" alt="' +
      alt +
      '" decoding="async">'
    );
  }

  function renderFeaturedProgram(product) {
    const tagline = product.tagline
      ? '<p class="tagline">' + escapeHtml(product.tagline) + "</p>"
      : "";
    const price = product.price
      ? '<span class="program-price-pill">' + escapeHtml(product.price) + "</span>"
      : "";
    const note = product.note
      ? '<p class="program-note program-note--compact">' + escapeHtml(product.note) + "</p>"
      : "";
    const actions = renderFooter(product).replace(
      "card-actions",
      "card-actions card-actions--featured"
    );

    return (
      '<article class="program-card program-card--tier program-card--featured" data-program-id="' +
      escapeHtml(product.id) +
      '">' +
      '<div class="program-featured-inner">' +
      '<div class="program-featured-col program-featured-col--text">' +
      badge(product.status) +
      '<div class="program-featured-title-row">' +
      renderFeaturedIcon(product) +
      "<h3>" +
      escapeHtml(product.title) +
      "</h3>" +
      price +
      "</div>" +
      tagline +
      '<p class="desc">' +
      escapeHtml(product.description) +
      "</p>" +
      "</div>" +
      '<div class="program-featured-col program-featured-col--actions">' +
      note +
      actions +
      "</div></div></article>"
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

      const featured = programs.find(function (p) {
        return p.homeFeatured;
      });
      const gridPrograms = programs.filter(function (p) {
        return !p.homeFeatured;
      });

      const gridHtml = gridPrograms.map(renderProgram).join("");

      const featuredHtml = featured ? renderFeaturedProgram(featured) : "";

      layout.classList.add("program-grid", "program-grid--apps");
      layout.innerHTML = featuredHtml + gridHtml;
    })
    .catch(function () {
      layout.innerHTML =
        '<p class="store-error" role="alert">Programs could not be loaded. Please refresh the page.</p>';
    });
})();
