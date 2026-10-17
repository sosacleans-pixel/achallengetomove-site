import { applyBulkToggle, BULK_TOGGLES, defaultEatSelections } from "./masterFood.js";
import { MACRO_GROUPS, itemsInMacroGroup, countSelectedInGroup, macroGroupForItem } from "./macroGroups.js";

export function renderMacroPickerPanel(masterList, selections, groupId, idPrefix = "macro") {
  const sel = selections || defaultEatSelections(masterList);
  const group = MACRO_GROUPS.find((g) => g.id === groupId) || MACRO_GROUPS[0];
  const items = itemsInMacroGroup(masterList, group.id);
  const selected = countSelectedInGroup(masterList, sel, group.id);
  const min = group.min;
  const countLabel =
    min > 0
      ? `${selected} selected · need at least ${min}`
      : `${selected} selected`;

  const toggles =
    group.id === "protein"
      ? `<div class="chip-row macro-diet-toggles" style="margin-bottom:0.75rem">${BULK_TOGGLES
          .map(
            (t) =>
              `<button type="button" class="btn btn-secondary btn-small bulk-toggle" data-toggle="${t.id}">${t.label}</button>`
          )
          .join(" ")}</div>`
      : "";

  const chips = items
    .map((item) => {
      const s = sel[item.id] || { allowed: true };
      const cls = s.allowed ? "selected" : "";
      const n = item.calories != null ? `~${item.calories} cal` : "";
      return `<button type="button" class="chip eat-chip macro-chip ${cls}" data-id="${item.id}" data-macro-group="${group.id}">
        <span class="macro-chip-label">${item.label}</span>
        ${n ? `<span class="macro-chip-meta muted">${n}</span>` : ""}
      </button>`;
    })
    .join("");

  const minWarn =
    min > 0 && selected < min
      ? `<p class="macro-min-hint" role="status">${group.hint}</p>`
      : `<p class="muted macro-min-hint">${group.hint}</p>`;

  return `
    <div class="card macro-picker-panel" id="${idPrefix}-${group.id}-eat-panel" data-macro-group="${group.id}">
      <div class="macro-step-header">
        <h2>${group.label}</h2>
        <span class="macro-count-badge" id="macro-count-${group.id}">${countLabel}</span>
      </div>
      <p class="muted">Tap foods you <strong>want</strong> in your 30-day plan. Selected chips are included; tap again to remove.</p>
      ${toggles}
      <div class="macro-picker-actions">
        <button type="button" class="btn btn-secondary btn-small macro-select-all" data-group="${group.id}">Select all</button>
        <button type="button" class="btn btn-secondary btn-small macro-clear-all" data-group="${group.id}">Clear all</button>
      </div>
      ${minWarn}
      <div class="chip-row eat-chip-row macro-chip-grid">${chips}</div>
      <nav class="macro-tabs" aria-label="Macro groups">
        ${MACRO_GROUPS
          .map(
            (g) =>
              `<span class="macro-tab ${g.id === group.id ? "on" : ""}" data-macro-tab="${g.id}">${g.shortLabel}</span>`
          )
          .join("")}
      </nav>
    </div>
  `;
}

export function readMacroSelectionsFromDom(root, prior) {
  const sel = { ...prior };
  root.querySelectorAll(".eat-chip").forEach((btn) => {
    const id = btn.dataset.id;
    const allowed = btn.classList.contains("selected");
    sel[id] = { allowed, reason: allowed ? null : "dont_eat" };
  });
  return sel;
}

export function bindMacroPicker(
  root,
  getSelections,
  setSelections,
  masterList,
  groupId,
  onUpdate
) {
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
  root.querySelectorAll(".bulk-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = applyBulkToggle(getSelections(), masterList, btn.dataset.toggle, false);
      setSelections(next);
      onUpdate();
    });
  });
  root.querySelectorAll(".macro-select-all").forEach((btn) => {
    btn.addEventListener("click", () => {
      const gid = btn.dataset.group;
      const sel = { ...getSelections() };
      for (const item of itemsInMacroGroup(masterList, gid)) {
        sel[item.id] = { allowed: true, reason: null };
      }
      setSelections(sel);
      onUpdate();
    });
  });
  root.querySelectorAll(".macro-clear-all").forEach((btn) => {
    btn.addEventListener("click", () => {
      const gid = btn.dataset.group;
      const sel = { ...getSelections() };
      for (const item of itemsInMacroGroup(masterList, gid)) {
        sel[item.id] = { allowed: false, reason: "dont_eat" };
      }
      setSelections(sel);
      onUpdate();
    });
  });
}

export function renderMacroPickerTabsOnly(currentGroupId) {
  return MACRO_GROUPS.map((g) => g.id).indexOf(currentGroupId);
}

/** For foods edit: all groups in accordion */
export function renderMacroPickerAllGroups(masterList, selections, idPrefix = "edit") {
  return MACRO_GROUPS
    .map((g) => {
      const panel = renderMacroPickerPanel(masterList, selections, g.id, `${idPrefix}-${g.id}`);
      return panel.replace('id="' + `${idPrefix}-${g.id}-eat-panel"`, 'id="' + `${idPrefix}-eat-panel-${g.id}"`);
    })
    .join("");
}

export { macroGroupForItem };
