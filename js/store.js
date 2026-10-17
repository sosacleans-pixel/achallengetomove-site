/**
 * Renders the store catalog from /js/products.json.
 * Add new books, apps, or bundles in that file — no HTML edits required.
 */
(function () {
  const grid = document.getElementById("product-grid");
  if (!grid) return;

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
        '<a class="btn btn-secondary btn-small" href="' +
          escapeHtml(mailtoNotify(subject)) +
          '">Notify me</a>'
      );
    } else if (product.actions && product.actions.length) {
      product.actions.forEach(function (action) {
        if (action.kind !== "link") return;
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
      });
    }

    /*
     * FUTURE CHECKOUT: When you add direct sales (e.g. Stripe Payment Link),
     * push an action like:
     * { "kind": "link", "label": "Buy", "href": "https://buy.stripe.com/...", "variant": "primary", "newTab": true }
     * Or render a dedicated checkout button here for products with checkoutUrl set.
     */

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
    const compact = product._compact ? " product-card--compact" : "";

    return (
      '<article class="product-card' +
      compact +
      '" data-product-id="' +
      escapeHtml(product.id) +
      '">' +
      statusBadge(product.status) +
      '<div class="product-card-body">' +
      renderImage(product.image) +
      '<div class="product-copy">' +
      typeLabel +
      "<h2>" +
      title +
      "</h2>" +
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
    grid.innerHTML =
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
      '<section class="product-pair" aria-labelledby="pair-' +
      escapeHtml(items[0].pairGroup) +
      '">' +
      '<header class="product-pair-head">' +
      '<h2 class="product-pair-title" id="pair-' +
      escapeHtml(items[0].pairGroup) +
      '">' +
      title +
      "</h2>" +
      subtitle +
      "</header>" +
      '<div class="product-pair-grid">' +
      cards +
      "</div></section>"
    );
  }

  function buildCatalogHtml(products, pairGroups) {
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

  fetch("/js/products.json")
    .then(function (res) {
      if (!res.ok) throw new Error("Could not load product catalog.");
      return res.json();
    })
    .then(function (data) {
      const products = data.products || [];
      if (!products.length) {
        showError("No products listed yet. Check back soon.");
        return;
      }
      grid.innerHTML = buildCatalogHtml(products, data.pairGroups || {});
    })
    .catch(function () {
      showError("The store catalog could not be loaded. Please refresh the page.");
    });
})();
