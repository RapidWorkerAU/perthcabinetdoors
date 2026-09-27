// Shared top-panel run detection.
//
// A finished top panel is an applied horizontal board sitting on the carcass
// top. On a wall cabinet it finishes the top you can see; on a low base run it
// is the finished surface of a bench built from white carcasses. That is NOT a
// benchtop: it is our own board, cut and quoted like every other finished
// panel. When finished side panels are on, the top spans over them too, so its
// cut width is carcass width plus the applied side panel thicknesses.
//
// It adds its own thickness to the cabinet's overall height, the same way an
// end panel adds to its width: a 400 carcass on a 120 kickboard with an 18 top
// stands 538 tall. occupiedVerticalSpanMm below is that overall height.

import { getWallAxisPos, groupIntoRuns, islandVirtualWall, wallSpanMm, cabinetVerticalSpanMm, kickboardOffsetMm } from "./pcd-kickboard-utils";
import { endPanelSpanMm, finishPanelThicknessMm, bottomPanelThicknessMm } from "./pcd-finishpanel-utils";

export const TOP_PANEL_TYPES = new Set(["wall_cabinet", "base_cabinet", "blind_corner_cabinet"]);

/** Can this cabinet type carry a finished top panel at all. */
export function topPanelAllowedFor(item) {
  return TOP_PANEL_TYPES.has(item?.item_type ?? item);
}

/** Does this cabinet have a finished top panel switched on. */
export function hasTopPanel(item) {
  return Boolean(item?.has_top_panel) && topPanelAllowedFor(item);
}

/**
 * A low cabinet is finished with a benchtop OR a top panel, never both: they
 * would sit in the same place. Switching one on switches the other off. The
 * admin and the public tool both build their patch here so the rule lives once.
 */
export function topSurfacePatch(field, on) {
  const patch = { [field]: Boolean(on) };
  if (on && field === "has_top_panel") patch.has_benchtop = false;
  if (on && field === "has_benchtop") patch.has_top_panel = false;
  return patch;
}

/**
 * The vertical extent [bottomMm, topMm] a cabinet OCCUPIES: the carcass lifted
 * by its kickboard, plus a finished top panel above it and a finished underside
 * panel below it. This is the cabinet's overall height and it is what every
 * measurement reads: the elevation's snapping and collision, the space between
 * readouts, the plan's clash checks. Draw the carcass box from
 * cabinetVerticalSpanMm; measure against this.
 */
export function occupiedVerticalSpanMm(item) {
  const [bottom, top] = cabinetVerticalSpanMm(item);
  return [bottom - bottomPanelThicknessMm(item), top + topPanelThicknessMm(item)];
}

/**
 * The cabinet's overall height as you would tape it: kickboard, carcass and any
 * finished top or underside. 120 + 400 + 18 = 538.
 */
export function overallHeightMm(item) {
  const [bottom, top] = occupiedVerticalSpanMm(item);
  return Math.round(top - bottom + kickboardOffsetMm(item));
}

export function topPanelSideExtensionMm(item, effectiveWall) {
  if (!item || !TOP_PANEL_TYPES.has(item.item_type)) return { lowT: 0, highT: 0 };
  return endPanelSpanMm(item, effectiveWall);
}

export function topPanelWidthMm(item, effectiveWall) {
  const { lowT, highT } = topPanelSideExtensionMm(item, effectiveWall);
  return Math.max(0, wallSpanMm(item) + lowT + highT);
}

// A colour picked for the top alone brings its own board, and the quote cuts
// that board (applyPanelOverride), so the height has to use its thickness too.
export function topPanelThicknessMm(item) {
  if (!hasTopPanel(item)) return 0;
  return Number(item.top_panel_style?.thickness_mm) || finishPanelThicknessMm(item);
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
    // The height the board lies at. Only tops at the same height can be one
    // board: a wall cabinet's top and the low run under it share a wall and an
    // along-wall position, and are never the same panel.
    level: Math.round(cabinetVerticalSpanMm(item)[1]),
  };
}

export function computeTopPanelRun(item, allItems) {
  const seg = topPanelSegment(item);
  if (!seg) return { firstItemId: item.id, totalWidth: item.width_mm || 600, count: 1 };

  const candidates = allItems
    .filter((i) =>
      i.room_id === item.room_id &&
      hasTopPanel(i) &&
      (i.top_panel_span || "continuous") === "continuous"
    )
    .map((i) => topPanelSegment(i))
    .filter((s) => s && s.wall === seg.wall && s.level === seg.level);

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
    if (!hasTopPanel(item) || (item.top_panel_span || "continuous") !== "continuous") continue;
    const seg = topPanelSegment(item);
    if (!seg) continue;
    const key = `${seg.wall || "top"}|${seg.level}`;
    if (!byWall[key]) byWall[key] = [];
    byWall[key].push({ ...seg, item });
  }

  const allRuns = [];
  for (const segs of Object.values(byWall)) {
    for (const run of groupIntoRuns(segs)) {
      if (run.length >= 2) allRuns.push({ wall: segs[0].wall || "top", segments: run });
    }
  }
  return allRuns;
}
