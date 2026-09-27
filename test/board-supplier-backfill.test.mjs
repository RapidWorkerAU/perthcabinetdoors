// A board on a design must reach the quote with its supplier.
//
// 27 September 2026: a design imported with its doors and one cabinet showing
// no supplier, though every board was a Polytec board in the library. Three
// leaks, each closed and checked here:
//   1. the import only kept a library match when it had a price, and most of
//      the library has none, so the supplier it found was thrown away;
//   2. project defaults filled a new cabinet's board words but not whose board;
//   3. creating an item never wrote its supplier at all.
// The door picker dropping the supplier is checked in the source test below.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveBoardSource } from "../lib/pcd-board-cost.js";
import { withLibraryBoardRatesForAll } from "../lib/pcd-design-board-rates.js";
import { applyMaterialDefaults, buildItemRow } from "../lib/pcd-design-item-io.js";
import { doorLinesForCabinet, designItemToLine } from "../lib/pcd-design-to-lines.js";

// Unpriced rows, like most of the library.
const ROWS = [
  { id: "oak16", supplier_name: "Polytec", material_type: "Decorative Board", thickness: "16mm", finish_type: "Woodmatt", name: "Coastal Oak", cost_per_sqm_ex_gst: 0 },
  { id: "carc18", supplier_name: "Polytec", material_type: "Decorative Board", thickness: "18mm", finish_type: "Matt", name: "Carcass", cost_per_sqm_ex_gst: 0 },
  // The same colour name from two suppliers: never guessed between.
  { id: "w-p", supplier_name: "Polytec", material_type: "Decorative Board", thickness: "16mm", finish_type: "Matt", name: "White", cost_per_sqm_ex_gst: 0 },
  { id: "w-l", supplier_name: "Laminex", material_type: "Decorative Board", thickness: "16mm", finish_type: "Matt", name: "White", cost_per_sqm_ex_gst: 0 },
];

const oak = { material: "decorative board", finish: "Woodmatt", colour: "Coastal Oak", thickness_mm: 16 };

test("the library says whose board it is, priced or not", () => {
  assert.deepEqual(resolveBoardSource(ROWS, { ...oak, thickness: 16 }), { id: "oak16", supplier: "Polytec" });
  assert.equal(resolveBoardSource(ROWS, { material: "decorative board", finish: "Matt", colour: "White", thickness: 16 }), null,
    "two suppliers, so no guess");
  assert.deepEqual(resolveBoardSource(ROWS, { material: "decorative board", finish: "Matt", colour: "White", thickness: 16, supplier: "Laminex" }),
    { id: "w-l", supplier: "Laminex" }, "the supplier already named settles it");
});

test("importing a design fills in a missing supplier on every board", () => {
  const cab = {
    id: "a", item_type: "base_cabinet", qty: 1, width_mm: 742, height_mm: 400, depth_mm: 560,
    material: "decorative board", finish: "Matt", colour: "Carcass", carcass_thickness_mm: 18,
    front_type: "doors", door_config: { columns: 2, rows: 1, hinges: ["L", "R"] },
    door_style: { ...oak },
  };
  const { items: [out] } = withLibraryBoardRatesForAll([cab], ROWS, () => true);
  assert.equal(out.supplier_name, "Polytec");
  assert.equal(out.colour_library_id, "carc18");
  assert.equal(out.door_style.supplier, "Polytec");
  assert.equal(out.door_style.colour_library_id, "oak16");
  assert.equal(doorLinesForCabinet(out, "Kitchen")[0].supplier_name, "Polytec");
  assert.equal(designItemToLine(out).supplier_name, "Polytec");
});

test("a supplier somebody set is never replaced", () => {
  const cab = { id: "a", item_type: "base_cabinet", material: "decorative board", finish: "Matt", colour: "Carcass",
    carcass_thickness_mm: 18, supplier_name: "Someone Else", door_style: { ...oak, supplier: "Another" } };
  const { items: [out] } = withLibraryBoardRatesForAll([cab], ROWS, () => true);
  assert.equal(out.supplier_name, "Someone Else");
  assert.equal(out.door_style.supplier, "Another");
});

test("a project default brings its supplier with its board, and create saves it", () => {
  const defaults = { carcass: { base_cabinet: { material: "decorative board", finish: "Matt", colour: "Carcass", thickness_mm: 18, supplier: "Polytec", colour_library_id: "carc18" } } };
  const merged = applyMaterialDefaults({ item_type: "base_cabinet" }, defaults);
  assert.equal(merged.supplier_name, "Polytec");
  assert.equal(merged.colour_library_id, "carc18");
  const row = buildItemRow(merged, "p");
  assert.equal(row.supplier_name, "Polytec");
  assert.equal(row.colour_library_id, "carc18");

  const own = applyMaterialDefaults({ item_type: "base_cabinet", material: "decorative board", colour: "Black" }, defaults);
  assert.equal(own.supplier_name, undefined, "a board somebody picked is not given the default's supplier");
});

test("the door and drawer picker keeps the supplier and library row", () => {
  const panel = readFileSync(new URL("../app/admin/design/_components/DesignRightPanel.js", import.meta.url), "utf8");
  const block = panel.slice(panel.indexOf("export function FrontStyleFields"), panel.indexOf("// ---- Cabinet config form ----"));
  assert.match(block, /supplier: s\?\.supplier \|\| s\?\.supplier_name \|\| null/);
  assert.match(block, /colour_library_id: s\?\.colour_library_id \|\| null/);
});
