// Shared finished-back-panel run detection for design tool items — the
// counterpart to lib/pcd-kickboard-utils.js for the visible back cladding
// on a freestanding (island) run, rather than the front toe-kick.
//
// Unlike kickboard, a back panel run doesn't just need a total width — it
// splits into a user-chosen NUMBER of panels (a design choice, e.g. "3
// panels" vs "4 panels" for the same island), and that panel count is a
// single value shared across the whole run, not something each cabinet in
// the run can set independently. Mirroring how kickboard already handles
// its own run-level values (e.g. kickboard_height_mm is only ever read
// from the run's first cabinet), back_panel_qty is only read from the
// run's first cabinet — the other cabinets' own back_panel_qty is ignored
// once merged into a run.
//
// Only base_cabinet and tall_cabinet get a back panel — a corner cabinet's
// "back" isn't a single well-defined side given its L-shape, and wall
// cabinets aren't floor-standing, so both are excluded.

import { getWallAxisPos, groupIntoRuns, islandVirtualWall, wallSpanMm } from "./pcd-kickboard-utils";

const BACK_PANEL_TYPES = new Set(["base_cabinet", "tall_cabinet"]);

export function backPanelSegment(item) {
  if (!BACK_PANEL_TYPES.has(item.item_type)) return null;
  const wall = item.wall === "island" ? islandVirtualWall(item) : item.wall;
  const length = wallSpanMm(item);
  return { wall, axisPos: getWallAxisPos(item), length, itemId: item.id };
}

// Finds the continuous back-panel run `item` belongs to. Returns
// { firstItemId, totalWidth, count }. Only cabinets with has_back_panel
// and back_panel_span "continuous" on the same (virtual) wall are
// considered — "individual" span cabinets never merge into a run, so they
// naturally come back as their own single-cabinet, count:1 result.
export function computeBackPanelRun(item, allItems) {
  const seg = backPanelSegment(item);
  if (!seg) return { firstItemId: item.id, totalWidth: item.width_mm || 600, count: 1 };

  const candidates = allItems
    .filter((i) =>
      i.room_id === item.room_id &&
      i.has_back_panel &&
      (i.back_panel_span || "continuous") === "continuous"
    )
    .map((i) => backPanelSegment(i))
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

// Returns all continuous back-panel runs with 2+ cabinets for a room's
// items, grouped by wall — mirrors computeAllKickboardRuns(). Each
// returned segment carries an `item` reference for display purposes.
export function computeAllBackPanelRuns(roomItems) {
  const byWall = {};
  for (const item of roomItems) {
    if (!item.has_back_panel || (item.back_panel_span || "continuous") !== "continuous") continue;
    const seg = backPanelSegment(item);
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

// Splits a run's total width into `qty` equal-width panels, rounded to the
// nearest mm — any rounding remainder is absorbed into the last panel so
// the pieces still sum exactly to the total.
export function splitBackPanelWidths(totalWidth, qty) {
  const n = Math.max(1, Math.round(qty) || 1);
  const base = Math.floor(totalWidth / n);
  const remainder = totalWidth - base * n;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? base + remainder : base));
}
