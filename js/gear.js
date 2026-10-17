/*
 * Gear page: Amazon link builder.
 *
 * Set your Amazon Associates tracking ID here (for example "yourtag-20").
 * This is the ONLY place the tag lives. While it is empty, links go to the
 * plain product page with no tag parameter.
 */
const AFFILIATE_TAG = "";

(function () {
  "use strict";

  function amazonUrl(asin) {
    var url = "https://www.amazon.com/dp/" + encodeURIComponent(asin);
    var tag = String(AFFILIATE_TAG || "").trim();
    return tag ? url + "?tag=" + encodeURIComponent(tag) : url;
  }

  document.querySelectorAll("a[data-asin]").forEach(function (link) {
    link.href = amazonUrl(link.getAttribute("data-asin"));
    link.rel = "sponsored noopener";
    link.target = "_blank";
  });
})();
