// SUPPLY OR MADE TO ORDER, on a board line. See lib/pcd-made-by.js.
//
// Asked after the colour, offered only as the Board Library allows, and it
// decides both the price and how the order plans the line.
import test from "node:test";
import assert from "node:assert/strict";
import {
  MTO, SUPPLY, asksMadeBy, colourOrderTypesIndex, effectiveMadeBy, fulfilmentForMadeBy, madeByOptions,
  madeByOptionsForLine, settleMadeBy,
} from "../lib/pcd-made-by.js";
import { calculateQuoteLine } from "../lib/pcd-quote-utils.js";
import { normalizePolytecBoardCard, withMadeToOrderBoardPrice, withMadeToOrderBoardRateCard } from "../lib/pcd-polytec-board-pricing.js";
import { convertedQuoteLine } from "../lib/pcd-quote-request-convert.js";
import { buildBoardOrder } from "../lib/pcd-board-order.js";

const decor = (extra = {}) => ({ material: "Decorative Board", product_type: "Door", colour: "European Walnut", ...extra });
const BOTH = ["supply board", "made to order MTO"];

test("only what the colour can be is offered, supply first", () => {
  assert.deepEqual(madeByOptions(decor(), BOTH), [SUPPLY, MTO]);
  assert.deepEqual(madeByOptions(decor(), ["supply board"]), [SUPPLY]);
  assert.deepEqual(madeByOptions(decor(), ["made to order MTO"]), [MTO]);
  // A colour the library does not know: we can always buy board and cut it.
  assert.deepEqual(madeByOptions(decor(), null), [SUPPLY]);
  // Thermolaminate and compact laminate are never supply, whatever is ticked.
  assert.deepEqual(madeByOptions({ material: "Thermolaminate" }, ["supply board"]), [MTO]);
  assert.deepEqual(madeByOptions({ material: "Compact Laminate" }, null), [MTO]);
});

test("the question is not asked of hardware, a benchtop or a cabinet", () => {
  assert.equal(asksMadeBy({ material: "Decorative Board", product_type: "Hardware" }), false);
  assert.equal(asksMadeBy({ material: "Decorative Board", product_type: "base_cabinet" }), false);
  assert.deepEqual(madeByOptions({ product_type: "Benchtop", material: "Laminate" }, BOTH), []);
});

test("one possibility is the answer; both starts as made to order; an answer still possible is kept", () => {
  assert.equal(settleMadeBy("", [SUPPLY]), SUPPLY);
  assert.equal(settleMadeBy("supply", [MTO]), MTO);
  assert.equal(settleMadeBy("", [SUPPLY, MTO]), MTO);
  assert.equal(settleMadeBy("supply", [SUPPLY, MTO]), SUPPLY);
  assert.equal(settleMadeBy("mto", []), "");
});

test("a line saved before the question reads the way it was always priced", () => {
  assert.equal(effectiveMadeBy(decor()), SUPPLY);
  assert.equal(effectiveMadeBy({ material: "Thermolaminate" }), MTO);
  assert.equal(effectiveMadeBy(decor({ made_by: "mto" })), MTO);
});

test("an editor finds a colour's ticks by its library row, or by its name", () => {
  const index = colourOrderTypesIndex([
    { id: "row-1", material: "Decorative Board", thickness: "16mm", finish: "Matt", colour: "European Walnut", orderTypes: BOTH },
  ]);
  assert.deepEqual(madeByOptionsForLine(decor({ unit_cost_source_id: "row-1" }), index), [SUPPLY, MTO]);
  assert.deepEqual(madeByOptionsForLine(decor({ thickness: "16mm", finish: "Matt" }), index), [SUPPLY, MTO]);
  assert.deepEqual(madeByOptionsForLine(decor({ colour: "Unknown", thickness: "16mm", finish: "Matt" }), index), [SUPPLY]);
});

test("made to order decorative board carries no edge tape and no workshop time", () => {
  const defaults = { inhouse_processing_hours_per_piece: 0.5 };
  const sized = decor({ height_mm: 600, width_mm: 400, qty: 2 });
  const supply = calculateQuoteLine({ ...sized, made_by: "supply" }, defaults);
  const mto = calculateQuoteLine({ ...sized, made_by: "mto" }, defaults);
  assert.ok(supply.edging_lineal_metres > 0);
  assert.equal(supply.processing_labour_hours, 1);
  assert.equal(mto.edging_lineal_metres, 0);
  assert.equal(mto.processing_labour_hours, 0);
  assert.equal(mto.made_by, "mto");
});

test("made to order decorative board prices from the Polytec card; supply is left to its rate", () => {
  const card = normalizePolytecBoardCard({});
  const line = decor({ thickness: "16mm", finish: "Matt", height_mm: 400, width_mm: 400, unit_cost_per_sqm_ex_gst: 60.74, unit_cost_mode: "auto" });
  const mto = withMadeToOrderBoardPrice({ ...line, made_by: "mto" }, card, { forceAuto: true });
  assert.equal(mto.product_unit_cost_ex_gst, 28.58);
  assert.equal(mto.unit_cost_per_sqm_ex_gst, 60.74, "the board rate stays, it is what the card multiplies");
  assert.deepEqual(withMadeToOrderBoardPrice({ ...line, made_by: "supply" }, card), { ...line, made_by: "supply" });
  // A typed price on a manual line is kept.
  const typed = withMadeToOrderBoardPrice({ ...line, made_by: "mto", unit_cost_mode: "manual", product_unit_cost_ex_gst: 50 }, card);
  assert.equal(typed.product_unit_cost_ex_gst, 50);
  assert.equal(typed.calculated_unit_cost_ex_gst, 28.58);
});

test("a converted request line takes made to order where both are ticked, priced at the card's margin", () => {
  const card = normalizePolytecBoardCard({});
  const resolveBoard = () => ({
    ok: true, id: "row-1", label: "Polytec Matt European Walnut 16mm", supplier: "Polytec", material: "decorative board",
    thickness: "16mm", finish: "Matt", colour: "European Walnut", costPerSqmExGst: 60.74, costPerBoardExGst: 0, orderTypes: BOTH,
  });
  const request = { product_type: "Door", material: "Decorative Board", thickness: "16mm", finish: "Matt", colour: "European Walnut", height_mm: 400, width_mm: 400, qty: 1 };
  const entry = convertedQuoteLine(request, { resolveBoard, quoteRequest: {}, businessDefaults: { markup_percent: 40 } });
  assert.equal(entry.line.made_by, "mto");
  const priced = withMadeToOrderBoardRateCard(entry, card);
  assert.equal(priced.line.product_unit_cost_ex_gst, 28.58);
  assert.equal(priced.line.markup_percent, card.margin_percent);

  const boardOnly = convertedQuoteLine(request, { resolveBoard: () => ({ ...resolveBoard(), orderTypes: ["supply board"] }), quoteRequest: {}, businessDefaults: { markup_percent: 40 } });
  assert.equal(boardOnly.line.made_by, "supply");
  assert.equal(withMadeToOrderBoardRateCard(boardOnly, card), boardOnly, "supply keeps its board rate price");
});

test("the order plans a line the way it was answered", () => {
  assert.equal(fulfilmentForMadeBy(decor({ made_by: "supply" })), "in_house");
  assert.equal(fulfilmentForMadeBy(decor({ made_by: "mto" })), "supplier_ready_made");
  assert.equal(fulfilmentForMadeBy(decor()), null);
});

test("the board order leaves out what the supplier makes", () => {
  const sized = { thickness: "16mm", finish: "Matt", supplier_name: "Polytec", height_mm: 600, width_mm: 400, qty: 1 };
  const result = buildBoardOrder({ lines: [decor({ ...sized, made_by: "supply" }), decor({ ...sized, made_by: "mto" })] });
  assert.equal(result.excluded_lines.length, 1);
  assert.equal(result.excluded_lines[0].index, 1);
  assert.match(result.excluded_lines[0].product_type, /made to order/);
});

// ── the server settles every line written, whoever wrote it ─────────────────
import { settleLineMadeBy } from "../lib/pcd-made-by-settle.js";

const ROWS = [
  { id: "both", name: "European Walnut", finish_type: "Matt", thickness: "16mm", material_type: "decorative board", supplier_name: "Polytec", cost_per_sqm_ex_gst: 60.74, order_types: ["supply board", "made to order MTO"], is_active: true },
  { id: "board", name: "Carcass", finish_type: "Matt", thickness: "16mm", material_type: "decorative board", supplier_name: "Polytec", cost_per_sqm_ex_gst: 60.74, order_types: ["supply board"], is_active: true },
];
const CARD = normalizePolytecBoardCard({});
const piece = (colour, extra = {}) => ({
  product_type: "Door", material: "Decorative Board", supplier_name: "Polytec", thickness: "16mm", finish: "Matt", colour,
  height_mm: 400, width_mm: 400, qty: 1, unit_cost_per_sqm_ex_gst: 60.74, unit_cost_mode: "auto", product_unit_cost_ex_gst: 9.72, markup_percent: 40, ...extra,
});
const settle = (line, before = null) => settleLineMadeBy(line, { colourRows: ROWS, boardCard: CARD, before, defaultMarkup: 40 });

test("a new line from any path takes supplier made where both are ticked, at the card's price and margin", () => {
  const line = settle(piece("European Walnut"));
  assert.equal(line.made_by, "mto");
  assert.equal(line.product_unit_cost_ex_gst, 28.58);
  assert.equal(line.markup_percent, CARD.margin_percent);
});

test("a new line in a board only colour is made in house at its board rate", () => {
  const line = settle(piece("Carcass"));
  assert.equal(line.made_by, "supply");
  assert.equal(line.product_unit_cost_ex_gst, 9.72);
  assert.equal(line.markup_percent, 40);
});

test("a line saved before the question, board unchanged, is left exactly as it is", () => {
  const stored = piece("European Walnut", { made_by: null });
  assert.deepEqual(settle({ ...stored, qty: 3 }, stored), { ...stored, qty: 3 });
});

test("an old line given a new colour is settled like a new one", () => {
  const stored = piece("Carcass", { made_by: null });
  assert.equal(settle(piece("European Walnut"), stored).made_by, "mto");
});

test("an answer that is not possible is corrected, back to the board rate and the usual markup", () => {
  const line = settle(piece("Carcass", { made_by: "mto", product_unit_cost_ex_gst: 28.58, markup_percent: CARD.margin_percent }));
  assert.equal(line.made_by, "supply");
  assert.equal(line.product_unit_cost_ex_gst, 9.72);
  assert.equal(line.markup_percent, 40);
});

test("made in house chosen on a colour that allows both is kept", () => {
  assert.equal(settle(piece("European Walnut", { made_by: "supply" })).made_by, "supply");
});

test("a typed price is never overwritten, and a cabinet is never asked", () => {
  const typed = settle(piece("European Walnut", { unit_cost_mode: "manual", product_unit_cost_ex_gst: 50 }));
  assert.equal(typed.made_by, "mto");
  assert.equal(typed.product_unit_cost_ex_gst, 50);
  const cabinet = { product_type: "base_cabinet", material: "Decorative Board", colour: "European Walnut" };
  assert.deepEqual(settle(cabinet), cabinet);
});
