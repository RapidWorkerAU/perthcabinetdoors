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

// What a finished panel is made from when neither it nor the doors say.
const FINISHED_PANEL_THICKNESS_MM = 18;

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
    // An override that names a different colour cannot keep the board the
    // panel was matching. Its own library row or none: a source label naming a
    // board we did not price from is worse than a blank one, because the quote
    // editor reads the supplier back out of it.
    colourLibraryId: o.colour ? o.colour_library_id || null : base.colourLibraryId,
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
    // 18mm last, not the carcass thickness. A finished panel is a front-grade
    // board: it matches the doors, and where nothing says otherwise the design
    // tool's own default for a finished panel is 18mm (see MaterialDefaultsModal).
    // Falling back to a 16mm carcass quoted a finished end thinner than the door
    // beside it.
    thicknessMm: fp.thickness_mm || d.thickness_mm || FINISHED_PANEL_THICKNESS_MM,
    rate: Number(fp.cost_per_sqm) || Number(d.cost_per_sqm) || Number(item.cost_per_sqm_carcass) || 0,
    // WHICH LIBRARY ROW THIS PANEL IS, down the same chain as the material. A
    // rate alone can be repriced only by matching five loose strings back to a
    // colour; the row id prices it exactly, and it is what the website's own
    // path always carried for a panel while the importer carried nothing.
    colourLibraryId: fp.colour_library_id || d.colour_library_id || item.colour_library_id || null,
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
    colourLibraryId: item.colour_library_id || null,
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
    // Named the same way every other design-sourced line names it, so a panel
    // reads identically in the Source column and reprices off the same id.
    // See designSourcePatch in lib/pcd-board-cost.js.
    ...(board.colourLibraryId
      ? {
          unit_cost_source_id: board.colourLibraryId,
          unit_cost_source_label: [board.supplier_name, board.colour].filter(Boolean).join(" - "),
        }
      : {}),
  };
}
