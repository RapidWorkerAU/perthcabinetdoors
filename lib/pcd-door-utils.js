// Shared door/drawer front sizing math — used by the left panel's cut list,
// the front elevation drawing, and the quote import route, so all three
// agree on the actual finished panel sizes and how they're grouped.
import { computeDrawerFrontHeights } from "./pcd-drawer-utils";
import { builtInPlinthMm } from "./pcd-ikea-presets";
import { cabinetVerticalSpanMm } from "./pcd-kickboard-utils";
import { endPanelThicknesses, endPanelBackExtensionMm } from "./pcd-finishpanel-utils";

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

// ---- Bay heights: share of the cabinet, or pinned millimetres -------------
//
// A bay's height is either PINNED to a fixed size — an oven bay is 600mm
// whatever the cabinet does — or a SHARE of whatever height the pinned bays
// leave over. `height_lock_mm` pins it; `height_pct` is its share.
//
// Whichever way a bay is sized, the resolved answer is always written back to
// `height_mm`, because that is what every consumer downstream already reads:
// the elevation, the 3D view, the cut list and the quote importer. Nothing
// below this function needs to know percentages exist.
//
// Bays built before percentages existed carry neither field. Their stored
// `height_mm` is read as their share, so they resolve to the same proportions
// they already had.

// What a freed bay is worth in real millimetres, so picking an appliance sizes
// its bay instead of leaving it on an arbitrary share.
export const APPLIANCE_BAY_HEIGHT_MM = { oven: 600, microwave: 400, cooktop: 150 };

export function applianceBayHeightMm(appliance) {
  return APPLIANCE_BAY_HEIGHT_MM[appliance] || APPLIANCE_BAY_HEIGHT_MM.oven;
}

export function bayIsPinned(sec) {
  return Number(sec?.height_lock_mm) > 0;
}

// Resolves every bay to a real millimetre height that sums to EXACTLY the
// cabinet height, so the drawing, the cut list and the quote can never
// disagree about where a bay starts and stops.
export function resolveBayHeightsMm(sections, cabinetHeightMm) {
  const secs = Array.isArray(sections) ? sections : [];
  if (!secs.length) return [];
  const cabinetH = Math.max(0, Math.round(Number(cabinetHeightMm) || 0));
  if (cabinetH <= 0) return secs.map(() => 0);

  // Pinned bays take their millimetres first. If they would overflow the
  // cabinet they shrink together rather than pushing a share bay negative.
  const pinnedRaw = secs.reduce((sum, sec) => sum + (bayIsPinned(sec) ? Number(sec.height_lock_mm) : 0), 0);
  const pinnedScale = pinnedRaw > cabinetH ? cabinetH / pinnedRaw : 1;
  const pinnedMm = secs.map((sec) => (bayIsPinned(sec) ? Math.round(Number(sec.height_lock_mm) * pinnedScale) : 0));
  const free = Math.max(0, cabinetH - pinnedMm.reduce((a, b) => a + b, 0));

  const shareOf = (sec) => {
    const pct = Number(sec?.height_pct);
    if (Number.isFinite(pct) && pct > 0) return pct;
    const mm = Number(sec?.height_mm);
    return Number.isFinite(mm) && mm > 0 ? mm : 1;
  };
  const shareTotal = secs.reduce((sum, sec, i) => sum + (pinnedMm[i] ? 0 : shareOf(sec)), 0) || 1;

  const out = secs.map((sec, i) => (pinnedMm[i] ? pinnedMm[i] : Math.round((free * shareOf(sec)) / shareTotal)));

  // Rounding leaves a millimetre or two unallocated. It goes to the last share
  // bay — never a pinned one, whose whole point is that its size does not move.
  const lastShare = out.reduce((last, _, i) => (pinnedMm[i] ? last : i), -1);
  const drift = cabinetH - out.reduce((a, b) => a + b, 0);
  if (drift !== 0 && lastShare >= 0) out[lastShare] = Math.max(0, out[lastShare] + drift);

  return out;
}

// A drawer bank's opening heights are real millimetres — the cut list and the
// quote importer read them as authoritative. When its bay changes height they
// have to move with it, or the cabinet quietly quotes the old front sizes.
// Scaling keeps the proportions, so a deliberately deep bottom drawer stays
// deep instead of being flattened back to an even split.
export function scaleDrawerHeightsMm(heightsMm, fromHeightMm, toHeightMm) {
  const heights = Array.isArray(heightsMm) ? heightsMm.filter((h) => Number.isFinite(Number(h))) : [];
  const count = heights.length;
  const to = Math.max(0, Math.round(Number(toHeightMm) || 0));
  if (!count) return heights;
  const from = heights.reduce((sum, h) => sum + Number(h), 0) || Number(fromHeightMm) || 0;
  const out = from > 0
    ? heights.map((h) => Math.max(1, Math.round((Number(h) * to) / from)))
    : Array.from({ length: count }, () => Math.max(1, Math.round(to / count)));
  // Rounding drift goes to the last drawer so the bank still fills its bay.
  const drift = to - out.reduce((a, b) => a + b, 0);
  if (drift !== 0) out[count - 1] = Math.max(1, out[count - 1] + drift);
  return out;
}

// The sections with their resolved `height_mm` written in — what every commit
// should store, so the saved record is always internally consistent.
export function withResolvedBayHeights(sections, cabinetHeightMm) {
  const secs = Array.isArray(sections) ? sections : [];
  const heights = resolveBayHeightsMm(secs, cabinetHeightMm);
  return secs.map((sec, i) => {
    const prevMm = Math.round(Number(sec?.height_mm) || 0);
    const nextMm = heights[i];
    if (nextMm === prevMm) return { ...sec, height_mm: nextMm };
    // Only a bay that actually moved rescales its drawers — editing the drawer
    // heights by hand must not be undone by the next commit.
    if (sec?.type === "drawers" && Array.isArray(sec?.drawer?.heights_mm) && sec.drawer.heights_mm.length) {
      return {
        ...sec,
        height_mm: nextMm,
        drawer: { ...sec.drawer, heights_mm: scaleDrawerHeightsMm(sec.drawer.heights_mm, prevMm, nextMm) },
      };
    }
    return { ...sec, height_mm: nextMm };
  });
}

// A bay's resolved share of the cabinet, for display. One decimal place, so a
// three-way split reads 33.3% rather than a misleading 33%.
export function bayPercentOfCabinet(heightMm, cabinetHeightMm) {
  const cabinetH = Number(cabinetHeightMm) || 0;
  if (cabinetH <= 0) return 0;
  return Math.round((Number(heightMm) || 0) * 1000 / cabinetH) / 10;
}

// ---- Migrating the old tall-cabinet row bays ------------------------------
//
// Tall cabinets used to free a bay for an appliance through `door_config.bays`,
// an array parallel to the door rows. That was a second bay system sitting
// beside mixed-front sections, which do everything it did and more, so it is
// retired: anything it can express converts straight across.

export function hasLegacyRowBays(item) {
  if ((item?.front_type || "none") !== "doors") return false;
  const bays = item?.door_config?.bays;
  return Array.isArray(bays) && bays.some((bay) => bay && (bay.type === "appliance" || bay.type === "open"));
}

export function sectionsFromLegacyRowBays(item) {
  const cfg = item?.door_config || {};
  const rows = Math.max(1, Number(cfg.rows) || 1);
  const columns = Math.max(1, Number(cfg.columns) || 1);
  // The per-row door settings become each doors bay's own sub-config. `rows`
  // and `bays` do not travel: a bay IS one row, and bays are the new bays.
  const { bays: _bays, rows: _rows, ...doorBase } = cfg;

  return Array.from({ length: rows }, (_, i) => {
    const bay = (Array.isArray(cfg.bays) ? cfg.bays[i] : null) || {};
    if (bay.type === "appliance") {
      const appliance = bay.appliance || "oven";
      return { type: "appliance", appliance, height_lock_mm: applianceBayHeightMm(appliance) };
    }
    if (bay.type === "open") {
      return { type: "open", shelf_qty: Math.max(0, Math.round(Number(bay.shelf_qty) || 0)) };
    }
    return { type: "doors", door: { ...doorBase, columns, rows: 1 } };
  });
}

// The whole patch that retires an item's row bays, heights resolved. Applied
// the moment such a cabinet is opened, so there is one bay system, not two.
export function legacyRowBayMigration(item) {
  if (!hasLegacyRowBays(item)) return null;
  const sections = withResolvedBayHeights(sectionsFromLegacyRowBays(item), item?.height_mm);
  const { bays: _drop, ...doorCfg } = item?.door_config || {};
  return { front_type: "mixed", section_config: { ...(item?.section_config || {}), sections }, door_config: doorCfg };
}

// ---- Bays of a MIXED front (section_config.sections) ----------------------
//
// Sections are stored TOP-FIRST (index 0 is the top bay), which is how the
// right panel lists them and how the elevation draws them. Everything that
// MEASURES a cabinet — shelf_heights_mm, the 3D view, cabinetVerticalSpanMm —
// works from the BOTTOM up instead, so this converts once, here, rather than
// each consumer re-deriving it and getting the order wrong.
//
// An OPEN bay can carry its own shelves (sec.shelf_qty). They're spread evenly
// inside that bay, so a 3-shelf bay gets quarter points of its own height, not
// of the whole cabinet.
//
// Returns [{ index, type, topMm, bottomMm, heightMm, shelfQty, shelfHeightsMm }]
// with every height measured from the cabinet's bottom.
export function mixedBaySections(item) {
  const sections = Array.isArray(item?.section_config?.sections) ? item.section_config.sections : [];
  if (!sections.length) return [];
  const total = sections.reduce((s, x) => s + (Number(x.height_mm) || 0), 0);
  // The height the BAYS share out is the fronted height, so a frame with its
  // own plinth does not hand its bays 60mm of base to cover.
  const cabinetH = frontSpanMm(item) || total || 0;
  // Sections don't always sum to the cabinet height (the user is mid-edit, or
  // the height changed). Scale them to fit, exactly as the elevation does, so
  // the drawing and the cut list never disagree about where a bay sits.
  const scale = total > 0 ? cabinetH / total : 1;

  const out = [];
  let fromTop = 0;
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i] || {};
    const h = (Number(sec.height_mm) || 0) * scale;
    const topMm = cabinetH - fromTop;
    const bottomMm = topMm - h;
    fromTop += h;
    const shelfQty = Math.max(0, Math.round(Number(sec.shelf_qty) || 0));
    // Stored heights win — a bay shelf is draggable in the elevation, same as
    // any other shelf — but only while they still match the count, and they're
    // clamped INTO the bay so resizing a bay can't strand a shelf outside it.
    // Heights are absolute from the cabinet bottom, the same datum
    // shelf_heights_mm uses, so the drag maths is identical for both.
    const stored = Array.isArray(sec.shelf_heights_mm) ? sec.shelf_heights_mm : null;
    const evenly = () => Array.from({ length: shelfQty }, (_, j) => Math.round(bottomMm + ((j + 1) * h) / (shelfQty + 1)));
    // Stored heights are used ONLY if they still describe this bay: the right
    // count, and all of them inside it. Anything else — the count changed, the
    // bay was resized, the cabinet height moved — re-spreads the whole bay
    // evenly. Clamping each stray value instead would pile them on the boundary.
    const storedUsable = stored
      && stored.length === shelfQty
      && stored.every((v) => Number.isFinite(Number(v)) && Number(v) >= bottomMm && Number(v) <= topMm);
    const shelfHeightsMm = shelfQty > 0
      ? (storedUsable ? stored.map((v) => Math.round(Number(v))) : evenly())
      : [];
    out.push({ index: i, type: sec.type || "doors", topMm, bottomMm, heightMm: h, shelfQty, shelfHeightsMm });
  }
  return out;
}

// The same bays measured from the FLOOR rather than from the cabinet's own
// bottom — what you'd read off a tape on site, and the datum an oven's
// installation height is specified in.
//
// A cabinet's bottom is not the floor: a base cabinet sits on its kickboard
// and a wall cabinet hangs at its mount height, so both shift every bay in it
// by the same amount. cabinetVerticalSpanMm already knows where a cabinet's
// carcass really starts, so that is what this adds.
//
// Returns the mixedBaySections entries plus { floorBottomMm, floorTopMm }.
export function baySectionsFromFloor(item) {
  const [carcassBottomMm] = cabinetVerticalSpanMm(item);
  return mixedBaySections(item).map((bay) => ({
    ...bay,
    floorBottomMm: Math.round(carcassBottomMm + bay.bottomMm),
    floorTopMm: Math.round(carcassBottomMm + bay.topMm),
  }));
}

// "750–1350mm from floor" — the one wording used everywhere this is shown, so
// the sidebar, the bay editor and the public tool can never word it three
// different ways.
export function bayFloorRangeLabel(bay) {
  if (!bay) return "";
  return `${bay.floorBottomMm}–${bay.floorTopMm}mm from floor`;
}

// Only the bays that are actually open — the ones you can see into and that
// can hold a shelf.
export function openBaySections(item) {
  return mixedBaySections(item).filter((s) => s.type === "open");
}

// Every bay shelf's height, measured from the cabinet bottom.
export function bayShelfHeightsMm(item) {
  return openBaySections(item).flatMap((s) => s.shelfHeightsMm);
}

// How many shelves sit inside open bays in total.
export function bayShelfCount(item) {
  return openBaySections(item).reduce((n, s) => n + s.shelfQty, 0);
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
/**
 * The height a cabinet's FRONTS cover, which is not always its own height.
 *
 * An IKEA Pax is sold at 2010 or 2360 with its base built into that height, and
 * the doors that go on it are 1950 and 2290. Sizing a door off the cabinet
 * height alone quoted a Pax door 60mm too long, on a wardrobe where the plinth
 * it would have covered is right there in the photo.
 *
 * Everything we build ourselves stands ON its kickboard rather than inside it,
 * so its fronts cover the whole carcass and this is just height_mm.
 */
export function frontSpanMm(item) {
  return Math.max(0, (Number(item?.height_mm) || 0) - builtInPlinthMm(item));
}

export function frontWidthMm(item) {
  const width = Number(item?.width_mm) || 0;
  if (item?.item_type !== "blind_corner_cabinet") return width;
  const blind = Math.max(0, Number(item.blind_width_mm) || 0);
  return Math.max(0, width - blind);
}

export const FRONT_PANEL_MODE_OVER = "over_side_panels";
export const FRONT_PANEL_MODE_INSET = "inset_between_side_panels";

export function frontPanelMode(item) {
  return item?.front_panel_mode === FRONT_PANEL_MODE_INSET
    ? FRONT_PANEL_MODE_INSET
    : FRONT_PANEL_MODE_OVER;
}

export function frontHasAppliedPanel(item) {
  return ["doors", "drawers", "mixed"].includes(item?.front_type || "none");
}

export function frontPanelThicknessMm(item) {
  const doorT = Number(item?.door_style?.thickness_mm) || 0;
  const drawerT = Number(item?.drawer_style?.thickness_mm) || 0;
  const carcassT = Number(item?.carcass_thickness_mm) || 0;
  return Math.max(doorT, drawerT, carcassT, 18);
}

export function frontSideOverlayMm(item) {
  if (!frontHasAppliedPanel(item) || frontPanelMode(item) !== FRONT_PANEL_MODE_OVER) {
    return { leftT: 0, rightT: 0, totalT: 0 };
  }
  const { leftT, rightT } = endPanelThicknesses(item);
  return { leftT, rightT, totalT: leftT + rightT };
}

export function frontSizingWidthMm(item) {
  const base = frontWidthMm(item);
  const { totalT } = frontSideOverlayMm(item);
  return Math.max(0, base + totalT);
}

export function finishedSidePanelDepthMm(item) {
  const depth = Number(item?.depth_mm) || 0;
  // Past the carcass back, to cover a finished back panel's edge.
  const back = endPanelBackExtensionMm(item);
  if (!frontHasAppliedPanel(item) || frontPanelMode(item) !== FRONT_PANEL_MODE_INSET) return depth + back;
  return depth + back + frontPanelThicknessMm(item);
}

export function finishedTopPanelDepthMm(item) {
  const depth = Number(item?.depth_mm) || 0;
  return depth + (frontHasAppliedPanel(item) ? frontPanelThicknessMm(item) : 0);
}

export function computeDoorSizes(item) {
  return computeDoorSizesForConfig(item.door_config || {}, frontSizingWidthMm(item), frontSpanMm(item));
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
  return computeDrawerSizesForConfig(item.drawer_config || {}, frontSizingWidthMm(item), frontSpanMm(item));
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
// THE SAME HINGE FACTS AS FIELDS RATHER THAN A SENTENCE.
//
// formatHingeNote below writes the drilling out in words, which is what a
// person reads. A quote line also has real columns for it (hinge_side,
// hinge_from_bottom_mm, hinge_from_top_mm, hinge_middles_mm), and those are
// what the workshop sheet and the order are built from.
//
// The website's own path filled the columns; the design importer only wrote the
// sentence, so a door imported from a design arrived with the drilling
// described but not recorded, and somebody re-typed it into the form. That is
// where a pair becomes two identical doors.
//
// Positions are stored bottom-to-top as distances from the bottom, the same
// datum the elevation drills them from. The form asks for the top cup as a
// distance from the TOP, so it is turned round here once rather than
// everywhere that reads it.
export function hingeFields(size = {}) {
  const positions = Array.isArray(size.hingePositions)
    ? size.hingePositions.map((mm) => Math.round(Number(mm) || 0)).filter((mm) => mm > 0)
    : [];
  const height = Number(size.height ?? size.heightMm) || 0;
  const side = size.hingeSide === "L" ? "Left" : size.hingeSide === "R" ? "Right" : "";
  // Fewer than two positions is not a half-drilled door, it is a door whose
  // positions were never set. Our standard ones are used, and a blank here is
  // what says so.
  if (positions.length < 2 || height <= 0) {
    return { hinge_side: side, hinge_from_bottom_mm: null, hinge_from_top_mm: null, hinge_middles_mm: [] };
  }
  return {
    hinge_side: side,
    hinge_from_bottom_mm: positions[0],
    hinge_from_top_mm: Math.max(0, height - positions[positions.length - 1]),
    hinge_middles_mm: positions.slice(1, -1),
  };
}

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
    frontSpanMm(item) - (rowGap > 0 ? rowGap + reveal / 2 : reveal)
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
