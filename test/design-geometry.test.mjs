// Shared plan geometry: kickboard/panel runs, kickboard lift, applied panels.
//
// These feed both the drawing and the cut list, so a wrong value here shows up
// as a board that's the wrong length rather than as anything visibly broken.
import test from "node:test";
import assert from "node:assert/strict";
import {
  kickboardSegments, kickboardOffsetMm, cabinetVerticalSpanMm,
  getWallAxisPos, wallSpanMm,
} from "../lib/pcd-kickboard-utils.js";
import { fillerPanelGapMm, fillerPanelSegment } from "../lib/pcd-fillerpanel-utils.js";
import { backPanelSegment } from "../lib/pcd-backpanel-utils.js";
import {
  finishPanelThicknessMm, endPanelSpanMm, endPanelElevationSpanMm,
  backPanelDepthMm, bottomPanelThicknessMm,
} from "../lib/pcd-finishpanel-utils.js";

const ROOM = { width_mm: 4000, depth_mm: 3000 };
const island = (rotation) => ({
  id: "i", item_type: "base_cabinet", wall: "island", rotation, x_mm: 1000, y_mm: 500,
  width_mm: 900, depth_mm: 600, height_mm: 720,
  has_kickboard: true, has_back_panel: true, has_filler_panel: true,
});

test("a rotated island still presents its full width to its wall", () => {
  // `rotated90 ? depth : width` was copied into six files, with a comment
  // claiming it mirrored islandEffectiveDims. It doesn't: rotating the item
  // turns its virtual wall WITH it, so the two swaps cancel. The old formula
  // cut a 900mm front face's kickboard at 600mm — 300mm short, every time.
  for (const rot of [0, 90, 180, 270]) {
    assert.equal(wallSpanMm(island(rot)), 900, `rotation ${rot}`);
    assert.equal(kickboardSegments(island(rot), ROOM)[0].length, 900, `kickboard at rotation ${rot}`);
  }
  assert.equal(backPanelSegment(island(90))?.length, 900);
  assert.equal(fillerPanelSegment({ ...island(90), item_type: "tall_cabinet" })?.length, 900);
});

test("an island's coordinates are read straight, with no legacy-format guess", () => {
  // The old/new-format heuristic is only meaningful on a real left/right WALL.
  // An island's x and y are both genuine room coordinates, so `x > 0` there
  // means "1000mm across the room", not "legacy row" — and an island sitting
  // at y=0 was reported 1000mm along its wall, splitting cut-list runs.
  const at = (rot, x, y) => getWallAxisPos({ wall: "island", rotation: rot, x_mm: x, y_mm: y });
  assert.equal(at(90, 1000, 0), 0, "rot 90 reads y, even when y is 0");
  assert.equal(at(90, 1000, 500), 500);
  assert.equal(at(0, 1000, 500), 1000, "rot 0 reads x");
  // Real walls keep the heuristic.
  assert.equal(getWallAxisPos({ wall: "left", x_mm: 800, y_mm: 0 }), 800, "legacy format");
  assert.equal(getWallAxisPos({ wall: "left", x_mm: 0, y_mm: 800 }), 800, "new format");
});

test("a kickboard genuinely lifts the carcass", () => {
  // This was applied only when DRAWING, so every measurement, collision and
  // filler calc placed a kickboarded carcass a full kickboard too low.
  const base = { item_type: "base_cabinet", mount_height_mm: 0, height_mm: 720 };
  assert.equal(kickboardOffsetMm(base), 0);
  assert.equal(kickboardOffsetMm({ ...base, has_kickboard: true }), 120, "defaults to 120");
  assert.equal(kickboardOffsetMm({ item_type: "wall_cabinet", has_kickboard: true }), 0, "wall cabs hang");

  assert.deepEqual(cabinetVerticalSpanMm({ ...base, has_kickboard: true }), [120, 840]);
  assert.deepEqual(cabinetVerticalSpanMm(base), [0, 720]);
  // The reported symptom: a wall cab at 1400 is 560 above that top, not 680.
  assert.equal(1400 - cabinetVerticalSpanMm({ ...base, has_kickboard: true })[1], 560);
});

test("the auto filler height accounts for the kickboard", () => {
  // Unlike the other symptoms this one is SAVED to filler_panel_height_mm and
  // imported, so it reached the cut list and the customer's PDF.
  const room = { height_mm: 2400 };
  const tall = { id: "t", room_id: "r", item_type: "tall_cabinet", wall: "top", x_mm: 0,
                 width_mm: 600, mount_height_mm: 0, height_mm: 2100 };
  assert.equal(fillerPanelGapMm(tall, room, []), 300);
  assert.equal(fillerPanelGapMm({ ...tall, has_kickboard: true }, room, []), 180);
});

test("applied panels add to the cabinet, they don't eat into it", () => {
  const wallCab = {
    item_type: "wall_cabinet", width_mm: 600, height_mm: 720, depth_mm: 350,
    mount_height_mm: 1400, finish_panel_style: { thickness_mm: 18 },
  };
  assert.equal(finishPanelThicknessMm(wallCab), 18, "finish panel style wins");
  assert.equal(finishPanelThicknessMm({ door_style: { thickness_mm: 20 } }), 20, "falls back to door");
  assert.equal(finishPanelThicknessMm({}), 16, "final default");

  // The stated rule: a 600 carcass with an 18mm end is 618 overall.
  const s = endPanelSpanMm({ ...wallCab, wall: "top", end_panel_right: true });
  assert.equal(600 + s.lowT + s.highT, 618);

  // An underside panel HANGS BELOW the carcass rather than shortening it.
  const under = { ...wallCab, has_bottom_panel: true };
  const [bottom, top] = cabinetVerticalSpanMm(under);
  assert.deepEqual([bottom, top], [1400, 2120], "the carcass itself is unmoved");
  assert.equal(bottom - bottomPanelThicknessMm(under), 1382, "the panel hangs below it");
});

test("the plan flips the end-panel axis; the elevation must not", () => {
  // "Left end" means the viewer's left. Facing the bottom/left wall you look
  // back down the room axis, so it's the HIGH coordinate there. The elevation
  // is already flipped by getWallPos, so a second flip would undo it. These
  // two are duals — if they ever agree on a mirrored wall, one is wrong.
  const p = { item_type: "wall_cabinet", finish_panel_style: { thickness_mm: 18 }, end_panel_left: true };
  assert.deepEqual(endPanelSpanMm({ ...p, wall: "top" }), { lowT: 18, highT: 0 });
  assert.deepEqual(endPanelSpanMm({ ...p, wall: "bottom" }), { lowT: 0, highT: 18 }, "plan flips");
  assert.deepEqual(endPanelElevationSpanMm({ ...p, wall: "bottom" }), { lowT: 18, highT: 0 }, "elevation does not");
});

test("a finished back is dimensional only where the back is exposed", () => {
  const cab = { item_type: "base_cabinet", finish_panel_style: { thickness_mm: 18 }, has_back_panel: true };
  assert.equal(backPanelDepthMm({ ...cab, wall: "island" }), 18);
  assert.equal(backPanelDepthMm({ ...cab, wall: "top" }), 0, "a wall cabinet has no exposed back");
});
