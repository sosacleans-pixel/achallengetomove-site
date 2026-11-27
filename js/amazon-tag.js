/**
 * Amazon Associates tracking tag for Coach's Picks on the hub homepage.
 * Tag jorgesheyaime-20 is also hardcoded in each product href
 * so links work without JavaScript.
 */
(function () {
  var AMAZON_TAG = "jorgesheyaime-20";
  document.querySelectorAll("a[data-amazon-asin]").forEach(function (link) {
    var asin = link.getAttribute("data-amazon-asin");
    if (!asin) return;
    link.href = "https://www.amazon.com/dp/" + encodeURIComponent(asin) + "?tag=" + encodeURIComponent(AMAZON_TAG);
  });
})();
