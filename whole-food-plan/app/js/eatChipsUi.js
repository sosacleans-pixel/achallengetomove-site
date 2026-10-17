import { applyBulkToggle, BULK_TOGGLES, REASONS, defaultEatSelections } from "./masterFood.js";

export function renderEatChipsPanel(masterList, selections, idPrefix = "eat") {
  const sel = selections || defaultEatSelections(masterList);
  const byCat = {};
  for (const item of masterList.eat || []) {
    if (!byCat[item.category]) byCat[item.category] = [];
    byCat[item.category].push(item);
  }
  const toggles = BULK_TOGGLES
    .map(
      (t) =>
        `<button type="button" class="btn btn-secondary btn-small bulk-toggle" data-toggle="${t.id}">${t.label}</button>`
    )
    .join(" ");
  const groups = Object.entries(byCat)
    .map(([cat, items]) => {
      const chips = items
        .map((item) => {
          const s = sel[item.id] || { allowed: true, reason: null };
          const cls = s.allowed ? "selected" : "";
          const reasonRow = !s.allowed
            ? `<select class="eat-reason" data-id="${item.id}" aria-label="Reason for ${item.label}">
            ${REASONS.map((r) => `<option value="${r.id}" ${s.reason === r.id ? "selected" : ""}>${r.label}</option>`).join("")}
          </select>`
            : "";
          return `<div class="eat-chip-wrap">
          <button type="button" class="chip eat-chip ${cls}" data-id="${item.id}">${item.label}</button>
          ${reasonRow}
        </div>`;
        })
        .join("");
      return `<div class="eat-cat"><h3>${cat}</h3><div class="chip-row eat-chip-row">${chips}</div></div>`;
    })
    .join("");
  return `
    <div class="card" id="${idPrefix}-eat-panel">
      <h2>Foods you can't or won't eat</h2>
      <p class="muted">Everything below is on your <strong>Eat</strong> list for the 30-day reset. Uncheck what you need to avoid — we'll build meals and groceries from what's left.</p>
      <div class="chip-row" style="margin-bottom:0.75rem">${toggles}</div>
      <div class="eat-cat-list">${groups}</div>
    </div>
  `;
}

export function readEatSelectionsFromDom(root, prior) {
  const sel = { ...prior };
  root.querySelectorAll(".eat-chip").forEach((btn) => {
    const id = btn.dataset.id;
    const allowed = btn.classList.contains("selected");
    const reasonEl = root.querySelector(`select.eat-reason[data-id="${id}"]`);
    sel[id] = {
      allowed,
      reason: allowed ? null : reasonEl?.value || "dont_eat",
    };
  });
  return sel;
}

export function bindEatChips(root, getSelections, setSelections, masterList, onUpdate) {
  root.querySelectorAll(".eat-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sel = { ...getSelections() };
      const id = btn.dataset.id;
      const cur = sel[id] || { allowed: true };
      sel[id] = { allowed: !cur.allowed, reason: cur.allowed ? "dont_eat" : null };
      setSelections(sel);
      onUpdate();
    });
  });
  root.querySelectorAll(".eat-reason").forEach((sel) => {
    sel.addEventListener("change", () => {
      const selections = { ...getSelections() };
      selections[sel.dataset.id] = {
        allowed: false,
        reason: sel.value,
      };
      setSelections(selections);
    });
  });
  root.querySelectorAll(".bulk-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = applyBulkToggle(getSelections(), masterList, btn.dataset.toggle, false);
      setSelections(next);
      onUpdate();
    });
  });
}
