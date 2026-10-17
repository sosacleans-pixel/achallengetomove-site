/**
 * Renders the store catalog from /js/products.json.
 * Add new books, apps, or bundles in that file — no HTML edits required.
 */
(function () {
  const catalog = document.getElementById("store-catalog");
  if (!catalog) return;

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

  function renderImage(image) {
    if (!image) return "";
    const alt = escapeHtml(image.alt || "");
    if (image.webp && image.jpg) {
      return (
        '<picture class="product-media">' +
        '<source srcset="' +
        escapeHtml(image.webp) +
        '" type="image/webp">' +
        '<img src="' +
        escapeHtml(image.jpg) +
        '" width="' +
        (image.width || "") +
        '" height="' +
        (image.height || "") +
        '" alt="' +
        alt +
        '" loading="lazy" decoding="async">' +
        "</picture>"
      );
    }
    if (image.svg) {
      return (
        '<div class="product-media product-media--app">' +
        '<img src="' +
        escapeHtml(image.svg) +
        '" width="' +
        (image.width || 512) +
        '" height="' +
        (image.height || 512) +
        '" alt="' +
        alt +
        '" loading="lazy" decoding="async">' +
        "</div>"
      );
    }
    return "";
  }

  function btnClass(variant) {
    return variant === "secondary" ? "btn btn-secondary btn-small" : "btn btn-primary btn-small";
  }

  function renderActions(product) {
    const parts = [];

    if (product.status === "coming_soon") {
      const subject = product.notifySubject || "Notify me: new product";
      parts.push(
        '<a class="btn btn-primary btn-small" href="' +
          escapeHtml(mailtoNotify(subject)) +
          '">Notify me</a>'
      );
      if (product.learnMoreHref) {
        parts.push(
          '<a class="btn btn-secondary btn-small" href="' +
            escapeHtml(product.learnMoreHref) +
            '">Learn more<span class="visually-hidden"> about ' +
            escapeHtml(product.title) +
            "</span></a>"
        );
      }
    } else if (product.actions && product.actions.length) {
      product.actions.forEach(function (action) {
        if (action.kind === "link") {
          const rel = action.newTab ? ' rel="noopener noreferrer"' : "";
          const target = action.newTab ? ' target="_blank"' : "";
          parts.push(
            '<a class="' +
              btnClass(action.variant) +
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
    }

    return parts.length ? '<div class="product-actions">' + parts.join("") + "</div>" : "";
  }

  function statusBadge(status) {
    if (status === "coming_soon") {
      return '<span class="badge badge-soon">Coming soon</span>';
    }
    return '<span class="badge badge-live">Available</span>';
  }

  function renderProduct(product) {
    const typeLabel = product.typeLabel ? '<p class="product-type">' + escapeHtml(product.typeLabel) + "</p>" : "";
    const note = product.note
      ? '<p class="product-note">' + escapeHtml(product.note) + "</p>"
      : "";
    const title = escapeHtml(product.title);
    const desc = escapeHtml(product.description);
    const tagline = product.tagline
      ? '<p class="product-tagline">' + escapeHtml(product.tagline) + "</p>"
      : "";
    const price = product.price
      ? '<p class="product-price">' + escapeHtml(product.price) + "</p>"
      : "";
    const compact = product._compact ? " product-card--compact" : "";
    const textOnly = !product.image ? " product-card--text-only" : "";

    return (
      '<article class="product-card' +
      compact +
      textOnly +
      '" data-product-id="' +
      escapeHtml(product.id) +
      '">' +
      statusBadge(product.status) +
      '<div class="product-card-body">' +
      renderImage(product.image) +
      '<div class="product-copy">' +
      typeLabel +
      "<h3>" +
      title +
      "</h3>" +
      price +
      tagline +
      '<p class="product-desc">' +
      desc +
      "</p>" +
      note +
      renderActions(product) +
      "</div></div></article>"
    );
  }

  function showError(message) {
    catalog.innerHTML =
      '<p class="store-error" role="alert">' + escapeHtml(message) + "</p>";
  }

  function renderPairGroup(groupMeta, items) {
    const title = escapeHtml(groupMeta.title || "Choose your level");
    const subtitle = groupMeta.subtitle
      ? '<p class="product-pair-lede">' + escapeHtml(groupMeta.subtitle) + "</p>"
      : "";
    const cards = items
      .map(function (p) {
        const copy = Object.assign({}, p, { _compact: true });
        return renderProduct(copy);
      })
      .join("");
    return (
      '<div class="product-pair" aria-labelledby="pair-' +
      escapeHtml(items[0].pairGroup) +
      '">' +
      '<header class="product-pair-head">' +
      '<h3 class="product-pair-title" id="pair-' +
      escapeHtml(items[0].pairGroup) +
      '">' +
      title +
      "</h3>" +
      subtitle +
      "</header>" +
      '<div class="product-pair-grid">' +
      cards +
      "</div></div>"
    );
  }

  function buildSectionItemsHtml(products, pairGroups) {
    const html = [];
    let i = 0;
    while (i < products.length) {
      const product = products[i];
      if (product.pairGroup) {
        const groupId = product.pairGroup;
        const batch = [];
        while (i < products.length && products[i].pairGroup === groupId) {
          batch.push(products[i]);
          i += 1;
        }
        const meta = (pairGroups && pairGroups[groupId]) || { title: "Choose your level" };
        html.push(renderPairGroup(meta, batch));
      } else {
        html.push(renderProduct(product));
        i += 1;
      }
    }
    return html.join("");
  }

  function renderCatalog(data) {
    const sections = data.catalogSections || [];
    const allProducts = data.products || [];
    const pairGroups = data.pairGroups || {};

    if (!allProducts.length) {
      showError("No products listed yet. Check back soon.");
      return;
    }

    const bySection = {};
    allProducts.forEach(function (p) {
      const key = p.catalogSection || "programs";
      if (!bySection[key]) bySection[key] = [];
      bySection[key].push(p);
    });

    const order =
      sections.length > 0
        ? sections.map(function (s) {
            return s.id;
          })
        : Object.keys(bySection);

    function renderComingSoonSection(meta) {
      const title = meta.title || meta.id;
      const blurb = meta.blurb || "Coming soon.";
      return (
        '<section class="store-section store-section--soon" id="store-' +
        escapeHtml(meta.id) +
        '" aria-labelledby="store-heading-' +
        escapeHtml(meta.id) +
        '">' +
        '<h2 class="store-section-title" id="store-heading-' +
        escapeHtml(meta.id) +
        '">' +
        escapeHtml(title) +
        "</h2>" +
        '<div class="store-coming-soon-block">' +
        '<span class="badge badge-soon">Coming soon</span>' +
        "<p>" +
        escapeHtml(blurb) +
        "</p></div></section>"
      );
    }

    const html = [];
    order.forEach(function (sectionId) {
      const meta = sections.find(function (s) {
        return s.id === sectionId;
      });
      const items = bySection[sectionId] || [];
      if (meta && meta.comingSoon && !items.length) {
        html.push(renderComingSoonSection(meta));
        return;
      }
      if (!items.length) return;
      const title = meta ? meta.title : sectionId;
      html.push(
        '<section class="store-section" id="store-' +
          escapeHtml(sectionId) +
          '" aria-labelledby="store-heading-' +
          escapeHtml(sectionId) +
          '">' +
          '<h2 class="store-section-title" id="store-heading-' +
          escapeHtml(sectionId) +
          '">' +
          escapeHtml(title) +
          "</h2>" +
          '<div class="store-section-items">' +
          buildSectionItemsHtml(items, pairGroups) +
          "</div></section>"
      );
    });

    catalog.innerHTML = html.join("");
  }

  fetch("/js/products.json")
    .then(function (res) {
      if (!res.ok) throw new Error("Could not load product catalog.");
      return res.json();
    })
    .then(renderCatalog)
    .catch(function () {
      showError("The store catalog could not be loaded. Please refresh the page.");
    });
})();
