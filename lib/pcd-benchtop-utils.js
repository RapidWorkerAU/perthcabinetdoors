// Benchtop geometry — the counterpart to lib/pcd-kickboard-utils.js for the
// surface on TOP of a base cabinet run rather than the toe-kick beneath it.
//
// NOW QUOTED (audit Phase 2, p2-2). PCD sells benchtops, priced PER SQUARE
// METRE from the pcd_benchtop_materials catalogue: the run area at the chosen
// material's $/m², plus each waterfall end (an extra vertical slab) at the same
// rate, plus a per-cutout fee for each sink/cooktop hole. The design tool still
// models the top for the drawing and the fabricator; the geometry here also
// feeds the quote import's benchtop line-builder.
//
// Only floor-standing cabinets with a working top get one: base, and the two
// corner variants. A tall pantry runs past bench height, and a wall cabinet
// has nothing to sit on.

import { getWallAxisPos, groupIntoRuns, islandVirtualWall, wallSpanMm, cabinetVerticalSpanMm } from "./pcd-kickboard-utils";
import { endPanelSpanMm } from "./pcd-finishpanel-utils";

const BENCHTOP_TYPES = new Set(["base_cabinet", "corner_base_cabinet", "blind_corner_cabinet"]);

export const DEFAULT_BENCHTOP_THICKNESS_MM = 40;
export const DEFAULT_BENCHTOP_OVERHANG_MM = 20;

// Flat ex-GST fee charged per sink/cooktop cutout (the labour to cut the hole),
// on top of the per-m² material. A sensible default like the hinge-drilling
// fee; TODO promote to a business default so it's editable per business.
export const DEFAULT_BENCHTOP_CUTOUT_FEE_EX_GST = 90;

export function benchtopMaterialLabel(item) {
  return String(item?.benchtop_material || "").trim();
}

export function benchtopRatePerSqm(item) {
  return Number(item?.benchtop_cost_per_sqm) || 0;
}

export function benchtopThicknessMm(item) {
  const v = Number(item?.benchtop_thickness_mm);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_BENCHTOP_THICKNESS_MM;
}

// The overhang is measured past the FRONT FACE OF THE DOOR, not past the
// carcass — that's the dimension a joiner actually quotes, and the one you'd
// check a drawer front against.
export function benchtopOverhangMm(item) {
  const v = Number(item?.benchtop_overhang_mm);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_BENCHTOP_OVERHANG_MM;
}

// The board thickness the cabinet's front adds in front of the carcass. A
// cabinet with no front adds nothing, so its top overhangs the carcass alone.
function frontBoardThicknessMm(item) {
  if (!item?.front_type || item.front_type === "none") return 0;
  const style = item.front_type === "drawers" ? item.drawer_style : item.door_style;
  const t = Number(style?.thickness_mm ?? item.door_style?.thickness_mm);
  return Number.isFinite(t) && t > 0 ? t : 18;
}

// How deep the benchtop actually is: the carcass, plus whatever the front
// board stands proud of it, plus the overhang past that.
//
// Deriving it rather than storing it means the top can't silently disagree
// with the cabinet it sits on — change the cabinet depth or the door board and
// the top follows, which is the whole reason this is derived and not placed.
export function benchtopDepthMm(item) {
  const carcass = Number(item?.depth_mm) || 600;
  return carcass + frontBoardThicknessMm(item) + benchtopOverhangMm(item);
}

// The height the underside of the benchtop sits at — the top of the carcass,
// kickboard included. Bench height is this plus the benchtop's thickness.
export function benchtopUndersideMm(item) {
  return cabinetVerticalSpanMm(item)[1];
}

export function benchtopSegment(item) {
  if (!BENCHTOP_TYPES.has(item.item_type) || !item.has_benchtop) return null;
  const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;
  return { wall, axisPos: getWallAxisPos(item), length: wallSpanMm(item), itemId: item.id };
}

// Finds the continuous benchtop run `item` belongs to, returning
// { firstItemId, totalWidth, count } — the run's first cabinet is the one that
// draws the merged top, so the others don't draw their own on top of it.
//
// "individual" span never merges, so it naturally comes back as its own
// count:1 result with no special-casing. Mirrors computeBottomPanelRun.
export function computeBenchtopRun(item, allItems) {
  const seg = benchtopSegment(item);
  if (!seg) return { firstItemId: item.id, totalWidth: wallSpanMm(item), count: 1 };

  // Flush end-panel cover: the top extends past the carcass by a finished end
  // panel's thickness at each exposed end, so it sits OVER the panel rather
  // than beside it — except a waterfall end, where the top drops to the floor
  // instead. Uses the same low/high span the plan reserves for the panel, so
  // the drawing, 3D and quote all agree.
  //
  // This applies to RUNS as well as to a single cabinet. It used to be single
  // cabinets only, which left a run of three units with its top stopping flush
  // at the carcass while the finished end panel stood proud of it. Only the two
  // ends of a run are exposed; the joins in the middle have a cabinet either
  // side and nothing to cover.
  const single = (length) => {
    const span = endPanelSpanMm(item, seg.wall);       // { lowT, highT } — viewer→axis flip handled
    const wf = benchtopWaterfallSides(item, seg.wall);  // { low, high } booleans
    const lowT = wf.low ? 0 : span.lowT;
    const highT = wf.high ? 0 : span.highT;
    return {
      firstItemId: item.id,
      totalWidth: length + lowT + highT,
      count: 1,
      startAxisPos: seg.axisPos - lowT,
      memberIds: [item.id],
    };
  };

  const candidates = allItems
    .filter((i) =>
      i.room_id === item.room_id &&
      i.has_benchtop &&
      BENCHTOP_TYPES.has(i.item_type) &&
      (i.benchtop_span || "continuous") === "continuous"
    )
    .map((i) => benchtopSegment(i))
    .filter((s) => s && s.wall === seg.wall);

  if (!candidates.length) return single(seg.length);

  const runs = groupIntoRuns(candidates);
  const myRun = runs.find((run) => run.some((s) => s.itemId === item.id));
  if (!myRun || myRun.length === 1) return single(seg.length);

  const memberItems = myRun
    .map((m) => allItems.find((i) => i.id === m.itemId))
    .filter(Boolean);

  // Waterfall flags are aggregated across the run the same way
  // benchtopRunWaterfallEnds does, but inline: that helper calls back into this
  // function, so using it here would recurse.
  const wfFlags = memberItems.reduce(
    (acc, it) => ({
      benchtop_waterfall_left: acc.benchtop_waterfall_left || Boolean(it.benchtop_waterfall_left),
      benchtop_waterfall_right: acc.benchtop_waterfall_right || Boolean(it.benchtop_waterfall_right),
    }),
    { has_benchtop: true, benchtop_waterfall_left: false, benchtop_waterfall_right: false }
  );
  const runWf = benchtopWaterfallSides(wfFlags, seg.wall);

  // Only the OUTER end of each end cabinet is exposed.
  const firstItem = memberItems[0] || item;
  const lastItem = memberItems[memberItems.length - 1] || item;
  const lowT = runWf.low ? 0 : endPanelSpanMm(firstItem, seg.wall).lowT;
  const highT = runWf.high ? 0 : endPanelSpanMm(lastItem, seg.wall).highT;

  return {
    firstItemId: myRun[0].itemId,
    totalWidth: myRun.reduce((sum, m) => sum + m.length, 0) + lowT + highT,
    count: myRun.length,
    startAxisPos: myRun[0].axisPos - lowT,
    memberIds: myRun.map((m) => m.itemId),
  };
}

// A waterfall belongs on the exposed END of a benchtop RUN, but the run is
// drawn once by its first cabinet — so a waterfall set on any other cabinet in
// the run would be lost. This aggregates the viewer left/right flags across
// every cabinet in the run so the end that's meant to fall actually does,
// whichever cabinet in the run carries the flag.
export function benchtopRunWaterfallEnds(item, allItems) {
  const run = computeBenchtopRun(item, allItems || []);
  const ids = run.memberIds || [item.id];
  let left = false, right = false;
  for (const id of ids) {
    const it = (allItems || []).find((x) => x.id === id);
    if (!it || !it.has_benchtop) continue;
    left = left || Boolean(it.benchtop_waterfall_left);
    right = right || Boolean(it.benchtop_waterfall_right);
  }
  return left || right ? { left, right } : null;
}

// Cutouts in this cabinet's stretch of top. Not appliances — the tool has no
// appliance concept — just "a hole this size goes here", for the fabricator.
// Centred on the cabinet, which is where a sink or cooktop almost always is
// and avoids asking for an offset nobody would measure.
export function benchtopCutouts(item) {
  const raw = Array.isArray(item?.benchtop_cutouts) ? item.benchtop_cutouts : [];
  return raw
    .map((c) => ({
      type: c?.type === "cooktop" ? "cooktop" : "sink",
      width_mm: Math.max(0, Number(c?.width_mm) || 0),
      depth_mm: Math.max(0, Number(c?.depth_mm) || 0),
    }))
    .filter((c) => c.width_mm > 0 && c.depth_mm > 0);
}

// Waterfall ends are stored as left/right in VIEWER terms — "the left end" is
// what you'd say standing in the room. The two views map that onto their own
// axes differently, so there are two functions, exactly like endPanelSpanMm /
// endPanelElevationSpanMm. If these two ever agree on a mirrored wall, one of
// them is wrong.
function waterfallEnds(item) {
  if (!item?.has_benchtop) return null;
  const left = Boolean(item.benchtop_waterfall_left);
  const right = Boolean(item.benchtop_waterfall_right);
  return left || right ? { left, right } : null;
}

// PLAN: room-space along-wall order (low = smaller x/y). Needs the flip —
// facing the bottom or left wall you're looking back down the axis, so the
// viewer's left end is the one at the HIGH coordinate.
export function benchtopWaterfallSides(item, effectiveWall, ends) {
  const e = ends === undefined ? waterfallEnds(item) : ends;
  if (!e) return { low: false, high: false };
  const wall = effectiveWall ?? (item.wall === "island" ? islandVirtualWall(item) : item.wall);
  const flip = wall === "bottom" || wall === "left";
  return flip ? { low: e.right, high: e.left } : { low: e.left, high: e.right };
}

// ELEVATION: getWallPos has ALREADY flipped this axis so svg-left is always
// the viewer's left. A second flip here would undo it, and a left waterfall
// would jump to the wrong end of every bottom- and left-wall run.
export function benchtopWaterfallElevationSides(item, ends) {
  const e = ends === undefined ? waterfallEnds(item) : ends;
  if (!e) return { low: false, high: false };
  return { low: e.left, high: e.right };
}
