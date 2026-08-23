// Applied finish panels: how far they run vertically, and how deep a finished
// end is once there is a finished back behind it.
//
// panel_to_floor / panel_to_ceiling are read by three places that must agree —
// the quote import, the front elevation and the 3D view — so the rules live in
// one helper and are checked here rather than three times over.
import test from "node:test";
import assert from "node:assert/strict";
import {
  finishPanelVerticalSpanMm,
  endPanelBackExtensionMm,
  finishPanelThicknessMm,
} from "../lib/pcd-finishpanel-utils.js";
import { finishedSidePanelDepthMm } from "../lib/pcd-door-utils.js";

const ROOM_H = 2400;

// A plain 720 high base cabinet on a 150 kickboard: carcass runs 150 to 870.
const base = (over = {}) => ({
  item_type: "base_cabinet",
  width_mm: 600, height_mm: 720, depth_mm: 600,
  kickboard_height_mm: 150, has_kickboard: true,
  carcass_thickness_mm: 16,
  finish_panel_style: { thickness_mm: 18 },
  ...over,
});

test("with neither flag a panel stays at the carcass height", () => {
  const { bottomMm, topMm } = finishPanelVerticalSpanMm(base(), ROOM_H);
  assert.equal(bottomMm, 150);
  assert.equal(topMm, 870);
});

test("panel_to_floor drops the bottom to the floor", () => {
  const { bottomMm, topMm } = finishPanelVerticalSpanMm(base({ panel_to_floor: true }), ROOM_H);
  assert.equal(bottomMm, 0);
  assert.equal(topMm, 870);
});

test("panel_to_ceiling raises the top to the ceiling", () => {
  const { bottomMm, topMm, heightMm } = finishPanelVerticalSpanMm(base({ panel_to_ceiling: true }), ROOM_H);
  assert.equal(bottomMm, 150);
  assert.equal(topMm, ROOM_H);
  assert.equal(heightMm, ROOM_H - 150);
});

test("both flags together run the panel floor to ceiling", () => {
  const { bottomMm, topMm, heightMm } = finishPanelVerticalSpanMm(
    base({ panel_to_floor: true, panel_to_ceiling: true }), ROOM_H
  );
  assert.equal(bottomMm, 0);
  assert.equal(topMm, ROOM_H);
  assert.equal(heightMm, ROOM_H);
});

test("panel_to_ceiling needs a room height to act on", () => {
  // No room height means no ceiling to run to, so the panel stays put rather
  // than collapsing to zero against a 0mm ceiling.
  const { topMm } = finishPanelVerticalSpanMm(base({ panel_to_ceiling: true }), 0);
  assert.equal(topMm, 870);
});

test("the flags apply to a back panel exactly as they do to an end", () => {
  // Both come out of the same helper, which is the point: a cabinet marked to
  // run to the floor runs ALL its finished panels there, not just the ends.
  const item = base({ has_back_panel: true, panel_to_floor: true });
  assert.equal(finishPanelVerticalSpanMm(item, ROOM_H).bottomMm, 0);
});

test("a finished end runs deeper when there is a finished back behind it", () => {
  // The back sits inside the ends, so the ends carry past the carcass back and
  // cover its edge. A 600 deep cabinet with an 18mm finished back has 618 ends.
  assert.equal(endPanelBackExtensionMm(base()), 0);
  assert.equal(endPanelBackExtensionMm(base({ has_back_panel: true })), 18);
  assert.equal(finishedSidePanelDepthMm(base()), 600);
  assert.equal(finishedSidePanelDepthMm(base({ has_back_panel: true })), 618);
});

test("a corner cabinet's per-leg backs count too", () => {
  // Corners name their backs back_panel_wall1 / wall2 rather than has_back_panel.
  assert.equal(endPanelBackExtensionMm(base({ back_panel_wall1: true })), 18);
  assert.equal(endPanelBackExtensionMm(base({ back_panel_wall2: true })), 18);
});

test("the back extension follows the finish panel thickness", () => {
  // Not the carcass's own structural back board — that is a different piece.
  const item = base({ has_back_panel: true, back_panel_thickness_mm: 12, finish_panel_style: { thickness_mm: 21 } });
  assert.equal(finishPanelThicknessMm(item), 21);
  assert.equal(endPanelBackExtensionMm(item), 21);
});
