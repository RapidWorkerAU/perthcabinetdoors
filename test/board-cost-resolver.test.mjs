// The board cost resolver is what turns a colour on a line into a price.
//
// Before it existed, nothing between the website and the quote editor ever
// asked the colour library what a board cost. The editor never looked one up
// either: the price rode along on the dropdown option a person clicked, so the
// CLICK was the lookup, and any line made without a click (a converted quote
// request, an imported design) landed at $0 in manual mode.
//
// These lock the three things that make it trustworthy:
//   * an exact library id beats everything, because that is the row the
//     customer actually clicked
//   * a name match still works, including for rows written before ids were
//     captured and for the old "Finish - Colour" colours
//   * an ambiguous match returns NOTHING rather than guessing. Two suppliers
//     stocking the same colour name at two prices is real, and silently
//     charging the wrong one is worse than flagging the line.

import test from "node:test";
import assert from "node:assert/strict";
import {
  boardCostLinePatch,
  colourWithoutFinishPrefix,
  lineAreaSqm,
  matchBoardCost,
  thicknessMm,
} from "../lib/pcd-board-cost.js";

const row = (over = {}) => ({
  id: "row-1",
  name: "Classic White",
  finish_type: "Matt",
  thickness: "18mm",
  material_type: "decorative board",
  supplier_name: "Polytec",
  cost_per_sqm_ex_gst: 66.81,
  cost_per_board_ex_gst: 192.41,
  ...over,
});

const SPEC = {
  material: "Decorative Board",
  thickness: "18mm",
  finish: "Matt",
  colour: "Classic White",
};

// ── thickness normalising ────────────────────────────────────────────────────

test("thickness is read the same however it was written", () => {
  assert.equal(thicknessMm("18mm"), 18);
  assert.equal(thicknessMm("18 mm"), 18);
  assert.equal(thicknessMm(" 18 "), 18);
  assert.equal(thicknessMm(18), 18);
  assert.equal(thicknessMm(""), 0);
  assert.equal(thicknessMm(null), 0);
});

// ── matching by id ───────────────────────────────────────────────────────────

test("an exact library id wins, and does not need anything else to agree", () => {
  const rows = [row({ id: "wanted", name: "Classic White" }), row({ id: "other", name: "Snowdrift" })];
  const match = matchBoardCost(rows, { colourLibraryId: "wanted" });

  assert.equal(match.ok, true);
  assert.equal(match.matchedBy, "id");
  assert.equal(match.id, "wanted");
  assert.equal(match.costPerSqmExGst, 66.81);
});

test("a stale id falls back to matching on the name rather than failing", () => {
  // A colour that has since been retired or re-created must not strand an old
  // quote request at $0.
  const match = matchBoardCost([row()], { ...SPEC, colourLibraryId: "no-longer-exists" });

  assert.equal(match.ok, true);
  assert.equal(match.matchedBy, "name");
  assert.equal(match.id, "row-1");
});

// ── matching by name ─────────────────────────────────────────────────────────

test("material, thickness, finish and colour together find the board", () => {
  const match = matchBoardCost([row()], SPEC);

  assert.equal(match.ok, true);
  assert.equal(match.costPerSqmExGst, 66.81);
  assert.equal(match.supplier, "Polytec");
  assert.equal(match.label, "Polytec - Matt - Classic White - 18mm");
});

test("case and spacing do not stop a match", () => {
  const match = matchBoardCost([row()], {
    material: "decorative board",
    thickness: "18 mm",
    finish: "  matt ",
    colour: "CLASSIC WHITE",
  });
  assert.equal(match.ok, true);
});

test("the same colour in another thickness is a different board and is not used", () => {
  const match = matchBoardCost([row({ thickness: "16mm", cost_per_sqm_ex_gst: 60.74 })], SPEC);
  assert.equal(match.ok, false);
  assert.equal(match.reason, "not_found");
});

test("a colour still carrying its finish as a prefix is matched anyway", () => {
  // Rows written by the website form before it stopped gluing the finish onto
  // the colour. Repricing has to reach these.
  const match = matchBoardCost([row()], { ...SPEC, colour: "Matt - Classic White" });
  assert.equal(match.ok, true);
  assert.equal(match.colour, "Classic White");
});

test("a colour genuinely named after its finish is left alone", () => {
  const rows = [row({ name: "Matt Black" })];
  const match = matchBoardCost(rows, { ...SPEC, colour: "Matt Black" });
  assert.equal(match.ok, true);
  assert.equal(match.colour, "Matt Black");
});

test("a blank finish matches on the rest rather than refusing", () => {
  const match = matchBoardCost([row()], { ...SPEC, finish: "" });
  assert.equal(match.ok, true);
});

// ── supplier ─────────────────────────────────────────────────────────────────

test("the supplier on the line decides between two brands stocking the same colour", () => {
  const rows = [
    row({ id: "poly", supplier_name: "Polytec", cost_per_sqm_ex_gst: 66.81 }),
    row({ id: "lam", supplier_name: "Laminex", cost_per_sqm_ex_gst: 74.2 }),
  ];

  const match = matchBoardCost(rows, { ...SPEC, supplier: "Laminex" });
  assert.equal(match.ok, true);
  assert.equal(match.matchedBy, "supplier");
  assert.equal(match.costPerSqmExGst, 74.2);
});

test("a supplier that stocks nothing matching falls through instead of refusing", () => {
  // The supplier on a converted line is often just the editor's default, so it
  // must not be able to veto a match that is otherwise unambiguous.
  const match = matchBoardCost([row({ supplier_name: "Polytec" })], { ...SPEC, supplier: "Formica" });
  assert.equal(match.ok, true);
  assert.equal(match.matchedBy, "name");
});

// ── refusing to guess ────────────────────────────────────────────────────────

test("two brands at two prices and no supplier named returns nothing, not a guess", () => {
  const rows = [
    row({ id: "poly", supplier_name: "Polytec", cost_per_sqm_ex_gst: 66.81 }),
    row({ id: "lam", supplier_name: "Laminex", cost_per_sqm_ex_gst: 74.2 }),
  ];

  const match = matchBoardCost(rows, SPEC);
  assert.equal(match.ok, false);
  assert.equal(match.reason, "ambiguous");
  assert.match(match.message, /supplier/i);
});

test("two rows at the SAME price are not an ambiguity worth stopping for", () => {
  const rows = [
    row({ id: "a", supplier_name: "Polytec" }),
    row({ id: "b", supplier_name: "Laminex" }),
  ];
  const match = matchBoardCost(rows, SPEC);
  assert.equal(match.ok, true);
  assert.equal(match.costPerSqmExGst, 66.81);
});

test("a matched row with no price says so, rather than pricing the line at zero", () => {
  const match = matchBoardCost([row({ cost_per_sqm_ex_gst: 0 })], SPEC);
  assert.equal(match.ok, false);
  assert.equal(match.reason, "unpriced");
});

test("a missing thickness is named as the reason, because prices are held per thickness", () => {
  // Every line from the public design planner used to arrive like this.
  const match = matchBoardCost([row()], { ...SPEC, thickness: "" });
  assert.equal(match.ok, false);
  assert.equal(match.reason, "no_thickness");
  assert.match(match.message, /thickness/i);
});

test("a line with no material or no colour is reported, not silently skipped", () => {
  assert.equal(matchBoardCost([row()], { ...SPEC, material: "" }).reason, "no_material");
  assert.equal(matchBoardCost([row()], { ...SPEC, colour: "" }).reason, "no_colour");
});

// ── the patch written onto a quote line ──────────────────────────────────────

test("a hit stamps the same fields the editor's own colour picker stamps", () => {
  const match = matchBoardCost([row()], SPEC);
  // 400 x 700 door = 0.28 m² at $66.81 = $18.71
  const patch = boardCostLinePatch(match, { areaSqm: lineAreaSqm({ width_mm: 400, height_mm: 700 }) });

  assert.equal(patch.unit_cost_mode, "auto");
  assert.equal(patch.unit_cost_source_id, "row-1");
  assert.equal(patch.unit_cost_source_label, "Polytec - Matt - Classic White - 18mm");
  assert.equal(patch.supplier_name, "Polytec");
  assert.equal(patch.unit_cost_per_sqm_ex_gst, 66.81);
  assert.equal(patch.calculated_unit_cost_ex_gst, 18.71);
  assert.equal(patch.product_unit_cost_ex_gst, 18.71);
});

test("a miss leaves the line manual at zero rather than inventing a rate", () => {
  const patch = boardCostLinePatch(matchBoardCost([], SPEC), { areaSqm: 0.28 });

  assert.equal(patch.unit_cost_mode, "manual");
  assert.equal(patch.unit_cost_source_id, null);
  assert.equal(patch.unit_cost_per_sqm_ex_gst, 0);
  assert.equal(patch.calculated_unit_cost_ex_gst, 0);
  assert.ok(!("product_unit_cost_ex_gst" in patch));
});

test("a cabinet has no size, so its rate is carried without costing it as a flat sheet", () => {
  // Cabinet lines deliberately carry no width or height: they are priced from
  // their cut list. The rate still rides along for whoever configures it.
  const match = matchBoardCost([row({ thickness: "16mm" })], { ...SPEC, thickness: "16mm" });
  const patch = boardCostLinePatch(match, { areaSqm: lineAreaSqm({ width_mm: null, height_mm: null }) });

  assert.equal(patch.unit_cost_per_sqm_ex_gst, 66.81);
  assert.equal(patch.calculated_unit_cost_ex_gst, 0);
  assert.ok(!("product_unit_cost_ex_gst" in patch));
});

test("area is zero when either side is missing, so nothing is priced off half a board", () => {
  assert.equal(lineAreaSqm({ width_mm: 400, height_mm: 0 }), 0);
  assert.equal(lineAreaSqm({ width_mm: 0, height_mm: 700 }), 0);
  assert.equal(lineAreaSqm({ width_mm: "400", height_mm: "700" }), 0.28);
});

// ── the prefix helper on its own ─────────────────────────────────────────────

test("the finish prefix is only stripped when it is that line's own finish", () => {
  assert.equal(colourWithoutFinishPrefix("Matt - Classic White", "Matt"), "Classic White");
  assert.equal(colourWithoutFinishPrefix("Gloss - Classic White", "Matt"), "Gloss - Classic White");
  assert.equal(colourWithoutFinishPrefix("Classic White", "Matt"), "Classic White");
  assert.equal(colourWithoutFinishPrefix("Classic White", ""), "Classic White");
});

// ── AN ID THAT NO LONGER DESCRIBES THE BOARD BESIDE IT ──────────────────────
//
// 13 September 2026. A wardrobe job set to Polytec Black Texture 16mm reached a
// quote priced from a Laminex Black AbsoluteMatte 18mm at $145.49 a square
// metre, printed as "16mm Black Texture". The screens that rewrote the words on
// the item had left the library id behind, and this trusted the id outright
// without ever looking at the two together.
//
// An id that contradicts the board written beside it is not the board somebody
// clicked, it is a leftover. It falls through to name matching, which refuses
// to guess between two prices and says so, so the worst case is a rate nobody
// filled in rather than a confident wrong one.

test("an id is not trusted when it names a different board", () => {
  const laminex = row({
    id: "left-behind", name: "Black", finish_type: "AbsoluteMatte", thickness: "18mm",
    supplier_name: "Laminex", cost_per_sqm_ex_gst: 145.49,
  });
  const polytec = row({
    id: "the-real-one", name: "Black", finish_type: "Texture", thickness: "16mm",
    supplier_name: "Polytec", cost_per_sqm_ex_gst: 54.92,
  });
  const spec = { material: "Decorative Board", thickness: "16mm", finish: "Texture", colour: "Black" };

  const match = matchBoardCost([laminex, polytec], { ...spec, colourLibraryId: "left-behind" });
  assert.equal(match.ok, true);
  assert.equal(match.costPerSqmExGst, 54.92, "priced from the board it actually says it is");
  assert.equal(match.matchedBy, "name");
});

test("each of the four things that say which board it is, on its own", () => {
  const spec = { material: "Decorative Board", thickness: "18mm", finish: "Matt", colour: "Classic White" };
  const contradiction = (over) => {
    const stale = row({ id: "stale", cost_per_sqm_ex_gst: 999, ...over });
    return matchBoardCost([stale], { ...spec, colourLibraryId: "stale" });
  };
  assert.notEqual(contradiction({ thickness: "16mm" }).costPerSqmExGst, 999, "a different thickness");
  assert.notEqual(contradiction({ name: "Snowdrift" }).costPerSqmExGst, 999, "a different colour");
  assert.notEqual(contradiction({ finish_type: "Texture" }).costPerSqmExGst, 999, "a different finish");
  assert.notEqual(contradiction({ material_type: "thermolaminate" }).costPerSqmExGst, 999, "a different material");
  // The supplier is NOT one of them: it is often just the default that came
  // with a line, and disagreeing with it is no evidence the id is wrong.
  assert.equal(
    matchBoardCost([row({ id: "s", supplier_name: "Laminex" })], { ...spec, colourLibraryId: "s", supplier: "Polytec" }).costPerSqmExGst,
    66.81
  );
});

test("an id with nothing beside it to check is still trusted outright", () => {
  // A public request carries the row the customer clicked and little else.
  // There is nothing to contradict, so nothing is doubted.
  const only = row({ id: "clicked", cost_per_sqm_ex_gst: 88 });
  const match = matchBoardCost([only, row({ id: "other" })], { colourLibraryId: "clicked" });
  assert.equal(match.matchedBy, "id");
  assert.equal(match.costPerSqmExGst, 88);
});

test("a contradiction with nowhere to fall back to says so rather than guessing", () => {
  const stale = row({ id: "stale", thickness: "18mm", cost_per_sqm_ex_gst: 145.49 });
  const match = matchBoardCost([stale], {
    material: "Decorative Board", thickness: "16mm", finish: "Matt", colour: "Classic White",
    colourLibraryId: "stale",
  });
  assert.equal(match.ok, false, "no 16mm row exists, so there is no price to give");
  assert.equal(match.reason, "not_found");
});
