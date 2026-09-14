// Per-panel settings for a design item.
//
// A cabinet's applied panels used to share one pair of flags: panel_to_floor
// and panel_to_ceiling applied to every finished panel at once. That is wrong
// in an ordinary kitchen — the exposed left end runs to the floor while the
// right end dies into an appliance, and the back panel behind an island runs
// to the floor whatever the ends do.
//
// So each panel now carries its own settings in a `panel_options` map, keyed by
// the panel keys below:
//
//   { end_left: { to_floor: true }, back: { to_floor: true, profile: "..." } }
//
// Anything absent falls back to the old item-level flags, so designs drawn
// before this keep the exact geometry they had. Colour is NOT here — a panel's
// colour still lives in its style object, set in Colours & finishes.

import { hasKickboard, isCornerType } from "./pcd-kickboard-utils";
import { BANDED_EDGES, bandedEdgeList } from "./pcd-line-details";

const isWall = (item) => item?.item_type === "wall_cabinet";

// The panels a cabinet can carry, in the order they appear in the Panels
// window's left menu. Each entry says:
//   enabledBy   the item field that switches this panel on
//   vertical    whether "run to floor" / "run to ceiling" mean anything for it
//               (a kickboard already sits on the floor, a filler already runs
//               to the ceiling, a top/underside is fixed to the carcass face)
//   flat        the panel lies horizontally, so it has no upright face and
//               cannot carry a shaped 3D profile
//   styleKey    the style object holding this panel's colour
//   board       which board it is cut from when it has no colour of its own
//   applies     which items can have it — the same conditions the sidebar
//               toggles use, so the menu can never offer a panel the sidebar
//               cannot switch on
export const PANEL_DEFS = [
  {
    key: "end_left", enabledBy: "end_panel_left", vertical: true, use: "End panel",
    styleKey: "end_left_style", board: "finish",
    applies: (item) => isCornerType(item) || isWall(item) || ["base_cabinet", "tall_cabinet", "blind_corner_cabinet"].includes(item.item_type),
    label: (item) => {
      if (isCornerType(item)) return `Wall 1 end panel${item.wall ? ` (${item.wall})` : ""}`;
      return isWall(item) ? "Left side panel" : "Left end panel";
    },
  },
  {
    key: "end_right", enabledBy: "end_panel_right", vertical: true, use: "End panel",
    styleKey: "end_right_style", board: "finish",
    applies: (item) => isCornerType(item) || isWall(item) || ["base_cabinet", "tall_cabinet", "blind_corner_cabinet"].includes(item.item_type),
    label: (item) => {
      if (isCornerType(item)) return `Wall 2 end panel${item.secondary_wall ? ` (${item.secondary_wall})` : ""}`;
      return isWall(item) ? "Right side panel" : "Right end panel";
    },
  },
  {
    key: "back", enabledBy: "has_back_panel", vertical: true, use: "Back panel",
    styleKey: "back_panel_style", board: "finish",
    applies: (item) => ["base_cabinet", "tall_cabinet", "blind_corner_cabinet"].includes(item.item_type),
    label: () => "Finished back panel",
  },
  {
    key: "back_wall1", enabledBy: "back_panel_wall1", vertical: true, use: "Back panel",
    styleKey: "back_panel_style", board: "finish",
    applies: (item) => isCornerType(item),
    label: (item) => `Wall 1 finished back${item.wall ? ` (${item.wall})` : ""}`,
  },
  {
    key: "back_wall2", enabledBy: "back_panel_wall2", vertical: true, use: "Back panel",
    styleKey: "back_panel_style", board: "finish",
    applies: (item) => isCornerType(item),
    label: (item) => `Wall 2 finished back${item.secondary_wall ? ` (${item.secondary_wall})` : ""}`,
  },
  {
    key: "kickboard", enabledBy: "has_kickboard", vertical: false, use: "Kickboard",
    styleKey: "kickboard_style", board: "carcass", thicknessField: "kickboard_thickness_mm",
    applies: (item) => !isWall(item),
    label: () => "Kickboard / plinth",
  },
  {
    key: "filler", enabledBy: "has_filler_panel", vertical: false, use: "Filler",
    styleKey: "filler_panel_style", board: "carcass", thicknessField: "filler_panel_thickness_mm",
    applies: (item) => ["wall_cabinet", "tall_cabinet", "corner_tall_cabinet"].includes(item.item_type),
    label: () => "Filler panel",
  },
  {
    key: "top", enabledBy: "has_top_panel", vertical: false, flat: true,
    styleKey: "top_panel_style", board: "finish",
    applies: isWall,
    label: () => "Top panel",
  },
  {
    key: "underside", enabledBy: "has_bottom_panel", vertical: false, flat: true,
    styleKey: "bottom_panel_style", board: "finish",
    applies: isWall,
    label: () => "Underside panel",
  },
  {
    key: "side_filler_left", enabledBy: "side_filler_left", vertical: true, use: "Filler",
    styleKey: "finish_panel_style", board: "finish",
    applies: (item) => !isCornerType(item),
    label: () => "Left side filler",
  },
  {
    key: "side_filler_right", enabledBy: "side_filler_right", vertical: true, use: "Filler",
    styleKey: "finish_panel_style", board: "finish",
    applies: (item) => !isCornerType(item),
    label: () => "Right side filler",
  },
];

// ── THE APPLIED PANELS THAT HAVE A PROJECT DEFAULT ──────────────────────────
//
// A kickboard and a filler are cut from the cabinet's carcass when nothing says
// otherwise, and a finished panel from the door board. That is fine until a job
// wants every kickboard black, at which point it had to be picked on every
// cabinet one at a time, and Material Defaults could not reach it: half the
// kickboards on the live projects were carrying a colour of their own that
// nothing but a hand edit would ever change again.
//
// So each of these can be set once for the project. Left blank they follow what
// they always followed, which is why an existing job sees no change.
//
// ONE DEFINITION, read by the Material Defaults modal, by the new-item filler
// and by apply-to-all, because three copies of a list like this is how two of
// them end up right.
export const PANEL_STYLE_DEFAULTS = [
  {
    key: "kickboard", label: "Kickboards", styleKey: "kickboard_style",
    thicknessField: "kickboard_thickness_mm", thicknessDefault: 16,
    follows: "the cabinet's own carcass board",
    applies: (item) => !isWall(item),
    clears: [],
  },
  {
    key: "filler_panel", label: "Filler Panels", styleKey: "filler_panel_style",
    thicknessField: "filler_panel_thickness_mm", thicknessDefault: 16,
    follows: "the cabinet's own carcass board",
    applies: (item) => ["wall_cabinet", "tall_cabinet", "corner_tall_cabinet"].includes(item?.item_type),
    clears: [],
  },
  {
    key: "finish_panel", label: "Finished Panels", styleKey: "finish_panel_style",
    thicknessField: null, thicknessDefault: 18,
    follows: "the doors",
    applies: () => true,
    // A colour picked on ONE end panel beats finish_panel_style, so forcing the
    // project default in has to clear those too or nothing on screen moves.
    clears: ["end_left_style", "end_right_style", "back_panel_style", "top_panel_style", "bottom_panel_style"],
  },
];

/** The style object to store for one of the above, from a defaults bucket. */
export function panelStyleFromDefault(def, bucket) {
  const material = String(bucket?.material || "").trim();
  if (!material) return null;
  const style = {
    material,
    finish: String(bucket.finish || "").trim(),
    colour: String(bucket.colour || "").trim(),
  };
  if (bucket.thickness_mm) style.thickness_mm = Number(bucket.thickness_mm);
  if (bucket.cost_per_sqm != null) style.cost_per_sqm = Number(bucket.cost_per_sqm) || 0;
  if (bucket.colour_library_id) style.colour_library_id = bucket.colour_library_id;
  const supplier = String(bucket.supplier || bucket.supplier_name || "").trim();
  if (supplier) style.supplier = supplier;
  return style;
}

const BY_KEY = new Map(PANEL_DEFS.map((d) => [d.key, d]));

export function panelDef(panelKey) {
  return BY_KEY.get(panelKey) || null;
}

// The panels this item currently has switched on, in menu order. Drives the
// Panels window's left list, so the list is exactly the panels the sidebar
// toggles have enabled — nothing to configure that isn't on.
export function enabledPanels(item) {
  if (!item) return [];
  return PANEL_DEFS
    .filter((d) => d.applies(item) && Boolean(item[d.enabledBy]))
    .map((d) => ({ ...d, label: d.label(item) }));
}

/**
 * WHICH EDGES OF THIS PANEL GET TAPE.
 *
 * Kept in the panel's own settings beside its reach and profile, because a
 * finished end and the filler above it are separate boards and are regularly
 * edged differently. Nothing stored means nobody changed it, which is all four,
 * our standard, so a panel always arrives on the quote with a real answer.
 * Whether the panel is taped at all is the board's question, not this one: see
 * lineBandedEdges.
 */
export function panelBandedEdges(item, panelKey) {
  const stored = panelOption(item, panelKey).banded_edges;
  return Array.isArray(stored) ? bandedEdgeList(stored) : [...BANDED_EDGES];
}

/**
 * The edges taped on an item's OWN board: a cabinet's doors and drawer fronts,
 * or a standalone panel or scribe. All four until somebody changes it.
 */
export function itemBandedEdges(item) {
  return Array.isArray(item?.banded_edges) ? bandedEdgeList(item.banded_edges) : [...BANDED_EDGES];
}

/**
 * The banded edges a LINE carries: the edges, on decorative board, and nothing
 * on anything else. Thermolaminate is wrapped and compact laminate is solid
 * through, so an answer on either would be an instruction nobody can follow.
 */
export function lineBandedEdges(material, edges) {
  return String(material || "").trim().toLowerCase() === "decorative board" ? edges : null;
}

/** What a panel's board needs to carry onto its line besides the board. */
export function panelBoardAnswers(item, panelKey) {
  if (!panelKey) return {};
  return { panelKey, panelUse: panelDef(panelKey)?.use || "", bandedEdges: panelBandedEdges(item, panelKey) };
}

// One panel's stored settings, or an empty object. Never returns null so
// callers can read straight through it.
export function panelOption(item, panelKey) {
  const opts = item?.panel_options;
  if (!opts || !panelKey || typeof opts !== "object") return {};
  const o = opts[panelKey];
  return o && typeof o === "object" ? o : {};
}

// Whether one panel runs to the floor / to the ceiling.
//
// Falls back to the item-level panel_to_floor / panel_to_ceiling whenever this
// panel has no answer of its own, which is what keeps every design drawn before
// per-panel settings existed rendering and pricing exactly as it did.
export function panelReach(item, panelKey) {
  const o = panelOption(item, panelKey);
  return {
    toFloor:   o.to_floor   != null ? Boolean(o.to_floor)   : Boolean(item?.panel_to_floor),
    toCeiling: o.to_ceiling != null ? Boolean(o.to_ceiling) : Boolean(item?.panel_to_ceiling),
  };
}

// One panel's routed profile. Panels that share a colour can still differ here
// — the two ends of a cabinet come off the same board but only one of them may
// be shaker — which is why the profile is keyed per panel and the colour isn't.
export function panelProfile(item, panelKey) {
  const o = panelOption(item, panelKey);
  return { profile_type: o.profile_type || "", profile: o.profile || "" };
}

// Merges a patch into one panel's settings and returns the whole map, ready to
// save. Blank strings and nulls are dropped so an untouched panel stays absent
// from the map and keeps inheriting the item-level flags.
export function withPanelOption(item, panelKey, patch) {
  const opts = { ...(item?.panel_options && typeof item.panel_options === "object" ? item.panel_options : {}) };
  const next = { ...(opts[panelKey] || {}), ...patch };
  for (const [k, v] of Object.entries(next)) {
    // An empty list is kept: no edges taped is an answer, not a blank.
    if (v === null || v === undefined || v === "") delete next[k];
  }
  if (Object.keys(next).length) opts[panelKey] = next;
  else delete opts[panelKey];
  return opts;
}

// Whether a panel needs a kickboard piece made to close the toe-kick recess
// behind it. A panel running to the floor closes its own recess and needs none.
export function panelNeedsKickboard(item, panelKey) {
  if (!hasKickboard(item)) return false;
  return !panelReach(item, panelKey).toFloor;
}

// The visual 3D profile a panel is drawn with — slab, shaker, bevel, VJ.
//
// Deliberately SEPARATE from profile_type / profile above. Those name a real
// routed profile out of the library and reach the quote and the cut list; this
// one is a drawing choice for the 3D view and nothing else, exactly as it is for
// doors and drawer fronts. A panel can carry one, the other, both or neither.
export function panelFrontProfile(item, panelKey) {
  return panelOption(item, panelKey).front_profile || "slab";
}

// Whether this panel has an upright face for a 3D profile to be shaped into. A
// top or underside panel lies flat, so it doesn't.
export function panelTakesFrontProfile(panelKey) {
  const def = panelDef(panelKey);
  return Boolean(def) && !def.flat;
}
