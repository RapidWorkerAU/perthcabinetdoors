// Shared door/drawer front sizing math — used by the left panel's cut list,
// the front elevation drawing, and the quote import route, so all three
// agree on the actual finished panel sizes and how they're grouped.
import { computeDrawerFrontHeights } from "./pcd-drawer-utils";

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
  const rowGapMm = cfg.row_gap_enabled ? (Number(cfg.row_gap_mm) || 0) : 0;
  const doorHeight = Math.max(0, Math.round((Number(heightMm) || 0) / rows - rowGapMm));
  const hingeQtyArr = Array.isArray(cfg.hinge_qty) ? cfg.hinge_qty : [];
  const hingePosArr = Array.isArray(cfg.hinge_positions_mm) ? cfg.hinge_positions_mm : [];

  const sizes = new Map();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ratio = (Number(rawRatios[c]) || 0) / totalRatio;
      const doorWidth = Math.round((Number(widthMm) || 0) * ratio);
      const hingeQty = Number(hingeQtyArr[c]) || 0;
      const hingePositions = (Array.isArray(hingePosArr[c]) ? hingePosArr[c] : [])
        .map((p) => Math.round(Number(p) || 0));
      const key = `${doorWidth}x${doorHeight}|${hingeQty}|${hingePositions.join(",")}`;
      const existing = sizes.get(key);
      if (existing) existing.qty += 1;
      else sizes.set(key, { width: doorWidth, height: doorHeight, qty: 1, hingeQty, hingePositions });
    }
  }
  return Array.from(sizes.values());
}

export function computeDoorSizes(item) {
  return computeDoorSizesForConfig(item.door_config || {}, item.width_mm, item.height_mm);
}

// Generalised the same way as computeDoorSizesForConfig — sizes a plain
// cabinet's full drawer_config or a single "mixed" section's drawer
// sub-config. A drawer bank is always a single column, so unlike doors
// there's no per-column width split — every front shares the
// cabinet/section's full width, just different heights per drawer.
export function computeDrawerSizesForConfig(cfg, widthMm, heightMm) {
  const heights = Array.isArray(cfg.heights_mm) && cfg.heights_mm.length ? cfg.heights_mm : [Number(heightMm) || 0];
  const gapEnabled = Boolean(cfg.gap_enabled);
  const gapMm = gapEnabled ? (Number(cfg.gap_mm) || 0) : 0;
  const frontHeights = computeDrawerFrontHeights(heights, gapEnabled, gapMm);
  const w = Math.round(Number(widthMm) || 0);

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
  return computeDrawerSizesForConfig(item.drawer_config || {}, item.width_mm, item.height_mm);
}

// Formats hinge drilling positions for manufacturing notes. hingePositions
// is ordered bottom-to-top, always stored as distance-from-bottom (same
// datum the elevation view drills hinge marks from) — but the bottom hinge
// is described as distance from the bottom edge and the top hinge as
// distance from the top edge, matching how a joiner's spec sheet actually
// reads. Any 3rd/4th (middle) hinges aren't independently drilled — they're
// auto-spaced evenly between the bottom and top hinge — so they're called
// out as such rather than given their own edge reference.
export function formatHingeNote(hingeQty, hingePositions, doorHeightMm) {
  if (!hingeQty) return "";
  if (!Array.isArray(hingePositions) || !hingePositions.length) {
    return `Hinge drilling: ${hingeQty} hinges, positions not set.`;
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
  return `Hinge drilling: ${hingeQty} hinges — ${parts.join(", ")}.`;
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
  const heightMm = Number(item.height_mm) || 0;
  const hingeWall = cfg.hinge_wall || "primary";
  const hingeQty = Number(cfg.hinge_qty) || 0;
  const hingePositions = Array.isArray(cfg.hinge_positions_mm)
    ? cfg.hinge_positions_mm.map((p) => Math.round(Number(p) || 0))
    : [];

  return [
    { key: "primary", wallLabel: item.wall, widthMm: Math.round(Math.max(0, (Number(item.width_mm) || 0) - depthMm)) },
    { key: "secondary", wallLabel: item.secondary_wall, widthMm: Math.round(Math.max(0, (Number(item.secondary_width_mm) || 0) - depthMm)) },
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
