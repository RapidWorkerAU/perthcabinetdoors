// Shelf & Rail — the wardrobe module that spans an opening rather than standing
// on the floor. A shelf carried on cleats, with an optional front rail on its
// leading edge, dropped between two towers, a tower and a wall, or two walls.
//
// This is the single source of truth for how one breaks down into boards, what
// each end lands on, and when a span needs help — used to draw it, cut it and
// price it, so the drawing, the cut list and the quote can never disagree.
//
// The two structural facts that shape everything here:
//
//   1. A cleat puts the load in BEARING, not screw pull-out. The shelf sits on
//      top of the cleat, so the weight goes into the fixings in shear rather
//      than trying to withdraw them from the edge of a sheet of particleboard.
//      That's why every end has a cleat rather than the shelf being butted and
//      screwed through.
//
//   2. A front rail's stiffening comes from its DEPTH, and section stiffness
//      goes with depth cubed — a 100mm rail is roughly four times the help of a
//      65mm one, not 50% more. It is structure, not trim.
//
// Melamine particleboard also CREEPS: it sags roughly 50% further over time
// under sustained load, and a robe shelf is loaded permanently. The span limits
// below are set with that in mind rather than at the instantaneous limit.

import { getWallAxisPos, islandVirtualWall, mountHeightMm, wallSpanMm, cabinetVerticalSpanMm } from "./pcd-kickboard-utils";

// Cleats are always 18mm — they're the structural part, so they don't follow
// the shelf down to 16mm even when the shelf board is 16.
export const CLEAT_THICKNESS_MM = 18;

export const SHELF_RAIL_DEFAULTS = {
  width_mm: 900,          // clear span; "Fit to opening" replaces this
  depth_mm: 500,          // robe depth — deeper than a kitchen shelf
  shelf_thickness_mm: 18, // follows the chosen board; 16 or 18
  rail_height_mm: 100,    // cleats AND front rail — one strip, one number
  front_rail_setback_mm: 20, // shadow line, so the shelf edge reads as the front
  // The classic AU single-hang robe shelf, measured to the TOP of the shelf.
  // Stored as a mount height (the underside of the cleats) — see mountForShelfTopMm.
  shelf_top_mm: 1800,
};

// Maximum clear span before the shelf wants help, by board thickness. Warnings,
// never blocks — the drawing can't see whether a stud landed where you needed
// one. Kept here as data so they can move to business defaults without touching
// any of the callers.
export const SPAN_LIMITS_MM = {
  16: { bare: 700, railed: 1000 },
  18: { bare: 900, railed: 1200 },
};

export function shelfThicknessMm(item) {
  return Number(item?.carcass_thickness_mm) || SHELF_RAIL_DEFAULTS.shelf_thickness_mm;
}

// The stored config, with every field defaulted — so callers never have to
// guard on a null config or a partially-filled one from an older row.
export function shelfRailConfig(item) {
  const c = item?.shelf_rail_config || {};
  const fr = c.front_rail || {};
  return {
    left_support:  c.left_support  || "wall",
    right_support: c.right_support || "wall",
    back_cleat:      c.back_cleat      !== false,
    end_cleat_left:  c.end_cleat_left  !== false,
    end_cleat_right: c.end_cleat_right !== false,
    rail_height_mm: Number(c.rail_height_mm) || SHELF_RAIL_DEFAULTS.rail_height_mm,
    cleat_thickness_mm: CLEAT_THICKNESS_MM,
    front_rail: {
      on: fr.on !== false,
      setback_mm: Number.isFinite(Number(fr.setback_mm)) ? Number(fr.setback_mm) : SHELF_RAIL_DEFAULTS.front_rail_setback_mm,
    },
    cleat_style: c.cleat_style || null,
    rails: Array.isArray(c.rails) ? c.rails : [],
  };
}

// The module's overall height is DERIVED, never entered: the cleats hang below
// the shelf and the shelf sits on top of them, so the assembly is exactly one
// rail height plus one board thickness. Both are fixed standards, which is why
// there's no height field on the form.
export function shelfRailHeightMm(item) {
  return shelfRailConfig(item).rail_height_mm + shelfThicknessMm(item);
}

// The form asks for the height of the TOP OF THE SHELF, because that's the
// number on a robe drawing. The tool stores mount_height_mm (the underside of
// the assembly) like every other item, so the two convert here rather than at
// each call site.
export function mountForShelfTopMm(item, shelfTopMm) {
  return Math.max(0, Math.round(Number(shelfTopMm) || 0) - shelfRailHeightMm(item));
}
export function shelfTopMm(item) {
  return mountHeightMm(item) + shelfRailHeightMm(item);
}

// The board pieces, each with its finished face dimensions and a fixing note.
// Cleat lengths stop at the back face of the front rail — the rail runs the
// full clear span between the two ends and the end cleats butt into it.
export function shelfRailBoards(item) {
  const span  = Math.round(Number(item?.width_mm) || 0);
  const depth = Math.round(Number(item?.depth_mm) || 0);
  const cfg = shelfRailConfig(item);
  const rh = cfg.rail_height_mm;
  if (!span || !depth) return [];

  const railAllowance = cfg.front_rail.on ? cfg.front_rail.setback_mm + cfg.cleat_thickness_mm : 0;
  const cleatLength = Math.max(0, depth - railAllowance);

  const boards = [
    { part: "shelf", label: "Shelf", width_mm: span, height_mm: depth, material: "shelf", note: "Sits on the cleats — screw down from above." },
  ];
  if (cfg.back_cleat) {
    boards.push({ part: "cleat-back", label: "Back cleat", width_mm: span, height_mm: rh, material: "cleat", note: "Fix to the wall — into studs where they land." });
  }
  const endNote = (support) =>
    support === "cabinet" ? "Fix to the cabinet gable FACE — not its edge."
      : support === "panel" ? "Fix to the panel face — the panel must be restrained top and bottom."
      : support === "open" ? "NO SUPPORT AT THIS END — add a gable or land it on something."
      : "Fix to the wall — into studs where they land.";
  if (cfg.end_cleat_left) {
    boards.push({ part: "cleat-left", label: "End cleat — left", width_mm: cleatLength, height_mm: rh, material: "cleat", note: endNote(cfg.left_support) });
  }
  if (cfg.end_cleat_right) {
    boards.push({ part: "cleat-right", label: "End cleat — right", width_mm: cleatLength, height_mm: rh, material: "cleat", note: endNote(cfg.right_support) });
  }
  if (cfg.front_rail.on) {
    boards.push({
      part: "front-rail",
      label: "Front rail",
      width_mm: span,
      height_mm: rh,
      material: "cleat",
      note: `Set back ${cfg.front_rail.setback_mm}mm from the shelf's front edge. Glue and fix along its full length — it only stiffens the shelf if it acts with it.`,
    });
  }
  return boards;
}

export function shelfRailAreaSqm(item) {
  return shelfRailBoards(item).reduce((sum, b) => sum + (b.width_mm * b.height_mm) / 1e6, 0);
}

// The shelf board's own finish (base material columns, same shape a panel uses).
export function shelfRailStyle(item) {
  return {
    material: item?.material || "",
    finish: item?.finish || "",
    colour: item?.colour || "",
    thickness_mm: shelfThicknessMm(item),
    cost_per_sqm: Number(item?.cost_per_sqm_carcass) || 0,
  };
}

// The cleats' finish — their own if one was picked, otherwise the shelf's. Note
// the thickness is always 18 regardless of what the shelf is.
export function cleatStyle(item) {
  const cfg = shelfRailConfig(item);
  const s = cfg.cleat_style;
  const base = (s && (s.material || s.colour)) ? s : shelfRailStyle(item);
  return {
    material: base.material || "",
    finish: base.finish || "",
    colour: base.colour || "",
    thickness_mm: CLEAT_THICKNESS_MM,
    cost_per_sqm: Number(base.cost_per_sqm) || Number(item?.cost_per_sqm_carcass) || 0,
  };
}

// ---- Where each end lands -------------------------------------------------
//
// Detection is a DEFAULT, never a lock: the drawing can tell you a tower is
// there, but it can't tell you whether there's a stud behind the plasterboard,
// so the user always gets the final say.

const SUPPORTING_TYPES = new Set([
  "base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet",
  "corner_tall_cabinet", "blind_corner_cabinet", "bookcase",
]);

function supportKindFor(other) {
  if (!other) return null;
  if (SUPPORTING_TYPES.has(other.item_type)) return "cabinet";
  if (other.item_type === "panel") return "panel";
  return null;
}

// Along-wall extent of any item, for neighbour comparison — mirrors the same
// idea fillerPanelGapMm uses vertically.
function wallSegment(it) {
  const wall = it.wall === "island" ? islandVirtualWall(it) : it.wall;
  return { wall, axisPos: getWallAxisPos(it), length: wallSpanMm(it) };
}

// Does `other` cover the height the shelf sits at? A tower only supports the
// shelf if it actually reaches it.
function coversHeight(other, atMm) {
  const [b, t] = cabinetVerticalSpanMm(other);
  return b <= atMm && t >= atMm;
}

const ABUT_TOL_MM = 40;

// What sits immediately left and right of this shelf, at its own height, on its
// own wall. Returns { left, right } as "cabinet" | "panel" | "wall" | "open".
// "wall" when it reaches the room's edge; "open" when there's simply nothing.
export function detectSupports(item, allItems = [], room = null) {
  const seg = wallSegment(item);
  const at = shelfTopMm(item) - 1; // just under the shelf, where a cleat lands
  const start = seg.axisPos;
  const end = seg.axisPos + seg.length;

  let left = null, right = null;
  for (const o of allItems) {
    if (!o || o.id === item.id || o.room_id !== item.room_id) continue;
    const oSeg = wallSegment(o);
    if (oSeg.wall !== seg.wall) continue;
    const kind = supportKindFor(o);
    if (!kind) continue;
    if (!coversHeight(o, at)) continue;
    const oEnd = oSeg.axisPos + oSeg.length;
    if (Math.abs(oEnd - start) <= ABUT_TOL_MM) left = kind;
    if (Math.abs(oSeg.axisPos - end) <= ABUT_TOL_MM) right = kind;
  }

  // Nothing abutting — if it runs into the end of the wall, that's a wall.
  const wallLengthMm = (seg.wall === "top" || seg.wall === "bottom")
    ? (room?.width_mm || 0)
    : (room?.depth_mm || 0);
  if (!left)  left  = start <= ABUT_TOL_MM ? "wall" : "open";
  if (!right) right = (wallLengthMm && end >= wallLengthMm - ABUT_TOL_MM) ? "wall" : "open";

  return { left, right };
}

// The clear opening this shelf could fill on its wall at its height — the gap
// between whatever is to its left and whatever is to its right. Used by "Fit to
// opening". Returns null when the opening can't be determined.
export function fitToOpeningMm(item, allItems = [], room = null) {
  const seg = wallSegment(item);
  const at = shelfTopMm(item) - 1;
  const wallLengthMm = (seg.wall === "top" || seg.wall === "bottom")
    ? (room?.width_mm || 0)
    : (room?.depth_mm || 0);
  if (!wallLengthMm) return null;

  const mid = seg.axisPos + seg.length / 2;
  let lo = 0, hi = wallLengthMm;
  for (const o of allItems) {
    if (!o || o.id === item.id || o.room_id !== item.room_id) continue;
    const oSeg = wallSegment(o);
    if (oSeg.wall !== seg.wall) continue;
    if (!supportKindFor(o) || !coversHeight(o, at)) continue;
    const oEnd = oSeg.axisPos + oSeg.length;
    if (oEnd <= mid) lo = Math.max(lo, oEnd);
    if (oSeg.axisPos >= mid) hi = Math.min(hi, oSeg.axisPos);
  }
  const span = Math.round(hi - lo);
  return span > 0 ? { x_mm: Math.round(lo), width_mm: span } : null;
}

// ---- Warnings -------------------------------------------------------------

// The span limit that applies, given the board and whether a front rail is on.
export function spanLimitMm(item) {
  const t = shelfThicknessMm(item) >= 18 ? 18 : 16;
  const limits = SPAN_LIMITS_MM[t] || SPAN_LIMITS_MM[18];
  return shelfRailConfig(item).front_rail.on ? limits.railed : limits.bare;
}

// Everything wrong (or worth saying) about this module, worst first. Each is
// { level: "error" | "warn", code, message }. Errors block the quote import;
// warnings are shown but never stop anyone — the person holding the drill knows
// things the drawing doesn't.
export function shelfRailWarnings(item) {
  const cfg = shelfRailConfig(item);
  const span = Math.round(Number(item?.width_mm) || 0);
  const t = shelfThicknessMm(item);
  const limit = spanLimitMm(item);
  const out = [];

  for (const [side, support] of [["Left", cfg.left_support], ["Right", cfg.right_support]]) {
    if (support === "open") {
      out.push({ level: "error", code: `${side.toLowerCase()}-open`, message: `${side} end has nothing to land on. Put a gable, cabinet or wall there.` });
    } else if (support === "panel") {
      out.push({ level: "warn", code: `${side.toLowerCase()}-panel`, message: `${side} end lands on a panel. That only carries the shelf if the panel is fixed top and bottom, or back to the wall — a panel fixed at one edge will rack.` });
    }
  }

  if (span > limit) {
    out.push(cfg.front_rail.on
      ? { level: "warn", code: "span-railed", message: `${span}mm span with a front rail is over the ${limit}mm guide for ${t}mm board. Add a mid gable, or split it into two modules.` }
      : { level: "warn", code: "span-bare", message: `${span}mm span with no front rail is over the ${limit}mm guide for ${t}mm board. Turn the front rail on — it takes this to ${(SPAN_LIMITS_MM[t >= 18 ? 18 : 16] || SPAN_LIMITS_MM[18]).railed}mm.` });
  }

  if (!cfg.back_cleat && !cfg.end_cleat_left && !cfg.end_cleat_right) {
    out.push({ level: "error", code: "no-cleats", message: "Every cleat is switched off — nothing is holding the shelf up." });
  }

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
}

export function shelfRailBlockingErrors(item) {
  return shelfRailWarnings(item).filter((w) => w.level === "error");
}
