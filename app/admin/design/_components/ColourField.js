"use client";

// A compact colour control for the config sidebar: a one-line summary of the
// current finish plus a "Set colour" button. The full material / thickness /
// finish / colour fields live in a modal instead of cluttering the panel, and
// the modal offers a "Match an existing finish" shortcut to copy any colour
// already used elsewhere on the project.

import { useState } from "react";
import ColourPickerModal from "../../../../components/ColourPickerModal";
import { styleColourSrc } from "../../../../lib/pcd-colour-images";
import styles from "../design.module.css";

// The clean subtitle the public tool shows: just the colour name, plus the
// thickness (the one bit of extra detail the backend carries that the public
// doesn't) — not the full material · finish · board chain.
function styleSummary(style) {
  if (!style) return null;
  const name = style.colour || style.material;
  if (!name) return null;
  return style.thickness_mm ? `${name} · ${style.thickness_mm}mm` : name;
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
  colourImages = null, // map for resolving the swatch image (optional)
  hex = null,          // a flat colour swatch fallback (e.g. benchtop flat colour)
  allowFlat = false,   // offer a "flat colour" option inside the picker modal
  onFlat = null,       // called with a hex when a flat colour is picked
  notice = null,       // when set, opening shows this message in the modal (no picker)
  onlyThicknessMm = null, // restrict to library colours stocked in this thickness
}) {
  const [open, setOpen] = useState(false);
  const summary = styleSummary(value) || (hex ? "Flat colour" : null);
  const src = styleColourSrc(colourImages, value);

  // A clean row — swatch · bold name · muted colour name · Change — matching
  // the public planner (no boxed card). Any extra config (door profile / edge
  // mould, benchtop material) is rendered by the caller under this row.
  return (
    <div style={{ padding: "7px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            width: 38, height: 38, borderRadius: 8, flexShrink: 0,
            border: "1px solid var(--dt-border, rgba(0,0,0,0.14))",
            background: src ? `center/cover no-repeat url(${src})` : (hex || "var(--dt-bg, #f1efe9)"),
          }}
        />
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dt-text, #292524)" }}>{label}</span>
          <span style={{ fontSize: 11.5, color: "var(--dt-text-muted, #a8a29e)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {summary || (matchHint || "Not set")}
          </span>
        </span>
        <span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <button type="button" className={styles.colourFieldBtn} onClick={() => setOpen(true)}>
            {summary ? "Change" : "Set colour"}
          </button>
        </span>
      </div>

      {open && (
        <ColourPickerModal
          mode="admin"
          title={label}
          value={value}
          matchOptions={matchOptions}
          thicknessDefault={thicknessDefault}
          showCost={!hideCost}
          allowFlat={allowFlat}
          flatValue={hex}
          onPickFlat={onFlat ? (h) => { onFlat(h); setOpen(false); } : undefined}
          canReset={canReset}
          onClear={canReset ? () => { onChange(null); setOpen(false); } : undefined}
          notice={notice}
          onlyThicknessMm={onlyThicknessMm}
          // Merge the picked colour INTO the existing style so sibling fields
          // (profile on a door style, etc.) are preserved — exactly as the old
          // draft-merge did.
          onPick={(picked) => { onChange(hasColour(picked) ? { ...(value || {}), ...picked } : null); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
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
    add(`${prefix}top panel`, it.top_panel_style);
    add(`${prefix}back panel`, it.back_panel_style);
    add(`${prefix}benchtop`, it.benchtop_colour_style);
  };
  addItem("This cabinet — ", draft);
  for (const it of allItems || []) addItem("", it);
  return out;
}
