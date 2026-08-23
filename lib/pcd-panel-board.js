// Which board a finished panel is actually made from, on its way into a quote.
//
// A cabinet's panels don't all come from the same place. Kickboards and
// fillers match the carcass; end, back, top and underside panels are their own
// finished board over the carcass (finish_panel_style), which in turn falls
// back to the door material and only then to the carcass. On top of all that,
// the design tool lets each piece be overridden individually — a kickboard in
// its own colour, a back panel in another.
//
// This module is the one place that resolves all of it, so the plan, the quote
// and the cut list can't drift apart on what a panel is made from.

import { panelProfile } from "./pcd-panel-options";

export function styleSupplierName(style = {}) {
  return String(style.supplier_name || style.supplier || "").trim();
}

// A per-piece COLOUR override beats whatever the piece would otherwise match.
// Blank fields inside it fall through to the default board, so setting just a
// colour keeps the default rate and thickness. An empty override means "match",
// which is the default state of every one of them.
//
// The profile is deliberately not here. A cabinet's two ends come off one
// finish_panel_style but are separate panels that can be routed differently, so
// the profile is keyed per panel instead (see panelProfile below).
export function applyPanelOverride(base, override) {
  const o = override || {};
  if (!o.material && !o.colour) return base;
  return {
    ...base,
    material: o.material || base.material,
    supplier_name: styleSupplierName(o) || base.supplier_name,
    finish: o.finish || base.finish,
    colour: o.colour || base.colour,
    thicknessMm: o.thickness_mm || base.thicknessMm,
    rate: Number(o.cost_per_sqm) || base.rate,
  };
}

// The finished-panel board: finish_panel_style, then the door/front material
// (its normal match), then the carcass. `overrideKey` names the per-piece
// colour override that beats all of it, when the designer set one; `panelKey`
// names which panel this is, which is where the profile comes from.
export function finishPanelBoard(item, overrideKey = null, panelKey = null) {
  const fp = item.finish_panel_style || {};
  const d = item.door_style || {};
  const base = {
    material: fp.material || d.material || item.material || "",
    supplier_name: styleSupplierName(fp) || styleSupplierName(d) || styleSupplierName(item),
    finish: fp.finish || d.finish || item.finish || "",
    colour: fp.colour || d.colour || item.colour || "",
    thicknessMm: fp.thickness_mm || d.thickness_mm || item.carcass_thickness_mm || null,
    rate: Number(fp.cost_per_sqm) || Number(d.cost_per_sqm) || Number(item.cost_per_sqm_carcass) || 0,
    // A profile does NOT inherit from the doors, unlike the material chain
    // above. Shaker doors don't imply shaker side panels, and assuming one
    // would quietly add routing cost to every quote with a finished end.
    ...panelProfile(item, panelKey),
  };
  return applyPanelOverride(base, overrideKey ? item[overrideKey] : null);
}

// The carcass board, for the pieces that match the carcass by default:
// kickboards and filler panels.
export function carcassPanelBoard(item, overrideKey, thicknessMm, panelKey = null) {
  return applyPanelOverride({
    material: item.material || "",
    supplier_name: styleSupplierName(item),
    finish: item.finish || "",
    colour: item.colour || "",
    thicknessMm: thicknessMm || null,
    rate: Number(item.cost_per_sqm_carcass) || 0,
    ...panelProfile(item, panelKey),
  }, item[overrideKey]);
}

// The board fields every panel line shares, so a board reaches the quote whole
// — profile included, which is what the cut list prices the routing from.
export function panelBoardFields(board) {
  return {
    material: board.material,
    supplier_name: board.supplier_name,
    finish: board.finish,
    colour: board.colour,
    thickness: board.thicknessMm ? `${board.thicknessMm}mm` : "",
    profile_type: board.profile_type || "",
    profile: board.profile || "",
    unit_cost_per_sqm_ex_gst: board.rate,
    unit_cost_mode: "auto",
  };
}
