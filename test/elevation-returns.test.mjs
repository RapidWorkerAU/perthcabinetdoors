// Perpendicular cabinet "returns" on an elevation.
//
// When you view wall 2, a cabinet on wall 1 that butts wall 2 at the corner
// should show its depth-side turning the corner into this view — the way corner
// cabinets already do via their secondary_wall. This tests the real function
// the elevation renders from, so the two can't drift.
import test from "node:test";
import assert from "node:assert/strict";
import { perpendicularCornerReturns } from "../lib/pcd-plan-geometry.js";

const ROOM = { width_mm: 4000, depth_mm: 3000 };
const ids = (rs) => rs.map((r) => r.item.id);

test("a wall cabinet on wall 1 shows its return on the wall it butts", () => {
  // The reported scenario: a wall cabinet on the TOP wall, hard against the
  // LEFT wall. It should appear on the LEFT elevation and nowhere else.
  const cab = {
    id: "w", item_type: "wall_cabinet", wall: "top",
    x_mm: 0, y_mm: 0, width_mm: 600, depth_mm: 350, height_mm: 720, mount_height_mm: 1400,
  };
  const r = perpendicularCornerReturns("left", [cab], ROOM);
  assert.equal(r.length, 1);
  assert.equal(r[0].depthMm, 350, "the return is drawn its depth wide");
  assert.deepEqual([r[0].bottomMm, r[0].topMm], [1400, 2120], "at its real wall-cabinet height");
  // Left wall is axisFlipped, top → low corner → svg-far end of the 3000 wall.
  assert.equal(r[0].alongMm, 3000 - 350);

  // Not on the far wall, not on the parallel wall, not on its own wall.
  assert.equal(perpendicularCornerReturns("right", [cab], ROOM).length, 0);
  assert.equal(perpendicularCornerReturns("bottom", [cab], ROOM).length, 0);
  assert.equal(perpendicularCornerReturns("top", [cab], ROOM).length, 0);
});

test("it follows the cabinet to whichever corner it butts", () => {
  const atRight = {
    id: "w2", item_type: "wall_cabinet", wall: "top",
    x_mm: 3400, width_mm: 600, depth_mm: 350, height_mm: 720, mount_height_mm: 1400,
  };
  assert.deepEqual(ids(perpendicularCornerReturns("right", [atRight], ROOM)), ["w2"]);
  assert.equal(perpendicularCornerReturns("left", [atRight], ROOM).length, 0);
});

test("a base cabinet returns too, at its own height and kickboard", () => {
  const base = {
    id: "b", item_type: "base_cabinet", wall: "left",
    x_mm: 0, y_mm: 0, width_mm: 600, depth_mm: 560, height_mm: 720, mount_height_mm: 0,
    has_kickboard: true, kickboard_height_mm: 150,
  };
  const r = perpendicularCornerReturns("top", [base], ROOM);
  assert.equal(r.length, 1);
  assert.equal(r[0].depthMm, 560);
  assert.deepEqual([r[0].bottomMm, r[0].topMm], [150, 870], "sits on its kickboard");
  assert.equal(r[0].alongMm, 0, "top wall isn't flipped; left corner is svg-left");
});

test("a cabinet not at a corner returns nothing", () => {
  const mid = {
    id: "m", item_type: "wall_cabinet", wall: "top",
    x_mm: 1500, width_mm: 600, depth_mm: 350, height_mm: 720, mount_height_mm: 1400,
  };
  assert.equal(perpendicularCornerReturns("left", [mid], ROOM).length, 0);
  assert.equal(perpendicularCornerReturns("right", [mid], ROOM).length, 0);
});

test("corner cabinets are excluded — they already show via secondary_wall", () => {
  const corner = {
    id: "c", item_type: "corner_base_cabinet", wall: "top", secondary_wall: "left",
    x_mm: 0, y_mm: 0, width_mm: 900, secondary_width_mm: 900, depth_mm: 600, height_mm: 720,
  };
  assert.equal(perpendicularCornerReturns("left", [corner], ROOM).length, 0);
});

test("a shelf & rail returns — thin, but exactly where a cabinet has to stop", () => {
  // A robe shelf on the LEFT wall, hard into the TOP corner. From the top
  // elevation you should see its end: the shelf board plus its cleats, 500 deep,
  // sitting at the shelf-top height, not a full-height box and not nothing.
  const rail = {
    id: "sr", item_type: "shelf_rail", wall: "left",
    x_mm: 0, y_mm: 0, width_mm: 900, depth_mm: 500,
    height_mm: 118, mount_height_mm: 1682, carcass_thickness_mm: 18,
  };
  const r = perpendicularCornerReturns("top", [rail], ROOM);
  assert.equal(r.length, 1);
  assert.equal(r[0].depthMm, 500, "you see the shelf's depth from the next wall");
  assert.deepEqual([r[0].bottomMm, r[0].topMm], [1682, 1800], "shelf top at the standard 1800");
  assert.equal(r[0].alongMm, 0, "left wall sits at the top wall's low corner");
  assert.equal(perpendicularCornerReturns("bottom", [rail], ROOM).length, 0);
});

test("a floating shelf returns too", () => {
  const shelf = {
    id: "fs", item_type: "floating_shelf", wall: "bottom",
    x_mm: 3700, y_mm: 2700, width_mm: 300, depth_mm: 300,
    height_mm: 40, mount_height_mm: 1500,
  };
  const r = perpendicularCornerReturns("right", [shelf], ROOM);
  assert.equal(r.length, 1);
  assert.equal(r[0].depthMm, 300);
  assert.deepEqual([r[0].bottomMm, r[0].topMm], [1500, 1540]);
  assert.equal(perpendicularCornerReturns("left", [shelf], ROOM).length, 0);
});

test("a shelf away from the corner still returns nothing", () => {
  const rail = {
    id: "sr2", item_type: "shelf_rail", wall: "left",
    x_mm: 0, y_mm: 900, width_mm: 900, depth_mm: 500,
    height_mm: 118, mount_height_mm: 1682,
  };
  assert.deepEqual(ids(perpendicularCornerReturns("top", [rail], ROOM)), []);
  assert.deepEqual(ids(perpendicularCornerReturns("bottom", [rail], ROOM)), []);
});
