// A VARIATION THAT RESIZES A CABINET HAS TO RESIZE ITS PANELS.
//
// The production sheet cuts a cabinet from the panel list snapshotted when the
// order was raised, not from the line's width and height. A variation that
// changed a cabinet updated the line and left the panel list alone, so the
// workshop kept cutting to the size the variation had just superseded, and
// nothing on the sheet said so. The order looked right on every screen.

import test from "node:test";
import assert from "node:assert/strict";

import { resnapshotCabinet } from "../lib/pcd-order-variations.js";

// A cabinet as it is stored on an order line: the sizes, and the panel list
// that was calculated from them.
function cabinet(overrides = {}) {
  return {
    label: "Base cabinet 1",
    item_type: "base_cabinet",
    width_mm: 900,
    height_mm: 720,
    depth_mm: 560,
    carcass_thickness_mm: 16,
    carcass_material: "Decorative Board",
    calculated_cut_list: [
      { label: "Side panel", qty: 2, width_mm: 560, height_mm: 720, thickness_mm: 16 },
      { label: "Bottom panel", qty: 1, width_mm: 868, height_mm: 560, thickness_mm: 16 },
    ],
    ...overrides,
  };
}

// The calculator names panels "Left side panel", not "Side panel", so this
// matches loosely on purpose. A test that silently finds nothing and compares
// undefined proves the opposite of what it claims to.
function pieceNamed(list, label) {
  const found = list.find((piece) => String(piece.label).toLowerCase().includes(label.toLowerCase()));
  assert.ok(found, `no panel named "${label}" in the rebuilt list: ${list.map((p) => p.label).join(", ")}`);
  return found;
}

test("a cabinet made shorter has its panels rebuilt at the new height", () => {
  const rebuilt = resnapshotCabinet(cabinet(), { height_mm: 600, width_mm: 900 });
  assert.ok(rebuilt, "a real size change has to produce a rebuild");
  assert.equal(rebuilt.height_mm, 600, "the cabinet itself has to move to the new height");
  assert.ok(rebuilt.calculated_cut_list.length > 0, "a rebuild with no panels is the loss of the cut list");
  assert.equal(
    pieceNamed(rebuilt.calculated_cut_list, "side panel").height_mm,
    600,
    "the side panels still say 720, so the workshop cuts to the superseded size"
  );
});

test("a cabinet made wider has its panels rebuilt at the new width", () => {
  const rebuilt = resnapshotCabinet(cabinet(), { height_mm: 720, width_mm: 1200 });
  assert.ok(rebuilt, "a real size change has to produce a rebuild");
  assert.equal(rebuilt.width_mm, 1200);
  const bottom = pieceNamed(rebuilt.calculated_cut_list, "bottom panel");
  assert.ok(bottom.width_mm > 900, `the bottom panel is still ${bottom.width_mm}mm, cut for the old carcass`);
});

// Returning null means "leave the snapshot exactly as it is". A variation that
// changes a colour must not be an excuse to recalculate panels nobody asked
// about: the stored list can hold hand corrections, and a silent rebuild would
// throw them away.
test("a variation that changes no size leaves the panel list untouched", () => {
  assert.equal(resnapshotCabinet(cabinet(), { height_mm: 720, width_mm: 900 }), null);
});

test("a line with no sizes on it leaves the panel list untouched", () => {
  assert.equal(resnapshotCabinet(cabinet(), {}), null);
  assert.equal(resnapshotCabinet(cabinet(), { height_mm: 0, width_mm: 0 }), null);
});

test("a line that is not a cabinet has nothing to rebuild", () => {
  assert.equal(resnapshotCabinet(null, { height_mm: 600 }), null);
  assert.equal(resnapshotCabinet(undefined, { height_mm: 600 }), null);
});

// A rebuild that produces nothing is worse than a stale list. Wrong panels are
// at least visible; no panels is a cabinet the workshop has nothing to cut for.
test("a rebuild that produces no panels is refused rather than saved", () => {
  const unbuildable = resnapshotCabinet(cabinet({ item_type: "not_a_cabinet_type_we_know" }), { height_mm: 600 });
  if (unbuildable) {
    assert.ok(
      unbuildable.calculated_cut_list.length > 0,
      "an empty cut list was saved over a real one, so the cabinet has no panels to cut"
    );
  }
});

// The rest of the snapshot is not the variation's business.
test("a rebuild keeps everything about the cabinet the variation did not change", () => {
  const rebuilt = resnapshotCabinet(cabinet({ notes: "Chamfer the top front edge" }), { height_mm: 600 });
  assert.equal(rebuilt.notes, "Chamfer the top front edge", "a hand written cutting note must survive a resize");
  assert.equal(rebuilt.label, "Base cabinet 1");
  assert.equal(rebuilt.depth_mm, 560, "the depth was not part of the variation and must not move");
});
