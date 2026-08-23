// TELLING ONE ORDER LINE FROM ANOTHER.
//
// The variation form's "which item are you changing" dropdown labelled every
// option with its title, material and colour. On a real order that is eight rows
// all reading "Door - Decorative Board - Amaro", because a kitchen of matching
// doors IS eight identical descriptions. There was nothing to pick between them,
// so choosing the right one was guesswork, and varying the wrong door is a wrong
// door made.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  cabinetLabel,
  cabinetOptions,
  cabinetsByDesignItem,
  isCabinetLine,
  itemSizeLabel,
  orderItemLabel,
  orderItemOptions,
} from "../lib/pcd-order-item-label.js";

function door(overrides = {}) {
  return {
    id: "d1",
    sort_order: 0,
    title: "Door",
    product_type: "Door",
    material: "Decorative Board",
    colour: "Amaro",
    height_mm: 720,
    width_mm: 397,
    qty: 1,
    ...overrides,
  };
}

// ── the regression ─────────────────────────────────────────────────────────

test("eight matching doors all get different labels", () => {
  const doors = Array.from({ length: 8 }, (_, index) =>
    door({ id: `d${index}`, sort_order: index, width_mm: 297 + index * 10 })
  );
  const labels = doors.map((item, index) => orderItemLabel(item, index));
  assert.equal(new Set(labels).size, 8, "every option has to be distinguishable, or picking one is guesswork");
});

// The worst case: same size, same everything. Position is the only thing left,
// and it has to be enough.
test("two lines identical in every way are still told apart by position", () => {
  const a = orderItemLabel(door({ id: "a", sort_order: 0 }));
  const b = orderItemLabel(door({ id: "b", sort_order: 1 }));
  assert.notEqual(a, b);
  assert.match(a, /^1\./, "the position leads, because it is what the order lists by");
  assert.match(b, /^2\./);
});

test("a label carries what somebody is actually reading off a drawing", () => {
  const label = orderItemLabel(door({ sort_order: 2, qty: 4 }));
  assert.match(label, /^3\./, "its place on the order");
  assert.match(label, /Door/);
  assert.match(label, /720 x 397mm/, "height before width");
  assert.match(label, /Decorative Board/);
  assert.match(label, /Amaro/);
  assert.match(label, /x4/, "and how many, when it is more than one");
});

test("a single item does not say x1", () => {
  assert.doesNotMatch(orderItemLabel(door()), /x1/);
});

test("a line with no size still labels cleanly", () => {
  const label = orderItemLabel({ title: "Hinges", product_type: "Hardware", sort_order: 0, qty: 20 });
  assert.equal(label, "1. Hinges (x20)", "no size means no size, not a blank gap or a dash");
});

test("size falls back to the position when sort_order is missing", () => {
  assert.match(orderItemLabel({ title: "Door" }, 4), /^5\./);
  assert.doesNotMatch(orderItemLabel({ title: "Door" }), /^\d+\./, "and no position at all rather than a wrong one");
});

test("a partial size says which half is missing", () => {
  assert.equal(itemSizeLabel({ height_mm: 720 }), "720 x ?mm");
  assert.equal(itemSizeLabel({}), "", "nothing at all is not a size");
});

// ── grouping by cabinet ────────────────────────────────────────────────────

test("a cabinet is recognised by its panel list or its type", () => {
  assert.equal(isCabinetLine({ product_type: "base_cabinet" }), true);
  assert.equal(isCabinetLine({ cabinet_config_snapshot: { label: "Bank of drawers" } }), true);
  assert.equal(isCabinetLine(door()), false);
});

test("a cabinet is called what somebody named it", () => {
  assert.equal(cabinetLabel({ cabinet_config_snapshot: { label: "Island bank" }, title: "Base cabinet" }), "Island bank");
  assert.equal(cabinetLabel({ product_type: "tall_cabinet" }), "Tall Cabinet", "not the stored enum");
});

test("doors group under the cabinet they belong to", () => {
  const items = [
    { id: "c1", sort_order: 0, product_type: "base_cabinet", design_item_id: "cab-1", cabinet_config_snapshot: { label: "Island bank" } },
    door({ id: "d1", sort_order: 1, design_item_id: "cab-1" }),
    door({ id: "d2", sort_order: 2, design_item_id: "cab-1" }),
    door({ id: "d3", sort_order: 3 }),
  ];
  const options = orderItemOptions(items);
  assert.equal(options[1].group, "Island bank", "the four doors on one carcass sit together under its name");
  assert.equal(options[2].group, "Island bank");
  assert.equal(
    options[3].group,
    "Not part of a cabinet",
    "a replacement front ordered by itself genuinely belongs to nothing"
  );
});

test("the cabinet map takes the first cabinet per design item and ignores its pieces", () => {
  const map = cabinetsByDesignItem([
    door({ id: "d1", design_item_id: "cab-1" }),
    { id: "c1", product_type: "base_cabinet", design_item_id: "cab-1", title: "Base cabinet" },
  ]);
  assert.equal(map.get("cab-1"), "Base cabinet", "a door is not the cabinet it goes on");
  assert.equal(map.size, 1);
});

// ── the cabinet picker ─────────────────────────────────────────────────────

test("the cabinet picker offers no cabinet first, and says what that means", () => {
  const options = cabinetOptions([
    { id: "c1", product_type: "base_cabinet", design_item_id: "cab-1", title: "Island bank" },
  ]);
  assert.equal(options[0].value, "", "optional, so the empty choice leads");
  assert.equal(options[0].label, "Not part of a cabinet", "and it says what it means rather than being blank");
  assert.equal(options[1].value, "cab-1");
});

test("an order with no cabinets still offers the empty choice", () => {
  const options = cabinetOptions([door()]);
  assert.equal(options.length, 1);
  assert.equal(options[0].value, "");
});

// ── the form uses it ───────────────────────────────────────────────────────

const EDITOR = readFileSync(
  new URL("../app/admin/orders/[id]/variations/[variationId]/VariationEditor.js", import.meta.url),
  "utf8"
);

test("the variation form picks items from the identifying list, not the old one", () => {
  assert.match(EDITOR, /options=\{orderItemOptions\(orderItems\)\}/, "the picker has to use the labelled options");
  assert.doesNotMatch(
    EDITOR,
    /\[item\.title \|\| item\.product_type \|\| "Order item", item\.material, item\.colour\]/,
    "the old label, which read the same on every matching door, must not come back"
  );
});

test("a variation that adds a piece can say which cabinet it goes on", () => {
  assert.match(EDITOR, /cabinetOptions\(orderItems\)/, "the picker has to be there");
  assert.match(EDITOR, /lineDraft\.action === "add" \?/, "and only on an add, since a change inherits it");
  assert.match(EDITOR, /design_item_id: item\?\.design_item_id \|\| null/, "and varying a line has to inherit it");
});
