import { buildItemSearchUrl, storeSearchButtonLabel, GROCERY_STORE_IDS, getGroceryStore } from "./grocery-links.js";
import { groceryListPlainText } from "./grocery.js";

let toastFn = () => {};
let sheetBound = false;

export function initGroceryOrderSheet({ showToast }) {
  toastFn = showToast || toastFn;
  ensureSheetDom();
  if (!sheetBound) {
    bindSheetChrome();
    sheetBound = true;
  }
}

function ensureSheetDom() {
  if (document.getElementById("grocery-order-sheet")) return;
  const wrap = document.createElement("div");
  wrap.id = "grocery-order-sheet";
  wrap.className = "grocery-sheet hidden";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = `
    <div class="grocery-sheet-backdrop" data-close-sheet></div>
    <div class="grocery-sheet-panel">
      <header class="grocery-sheet-header">
        <h2 id="grocery-sheet-title" class="grocery-sheet-title"></h2>
        <p id="grocery-sheet-sub" class="muted grocery-sheet-sub"></p>
        <button type="button" class="grocery-sheet-close" aria-label="Close" data-close-sheet>×</button>
      </header>
      <div class="grocery-sheet-actions">
        <button type="button" class="btn btn-primary btn-small" id="grocery-sheet-copy">Copy list</button>
        <button type="button" class="btn btn-secondary btn-small" id="grocery-sheet-share">Share</button>
        <button type="button" class="btn btn-secondary btn-small" id="grocery-sheet-print">Print / Save as PDF</button>
      </div>
      <div id="grocery-order-print" class="grocery-sheet-body"></div>
    </div>
  `;
  document.body.appendChild(wrap);
}

function bindSheetChrome() {
  document.querySelectorAll("[data-close-sheet]").forEach((el) => {
    el.addEventListener("click", () => closeGroceryOrderSheet());
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeGroceryOrderSheet();
  });
}

let activePayload = null;

export function openGroceryOrderSheet({ title, subtitle, grocery, storeId }) {
  ensureSheetDom();
  activePayload = { title, subtitle, grocery, storeId };
  const sheet = document.getElementById("grocery-order-sheet");
  const body = document.getElementById("grocery-order-print");
  const titleEl = document.getElementById("grocery-sheet-title");
  const subEl = document.getElementById("grocery-sheet-sub");
  if (!sheet || !body || !titleEl) return;

  titleEl.textContent = title || "Groceries";
  subEl.textContent = subtitle || "";
  body.innerHTML = renderSheetList(grocery, storeId);

  sheet.classList.remove("hidden");
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("grocery-sheet-open");

  const copyBtn = document.getElementById("grocery-sheet-copy");
  const shareBtn = document.getElementById("grocery-sheet-share");
  const printBtn = document.getElementById("grocery-sheet-print");

  copyBtn?.replaceWith(copyBtn.cloneNode(true));
  shareBtn?.replaceWith(shareBtn.cloneNode(true));
  printBtn?.replaceWith(printBtn.cloneNode(true));

  document.getElementById("grocery-sheet-copy")?.addEventListener("click", () => copyGroceryList());
  document.getElementById("grocery-sheet-share")?.addEventListener("click", () => shareGroceryList());
  document.getElementById("grocery-sheet-print")?.addEventListener("click", () => printGroceryList());
}

export function closeGroceryOrderSheet() {
  const sheet = document.getElementById("grocery-order-sheet");
  if (!sheet) return;
  sheet.classList.add("hidden");
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("grocery-sheet-open", "printing-grocery");
  activePayload = null;
}

function renderSheetList(grocery, storeId) {
  const labels = grocery.sectionLabels || {};
  const bySec = {};
  for (const item of grocery.items || []) {
    if (!bySec[item.section]) bySec[item.section] = [];
    bySec[item.section].push(item);
  }
  const searchLabel = storeSearchButtonLabel(storeId);
  const sections = Object.entries(bySec)
    .map(([sec, items]) => {
      const rows = items
        .map((it) => {
          const url = buildItemSearchUrl(storeId, it.label);
          const qty = it.count > 1 ? ` <span class="muted">(×${it.count})</span>` : "";
          return `<li class="grocery-sheet-item">
            <span class="grocery-sheet-item-label">${escapeHtml(it.label)}${qty}</span>
            <a class="btn btn-secondary btn-small grocery-item-search" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(searchLabel)}</a>
          </li>`;
        })
        .join("");
      return `<section class="grocery-sheet-section"><h3>${escapeHtml(labels[sec] || sec)}</h3><ul>${rows}</ul></section>`;
    })
    .join("");
  return sections || `<p class="muted">No items in this list.</p>`;
}

function listText() {
  if (!activePayload?.grocery) return "";
  const header = [activePayload.title, activePayload.subtitle].filter(Boolean).join("\n");
  const body = groceryListPlainText(activePayload.grocery);
  return header ? `${header}\n\n${body}` : body;
}

async function copyGroceryList() {
  const text = listText();
  try {
    await navigator.clipboard.writeText(text);
    toastFn("Grocery list copied", "on");
  } catch {
    toastFn("Copy failed — try again", "check");
  }
}

async function shareGroceryList() {
  const text = listText();
  const title = activePayload?.title || "Grocery list";
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
  }
  await copyGroceryList();
}

function printGroceryList() {
  document.body.classList.add("printing-grocery");
  const cleanup = () => {
    document.body.classList.remove("printing-grocery");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

export { GROCERY_STORE_IDS, getGroceryStore };
