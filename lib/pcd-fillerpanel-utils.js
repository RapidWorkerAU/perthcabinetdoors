// Shared filler-panel run detection for design tool items — the counterpart
// to lib/pcd-kickboard-utils.js for the panel that closes the gap between a
// wall cabinet's TOP and the ceiling, rather than the floor-level toe-kick.
//
// Only wall_cabinet gets a filler panel — base/tall/corner cabinets sit on
// the floor and use kickboard instead, and there's no corner wall cabinet
// variant, so (unlike kickboard) a filler panel is always a single segment
// per item, no leg-splitting needed.

import { getWallAxisPos, groupIntoRuns, islandVirtualWall } from "./pcd-kickboard-utils";

const FILLER_PANEL_TYPES = new Set(["wall_cabinet"]);

// The vertical gap between a wall cabinet's top edge and the room's ceiling —
// what the filler panel needs to fill when its height isn't manually
// overridden. Mirrors the mount-height default used elsewhere
// (CABINET_MOUNT_MM.wall_cabinet in FrontElevationView.js).
export function fillerPanelGapMm(item, room) {
  const ceilingHeightMm = room?.height_mm || 2400;
  const mountMm = item.mount_height_mm ?? 1400;
  const cabinetHeightMm = item.height_mm || 720;
  return Math.max(0, ceilingHeightMm - (mountMm + cabinetHeightMm));
}

export function fillerPanelSegment(item) {
  if (!FILLER_PANEL_TYPES.has(item.item_type)) return null;
  const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;
  // A freestanding cabinet rotated 90°/270° runs depth-wise along its
  // virtual wall's axis instead of width-wise — same swap used for
  // kickboard and back panel.
  const rotated90 = item.wall === "island" && (item.rotation || 0) % 180 === 90;
  const length = rotated90 ? (item.depth_mm || 600) : (item.width_mm || 600);
  return { wall, axisPos: getWallAxisPos(item), length, itemId: item.id };
}

// Finds the continuous filler-panel run `item` belongs to. Returns
// { firstItemId, totalWidth, count }. Only wall cabinets with
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
