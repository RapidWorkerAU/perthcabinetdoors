// Shared top-panel run detection for wall cabinets.
//
// A finished top panel is an applied horizontal board sitting above a wall
// cabinet. When finished side panels are enabled, the top panel spans over
// those panels too, so its cut width is carcass width plus the applied side
// panel thicknesses.

import { getWallAxisPos, groupIntoRuns, islandVirtualWall, wallSpanMm } from "./pcd-kickboard-utils";
import { endPanelSpanMm, finishPanelThicknessMm } from "./pcd-finishpanel-utils";

const TOP_PANEL_TYPES = new Set(["wall_cabinet"]);

export function topPanelSideExtensionMm(item, effectiveWall) {
  if (!item || !TOP_PANEL_TYPES.has(item.item_type)) return { lowT: 0, highT: 0 };
  return endPanelSpanMm(item, effectiveWall);
}

export function topPanelWidthMm(item, effectiveWall) {
  const { lowT, highT } = topPanelSideExtensionMm(item, effectiveWall);
  return Math.max(0, wallSpanMm(item) + lowT + highT);
}

export function topPanelThicknessMm(item) {
  if (!item?.has_top_panel || item.item_type !== "wall_cabinet") return 0;
  return finishPanelThicknessMm(item);
}

export function topPanelSegment(item) {
  if (!TOP_PANEL_TYPES.has(item.item_type)) return null;
  const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;
  const { lowT } = topPanelSideExtensionMm(item, wall);
  return {
    wall,
    axisPos: getWallAxisPos(item) - lowT,
    length: topPanelWidthMm(item, wall),
    itemId: item.id,
  };
}

export function computeTopPanelRun(item, allItems) {
  const seg = topPanelSegment(item);
  if (!seg) return { firstItemId: item.id, totalWidth: item.width_mm || 600, count: 1 };

  const candidates = allItems
    .filter((i) =>
      i.room_id === item.room_id &&
      i.has_top_panel &&
      (i.top_panel_span || "continuous") === "continuous"
    )
    .map((i) => topPanelSegment(i))
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

export function computeAllTopPanelRuns(roomItems) {
  const byWall = {};
  for (const item of roomItems) {
    if (!item.has_top_panel || (item.top_panel_span || "continuous") !== "continuous") continue;
    const seg = topPanelSegment(item);
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
