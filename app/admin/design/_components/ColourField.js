"use client";

// A compact colour control for the config sidebar: a one-line summary of the
// current finish plus a "Set colour" button. The full material / thickness /
// finish / colour fields live in a modal instead of cluttering the panel, and
// the modal offers a "Match an existing finish" shortcut to copy any colour
// already used elsewhere on the project.

import { useState } from "react";
import MaterialColourPicker from "./MaterialColourPicker";
import styles from "../design.module.css";

function styleSummary(style) {
  if (!style) return null;
  const parts = [style.colour, style.finish, style.material].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function hasColour(style) {
  return Boolean(style && (style.material || style.colour));
}

export default function ColourField({
  label,
  value,
  onChange,
  matchOptions = [],
  matchHint,       // shown (muted) when nothing is set — e.g. "Matches carcass"
  canReset = false, // show a "Reset to match" action (for override fields)
  thicknessDefault = 16,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || {});

  const summary = styleSummary(value);

  function openModal() { setDraft(value || {}); setOpen(true); }
  function save() {
    onChange(hasColour(draft) ? draft : null);
    setOpen(false);
  }
  function reset() { onChange(null); setOpen(false); }

  return (
    <div className={styles.colourField}>
      <div className={styles.colourFieldTop}>
        <span className={styles.colourFieldLabel}>{label}</span>
        <button type="button" className={styles.colourFieldBtn} onClick={openModal}>
          {summary ? "Change" : "Set colour"}
        </button>
      </div>
      <div className={styles.colourFieldSummary}>
        {summary || <span className={styles.colourFieldMuted}>{matchHint || "Not set"}</span>}
      </div>

      {open && (
        <div className={styles.colourModalOverlay} onClick={() => setOpen(false)}>
          <div className={styles.colourModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.colourModalHeader}>
              <span>Set {label}</span>
              <button type="button" className={styles.colourModalClose} onClick={() => setOpen(false)} aria-label="Close">×</button>
            </div>
            <div className={styles.colourModalBody}>
              {matchOptions.length > 0 && (
                <label className={styles.fieldLabel}>
                  Match an existing finish
                  <select
                    className={styles.fieldSelect}
                    value=""
                    onChange={(e) => {
                      const opt = matchOptions[Number(e.target.value)];
                      if (opt) setDraft({ ...opt.style });
                    }}
                  >
                    <option value="">— copy a colour used elsewhere —</option>
                    {matchOptions.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
                  </select>
                </label>
              )}
              <MaterialColourPicker
                label="Material & colour"
                material={draft.material || ""}
                thickness={draft.thickness_mm ? `${draft.thickness_mm}mm` : ""}
                finish={draft.finish || ""}
                colour={draft.colour || ""}
                onChange={({ material, thickness, finish, colour, costPerSqmExGst }) =>
                  setDraft((d) => ({
                    ...d,
                    material, finish, colour,
                    thickness_mm: parseInt(thickness) || d.thickness_mm || thicknessDefault,
                    cost_per_sqm: Number(costPerSqmExGst) || 0,
                  }))
                }
              />
              <label className={styles.fieldLabel}>
                Cost per sqm ex GST ($)
                <input
                  className={styles.fieldInput} type="number" min="0" step="0.01"
                  value={draft.cost_per_sqm ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, cost_per_sqm: Number(e.target.value) }))}
                />
              </label>
            </div>
            <div className={styles.colourModalFooter}>
              {canReset && (hasColour(value) || hasColour(draft)) && (
                <button type="button" className={styles.colourModalReset} onClick={reset}>Reset to match</button>
              )}
              <span style={{ flex: 1 }} />
              <button type="button" className={styles.colourModalCancel} onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className={styles.colourModalSave} onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Builds the "match an existing finish" list from every colour already used on
// the project (this cabinet's parts first, then the rest), de-duplicated.
export function collectMatchOptions(allItems, draft) {
  const out = [];
  const seen = new Set();
  const add = (role, style) => {
    if (!style || (!style.material && !style.colour)) return;
    const key = `${style.material || ""}|${style.finish || ""}|${style.colour || ""}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const name = [style.colour, style.finish].filter(Boolean).join(" ") || style.material;
    out.push({ label: `${role}: ${name}`, style: { material: style.material, finish: style.finish, colour: style.colour, thickness_mm: style.thickness_mm, cost_per_sqm: style.cost_per_sqm } });
  };
  if (draft) {
    add("This cabinet — carcass", { material: draft.material, finish: draft.finish, colour: draft.colour, thickness_mm: draft.carcass_thickness_mm, cost_per_sqm: draft.cost_per_sqm_carcass });
    add("This cabinet — doors", draft.door_style);
    add("This cabinet — drawers", draft.drawer_style);
  }
  for (const it of allItems || []) {
    add("Carcass", { material: it.material, finish: it.finish, colour: it.colour, thickness_mm: it.carcass_thickness_mm });
    add("Doors", it.door_style);
    add("Drawers", it.drawer_style);
    add("End panel", it.finish_panel_style);
  }
  return out;
}
