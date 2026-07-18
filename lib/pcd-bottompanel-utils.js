// Shared underside-panel run detection for design tool items — the
// counterpart to lib/pcd-backpanel-utils.js for the visible UNDERSIDE of a
// wall cabinet run, rather than the back face of a floor-standing run.
//
// Only wall_cabinet gets an underside panel — base/tall cabinets sit on the
// floor (no visible underside) and use kickboard instead, and there's no
// corner wall cabinet variant, so this is always a single segment per item,
// no leg-splitting needed (same simplification as filler panel).
//
// Like back panel, an underside panel run splits into a user-chosen NUMBER
// of panels (bottom_panel_qty), read only from the run's first cabinet once
// merged — reuses splitBackPanelWidths() since that math isn't actually
// back-panel-specific, just generic equal-width splitting.

import { getWallAxisPos, groupIntoRuns, islandVirtualWall, wallSpanMm } from "./pcd-kickboard-utils";

const BOTTOM_PANEL_TYPES = new Set(["wall_cabinet"]);

export function bottomPanelSegment(item) {
  if (!BOTTOM_PANEL_TYPES.has(item.item_type)) return null;
  const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;
  const length = wallSpanMm(item);
  return { wall, axisPos: getWallAxisPos(item), length, itemId: item.id };
}

// Finds the continuous underside-panel run `item` belongs to. Returns
// { firstItemId, totalWidth, count }. Only wall cabinets with
// has_bottom_panel and bottom_panel_span "continuous" on the same (virtual)
// wall are considered — "individual" span cabinets never merge into a run,
// so they naturally come back as their own single-cabinet, count:1 result.
export function computeBottomPanelRun(item, allItems) {
  const seg = bottomPanelSegment(item);
  if (!seg) return { firstItemId: item.id, totalWidth: item.width_mm || 600, count: 1 };

  const candidates = allItems
    .filter((i) =>
      i.room_id === item.room_id &&
      i.has_bottom_panel &&
      (i.bottom_panel_span || "continuous") === "continuous"
    )
    .map((i) => bottomPanelSegment(i))
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

// Returns all continuous underside-panel runs with 2+ cabinets for a room's
// items, grouped by wall — mirrors computeAllBackPanelRuns(). Each returned
// segment carries an `item` reference for display purposes.
export function computeAllBottomPanelRuns(roomItems) {
  const byWall = {};
  for (const item of roomItems) {
    if (!item.has_bottom_panel || (item.bottom_panel_span || "continuous") !== "continuous") continue;
    const seg = bottomPanelSegment(item);
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
