/**
 * Store search URLs — single place for affiliate / API changes later.
 */

export const GROCERY_STORE_CONFIG = {
  instacart: {
    id: "instacart",
    mode: "search",
    affiliateParam: null,
    searchUrlTemplate: "https://www.instacart.com/store/s?k={query}",
    searchButtonLabel: "Search on Instacart",
  },
  walmart: {
    id: "walmart",
    mode: "search",
    affiliateParam: null,
    searchUrlTemplate: "https://www.walmart.com/search?q={query}",
    searchButtonLabel: "Search on Walmart",
  },
  amazon: {
    id: "amazon",
    mode: "search",
    affiliateParam: null,
    searchUrlTemplate: "https://www.amazon.com/s?k={query}",
    searchButtonLabel: "Search on Amazon",
  },
};

export const GROCERY_STORE_IDS = Object.keys(GROCERY_STORE_CONFIG);

export function getGroceryStore(storeId) {
  return GROCERY_STORE_CONFIG[storeId] || GROCERY_STORE_CONFIG.instacart;
}

/**
 * @param {string} storeId
 * @param {string} itemLabel
 */
export function buildItemSearchUrl(storeId, itemLabel) {
  const cfg = getGroceryStore(storeId);
  const query = encodeURIComponent(String(itemLabel || "").trim());
  let url = cfg.searchUrlTemplate.replace("{query}", query);
  if (cfg.affiliateParam) {
    const sep = url.includes("?") ? "&" : "?";
    url += `${sep}${cfg.affiliateParam}`;
  }
  return url;
}

export function storeSearchButtonLabel(storeId) {
  return getGroceryStore(storeId).searchButtonLabel;
}
