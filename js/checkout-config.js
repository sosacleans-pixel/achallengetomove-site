/* Checkout config (achallengetomove.com): the ONE place that sets app prices, buy links and gift links.
 *
 * Flip rules:
 *  - Doing a 5K: paste Salim's new $8.99 Stripe Payment Link into "doing-a-5k".newBuyLink. While it is
 *    empty, every Doing a 5K price mention (cards, product page, meta and schema.org price, price line,
 *    ES line) shows $6.99 and the live $6.99 link stays wired. The moment it is set, all of them show
 *    $8.99 and the button uses the new link. No "was" price and no strikethrough, ever.
 *  - 5K to Half Marathon: paste its $8.99 link into "5k-to-half-marathon".buyLink. Empty = disabled
 *    "Checkout pending" button.
 *  - Gifts: paste each app's gift Payment Link into giftLink. Empty = disabled "Gift checkout pending".
 *    Pay-button text for every gift link is listed in /GIFT-LINKS.md.
 *
 * Load this file (defer) before js/home-programs.js and js/store.js. On static pages it also fills
 * [data-actm-price], [data-actm-buy], [data-actm-tpl] (meta tags) and script[data-actm-ld] (JSON-LD).
 */
(function () {
  "use strict";

  var CONFIG = {
    "22-day-workout-app": { giftLink: "" },
    "doing-a-5k": {
      page: "/doing-a-5k/",
      newBuyLink: "", /* <- the single value: new $8.99 Stripe link for Doing a 5K */
      newPrice: "8.99",
      currentPrice: "6.99",
      currentBuyLink: "https://buy.stripe.com/14A6oH32iclb6TgeHf4ko04",
      priceLine: true,
      giftLink: ""
    },
    "5k-to-half-marathon": {
      page: "/5k-to-half-marathon/",
      price: "8.99",
      buyLink: "", /* <- 5K to Half Marathon $8.99 Stripe link (empty = Checkout pending) */
      priceLine: true,
      giftLink: ""
    },
    "whole-food-app": { giftLink: "" },
    "75-adaptive": { giftLink: "" },
    "75-all-in": { giftLink: "" }
  };

  var TEXT = {
    priceLineEn: "{price} one-time payment. Includes 12 months of access. No subscription.",
    priceLineEs: "{price} pago \u00fanico. Incluye 12 meses de acceso. Sin suscripci\u00f3n.",
    giftBtn: "Give as a gift",
    giftBtnEs: "Regalar",
    giftPending: "Gift checkout pending",
    giftNoteEn: "Gift buyers get a code to send. Gifts can be refunded within 3 days of purchase if the code hasn't been redeemed.",
    giftNoteEs: "Quien compra un regalo recibe un c\u00f3digo para enviar. Los regalos se pueden reembolsar dentro de los 3 d\u00edas posteriores a la compra si el c\u00f3digo no se ha canjeado.",
    gift22En: "A 22-Day gift gives the recipient the same access as a purchase.",
    gift22Es: "Un regalo de 22-Day da a quien lo recibe el mismo acceso que una compra.",
    termsLabel: "Terms",
    termsHref: "/purchase-terms/"
  };

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* Resolved checkout state for one product id: { amount, price, buyLink, buyPending, giftLink, priceLine }. */
  function resolve(id) {
    var c = CONFIG[id];
    if (!c) return null;
    var out = { id: id, giftLink: c.giftLink || "", giftable: true, priceLine: !!c.priceLine };
    if (id === "doing-a-5k") {
      var flipped = !!c.newBuyLink;
      out.amount = flipped ? c.newPrice : c.currentPrice;
      out.buyLink = flipped ? c.newBuyLink : c.currentBuyLink;
    } else if (c.price) {
      out.amount = c.price;
      out.buyLink = c.buyLink || "";
    }
    if (out.amount) out.price = "$" + out.amount;
    out.buyPending = out.amount ? !out.buyLink : false;
    return out;
  }

  function priceLines(r) {
    if (!r || !r.priceLine || !r.price) return "";
    return (
      '<p class="price-line"><small>' + esc(TEXT.priceLineEn.replace("{price}", r.price)) + "</small></p>" +
      '<p class="price-line" lang="es"><small>' + esc(TEXT.priceLineEs.replace("{price}", r.price)) + "</small></p>"
    );
  }

  /* Gift button + Terms link + gift note (EN/ES). Same markup on cards and product pages. */
  function giftHtml(id) {
    var r = resolve(id);
    if (!r || !r.giftable) return "";
    var btn = r.giftLink
      ? '<a class="btn btn-secondary btn-small btn-gift" href="' + esc(r.giftLink) + '" data-product="' + esc(id) +
        '-gift" target="_blank" rel="noopener noreferrer">' + esc(TEXT.giftBtn) + ' <span class="gift-sep" aria-hidden="true">/</span> <span lang="es">' +
        esc(TEXT.giftBtnEs) + "</span></a>"
      : '<span class="btn btn-secondary btn-small btn-gift btn-checkout-soon btn-gift-pending" role="link" aria-disabled="true" ' +
        'aria-label="' + esc(TEXT.giftBtn) + ", " + esc(TEXT.giftPending) + '" title="' + esc(TEXT.giftPending) + '">' + esc(TEXT.giftPending) + "</span>";
    var extra = id === "22-day-workout-app"
      ? "<small>" + esc(TEXT.gift22En) + '</small> <small lang="es">' + esc(TEXT.gift22Es) + "</small>"
      : "";
    return (
      '<div class="gift-block" data-gift-for="' + esc(id) + '">' +
      '<div class="gift-actions">' + btn +
      '<a class="text-link gift-terms" href="' + TEXT.termsHref + '">' + esc(TEXT.termsLabel) +
      '<span class="visually-hidden"> for gifts</span></a></div>' +
      '<p class="gift-note"><small>' + esc(TEXT.giftNoteEn) + '</small> <small lang="es">' + esc(TEXT.giftNoteEs) + "</small>" +
      (extra ? " " + extra : "") + "</p></div>"
    );
  }

  /* Apply config to a products.json entry before rendering (cards on home and store). Returns a copy. */
  function applyToProduct(product) {
    var r = resolve(product.id);
    if (!r || !r.price) return Object.assign({}, product, { _checkout: r });
    var p = Object.assign({}, product, { price: r.price, _checkout: r });
    var buyDone = false;
    p.actions = (product.actions || []).map(function (a) {
      var isBuy = a.kind === "checkout_pending" || (a.kind === "link" && /^https:\/\/buy\.stripe\.com\//.test(a.href || ""));
      if (!isBuy || buyDone) return a;
      buyDone = true;
      var label = "Buy app, " + r.price;
      if (r.buyPending) {
        return { kind: "checkout_pending", label: label, href: "#stripe-link-pending-" + product.id, variant: "primary", pendingNote: "Checkout link pending" };
      }
      return { kind: "link", label: label, href: r.buyLink, variant: "primary", newTab: true };
    });
    return p;
  }

  /* Static pages: fill every marked price mention from the config. */
  function hydrate(root) {
    root = root || document;
    [].forEach.call(root.querySelectorAll("[data-actm-price]"), function (el) {
      var r = resolve(el.getAttribute("data-actm-price"));
      if (r && r.price) el.textContent = r.price;
    });
    [].forEach.call(root.querySelectorAll("[data-actm-pricelines]"), function (el) {
      var r = resolve(el.getAttribute("data-actm-pricelines"));
      if (r) el.innerHTML = priceLines(r);
    });
    [].forEach.call(root.querySelectorAll("meta[data-actm-tpl]"), function (el) {
      var r = resolve(el.getAttribute("data-actm-for"));
      if (r && r.price) el.setAttribute("content", el.getAttribute("data-actm-tpl").replace("{price}", r.price));
    });
    [].forEach.call(root.querySelectorAll("script[data-actm-ld]"), function (el) {
      try {
        var data = JSON.parse(el.textContent);
        el.getAttribute("data-actm-ld").split(/\s+/).forEach(function (id) {
          var r = resolve(id), c = CONFIG[id];
          if (!r || !r.amount || !c || !c.page) return;
          var nodes = data["@graph"] || [data];
          nodes.forEach(function (n) {
            if (!n.offers || !n.url || n.url.indexOf(c.page) === -1) return;
            n.offers.price = r.amount;
            if (r.buyLink) n.offers.url = r.buyLink;
          });
        });
        el.textContent = JSON.stringify(data, null, 2);
      } catch (e) {}
    });
    [].forEach.call(root.querySelectorAll("[data-actm-buy]"), function (el) {
      var r = resolve(el.getAttribute("data-actm-buy"));
      if (!r || !r.price) return;
      el.setAttribute("data-actm-state", r.buyPending ? "pending" : "live");
      var a = el.matches("a") ? el : el.querySelector("a");
      if (!a) return;
      a.textContent = "Buy app, " + r.price;
      if (!r.buyPending) {
        a.setAttribute("href", r.buyLink);
        a.classList.remove("btn-checkout-soon", "btn-checkout-pending");
        a.removeAttribute("aria-disabled"); a.removeAttribute("tabindex"); a.removeAttribute("title");
        a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer");
        var note = el.querySelector(".checkout-pending-note"); if (note) note.remove();
      }
    });
    [].forEach.call(root.querySelectorAll("[data-actm-gift]"), function (el) {
      el.outerHTML = giftHtml(el.getAttribute("data-actm-gift"));
    });
  }

  window.ACTM_CHECKOUT = { config: CONFIG, text: TEXT, resolve: resolve, priceLines: priceLines, giftHtml: giftHtml, applyToProduct: applyToProduct, hydrate: hydrate };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { hydrate(); });
  else hydrate();
})();
