// Import-time helpers: the human reason attached to a flagged item, and the
// collapse of identical flat lines into one with a summed quantity.
import test from "node:test";
import assert from "node:assert/strict";
import { missingReason, mergeIdenticalLines } from "../lib/pcd-import-utils.js";

test("missingReason names the specific problem(s)", () => {
  assert.equal(missingReason({ material: true }), "no material selected");
  assert.equal(missingReason({ rate: true }), "board rate is $0 (no cost per m² in the library)");
  assert.equal(missingReason({ dims: true }), "a size is 0");
  assert.equal(
    missingReason({ material: true, rate: true }),
    "no material selected, board rate is $0 (no cost per m² in the library)"
  );
  // A flagged item with no specific flag set still reads as something.
  assert.equal(missingReason({}), "incomplete configuration");
});

const panel = (over = {}) => ({
  line: {
    product_type: "Panel", product_name: "Panel", description: "",
    width_mm: 250, height_mm: 80, material: "decorative board", finish: "Woodmatt",
    colour: "Ecru Oak", thickness: "18mm", unit_cost_per_sqm_ex_gst: 0, qty: 1,
    notes: "", ...over,
  },
  itemId: over.itemId || "x",
});

test("identical panels collapse to one line with summed qty", () => {
  const merged = mergeIdenticalLines([panel({ itemId: "a" }), panel({ itemId: "b" })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].line.qty, 2);
  // Keeps the first contributor's item id for the re-import sweep.
  assert.equal(merged[0].itemId, "a");
});

test("case-only differences in finish still merge", () => {
  const merged = mergeIdenticalLines([panel(), panel({ colour: "ECRU OAK" })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].line.qty, 2);
});

test("any real spec difference keeps them separate", () => {
  assert.equal(mergeIdenticalLines([panel(), panel({ width_mm: 300 })]).length, 2, "size");
  assert.equal(mergeIdenticalLines([panel(), panel({ notes: "Mitre 45°." })]).length, 2, "notes");
  assert.equal(mergeIdenticalLines([panel(), panel({ description: "From cabinet B" })]).length, 2, "description");
  assert.equal(mergeIdenticalLines([panel(), panel({ unit_cost_per_sqm_ex_gst: 25 })]).length, 2, "rate");
});

test("cabinet lines never merge, even when identical", () => {
  const cab = () => ({
    line: { product_type: "base_cabinet", product_name: "Base cabinet", qty: 1, cabinet_config: { width_mm: 900 } },
    itemId: "c",
  });
  const merged = mergeIdenticalLines([cab(), cab()]);
  assert.equal(merged.length, 2, "each cabinet stays its own line");
  assert.equal(merged[0].line.qty, 1);
});

test("merging never mutates the input line objects", () => {
  const a = panel({ itemId: "a" });
  mergeIdenticalLines([a, panel({ itemId: "b" })]);
  assert.equal(a.line.qty, 1, "source qty untouched");
});

test("order follows first appearance", () => {
  const door = { line: { product_type: "Door", product_name: "Door", width_mm: 400, height_mm: 700, qty: 1 }, itemId: "d" };
  const merged = mergeIdenticalLines([panel(), door, panel({ itemId: "b" })]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].line.product_type, "Panel");
  assert.equal(merged[0].line.qty, 2, "both panels summed into the first slot");
  assert.equal(merged[1].line.product_type, "Door");
});
