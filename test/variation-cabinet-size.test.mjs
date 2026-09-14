// VARYING A BASE CABINET.
//
// A cabinet could not be changed on a variation. Picking one opened an empty
// pair of size boxes, so there was nothing to edit and the screen read as
// "cabinets cannot be varied".
//
// The cause is a data shape, not a layout: every other kind of line carries
// height_mm and width_mm on the order line itself, and a base cabinet does not.
// Its line is mostly a name and a price; the dimensions live in
// cabinet_config_snapshot beside the shelves, the carcass board and the cut
// list. In the live data those two columns on a cabinet line are null.
//
// The back end was already right. resnapshotCabinet takes a varied height and
// width, rebuilds the config, and recalculates the cut list, the material cost
// and the labour hours with it. Only the editor was missing, because it read
// the size off the line and found nothing there.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resnapshotCabinet } from "../lib/pcd-order-variations.js";
import { isCabinetLine } from "../lib/pcd-order-item-label.js";

const editor = readFileSync(
  new URL("../app/admin/orders/[id]/variations/[variationId]/VariationEditor.js", import.meta.url),
  "utf8"
);

// The shape the live database actually holds: no size on the line, the size in
// the snapshot. This is the row that used to open blank.
const CABINET_LINE = {
  id: "line-1",
  product_type: "base_cabinet",
  title: "Open shelf",
  height_mm: null,
  width_mm: null,
  cabinet_config_snapshot: {
    label: "Open shelf",
    height_mm: 380,
    width_mm: 1148,
    depth_mm: 310,
    carcass_material: "Decorative Board",
    carcass_thickness_mm: 16,
    shelf_qty: 0,
    back_panel_included: true,
  },
};

test("a cabinet line really does keep its size in the config, not on the line", () => {
  assert.equal(isCabinetLine(CABINET_LINE), true);
  assert.equal(CABINET_LINE.height_mm, null, "this is the shape that caused the empty boxes");
  assert.equal(CABINET_LINE.cabinet_config_snapshot.height_mm, 380);
});

test("the editor seeds the size from the config, falling back from the line", () => {
  assert.ok(
    editor.includes("function itemSize(item)"),
    "there has to be one place that decides where a line's size comes from"
  );
  assert.match(
    editor,
    /height_mm: item\?\.height_mm \|\| config\.height_mm/,
    "the line first, then the config: a cabinet already varied carries its new size on the line"
  );
  assert.match(editor, /width_mm: size\.width_mm/, "and the draft has to actually use it");
  assert.match(editor, /height_mm: size\.height_mm/);
});

// THE PART THAT MAKES IT A REAL CHANGE RATHER THAN A NUMBER ON A FORM.
test("changing the size rebuilds the carcass and its cut list", () => {
  const rebuilt = resnapshotCabinet(CABINET_LINE.cabinet_config_snapshot, { height_mm: 500, width_mm: 900 });

  assert.ok(rebuilt, "a real size change has to rebuild");
  assert.equal(rebuilt.height_mm, 500);
  assert.equal(rebuilt.width_mm, 900);
  assert.equal(rebuilt.depth_mm, 310, "depth is carried through untouched");
  assert.ok(rebuilt.calculated_cut_list?.length, "the panels are recut to the new size");
  assert.ok(Number(rebuilt.calculated_material_cost_ex_gst) >= 0, "and recosted");
});

test("a variation that changes nothing about the size leaves the cut list alone", () => {
  const same = resnapshotCabinet(CABINET_LINE.cabinet_config_snapshot, { height_mm: 380, width_mm: 1148 });
  assert.equal(same, null, "no rebuild, so a colour change cannot quietly recut the panels");

  const neither = resnapshotCabinet(CABINET_LINE.cabinet_config_snapshot, { colour: "Black Wenge" });
  assert.equal(neither, null);
});

// Depth is shown and not editable. A variation line has no depth column and
// resnapshotCabinet does not read one, so offering the field would be offering
// a change that silently does not happen.
test("depth is shown to the reader and not offered as a change", () => {
  assert.match(editor, /Depth mm/, "the reader can see the third dimension");
  assert.match(editor, /Unchanged by a variation/, "and is told this screen will not change it");

  const deeper = resnapshotCabinet(CABINET_LINE.cabinet_config_snapshot, { depth_mm: 600 });
  assert.equal(deeper, null, "depth alone rebuilds nothing, which is why it is not offered");
});
