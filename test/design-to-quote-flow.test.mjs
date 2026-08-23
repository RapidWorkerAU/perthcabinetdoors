// A DESIGN BECOMING A QUOTE, BOTH WAYS ROUND.
//
// There are two routes from a design to a priced quote line and they used to
// answer differently:
//
//   1. the customer's own design on the website: "Send my design to PCD"
//      becomes a quote request, which staff convert to a quote. The board is
//      looked up in the colour library at conversion.
//   2. the staff design tool: Stage Quote imports the design straight onto a
//      quote. The board rate came from a number frozen onto the item when the
//      colour was picked, which for most items is not there at all.
//
// Same design, same boards, two answers, and only one of them a price. This
// walks both and asserts they agree.

import assert from "node:assert/strict";
import test from "node:test";

import { matchBoardCost } from "../lib/pcd-board-cost.js";
import { withLibraryBoardRates, withLibraryBoardRatesForAll } from "../lib/pcd-design-board-rates.js";
import { carcassColumnsFromStyle, shelfColumnsFromStyle } from "../lib/pcd-design-carcass-style.js";
import { requestLinesForItem } from "../lib/pcd-design-request-lines.js";
import { buildPreset, quotableItems, selectedPartKeys } from "../lib/pcd-design-parts.js";
import { quoteRequestLineRow } from "../lib/pcd-quote-request.js";
import { convertedQuoteLine } from "../lib/pcd-quote-request-convert.js";
import { lineIsReady } from "../lib/pcd-quote-ready.js";
import { calculateQuoteLine, DEFAULT_BUSINESS_DEFAULTS } from "../lib/pcd-quote-utils.js";

const LIBRARY = [
  { id: "lib-carcass-16", name: "Carcass", finish_type: "Matt", material_type: "decorative board", thickness: "16mm", supplier_name: "Polytec", cost_per_sqm_ex_gst: 60.74 },
  { id: "lib-carcass-18", name: "Carcass", finish_type: "Matt", material_type: "decorative board", thickness: "18mm", supplier_name: "Polytec", cost_per_sqm_ex_gst: 66.81 },
  { id: "lib-oak-18", name: "Bottega Oak", finish_type: "Woodmatt", material_type: "decorative board", thickness: "18mm", supplier_name: "Polytec", cost_per_sqm_ex_gst: 88.4 },
  { id: "lib-unpriced", name: "Raw MDY", finish_type: "Raw Finish", material_type: "thermolaminate", thickness: "21mm", supplier_name: "Polytec", cost_per_sqm_ex_gst: 0 },
];

const resolveBoard = (spec) => matchBoardCost(LIBRARY, spec);
const businessDefaults = { ...DEFAULT_BUSINESS_DEFAULTS, markup_percent: 25 };

// A door style as the design tool stores one, carrying the library row behind
// the swatch. Both pickers write this shape now; the admin one used to write
// only the name.
const doorStyle = {
  material: "decorative board",
  finish: "Woodmatt",
  colour: "Bottega Oak",
  thickness_mm: 18,
  cost_per_sqm: 88.4,
  supplier: "Polytec",
  colour_library_id: "lib-oak-18",
  edge_mould: "1mm Square Edge",
};

function cabinet(over = {}) {
  return {
    id: "item-1",
    item_type: "base_cabinet",
    label: "Base 900",
    width_mm: 900,
    height_mm: 720,
    depth_mm: 560,
    qty: 1,
    front_type: "doors",
    door_config: { columns: 2 },
    door_style: doorStyle,
    material: "decorative board",
    finish: "Matt",
    colour: "Carcass",
    carcass_thickness_mm: 16,
    cost_per_sqm_carcass: 60.74,
    shelf_qty: 1,
    ...over,
  };
}

// ── Route 1: the customer's design, via a quote request ───────────────────

function linesFromDesign(item) {
  const quotable = quotableItems([item]);
  const selection = buildPreset(quotable, "everything");
  return quotable.flatMap((it) => requestLinesForItem(it, selectedPartKeys(selection, it), { roomName: "Kitchen", roomHeightMm: 2400 }));
}

test("a customer's design arrives as lines we can price", () => {
  const lines = linesFromDesign(cabinet());
  const doors = lines.filter((line) => line.productType === "Door");
  assert.ok(doors.length >= 1, "a two-door cabinet produced no door line");

  for (const line of lines) {
    const row = quoteRequestLineRow(line, 0, {});
    assert.ok(lineIsReady(row), `${row.product_type} ${row.product_name} arrived unquotable: ${JSON.stringify(row)}`);
  }
});

test("the board the customer picked survives design to priced quote line", () => {
  const [door] = linesFromDesign(cabinet()).filter((line) => line.productType === "Door");
  const row = quoteRequestLineRow(door, 0, {});

  // The design tool stores the material lowercase; the quote editor matches
  // Title Case. This is the conversion point, and getting it wrong means the
  // material never matches its own dropdown.
  assert.equal(row.material, "Decorative Board");
  assert.equal(row.thickness, "18mm");
  assert.equal(row.finish, "Woodmatt");
  assert.equal(row.colour, "Bottega Oak");
  assert.equal(row.colour_library_id, "lib-oak-18", "the library row behind the swatch was lost");
  assert.equal(row.supplier_name, "Polytec");
  assert.equal(row.edge_mould, "1mm Square Edge");

  const entry = convertedQuoteLine(row, { resolveBoard, quoteRequest: { design_project_id: "d1" }, businessDefaults });
  const priced = calculateQuoteLine(entry.line, businessDefaults);
  assert.equal(entry.match.matchedBy, "id");
  assert.equal(priced.unit_cost_per_sqm_ex_gst, 88.4);
  assert.ok(priced.line_total_ex_gst > 0, "a fully specified door still priced at zero");
});

test("a cabinet from a design carries its carcass board, and no size", () => {
  const [carcass] = linesFromDesign(cabinet()).filter((line) => line.productType === "base_cabinet");
  const row = quoteRequestLineRow(carcass, 0, {});
  assert.equal(row.width_mm, null, "a cabinet line carried a width, which arms the flat-sheet costing");
  assert.equal(row.height_mm, null);
  assert.equal(row.material, "Decorative Board");
  assert.equal(row.thickness, "16mm");
  assert.equal(row.colour, "Carcass");
  // Its size still has to reach a person, in words.
  assert.match(String(row.notes || ""), /900/, "the cabinet's size is nowhere on the line");
});

// ── Route 2: the staff design tool, via Stage Quote ───────────────────────

test("a blank board rate is looked up instead of importing at zero", () => {
  // The common case: the colour was picked before it had a price, so only the
  // name came across.
  const item = cabinet({
    cost_per_sqm_carcass: 0,
    door_style: { ...doorStyle, cost_per_sqm: 0 },
  });
  const { item: repriced, priced } = withLibraryBoardRates(item, resolveBoard, { isCabinet: true });

  assert.equal(repriced.cost_per_sqm_carcass, 60.74, "the carcass rate was left at zero with the library holding the price");
  assert.equal(repriced.door_style.cost_per_sqm, 88.4, "the door rate was left at zero");
  assert.deepEqual(priced.map((entry) => entry.what).sort(), ["carcass", "door", "shelves"]);
  assert.ok(priced.every((entry) => entry.from), "a rate was not traceable to a library row");
  // Filling a blank is not a change anyone needs to review.
  assert.equal(priced.some((entry) => entry.changed), false);
});

test("a rate that has gone stale is brought up to the current price", () => {
  // A design drawn before a price rise. Quoting it at the old rate is how a job
  // goes out at last month's board price.
  const item = cabinet({ cost_per_sqm_carcass: 12.5, door_style: { ...doorStyle, cost_per_sqm: 70 } });
  const { item: repriced, priced } = withLibraryBoardRates(item, resolveBoard, { isCabinet: true });

  assert.equal(repriced.cost_per_sqm_carcass, 60.74, "the carcass quoted at the rate the design was drawn with");
  assert.equal(repriced.door_style.cost_per_sqm, 88.4, "the doors quoted at the rate the design was drawn with");

  // And every one of them is reported, with what it replaced, so the change is
  // seen before it is committed rather than found in the total.
  const carcass = priced.find((entry) => entry.what === "carcass");
  assert.equal(carcass.changed, true);
  assert.equal(carcass.previous, 12.5);
  assert.equal(carcass.rate, 60.74);
  assert.match(carcass.from, /Carcass/);
});

test("a manual override is never touched", () => {
  // "Manual (override)" is somebody setting the rate for this job: a one-off
  // board, a special order, a negotiated price. It is an instruction, not a
  // stale number.
  const item = { id: "p1", item_type: "panel", material: "decorative board", finish: "Woodmatt", colour: "Bottega Oak", panel_thickness_mm: 18, unit_cost_mode: "manual", unit_cost_per_sqm_ex_gst: 12 };
  const { item: repriced, priced } = withLibraryBoardRates(item, resolveBoard, { isCabinet: false });
  assert.equal(repriced.unit_cost_per_sqm_ex_gst, 12, "a manual override was overwritten from the library");
  assert.equal(priced.some((entry) => entry.what === "board" && entry.previous === 12), false);
});

test("a standalone panel gets its own board rate", () => {
  const panel = {
    id: "p1",
    item_type: "panel",
    material: "decorative board",
    finish: "Woodmatt",
    colour: "Bottega Oak",
    panel_thickness_mm: 18,
    unit_cost_per_sqm_ex_gst: 0,
  };
  const { item: repriced } = withLibraryBoardRates(panel, resolveBoard, { isCabinet: false });
  assert.equal(repriced.unit_cost_per_sqm_ex_gst, 88.4);
});

test("a board the library has no price for is left exactly as it is", () => {
  // Much of the library has no cost against it yet and those lines are costed
  // by hand at quote time. A missing price must never wipe out a rate somebody
  // put there, and must never invent one.
  const item = cabinet({
    material: "thermolaminate",
    finish: "Raw Finish",
    colour: "Raw MDY",
    carcass_thickness_mm: 21,
    cost_per_sqm_carcass: 0,
    door_style: { material: "thermolaminate", finish: "Raw Finish", colour: "Raw MDY", thickness_mm: 21, cost_per_sqm: 43.5 },
  });
  const { item: repriced, priced } = withLibraryBoardRates(item, resolveBoard, { isCabinet: true });
  assert.equal(repriced.cost_per_sqm_carcass, 0, "a price was invented for a board we have no cost for");
  assert.equal(repriced.door_style.cost_per_sqm, 43.5, "a hand-entered rate was wiped out because the library had no price");
  assert.equal(priced.length, 0);
});

test("both routes to a quote price the same design the same way", () => {
  // Route 1: through a quote request.
  const [door] = linesFromDesign(cabinet()).filter((line) => line.productType === "Door");
  const viaRequest = convertedQuoteLine(quoteRequestLineRow(door, 0, {}), {
    resolveBoard,
    quoteRequest: { design_project_id: "d1" },
    businessDefaults,
  }).line.unit_cost_per_sqm_ex_gst;

  // Route 2: through the design import, with a stale rate frozen onto the item.
  const { items } = withLibraryBoardRatesForAll(
    [cabinet({ cost_per_sqm_carcass: 0, door_style: { ...doorStyle, cost_per_sqm: 12.34 } })],
    LIBRARY,
    () => true
  );
  const viaImport = items[0].door_style.cost_per_sqm;

  assert.equal(viaRequest, viaImport, "the same door priced differently depending on which way it reached the quote");
});

// ── The carcass and shelf colour, stored in flat columns ──────────────────

test("picking a carcass colour records which library row it is", () => {
  // A colour name is not unique across suppliers. Fronts and panels have always
  // recorded the row behind the swatch because they are stored as JSON; the
  // carcass and shelves are flat columns and kept only the name, in six
  // separate copies of the same mapping.
  const picked = {
    material: "decorative board",
    finish: "Matt",
    colour: "Carcass",
    thickness_mm: 18,
    cost_per_sqm: 66.81,
    colour_library_id: "lib-carcass-18",
    supplier: "Polytec",
  };

  assert.deepEqual(carcassColumnsFromStyle(picked, { carcass_thickness_mm: 16 }, 16), {
    material: "decorative board",
    finish: "Matt",
    colour: "Carcass",
    carcass_thickness_mm: 18,
    cost_per_sqm_carcass: 66.81,
    colour_library_id: "lib-carcass-18",
    supplier_name: "Polytec",
  });

  assert.deepEqual(shelfColumnsFromStyle(picked, {}, 16), {
    shelf_material: "decorative board",
    shelf_finish: "Matt",
    shelf_colour: "Carcass",
    shelf_thickness_mm: 18,
    cost_per_sqm_shelf: 66.81,
    shelf_colour_library_id: "lib-carcass-18",
    shelf_supplier_name: "Polytec",
  });
});

test("clearing the colour clears which row it was", () => {
  // Otherwise the next price lookup matches the board that used to be on here.
  const cleared = carcassColumnsFromStyle(null, { carcass_thickness_mm: 18, cost_per_sqm_carcass: 66.81 }, 16);
  assert.equal(cleared.colour, "");
  assert.equal(cleared.colour_library_id, null);
  assert.equal(cleared.supplier_name, null);
});

test("the carcass board is priced from the exact row when two brands share a name", () => {
  const twoBrands = [
    { id: "a", name: "Shared White", finish_type: "Matt", material_type: "decorative board", thickness: "18mm", supplier_name: "Polytec", cost_per_sqm_ex_gst: 60 },
    { id: "b", name: "Shared White", finish_type: "Matt", material_type: "decorative board", thickness: "18mm", supplier_name: "Laminex", cost_per_sqm_ex_gst: 80 },
  ];
  const resolve = (spec) => matchBoardCost(twoBrands, spec);
  const base = { id: "c1", item_type: "base_cabinet", material: "decorative board", finish: "Matt", colour: "Shared White", carcass_thickness_mm: 18, cost_per_sqm_carcass: 0 };

  // Without the row id there are two prices and it refuses to guess, which is
  // right, but nothing gets priced.
  assert.equal(withLibraryBoardRates(base, resolve, { isCabinet: true }).item.cost_per_sqm_carcass, 0);

  // With it, the carcass prices off the board that was actually picked.
  const withRow = withLibraryBoardRates({ ...base, colour_library_id: "b" }, resolve, { isCabinet: true });
  assert.equal(withRow.item.cost_per_sqm_carcass, 80);
});
