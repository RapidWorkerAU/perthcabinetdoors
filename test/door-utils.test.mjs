// Front sizing: reveals, finger-pull gaps, hinges, handing, blind corners.
//
// Every case here is a bug that reached real quotes. They share one shape:
// the config panel showed one default while this module used another, so the
// screen and the cut list disagreed silently. Assert the DEFAULTS, not just
// the explicit values — the explicit path was never the broken one.
import test from "node:test";
import assert from "node:assert/strict";
import {
  FINGER_PULL_GAP_MM, DEFAULT_HINGE_QTY, DEFAULT_DOOR_REVEAL_MM,
  doorRowGapMm, drawerGapMm, frontRevealMm, frontWidthMm,
  computeDoorSizesForConfig, computeDrawerSizesForConfig,
  computeCornerDoorLeaves, formatHingeNote,
} from "../lib/pcd-door-utils.js";

test("finger-pull gap: an untouched field means the default, not zero", () => {
  // The panel has always displayed 20. This module read `|| 0`, so a ticked
  // gap drew AND PRICED as nothing until someone hand-edited the field.
  assert.equal(doorRowGapMm({ row_gap_enabled: true }), FINGER_PULL_GAP_MM);
  assert.equal(drawerGapMm({ gap_enabled: true }), FINGER_PULL_GAP_MM);
  assert.equal(doorRowGapMm({ row_gap_enabled: true, row_gap_mm: "" }), FINGER_PULL_GAP_MM);
  // Explicit values still win, and off still means off.
  assert.equal(doorRowGapMm({ row_gap_enabled: true, row_gap_mm: 35 }), 35);
  assert.equal(doorRowGapMm({ row_gap_enabled: false, row_gap_mm: 20 }), 0);
  assert.equal(drawerGapMm({}), 0);
});

test("hinge qty: an untouched dropdown means 2, so drilling gets billed", () => {
  // The dropdown only offers 2/3/4, so 0 was never a deliberate choice — it
  // meant "unset". Reading it as 0 set hinge_holes: false and billed no
  // drilling at all, on most doors, while the panel said "2 hinges".
  const doors = computeDoorSizesForConfig({ columns: 2 }, 800, 720);
  assert.ok(doors.every((d) => d.hingeQty === DEFAULT_HINGE_QTY));
  assert.ok(doors.every((d) => d.hingeQty > 0), "hinge_holes is derived from hingeQty > 0");
  assert.equal(computeDoorSizesForConfig({ columns: 1, hinge_qty: [4] }, 400, 720)[0].hingeQty, 4);
});

test("reveal: fronts never fill the opening", () => {
  assert.equal(DEFAULT_DOOR_REVEAL_MM, 3);
  assert.equal(frontRevealMm({}), 3);
  assert.equal(frontRevealMm({ reveal_mm: 2 }), 2);
  // 0 IS meaningful here (a shop running zero reveal), unlike the gap/hinge
  // defaults, so it must not be overridden.
  assert.equal(frontRevealMm({ reveal_mm: 0 }), 0);

  // Fronts used to be cut to the exact carcass face — 450 + 450 in a 900mm
  // hole — which physically cannot swing. Each front is now width/N - reveal.
  const two = computeDoorSizesForConfig({ columns: 2 }, 900, 720);
  assert.equal(two[0].width, 447);
  assert.equal(two[0].height, 717);
  // Half a reveal at each end, one between: it lands exactly on the face.
  assert.equal(1.5 + 447 + 3 + 447 + 1.5, 900);
  assert.equal(computeDoorSizesForConfig({ columns: 1 }, 600, 720)[0].width, 597);
});

test("reveal: a finger-pull replaces the reveal on its edge, never stacks", () => {
  // The gap IS the reveal on that edge, just a deliberate 20mm one. Stacking
  // them would quietly shrink every gripped door by a further 3mm.
  const gapped = computeDoorSizesForConfig({ columns: 1, row_gap_enabled: true }, 600, 720);
  assert.equal(gapped[0].height, 699); // 720 - 20 - 1.5, not 697
});

test("reveal: unequal door widths still land on the face", () => {
  const un = computeDoorSizesForConfig(
    { columns: 2, equal_width: false, width_ratios: [0.6, 0.4] }, 900, 720
  );
  const widths = un.map((d) => d.width).sort((a, b) => b - a);
  assert.deepEqual(widths, [537, 357]);
  assert.equal(1.5 + 537 + 3 + 357 + 1.5, 900);
});

test("handing reaches the factory and L/R pairs stay separate", () => {
  // hinges: ["L","R"] is a real field the panel asks for, and it was read by
  // nobody. Worse, the grouping key omitted it, so a standard opposing pair
  // collapsed to one line of qty 2 and the factory made two identical doors.
  const pair = computeDoorSizesForConfig({ columns: 2, hinges: ["L", "R"], hinge_qty: [2, 2] }, 900, 720);
  assert.equal(pair.length, 2, "an L/R pair is two products, not one of qty 2");
  assert.deepEqual(pair.map((d) => d.hingeSide), ["L", "R"]);

  // Genuinely identical doors must still merge.
  const same = computeDoorSizesForConfig({ columns: 2, hinges: ["L", "L"], hinge_qty: [2, 2] }, 900, 720);
  assert.equal(same.length, 1);
  assert.equal(same[0].qty, 2);

  assert.match(formatHingeNote(2, [100, 620], 720, "L"), /hinged left/);
  // A corner leaf has no handing — the bi-fold's is fixed by which leaf is
  // frame-hinged — so it must not claim one.
  assert.doesNotMatch(formatHingeNote(2, [100, 620], 720), /hinged/);
});

test("drawers: fronts are shorter than their openings", () => {
  const d = computeDrawerSizesForConfig({ heights_mm: [240, 240, 240] }, 600, 720);
  assert.equal(d[0].width, 597);
  assert.equal(d[0].height, 237);
  assert.equal(3 * (237 + 3), 720, "the stack still fills the cabinet");
  const g = computeDrawerSizesForConfig({ heights_mm: [240], gap_enabled: true }, 600, 720);
  assert.equal(g[0].height, 220, "finger-pull replaces the reveal");
});

test("corner door: one reveal across both leaves, and hinges billed", () => {
  const corner = {
    item_type: "corner_base_cabinet", wall: "top", secondary_wall: "right",
    width_mm: 900, secondary_width_mm: 900, depth_mm: 600, height_mm: 720,
    door_config: { hinge_wall: "primary" },
  };
  const leaves = computeCornerDoorLeaves(corner);
  assert.equal(leaves.length, 2);
  // Both shortened equally, so they still line up as the door folds.
  assert.deepEqual(leaves.map((l) => l.heightMm), [717, 717]);
  // Only the frame-hinged leaf is drilled; the other folds off it.
  assert.deepEqual(leaves.map((l) => l.hingeQty), [DEFAULT_HINGE_QTY, 0]);
});

test("blind corner: the front spans the opening, not the carcass", () => {
  const blind = {
    item_type: "blind_corner_cabinet", width_mm: 900, height_mm: 720,
    blind_width_mm: 450, front_type: "doors", door_config: { columns: 1 },
  };
  assert.equal(frontWidthMm(blind), 450);
  assert.equal(computeDoorSizes_width(blind), 447, "450 opening - 3 reveal");
  // Every other type is unaffected.
  assert.equal(frontWidthMm({ item_type: "base_cabinet", width_mm: 900 }), 900);
  assert.equal(frontWidthMm({ ...blind, blind_width_mm: null }), 900);
});

function computeDoorSizes_width(item) {
  return computeDoorSizesForConfig(item.door_config, frontWidthMm(item), item.height_mm)[0].width;
}
