// Shared filler-panel run detection for design tool items — the counterpart
// to lib/pcd-kickboard-utils.js for the panel that closes the gap between a
// cabinet's TOP and the ceiling, rather than the floor-level toe-kick.
//
// wall_cabinet and tall_cabinet get a filler panel — both can run nearly up
// to the ceiling, unlike base cabinets. Corner cabinets are excluded (no
// corner wall/tall variant exists), so (unlike kickboard) a filler panel is
// always a single segment per item, no leg-splitting needed.

import { getWallAxisPos, groupIntoRuns, islandVirtualWall, kickboardOffsetMm, mountHeightMm, wallSpanMm } from "./pcd-kickboard-utils";
import { nearestGaps } from "./pcd-plan-geometry";

const FILLER_PANEL_TYPES = new Set(["wall_cabinet", "tall_cabinet", "corner_tall_cabinet"]);

// Generic along-wall geometry for ANY item type (cabinet, obstruction, etc.)
// — unlike fillerPanelSegment() below, not restricted to wall cabinets,
// since an obstruction (e.g. a bulkhead) sitting above a wall cabinet needs
// the same axis-position/length comparison to detect horizontal overlap.
function itemWallSegment(it) {
  const wall = it.wall === "island" ? islandVirtualWall(it) : it.wall;
  const length = wallSpanMm(it);
  return { wall, axisPos: getWallAxisPos(it), length };
}

// The vertical gap between a cabinet's top edge and whatever's directly
// above it — the room's ceiling, OR the underside of the nearest item
// (typically an obstruction, e.g. a bulkhead) on the same wall that overlaps
// the cabinet's along-wall span and sits above its top, whichever is closer.
// This is what the filler panel needs to fill when its height isn't manually
// overridden. `others` should be every item in the room (any type) so
// obstructions are considered — pass [] to fall back to ceiling-only.
// A kickboard raises the cabinet, and therefore its top, so it must be in
// both bounds here — this cabinet's top and any neighbour's underside above
// it. Without it a kickboarded tall cabinet's top read a full kickboard low
// and the auto filler came out that much too tall; unlike the other symptoms
// of this bug, the result is SAVED to filler_panel_height_mm and imported
// into the quote, so it reached the cut list and the customer's PDF.
export function fillerPanelGapMm(item, room, others = []) {
  const ceilingHeightMm = room?.height_mm || 2400;
  const mountMm = mountHeightMm(item) + kickboardOffsetMm(item);
  const cabinetHeightMm = item.height_mm || 720;
  const topMm = mountMm + cabinetHeightMm;

  const seg = itemWallSegment(item);
  let topBound = ceilingHeightMm;

  for (const o of others) {
    if (o.id === item.id || o.room_id !== item.room_id) continue;
    if (o.mount_height_mm == null) continue;
    const om = mountHeightMm(o) + kickboardOffsetMm(o);
    if (om < topMm) continue; // must actually sit above this cabinet's top
    const oSeg = itemWallSegment(o);
    if (oSeg.wall !== seg.wall) continue;
    if (oSeg.axisPos < seg.axisPos + seg.length && oSeg.axisPos + oSeg.length > seg.axisPos) {
      topBound = Math.min(topBound, om);
    }
  }

  return Math.max(0, topBound - topMm);
}

// The horizontal gap beside a cabinet, on one side, measured the same way the
// filler above it measures the gap to the ceiling: out to the nearest thing
// actually in the way, or the wall.
//
// Why this exists: switching a side filler on left its width blank, and every
// drawing skips a side filler with no width. So the toggle went on, nothing
// appeared in the elevation or the 3D, and nothing said why. The gap is
// measurable from the plan, so it is measured and shown in the field rather
// than left for somebody to type. Typing over it still wins.
//
// `side` is the CABINET's own left/right (the viewer's, looking at its face),
// not the room's, so it follows the same wall flip endPanelSpanMm() uses.
export function sideFillerGapMm(item, room, others = [], side = "left") {
  if (!item) return 0;
  const roomW = room?.width_mm || 4000;
  const roomD = room?.depth_mm || 3000;
  // Only the items in THIS room can stand in the way. nearestGaps has no room
  // filter of its own, and a caller handing it a whole project would otherwise
  // measure this cabinet against a cabinet in another room.
  const inRoom = (others || []).filter((o) => o && (o.room_id == null || item.room_id == null || o.room_id === item.room_id));
  const gaps = nearestGaps(item, inRoom, roomW, roomD);
  if (!gaps) return 0;
  const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;
  // Along-wall axis: x for the back/front walls, y for the side walls.
  const alongY = wall === "left" || wall === "right";
  const low  = alongY ? gaps.up.gap   : gaps.left.gap;
  const high = alongY ? gaps.down.gap : gaps.right.gap;
  const flip = wall === "bottom" || wall === "left";
  const wantLow = flip ? side === "right" : side === "left";
  return Math.max(0, Math.round(wantLow ? low : high));
}

// The width a side filler is DRAWN and QUOTED at: what was typed, or the
// measured gap when nothing has been. One answer for the elevation, the 3D
// view and the cut list, so they cannot disagree about it.
export function sideFillerWidthMm(item, room, others = [], side = "left") {
  const typed = Number(side === "left" ? item?.side_filler_left_width_mm : item?.side_filler_right_width_mm);
  if (Number.isFinite(typed) && typed > 0) return typed;
  return sideFillerGapMm(item, room, others, side);
}

export function fillerPanelSegment(item) {
  if (!FILLER_PANEL_TYPES.has(item.item_type)) return null;
  const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;
  const length = wallSpanMm(item);
  return { wall, axisPos: getWallAxisPos(item), length, itemId: item.id };
}

// Finds the continuous filler-panel run `item` belongs to. Returns
// { firstItemId, totalWidth, count }. Only cabinets (wall or tall) with
// has_filler_panel and filler_panel_span "continuous" on the same (virtual)
// wall are considered — "individual" span cabinets never merge into a run,
// so they naturally come back as their own single-cabinet, count:1 result.
export function computeFillerPanelRun(item, allItems) {
  const seg = fillerPanelSegment(item);
  if (!seg) return { firstItemId: item.id, totalWidth: item.width_mm || 600, count: 1 };

  const candidates = allItems
    .filter((i) =>
      i.room_id === item.room_id &&
      i.has_filler_panel &&
      (i.filler_panel_span || "continuous") === "continuous"
    )
    .map((i) => fillerPanelSegment(i))
    .filter((s) => s && s.wall === seg.wall);

  if (!candidates.length) return { firstItemId: item.id, totalWidth: seg.length, count: 1 };

  const runs = groupIntoRuns(candidates);
  const myRun = runs.find((run) => run.some((s) => s.itemId === item.id));
  if (!myRun) return { firstItemId: item.id, totalWidth: seg.length, count: 1 };

  return {
    firstItemId: myRun[0].itemId,
    totalWidth: myRun.reduce((sum, s) => sum + s.length, 0),
    count: myRun.length,
  };
}

// Returns all continuous filler-panel runs with 2+ cabinets for a room's
// items, grouped by wall — mirrors computeAllKickboardRuns()/
// computeAllBackPanelRuns(). Each returned segment carries an `item`
// reference for display purposes.
export function computeAllFillerPanelRuns(roomItems) {
  const byWall = {};
  for (const item of roomItems) {
    if (!item.has_filler_panel || (item.filler_panel_span || "continuous") !== "continuous") continue;
    const seg = fillerPanelSegment(item);
    if (!seg) continue;
    const key = seg.wall || "top";
    if (!byWall[key]) byWall[key] = [];
    byWall[key].push({ ...seg, item });
  }

  const allRuns = [];
  for (const [wall, segs] of Object.entries(byWall)) {
    for (const run of groupIntoRuns(segs)) {
      if (run.length >= 2) allRuns.push({ wall, segments: run });
    }
  }
  return allRuns;
}
