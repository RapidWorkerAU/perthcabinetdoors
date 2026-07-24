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
  hideCost = false, // for visual-only selections (e.g. the benchtop colour)
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
              {!hideCost && (
                <label className={styles.fieldLabel}>
                  Cost per sqm ex GST ($)
                  <input
                    className={styles.fieldInput} type="number" min="0" step="0.01"
                    value={draft.cost_per_sqm ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, cost_per_sqm: Number(e.target.value) }))}
                  />
                </label>
              )}
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

// Builds the "match an existing finish" list from EVERY library colour used
// anywhere in the design — carcass, doors, drawers, shelves, every applied
// panel and the benchtop — this cabinet's parts first, then the rest,
// de-duplicated. (Flat hex colours aren't library finishes, so they're not
// offered here — there's nothing for the library picker to copy.)
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
  // Every library finish one item carries, across all its parts.
  const addItem = (prefix, it) => {
    if (!it) return;
    add(`${prefix}carcass`, { material: it.material, finish: it.finish, colour: it.colour, thickness_mm: it.carcass_thickness_mm, cost_per_sqm: it.cost_per_sqm_carcass });
    add(`${prefix}doors`, it.door_style);
    add(`${prefix}drawers`, it.drawer_style);
    add(`${prefix}shelf`, { material: it.shelf_material, finish: it.shelf_finish, colour: it.shelf_colour, thickness_mm: it.shelf_thickness_mm });
    add(`${prefix}end panel`, it.finish_panel_style);
    add(`${prefix}filler`, it.filler_panel_style);
    add(`${prefix}kickboard`, it.kickboard_style);
    add(`${prefix}underside`, it.bottom_panel_style);
    add(`${prefix}back panel`, it.back_panel_style);
    add(`${prefix}benchtop`, it.benchtop_colour_style);
  };
  addItem("This cabinet — ", draft);
  for (const it of allItems || []) addItem("", it);
  return out;
}
