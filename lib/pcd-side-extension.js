// Running a finished top or a kickboard past the end of its cabinet, to the
// wall or the next thing along.
//
// The case it is for: a cabinet stands off a wall and a side filler closes the
// gap. The filler lines up with the cabinet, but the top stopped at the cabinet
// and the kickboard stopped at the cabinet too, set back behind the filler. So
// the top did not read as one top and there was a hole under the filler. Each
// can now carry on past either end.
//
// Settings live in the panel's own panel_options entry ("top", "kickboard"):
//
//   { extend_left: true, extend_left_mm: 45 }
//
// Left and right are the VIEWER'S, looking at the cabinet's face, the same as
// the end panels and side fillers. The length is what was typed, or when
// nothing was, the side filler's width on that side, or when there is no
// filler, the measured gap to the wall or the next item. Measured live, like
// the filler, so moving the cabinet moves the answer.
//
// One definition for the drawing, the 3D view, the cut list and the quote.

import { panelOption } from "./pcd-panel-options";
import { sideFillerGapMm, sideFillerWidthMm } from "./pcd-fillerpanel-utils";
import { isCornerType, islandVirtualWall } from "./pcd-kickboard-utils";

export const SIDES = ["left", "right"];

/** Is this panel set to run past this end of the cabinet. */
export function sideExtensionOn(item, panelKey, side) {
  if (!item || isCornerType(item)) return false;
  return Boolean(panelOption(item, panelKey)[`extend_${side}`]);
}

/** The typed length, or null when nobody typed one. */
export function sideExtensionTypedMm(item, panelKey, side) {
  const v = Number(panelOption(item, panelKey)[`extend_${side}_mm`]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * What the extension would be if nobody typed a length: the side filler on
 * that side, or the measured gap. `ctx` is { room, items }, every item in the
 * room, obstructions included, so the measurement stops at what is really in
 * the way.
 */
export function sideExtensionMeasuredMm(item, side, ctx = {}) {
  const items = ctx.items || [];
  if (item?.[`side_filler_${side}`]) return Math.round(sideFillerWidthMm(item, ctx.room, items, side));
  if (!ctx.room) return 0;
  return Math.round(sideFillerGapMm(item, ctx.room, items, side));
}

/** How far this panel runs past this end, in mm. 0 when it does not. */
export function sideExtensionMm(item, panelKey, side, ctx = {}) {
  if (!sideExtensionOn(item, panelKey, side)) return 0;
  const typed = sideExtensionTypedMm(item, panelKey, side);
  return typed != null ? typed : Math.max(0, sideExtensionMeasuredMm(item, side, ctx));
}

/** Both ends in viewer terms: { leftMm, rightMm }. The elevation reads this. */
export function sideExtensionsMm(item, panelKey, ctx = {}) {
  return {
    leftMm: sideExtensionMm(item, panelKey, "left", ctx),
    rightMm: sideExtensionMm(item, panelKey, "right", ctx),
  };
}

/**
 * Both ends on the room's along-wall axis: { lowMm, highMm }, low being the
 * smaller x or y. Facing the bottom or left wall you look back down the axis,
 * so the viewer's left is the high end there. Same flip as endPanelSpanMm.
 */
export function sideExtensionsAxisMm(item, panelKey, ctx = {}, effectiveWall) {
  const { leftMm, rightMm } = sideExtensionsMm(item, panelKey, ctx);
  if (!leftMm && !rightMm) return { lowMm: 0, highMm: 0 };
  const wall = effectiveWall ?? (item.wall === "island" ? islandVirtualWall(item) : item.wall);
  const flip = wall === "bottom" || wall === "left";
  return flip ? { lowMm: rightMm, highMm: leftMm } : { lowMm: leftMm, highMm: rightMm };
}
