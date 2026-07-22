// Shared door/drawer front sizing math — used by the left panel's cut list,
// the front elevation drawing, and the quote import route, so all three
// agree on the actual finished panel sizes and how they're grouped.
import { computeDrawerFrontHeights } from "./pcd-drawer-utils";

// The finger-pull reveal's default, and the ONE place it's defined.
//
// It used to exist only as the right panel input's `?? 20` display fallback
// while every consumer independently fell back to 0, so ticking the gap on
// drew — and PRICED — as zero until someone hand-edited the field. The three
// readers disagreed silently, which is exactly the failure the rest of this
// module exists to prevent. Resolve through the helpers below; never read
// row_gap_mm/gap_mm raw.
export const FINGER_PULL_GAP_MM = 20;

// Resolves a stored gap value to the millimetres actually used. A stored
// null/empty (never touched) means "the default I was shown", not zero —
// the input's min is 1, so 0 is not a value anyone can deliberately pick.
function resolveGapMm(raw) {
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : FINGER_PULL_GAP_MM;
}

// The full-overlay reveal: the gap between adjacent fronts, with HALF of it
// at each outer edge of the bank so two neighbouring cabinets also end up a
// full reveal apart rather than touching.
//
// Fronts used to be cut to the exact carcass face — 450 + 450 on a 900
// cabinet, filling the opening with nothing between them — which cannot
// swing. 3mm is the Australian full-overlay standard.
//
// The arithmetic falls out neatly: with r/2 at each end and r between, the
// gaps total N×r, so each of N fronts is simply (W / N) − r.
export const DEFAULT_DOOR_REVEAL_MM = 3;

// A stored 0 IS meaningful here (a shop running zero reveal), so unlike the
// gap and hinge defaults this only falls back when the value is absent.
export function frontRevealMm(cfg = {}) {
  const v = Number(cfg.reveal_mm);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_DOOR_REVEAL_MM;
}

// Hinges per door. Same story as the gap above: the config panel has always
// shown 2 by default (DoorBankFields' `cfg.hinge_qty || Array(cols).fill(2)`,
// and the corner form's `?? 2`), but this module read `|| 0` — so a door
// whose hinge dropdown was never touched imported with hinge_holes: false
// and no drilling billed, while the screen said "2 hinges". The dropdown
// only offers 2/3/4, so 0 is never a deliberate choice — it means "unset".
export const DEFAULT_HINGE_QTY = 2;

function resolveHingeQty(raw) {
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_HINGE_QTY;
}

// Door row gap (finger-pull reveal) in mm — 0 when the toggle is off.
export function doorRowGapMm(cfg = {}) {
  return cfg.row_gap_enabled ? resolveGapMm(cfg.row_gap_mm) : 0;
}

// Drawer bank gap — the same reveal, stored under a different config shape.
export function drawerGapMm(cfg = {}) {
  return cfg.gap_enabled ? resolveGapMm(cfg.gap_mm) : 0;
}

// A tall cabinet's vertical bays (door_config.rows) can each be individually
// freed for an appliance recess (oven/microwave/cooktop) or plain open space
// instead of doors. Stored as door_config.bays — an optional array aligned to
// the rows, index 0 = TOP bay (matching the right-panel list order and the
// front-elevation doors loop where r=0 draws at the top). A missing/short
// entry defaults to a normal door bay, so existing cabinets (no bays) are
// unchanged. These two helpers are the single source of truth for "is this
// row a door row?" consumed by the sizing math below and the render views.
export function bayTypeForRow(cfg, rowIndex) {
  const bays = cfg && Array.isArray(cfg.bays) ? cfg.bays : null;
  const bay = bays ? bays[rowIndex] : null;
  const t = bay && bay.type;
  return t === "appliance" || t === "open" ? t : "doors";
}

export function bayIsFree(cfg, rowIndex) {
  return bayTypeForRow(cfg, rowIndex) !== "doors";
}

// Splits a cabinet's front into individual door panels using the same
// columns/rows/width_ratios math as the front elevation drawing, then groups
// doors (within this one door bank) into a single count wherever both the
// size AND the hinge setup (qty + positions) match — two same-size doors
// with different hinge drilling must not be merged into one line.
// Generalised so it can size a plain cabinet's full door_config (rows
// included) or a single "mixed" section's door sub-config (rows never set,
// naturally defaults to 1 — a mixed section is itself the row).
export function computeDoorSizesForConfig(cfg, widthMm, heightMm) {
  const cols = Math.max(1, cfg.columns || 1);
  const rows = Math.max(1, cfg.rows || 1);
  const rawRatios = Array.isArray(cfg.width_ratios) && cfg.width_ratios.length === cols
    ? cfg.width_ratios
    : Array(cols).fill(1 / cols);
  const totalRatio = rawRatios.reduce((sum, r) => sum + (Number(r) || 0), 0) || 1;
  // Row gap (finger-pull reveal) shortens every row's finished height by the
  // same amount, regardless of whether it's recessed at the top or bottom —
  // position only matters for where it's drawn, not the resulting cut size.
  // Applies even with a single row (rows=1) — a base cabinet's one row of
  // doors, or a single-row "mixed" section, can still want a handle-less
  // grip recessed into it.
  const rowGapMm = doorRowGapMm(cfg);
  // A finger-pull gap IS the reveal on the edge it sits on — a deliberate
  // 20mm one — so it replaces the 3mm there rather than stacking with it.
  // The opposite edge still gets its half reveal.
  const reveal = frontRevealMm(cfg);
  const heightDeduction = rowGapMm > 0 ? rowGapMm + reveal / 2 : reveal;
  const doorHeight = Math.max(0, Math.round((Number(heightMm) || 0) / rows - heightDeduction));
  const hingeQtyArr = Array.isArray(cfg.hinge_qty) ? cfg.hinge_qty : [];
  const hingePosArr = Array.isArray(cfg.hinge_positions_mm) ? cfg.hinge_positions_mm : [];

  const hingeSideArr = Array.isArray(cfg.hinges) ? cfg.hinges : [];

  const sizes = new Map();
  for (let r = 0; r < rows; r++) {
    // A free bay (appliance recess / open space) cuts no door board and is
    // never quoted — skip it entirely so it drops out of both the cut list
    // and the import quote lines.
    if (bayIsFree(cfg, r)) continue;
    for (let c = 0; c < cols; c++) {
      const ratio = (Number(rawRatios[c]) || 0) / totalRatio;
      // Each front loses a full reveal off its share: half at each end of the
      // bank plus one between each pair works out to exactly one per door.
      const doorWidth = Math.max(0, Math.round((Number(widthMm) || 0) * ratio - reveal));
      const hingeQty = resolveHingeQty(hingeQtyArr[c]);
      const hingeSide = hingeSideArr[c] === "R" ? "R" : "L";
      const hingePositions = (Array.isArray(hingePosArr[c]) ? hingePosArr[c] : [])
        .map((p) => Math.round(Number(p) || 0));
      // Handing is part of the hinge setup, so it belongs in the key — two
      // same-size doors of opposite hand are NOT the same product. Without
      // it, a standard L/R pair collapsed into one line of qty 2 and the
      // factory made two identical doors for a pair that opens outward.
      const key = `${doorWidth}x${doorHeight}|${hingeQty}|${hingeSide}|${hingePositions.join(",")}`;
      const existing = sizes.get(key);
      if (existing) existing.qty += 1;
      else sizes.set(key, { width: doorWidth, height: doorHeight, qty: 1, hingeQty, hingeSide, hingePositions });
    }
  }
  return Array.from(sizes.values());
}

// The width a cabinet's FRONT actually spans, which is not always its
// carcass width.
//
// A blind corner is a plain rectangular box, but part of it disappears behind
// the return cabinet in the corner — dead space no door opens onto. So its
// fronts are sized against the accessible remainder while everything else
// (carcass, back, kickboard, panels, shelves) still spans the full width_mm.
export function frontWidthMm(item) {
  const width = Number(item?.width_mm) || 0;
  if (item?.item_type !== "blind_corner_cabinet") return width;
  const blind = Math.max(0, Number(item.blind_width_mm) || 0);
  return Math.max(0, width - blind);
}

export function computeDoorSizes(item) {
  return computeDoorSizesForConfig(item.door_config || {}, frontWidthMm(item), item.height_mm);
}

// Generalised the same way as computeDoorSizesForConfig — sizes a plain
// cabinet's full drawer_config or a single "mixed" section's drawer
// sub-config. A drawer bank is always a single column, so unlike doors
// there's no per-column width split — every front shares the
// cabinet/section's full width, just different heights per drawer.
export function computeDrawerSizesForConfig(cfg, widthMm, heightMm) {
  const heights = Array.isArray(cfg.heights_mm) && cfg.heights_mm.length ? cfg.heights_mm : [Number(heightMm) || 0];
  const gapMm = drawerGapMm(cfg);
  const reveal = frontRevealMm(cfg);
  const frontHeights = computeDrawerFrontHeights(heights, gapMm > 0, gapMm, reveal);
  // A drawer bank is a single column, so its front loses one full reveal
  // across the width — half at each end, same as a single door.
  const w = Math.max(0, Math.round((Number(widthMm) || 0) - reveal));

  const sizes = new Map();
  frontHeights.forEach((h) => {
    const height = Math.round(h);
    const key = `${w}x${height}`;
    const existing = sizes.get(key);
    if (existing) existing.qty += 1;
    else sizes.set(key, { width: w, height, qty: 1 });
  });
  return Array.from(sizes.values());
}

export function computeDrawerSizes(item) {
  return computeDrawerSizesForConfig(item.drawer_config || {}, frontWidthMm(item), item.height_mm);
}

// Formats hinge drilling positions for manufacturing notes. hingePositions
// is ordered bottom-to-top, always stored as distance-from-bottom (same
// datum the elevation view drills hinge marks from) — but the bottom hinge
// is described as distance from the bottom edge and the top hinge as
// distance from the top edge, matching how a joiner's spec sheet actually
// reads. Any 3rd/4th (middle) hinges aren't independently drilled — they're
// auto-spaced evenly between the bottom and top hinge — so they're called
// out as such rather than given their own edge reference.
// `hingeSide` is "L"/"R" for a regular door and omitted for a corner leaf
// (a bi-fold's handing is fixed by which leaf is frame-hinged). Without it
// on the note, an L/R pair reached the factory as two identical doors —
// the config panel asks for the side, so the spec sheet has to state it.
export function formatHingeNote(hingeQty, hingePositions, doorHeightMm, hingeSide) {
  if (!hingeQty) return "";
  const side = hingeSide === "L" ? ", hinged left" : hingeSide === "R" ? ", hinged right" : "";
  if (!Array.isArray(hingePositions) || !hingePositions.length) {
    return `Hinge drilling: ${hingeQty} hinges${side}, positions not set.`;
  }
  const h = Number(doorHeightMm) || 0;
  const last = hingePositions.length - 1;
  const parts = hingePositions.map((pos, i) => {
    const p = Math.round(Number(pos) || 0);
    if (last === 0) return `${p}mm from bottom`;
    if (i === 0) return `bottom hinge ${p}mm from bottom`;
    if (i === last) return `top hinge ${Math.max(0, Math.round(h - p))}mm from top`;
    return `middle hinge ${p}mm from bottom (auto-spaced)`;
  });
  return `Hinge drilling: ${hingeQty} hinges${side} — ${parts.join(", ")}.`;
}

// A corner cabinet's door is one bi-fold unit split into two leaves — one
// per wall it touches — rather than the columns/rows grid regular cabinets
// use. Each leaf's width is that leg's footprint minus the shared depth_mm
// (the corner-square return has no door). Only the frame-hinged leaf
// (door_config.hinge_wall) gets hinge_qty/hinge_positions_mm — the other
// leaf folds off it, with no independent frame drilling.
export function computeCornerDoorLeaves(item) {
  const cfg = item.door_config || {};
  const depthMm = Number(item.depth_mm) || 0;
  // The finger-pull reveal shortens both leaves equally — it's one gap
  // across the single bi-fold door, not one per leaf, so the two halves
  // still line up when the door folds around the corner.
  const reveal = frontRevealMm(cfg);
  const rowGap = doorRowGapMm(cfg);
  const heightMm = Math.max(0, Math.round(
    (Number(item.height_mm) || 0) - (rowGap > 0 ? rowGap + reveal / 2 : reveal)
  ));
  const hingeWall = cfg.hinge_wall || "primary";
  const hingeQty = resolveHingeQty(cfg.hinge_qty);
  const hingePositions = Array.isArray(cfg.hinge_positions_mm)
    ? cfg.hinge_positions_mm.map((p) => Math.round(Number(p) || 0))
    : [];

  // Each leaf loses half a reveal at its outer end; the fold joint between
  // the two leaves takes the other half, so the pair still reads as one
  // reveal around a single door.
  const leafWidth = (legWidthMm) =>
    Math.round(Math.max(0, (Number(legWidthMm) || 0) - depthMm - reveal / 2));

  return [
    { key: "primary", wallLabel: item.wall, widthMm: leafWidth(item.width_mm) },
    { key: "secondary", wallLabel: item.secondary_wall, widthMm: leafWidth(item.secondary_width_mm) },
  ]
    .filter((leaf) => leaf.widthMm > 0 && leaf.wallLabel)
    .map((leaf) => {
      const isHingeLeaf = leaf.key === hingeWall;
      return {
        ...leaf,
        heightMm,
        isHingeLeaf,
        hingeQty: isHingeLeaf ? hingeQty : 0,
        hingePositions: isHingeLeaf ? hingePositions : [],
      };
    });
}
