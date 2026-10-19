/**
 * App icon family: one icon per program, keyed by the product id in /js/products.json.
 * Files live in /icons/apps/<slug>/ (icon.svg, icon-512.png, icon-192.png, apple-touch-icon.png).
 * Used by js/home-programs.js and js/store.js to show the icon at the top left of each program card.
 */
(function () {
  const SLUGS = {
    "22-day-workout-app": "22-day-7-minute-workout",
    "doing-a-5k": "doing-a-5k",
    "whole-food-app": "whole-food-plan",
    "5k-to-half-marathon": "5k-to-half-marathon",
    "75-adaptive": "75-adaptive",
    "75-all-in": "75-all-in",
    "30-days-before-xmas": "30-days-before-xmas"
  };

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function src(productId) {
    const slug = SLUGS[productId];
    return slug ? "/icons/apps/" + slug + "/icon.svg" : "";
  }

  /* <img> for a program card; alt text is the program name. Empty string if the product has no icon. */
  function img(product, className, size) {
    const s = product && src(product.id);
    if (!s) return "";
    const px = size || 52;
    return (
      '<img class="' + esc(className || "app-icon") + '" src="' + s +
      '" width="' + px + '" height="' + px + '" alt="' + esc(product.title || "") +
      '" decoding="async">'
    );
  }

  window.ACTM_APP_ICONS = { slugs: SLUGS, src: src, img: img };
})();
