// Shared geometry for APPLIED finish panels — the boards fixed to the
// outside of a carcass: finished ends, an exposed back, a wall cabinet's
// finished underside. Used by the plan view, the front elevation and the
// quote import route so all three agree on how much space a panel takes and
// where it sits.
//
// The rule throughout: a cabinet's dimensions describe its CARCASS and never
// change. calculateCabinetCutList() fits the sides/top/bottom inside width_mm
// and cuts the back at full width_mm, so a panel applied to the outside
// genuinely adds its own thickness to the overall size. A 600 wide cabinet
// with an 18mm finished end is 618 overall.

import { islandVirtualWall } from "./pcd-kickboard-utils";

export const DEFAULT_PANEL_THICKNESS_MM = 16;

// Only these carry applied ends — the same scoping the right panel's
// end_panel_left/right toggles and the cut list use. Corner cabinets expose
// their ends per leg and are handled separately.
const END_PANEL_TYPES = new Set(["base_cabinet", "tall_cabinet", "wall_cabinet", "blind_corner_cabinet"]);

// Thickness of one applied finish panel, mirroring the fallback chain in the
// import route's finishPanelBoard() (finish panel style → door style →
// carcass board). Kept in step with it deliberately: the space reserved on
// the drawing has to be the board the quote actually cuts.
export function finishPanelThicknessMm(item) {
  return (
    Number(item?.finish_panel_style?.thickness_mm) ||
    Number(item?.door_style?.thickness_mm) ||
    Number(item?.carcass_thickness_mm) ||
    DEFAULT_PANEL_THICKNESS_MM
  );
}

// End panel thicknesses in VIEWER terms — "left" is the left you'd see
// standing in front of the cabinet. This is the shared fact; the two views
// map it onto their own axes differently (see the two helpers below), so
// derive from here rather than reading end_panel_* directly.
export function endPanelThicknesses(item) {
  if (!item || !END_PANEL_TYPES.has(item.item_type)) return { leftT: 0, rightT: 0 };
  const t = finishPanelThicknessMm(item);
  return {
    leftT:  item.end_panel_left  ? t : 0,
    rightT: item.end_panel_right ? t : 0,
  };
}

// PLAN view mapping: how much the end panels add at the low and high ends of
// the item's along-wall axis (low = smaller x/y in room space).
//
// This needs the flip because the room axis and the viewer's axis disagree:
// facing the bottom or left wall you're looking back down the coordinate
// axis, so the cabinet's LEFT end is the one at the HIGH coordinate. Same
// axisFlipped convention panelSideEdges() uses, so the strip drawn on an
// edge and the space reserved beyond it always agree.
export function endPanelSpanMm(item, effectiveWall) {
  const { leftT, rightT } = endPanelThicknesses(item);
  if (!leftT && !rightT) return { lowT: 0, highT: 0 };
  const wall = effectiveWall ?? (item.wall === "island" ? islandVirtualWall(item) : item.wall);
  const flip = wall === "bottom" || wall === "left";
  return flip ? { lowT: rightT, highT: leftT } : { lowT: leftT, highT: rightT };
}

// ELEVATION mapping: the elevation's x axis is ALREADY flipped by
// getWallPos() so that svg-left is always the viewer's left. So a left end
// panel is always at the low end here — no second flip, which would undo it.
export function endPanelElevationSpanMm(item) {
  const { leftT, rightT } = endPanelThicknesses(item);
  return { lowT: leftT, highT: rightT };
}

// Depth added by a finished BACK panel.
//
// Only counted where the back is genuinely exposed — a freestanding island
// or peninsula run, whose back faces the room. A cabinet pushed against a
// wall has no exposed back to finish, so nothing is added there rather than
// silently shoving the carcass off the wall.
export function backPanelDepthMm(item) {
  if (!item?.has_back_panel || item.wall !== "island") return 0;
  return finishPanelThicknessMm(item);
}

// Thickness of a wall cabinet's finished underside panel. It's applied to
// the underside of the carcass, so it hangs BELOW mount_height_mm and adds
// to the cabinet's overall height rather than eating into it.
export function bottomPanelThicknessMm(item) {
  if (!item?.has_bottom_panel || item.item_type !== "wall_cabinet") return 0;
  return finishPanelThicknessMm(item);
}
