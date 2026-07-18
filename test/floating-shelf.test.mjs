// Floating shelf → boards. The construction is a top + bottom + front fascia,
// mitred, optionally capped at either end. These lock the board breakdown and
// dimensions the quote prices off, so a shelf can't silently drop a board or
// mis-size one.
import test from "node:test";
import assert from "node:assert/strict";
import { floatingShelfBoards, floatingShelfAreaSqm, floatingShelfStyle } from "../lib/pcd-floating-shelf-utils.js";

const shelf = (over = {}) => ({ item_type: "floating_shelf", width_mm: 900, depth_mm: 250, height_mm: 40, carcass_thickness_mm: 18, ...over });

test("an open shelf is three boards, correctly sized", () => {
  const boards = floatingShelfBoards(shelf());
  assert.equal(boards.length, 3);
  assert.deepEqual(boards.map((b) => b.part), ["top", "bottom", "front"]);
  // top & bottom are width x depth; front is width x height.
  assert.deepEqual([boards[0].width_mm, boards[0].height_mm], [900, 250]);
  assert.deepEqual([boards[1].width_mm, boards[1].height_mm], [900, 250]);
  assert.deepEqual([boards[2].width_mm, boards[2].height_mm], [900, 40], "front fascia is width x height");
});

test("the open-shelf mitre notes name only the right edges", () => {
  const [top, bottom, front] = floatingShelfBoards(shelf());
  assert.match(top.note, /front edge\.$/);
  assert.match(bottom.note, /front edge\.$/);
  assert.match(front.note, /top & bottom edges\.$/);
  assert.doesNotMatch(top.note, /end/, "no end mitres when nothing is capped");
});

test("a single capped end adds one board and its mitre", () => {
  const boards = floatingShelfBoards(shelf({ end_panel_right: true }));
  assert.equal(boards.length, 4);
  const cap = boards.find((b) => b.part === "cap-right");
  assert.ok(cap, "a right end board exists");
  assert.deepEqual([cap.width_mm, cap.height_mm], [250, 40], "end cap is depth x height");
  assert.match(cap.note, /top, bottom & front edges/);
  // The end edge is now called out on the top/bottom/front too.
  assert.match(boards.find((b) => b.part === "top").note, /front edge \+ right end\./);
  assert.match(boards.find((b) => b.part === "front").note, /top & bottom edges \+ right end\./);
});

test("both ends capped is five boards, both ends named", () => {
  const boards = floatingShelfBoards(shelf({ end_panel_left: true, end_panel_right: true }));
  assert.equal(boards.length, 5);
  assert.match(boards.find((b) => b.part === "top").note, /front edge \+ left & right ends\./);
});

test("area sums every board; style reads the single finish", () => {
  const s = shelf({ material: "decorative board", finish: "Matt", colour: "Char Oak", cost_per_sqm_carcass: 60 });
  // open: 2×(0.9×0.25) + 0.9×0.04 = 0.45 + 0.036 = 0.486
  assert.equal(Math.round(floatingShelfAreaSqm(s) * 1000), 486);
  assert.deepEqual(floatingShelfStyle(s), { material: "decorative board", finish: "Matt", colour: "Char Oak", thickness_mm: 18, cost_per_sqm: 60 });
});
