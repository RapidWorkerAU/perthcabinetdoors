// THE LINE GATE.
//
// ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────
//
//   A BOARD ON A LINE IS A BOARD IN THE LIBRARY. Any material, thickness,
//   supplier, colour or finish that the dropdowns could not have offered is
//   refused on the server, whoever sent it.
//
//   THE RIGHT BOARD SPELT WRONG IS TIDIED, NOT REFUSED. Lowercase materials and
//   "18 mm" come back in the library's spelling.
//
//   OLD LINES STILL SAVE. Only fields that changed are checked, so a quantity
//   change on a line from before the library is never refused.
//
//   THE LINE POINTS AT ITS ROW. A single match is stamped as the source; a
//   leftover id that no longer describes the board is cleared.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkLineBoard, changedBoardFields, passLineThroughGate } from "../lib/pcd-line-gate.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ROWS = [
  { id: "r-white", name: "Classic White", supplier_name: "Polytec", material_type: "decorative_board", thickness: "18mm", finish_type: "Matt", is_active: true },
  { id: "r-white16", name: "Classic White", supplier_name: "Polytec", material_type: "decorative_board", thickness: "16mm", finish_type: "Matt", is_active: true },
  { id: "r-oak", name: "Natural Oak", supplier_name: "Polytec", material_type: "decorative_board", thickness: "18mm", finish_type: "Ravine", is_active: true },
  { id: "r-possum", name: "Possum", supplier_name: "Laminex", material_type: "decorative_board", thickness: "18mm", finish_type: "Natural", is_active: true },
  { id: "r-snow-p", name: "Snow", supplier_name: "Polytec", material_type: "decorative_board", thickness: "18mm", finish_type: "Matt", is_active: true },
  { id: "r-snow-l", name: "Snow", supplier_name: "Laminex", material_type: "decorative_board", thickness: "18mm", finish_type: "Matt", is_active: true },
  { id: "r-thermo", name: "Classic White", supplier_name: "Polytec", material_type: "thermolaminate", thickness: "18mm", finish_type: "Matt", is_active: true },
];
const libs = { colourRows: ROWS, profileRows: [] };
const check = (line, before = null) => checkLineBoard(line, before, libs);

const door = (over = {}) => ({ product_type: "Door", material: "Decorative Board", supplier_name: "Polytec", thickness: "18mm", finish: "Matt", colour: "Classic White", ...over });

test("a real board passes and is stamped with its library row", () => {
  const { problems, patch } = check(door());
  assert.deepEqual(problems, []);
  assert.equal(patch.unit_cost_source_id, "r-white");
});

test("a colour the library does not have is refused, with what to do", () => {
  const { problems } = check(door({ colour: "White Shaker" }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /White Shaker is not in the colour library for Polytec Decorative Board 18mm/);
});

test("a finish the colour is not made in is refused and the real finishes named", () => {
  const { problems } = check(door({ finish: "Gloss" }));
  assert.match(problems[0], /not made in Gloss .* It comes in: Matt/);
});

test("a thickness the material does not come in is refused", () => {
  assert.match(check(door({ thickness: "25mm" })).problems[0], /does not come in 25mm\. Pick one of: 16mm, 18mm/);
});

test("a material that is not ours, or not allowed for the type, is refused", () => {
  assert.match(check(door({ material: "MDF" })).problems[0], /MDF is not one of our materials/);
  assert.match(check(door({ product_type: "Table top", material: "Thermolaminate", colour: "Classic White" })).problems[0], /table top cannot be made from Thermolaminate/);
});

test("a brand that stocks none of this material is refused, not title-cased in", () => {
  assert.match(check(door({ supplier_name: "Formica" })).problems.join(" "), /Formica has no Decorative Board in the colour library\. Pick one of: Laminex, Polytec/);
});

test("the right board written the wrong way is tidied, not refused", () => {
  const { problems, patch } = check(door({ material: "decorative board", thickness: "18 mm", supplier_name: "polytec", colour: "classic white" }));
  assert.deepEqual(problems, []);
  assert.equal(patch.material, "Decorative Board");
  assert.equal(patch.thickness, "18mm");
  assert.equal(patch.supplier_name, "Polytec");
  assert.equal(patch.colour, "Classic White");
  assert.equal(patch.unit_cost_source_id, "r-white");
});

test("a leftover row id that is not this board is cleared or replaced", () => {
  assert.equal(check(door({ unit_cost_source_id: "r-oak" })).patch.unit_cost_source_id, "r-white");
  // Same colour from two brands and no brand on the line: no guess.
  const snow = check(door({ supplier_name: "", colour: "Snow", unit_cost_source_id: "r-oak" }));
  assert.deepEqual(snow.problems, []);
  assert.equal(snow.patch.unit_cost_source_id, null);
  // A colour taken off leaves no row behind.
  assert.equal(check(door({ colour: "", unit_cost_source_id: "r-white" })).patch.unit_cost_source_id, null);
});

test("an old line with a board the library never had still saves when only the quantity changes", () => {
  const old = door({ colour: "Discontinued Grey", qty: 2 });
  const { problems } = check({ ...old, qty: 4 }, old);
  assert.deepEqual(problems, []);
  // But changing its colour to another unknown one is refused.
  assert.equal(check({ ...old, colour: "Another Unknown" }, old).problems.length, 1);
});

test("blank fields and hardware lines are left alone", () => {
  assert.deepEqual(check({ product_type: "Door", material: "Decorative Board" }).problems, []);
  assert.deepEqual(check({ product_type: "Hardware", product_name: "Blum hinge" }).problems, []);
});

test("only the fields that changed count as changed", () => {
  const before = door();
  assert.deepEqual([...changedBoardFields({ ...before, qty: 9 }, before)], []);
  assert.deepEqual([...changedBoardFields({ ...before, colour: "Snow" }, before)], ["colour"]);
  assert.equal(changedBoardFields(before, null).size, 7);
});

test("passing through the gate throws a 400 naming the problem", () => {
  const gate = (line, before) => check(line, before);
  assert.throws(() => passLineThroughGate(gate, door({ colour: "Nope" }), null, { label: "Line 2" }), (error) => error.status === 400 && /^Line 2: Nope/.test(error.message));
  assert.equal(passLineThroughGate(gate, door({ material: "decorative board" })).material, "Decorative Board");
});

test("every path that writes quote or variation lines goes through the gate", () => {
  for (const path of [
    "app/api/admin/quotes/[id]/_quote-line-save.js",
    "app/api/admin/quotes/[id]/route.js",
    "app/api/admin/quotes/route.js",
    "app/api/admin/orders/[id]/variations/[variationId]/lines/route.js",
    "app/api/admin/orders/[id]/variations/[variationId]/lines/[lineId]/route.js",
  ]) {
    assert.match(read(path), /createLineGate|passLineThroughGate|lineGate/, `${path} does not check lines against the library`);
  }
});

test("an imported line with a board the library lacks is settled, not refused, and keeps what it said", async () => {
  const { settleImportedLine } = await import("../lib/pcd-line-gate.js");
  const gate = (line, before) => check(line, before);
  const { line, notes } = settleImportedLine(gate, door({ colour: "White Shaker", notes: "Kitchen run A", unit_cost_source_id: "r-oak" }));
  assert.equal(line.colour, "");
  assert.equal(line.finish, "");
  assert.equal(line.unit_cost_source_id, null);
  assert.equal(line.material, "Decorative Board", "the parts that were right stay");
  assert.equal(line.supplier_name, "Polytec");
  assert.equal(notes.length, 1);
  assert.match(line.notes, /^Kitchen run A\nNot kept on import: White Shaker is not in the colour library/);
  // A good line comes through tidied and untouched otherwise.
  const good = settleImportedLine(gate, door({ material: "decorative board" }));
  assert.deepEqual(good.notes, []);
  assert.equal(good.line.material, "Decorative Board");
  assert.equal(good.line.unit_cost_source_id, "r-white");
});

test("the three import paths settle their lines through the gate", () => {
  for (const path of [
    "app/api/admin/quotes/[id]/import-order-form/route.js",
    "lib/pcd-quote-request-conversion.js",
    "app/api/admin/design/projects/[projectId]/import/route.js",
  ]) {
    assert.match(read(path), /settleImportedLine/, `${path} does not check imported lines against the library`);
  }
});

test("the data check lists live lines whose board is not in the library, and nothing else", async () => {
  const { boardsNotInLibrary } = await import("../lib/pcd-data-checks.js");
  const gate = (line, before) => check(line, before);
  const rows = boardsNotInLibrary(gate, {
    quotes: [{ id: "q1", quote_number: "Q-1", customer_name: "Mark" }],
    quoteLines: [
      { id: "a", quote_id: "q1", sort_order: 0, ...door() },
      { id: "b", quote_id: "q1", sort_order: 1, ...door({ colour: "White Shaker" }) },
      { id: "c", quote_id: "q1", sort_order: 2, ...door({ material: "decorative board" }) },
    ],
    orders: [{ id: "o1", order_number: "PCD-1", customer_name: "Sarah" }],
    orderLines: [{ id: "d", order_id: "o1", sort_order: 0, ...door({ supplier_name: "Formica", colour: "" }) }],
  });
  assert.deepEqual(rows.map((r) => [r.kind, r.ref, r.lineNo]), [["Order", "PCD-1", 1], ["Quote", "Q-1", 2]]);
  assert.match(rows[1].problem, /White Shaker is not in the colour library/);
  assert.equal(rows[1].href, "/admin/quotes/q1");
});

test("a cabinet's carcass and shelf boards must be in the library too", async () => {
  const { checkCabinetBoards, passCabinetThroughGate } = await import("../lib/pcd-line-gate.js");
  const gate = (line, before) => check(line, before);
  const good = { carcass_material: "Decorative Board", carcass_finish: "Matt", carcass_colour: "classic white", carcass_thickness_mm: 16, shelf_material: "", shelf_colour: "" };
  const ok = checkCabinetBoards(gate, good);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.patch.carcass_colour, "Classic White");
  const bad = checkCabinetBoards(gate, { ...good, shelf_material: "Decorative Board", shelf_colour: "Purple Haze", shelf_thickness_mm: 16 });
  assert.match(bad.problems[0], /^Shelves: Purple Haze is not in the colour library/);
  // An old cabinet with an unknown carcass still saves when nothing about it changed.
  const old = { ...good, carcass_colour: "Old Grey" };
  assert.deepEqual(checkCabinetBoards(gate, { ...old, label: "renamed" }, old).problems, []);
  assert.throws(() => passCabinetThroughGate(gate, { ...good, carcass_colour: "Nope" }), (error) => error.status === 400);
});

test("panel planning only takes the order page's own values, judged on what changed", async () => {
  const { planningProblems } = await import("../lib/pcd-line-gate.js");
  assert.deepEqual(planningProblems({ a: { status: "Ordered", production_stage: "Cutting", fulfilment_method: "in_house" } }, {}), []);
  assert.match(planningProblems({ a: { status: "Kind of ordered" } }, {})[0], /"Kind of ordered" is not a supplier status/);
  // An old value nobody touched still saves.
  assert.deepEqual(planningProblems({ a: { status: "Legacy" } }, { a: { status: "Legacy" } }), []);
});

test("the order line route checks a brand change and the planning values", () => {
  const route = read("lib/pcd-order-item-save.js");
  assert.match(route, /createLineGate/);
  assert.match(route, /planningProblems\(updates\.panel_planning, beforeItem\.panel_planning\)/);
});
