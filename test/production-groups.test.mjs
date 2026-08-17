// Grouping on the production sheet.
//
// The rule the workshop asked for: a cabinet group holds everything that
// cabinet is made of, its doors and fronts included. Only things supplied on
// their own group by what they are.
import test from "node:test";
import assert from "node:assert/strict";
import { groupProductionRows } from "../lib/pcd-production-groups.js";

// An order built by the design tool: two cabinets, each with a carcass line and
// its own fronts, plus a door someone ordered on its own.
const ITEMS = [
  { id: "oven-carcass", quote_line_item_id: "q1", product_type: "base_cabinet",
    cabinet_config: { label: "Oven cabinet", width_mm: 600, height_mm: 890, depth_mm: 600 } },
  { id: "oven-doors",   quote_line_item_id: "q2", product_type: "Door", title: "Doors" },
  { id: "oven-kick",    quote_line_item_id: "q3", product_type: "Panel", title: "Kickboard" },
  { id: "tall-carcass", quote_line_item_id: "q4", product_type: "tall_cabinet",
    cabinet_config: { label: "", width_mm: 600, height_mm: 400, depth_mm: 450 } },
  { id: "tall-doors",   quote_line_item_id: "q5", product_type: "Door", title: "Doors" },
  { id: "loose-door",   quote_line_item_id: "q6", product_type: "Door", title: "Door" },
  { id: "loose-front",  quote_line_item_id: "q7", product_type: "Drawer front", title: "Drawer front" },
  { id: "loose-panel",  quote_line_item_id: "q8", product_type: "Panel", title: "Filler panel" },
];

// design_item_id is what ties a door line to its cabinet. The loose lines have
// none, which is exactly what makes them loose.
const QUOTE_LINES = [
  { id: "q1", design_item_id: "oven" },
  { id: "q2", design_item_id: "oven" },
  { id: "q3", design_item_id: "oven" },
  { id: "q4", design_item_id: "tall" },
  { id: "q5", design_item_id: "tall" },
  { id: "q6", design_item_id: null },
  { id: "q7", design_item_id: null },
  { id: "q8", design_item_id: null },
];

const rowsFor = (ids) => ids.map((id) => ({ itemId: id, qty: 1, piece: id }));

function group(ids, { items = ITEMS, quoteLines = QUOTE_LINES } = {}) {
  return groupProductionRows(rowsFor(ids), { items, quoteLines });
}

test("a cabinet group holds its doors and its kickboard, not just its carcass", () => {
  const groups = group(["oven-carcass", "oven-doors", "oven-kick"]);
  assert.equal(groups.length, 1, "one group, not three");
  assert.equal(groups[0].name, "Oven cabinet");
  assert.match(groups[0].meta, /600W x 890H x 600D mm/);
  assert.deepEqual(groups[0].rows.map((row) => row.itemId), ["oven-carcass", "oven-doors", "oven-kick"]);
});

test("a door linked to a cabinet never lands in the doors group", () => {
  const groups = group(["oven-carcass", "oven-doors", "loose-door"]);
  const names = groups.map((g) => g.name);
  assert.deepEqual(names, ["Oven cabinet", "Doors"]);
  assert.deepEqual(groups[0].rows.map((r) => r.itemId), ["oven-carcass", "oven-doors"]);
  assert.deepEqual(groups[1].rows.map((r) => r.itemId), ["loose-door"], "only the unlinked one");
});

test("things supplied on their own group by what they are", () => {
  const groups = group(["loose-door", "loose-front", "loose-panel"]);
  assert.deepEqual(groups.map((g) => g.name), ["Doors", "Drawer fronts", "Loose panels"]);
});

test("cabinets come first, then the type groups in a fixed order", () => {
  // Fixed, so two sheets for two different orders read the same way.
  const groups = group(["loose-panel", "loose-front", "oven-carcass", "loose-door", "tall-carcass"]);
  assert.deepEqual(groups.map((g) => g.name), ["Oven cabinet", "Tall Cabinet", "Doors", "Drawer fronts", "Loose panels"]);
});

test("a cabinet with no label is named from its type, not its raw enum", () => {
  // The sheet printed "9. tall_cabinet" at a workshop. Nobody should read that.
  const groups = group(["tall-carcass"]);
  assert.equal(groups[0].name, "Tall Cabinet");
});

test("a design item with no cabinet in it is not an assembly", () => {
  // A door ordered on its own still comes from a design item. One door is not
  // an assembly of one, so it belongs with the other doors.
  const items = [{ id: "solo", quote_line_item_id: "qs", product_type: "Door", title: "Door" }];
  const quoteLines = [{ id: "qs", design_item_id: "design-door" }];
  const groups = groupProductionRows(rowsFor(["solo"]), { items, quoteLines });
  assert.deepEqual(groups.map((g) => g.name), ["Doors"]);
});

test("an order with no design tool behind it still groups", () => {
  // Hand-built orders have no design_item_id anywhere. They should read as
  // type groups rather than collapsing into one pile.
  const items = [
    { id: "d", quote_line_item_id: null, product_type: "Door", title: "Door" },
    { id: "f", quote_line_item_id: null, product_type: "Drawer front", title: "Drawer front" },
  ];
  const groups = groupProductionRows(rowsFor(["d", "f"]), { items, quoteLines: [] });
  assert.deepEqual(groups.map((g) => g.name), ["Doors", "Drawer fronts"]);
});

test("every row lands in exactly one group", () => {
  const ids = ITEMS.map((item) => item.id);
  const groups = group(ids);
  const placed = groups.flatMap((g) => g.rows.map((r) => r.itemId));
  assert.equal(placed.length, ids.length);
  assert.deepEqual([...placed].sort(), [...ids].sort());
});
