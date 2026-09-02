// THE WEBSITE QUOTE REQUEST, END TO END: what the customer filled in has to
// still be there, unchanged, on the quote line we price.
//
// Every step between the two is a place a field can go missing, and each one
// has: the form builds its own payload, the API validates it, the line is
// stored under different column names, the conversion re-shapes it, and the
// line saver re-validates and writes it. A field dropped anywhere in there
// looks like nothing at all until somebody opens the quote and has to ring the
// customer back to ask a question the form already asked them.
//
// So this walks one realistic line the whole way and asserts, field by field,
// that it arrives. It is deliberately written as a table: a new field on a
// request line is one row here, and a field that stops surviving fails by name
// rather than as a total that came out wrong.

import assert from "node:assert/strict";
import test from "node:test";

import { matchBoardCost } from "../lib/pcd-board-cost.js";
import { convertedQuoteLine, unpricedSummary, withHingeSupplyNote } from "../lib/pcd-quote-request-convert.js";
import { cabinetSpecFromDesignItem } from "../lib/pcd-cabinet-from-design.js";
import { insertQuoteRequest } from "../lib/pcd-quote-request.js";
import { describeGaps, lineGaps, lineIsReady, missingFields, unreadyLines } from "../lib/pcd-quote-ready.js";
import { calculateQuoteLine, DEFAULT_BUSINESS_DEFAULTS } from "../lib/pcd-quote-utils.js";
import { quoteLineRow } from "../app/api/admin/quotes/[id]/_quote-line-save.js";

// A small stand-in for the colour library. Two suppliers stock a colour with
// the same name at different prices, which is the case that must never be
// guessed at.
const LIBRARY = [
  {
    id: "lib-white-18",
    name: "Classic White",
    finish_type: "Matt",
    material_type: "decorative board",
    thickness: "18mm",
    supplier_name: "Polytec",
    cost_per_sqm_ex_gst: 60.74,
    cost_per_board_ex_gst: 174.93,
  },
  {
    id: "lib-white-16",
    name: "Classic White",
    finish_type: "Matt",
    material_type: "decorative board",
    thickness: "16mm",
    supplier_name: "Polytec",
    cost_per_sqm_ex_gst: 55.5,
    cost_per_board_ex_gst: 159.84,
  },
  // Same name, same board, another brand, another price.
  {
    id: "lib-white-18-other",
    name: "Classic White",
    finish_type: "Matt",
    material_type: "decorative board",
    thickness: "18mm",
    supplier_name: "Laminex",
    cost_per_sqm_ex_gst: 71.2,
    cost_per_board_ex_gst: 205.06,
  },
  // A real board we have not put a price against yet. Most of the library is
  // in this state, so it is not an edge case.
  {
    id: "lib-natura-oak",
    name: "Bottega Oak",
    finish_type: "Natura",
    material_type: "thermolaminate",
    thickness: "18mm",
    supplier_name: "Polytec",
    cost_per_sqm_ex_gst: 0,
    cost_per_board_ex_gst: 0,
  },
];

const resolveBoard = (spec) => matchBoardCost(LIBRARY, spec);
const businessDefaults = { ...DEFAULT_BUSINESS_DEFAULTS, markup_percent: 25 };

// A stored pcd_quote_request_line_items row, as the website writes one.
function requestLine(over = {}) {
  return {
    id: "line-1",
    sort_order: 0,
    product_type: "Door",
    product_name: "Door",
    material: "Decorative Board",
    thickness: "18mm",
    width_mm: 597,
    height_mm: 715,
    finish: "Matt",
    colour: "Classic White",
    colour_library_id: "lib-white-18",
    supplier_name: "Polytec",
    profile_type: "",
    profile: "",
    edge_mould: "1mm Square Edge",
    qty: 4,
    hinge_holes: true,
    hinge_supply: false,
    hinge_qty: "2 hinges",
    notes: "Handles on the left.",
    ...over,
  };
}

const quoteRequest = { design_project_id: null, product_name: "Kitchen doors" };

function convertOne(line) {
  const entry = convertedQuoteLine(line, { resolveBoard, quoteRequest, businessDefaults });
  const calculated = calculateQuoteLine(entry.line, businessDefaults);
  return { entry, line: entry.line, row: quoteLineRow(calculated, "quote-1", 0) };
}

// ── The contract ──────────────────────────────────────────────────────────
// Left: what the customer's request line holds. Right: where it has to be on
// the quote line that gets written. Anything a person needs in order to quote
// belongs in this table.
const SURVIVES = [
  ["product_type", "product_type", "Door"],
  ["material", "material", "Decorative Board"],
  ["thickness", "thickness", "18mm"],
  ["finish", "finish", "Matt"],
  ["colour", "colour", "Classic White"],
  ["width_mm", "width_mm", 597],
  ["height_mm", "height_mm", 715],
  ["qty", "qty", 4],
  ["edge_mould", "edge_mould", "1mm Square Edge"],
  ["hinge_holes", "hinge_holes", true],
  ["hinge_qty", "hinge_qty", "2 hinges"],
  ["notes", "notes", "Handles on the left."],
];

test("every field on a request line arrives on the quote line", () => {
  const { row } = convertOne(requestLine());
  for (const [from, to, expected] of SURVIVES) {
    assert.deepEqual(row[to], expected, `${from} did not survive the conversion (arrived as ${JSON.stringify(row[to])})`);
  }
});

test("the colour the customer clicked is what the line is priced from", () => {
  const { entry, row } = convertOne(requestLine());
  assert.equal(entry.match.matchedBy, "id", "matched on something other than the library row the customer picked");
  assert.equal(row.unit_cost_mode, "auto");
  assert.equal(row.unit_cost_source_id, "lib-white-18");
  assert.equal(row.unit_cost_per_sqm_ex_gst, 60.74);
  assert.equal(row.supplier_name, "Polytec");
  // 597 x 715mm at $60.74/m2, to the cent.
  assert.equal(row.calculated_unit_cost_ex_gst, 25.93);
  assert.ok(row.line_total_ex_gst > 0, "a fully specified line still totalled zero");
});

test("a line with no library id still prices, by name and brand", () => {
  const { entry, row } = convertOne(requestLine({ colour_library_id: null }));
  assert.equal(entry.match.matchedBy, "supplier");
  assert.equal(row.unit_cost_per_sqm_ex_gst, 60.74);
});

test("two brands stocking the same colour is never guessed at", () => {
  const { entry, row } = convertOne(requestLine({ colour_library_id: null, supplier_name: "" }));
  assert.equal(entry.match.ok, false);
  assert.equal(entry.match.reason, "ambiguous");
  assert.equal(row.unit_cost_mode, "manual", "guessed a price between two suppliers");
  assert.equal(row.unit_cost_per_sqm_ex_gst, 0);
  // Still reported, so nobody has to find it by noticing a $0.
  const [reported] = unpricedSummary([entry]);
  assert.equal(reported.colour, "Classic White");
  assert.match(reported.message, /supplier/i);
});

test("a real board we have not priced yet is reported, not invented", () => {
  const entry = convertedQuoteLine(
    requestLine({ colour_library_id: "lib-natura-oak", material: "Thermolaminate", finish: "Natura", colour: "Bottega Oak" }),
    { resolveBoard, quoteRequest, businessDefaults }
  );
  assert.equal(entry.match.ok, false);
  assert.equal(entry.match.reason, "unpriced");
  assert.equal(entry.line.unit_cost_per_sqm_ex_gst, 0);
  assert.match(unpricedSummary([entry])[0].message, /no cost per m/i);
});

test("hardware and benchtop lines are not sent looking for a board", () => {
  for (const productType of ["Hardware", "Benchtop"]) {
    const entry = convertedQuoteLine(requestLine({ product_type: productType, colour: "", colour_library_id: null }), {
      resolveBoard,
      quoteRequest,
      businessDefaults,
    });
    assert.equal(entry.skipped, true, `${productType} was board-resolved`);
    assert.equal(entry.match, null);
    assert.equal(unpricedSummary([entry]).length, 0, `${productType} was reported as unpriced`);
  }
});

test("a cabinet keeps its carcass rate without being costed as a flat sheet", () => {
  // A cabinet line carries no width or height on purpose: it is priced from its
  // cut list. The rate still has to come across, or whoever configures it has
  // to look the board price up again.
  const { row } = convertOne(requestLine({
    product_type: "base_cabinet",
    product_name: "Base cabinet",
    width_mm: null,
    height_mm: null,
    colour_library_id: "lib-white-16",
    thickness: "16mm",
  }));
  assert.equal(row.unit_cost_per_sqm_ex_gst, 55.5, "the carcass board rate was lost");
  assert.equal(row.calculated_unit_cost_ex_gst, 0, "a cabinet was costed as a flat sheet");
});

// ── The cabinet the customer drew ─────────────────────────────────────────
//
// A cabinet is priced from a cut list worked out from its box. The box used to
// reach the quote only as a sentence in the description, and the conversion had
// no cabinet handling at all, so a converted cabinet arrived with no height, no
// width, no depth and no shelves. On the first real customer design that came
// through, three cabinets were re-entered by hand off that sentence.

// The design item, exactly as the planner stores one.
const drawnCabinet = {
  id: "item-7",
  item_type: "base_cabinet",
  label: "Base 470",
  width_mm: 470,
  height_mm: 745,
  depth_mm: 470,
  qty: 1,
  material: "decorative board",
  finish: "Matt",
  colour: "Classic White",
  carcass_thickness_mm: 16,
  back_panel_included: true,
  back_panel_thickness_mm: 16,
  shelf_qty: 1,
  shelf_thickness_mm: 16,
  shelf_heights_mm: [373],
  front_type: "doors",
  door_config: { columns: 1 },
};

// The request line the website writes for it.
function cabinetRequestLine(over = {}) {
  return requestLine({
    product_type: "base_cabinet",
    product_name: "Base cabinet",
    material: "Decorative Board",
    thickness: "16mm",
    width_mm: null,
    height_mm: null,
    colour_library_id: "lib-white-16",
    edge_mould: null,
    hinge_holes: false,
    hinge_qty: null,
    design_item_id: drawnCabinet.id,
    cabinet_spec: cabinetSpecFromDesignItem(drawnCabinet),
    ...over,
  });
}

test("a cabinet from a design arrives measured, not empty", () => {
  const { line } = convertOne(cabinetRequestLine());
  const config = line.cabinet_config;
  assert.ok(config, "the cabinet converted with no configuration, so it opens on the configurator's own defaults");
  assert.equal(config.height_mm, 745, "the cabinet's height was lost");
  assert.equal(config.width_mm, 470, "the cabinet's width was lost");
  assert.equal(config.depth_mm, 470, "the cabinet's depth was lost");
  assert.equal(config.carcass_thickness_mm, 16);
  assert.equal(config.back_panel_included, true);
  assert.equal(config.shelf_qty, 1, "the shelf had to be added by hand");
  assert.deepEqual(config.shelf_heights_mm, [373], "the shelf height was lost");
});

test("a shelf drawn without a height is still given one", () => {
  // The planner records a shelf count without always recording where it sits.
  // The cut list spaces those evenly, so the cabinet stores where it actually
  // cut them rather than a blank that reads as "no shelves anywhere".
  const noHeights = { ...drawnCabinet, shelf_heights_mm: [] };
  const { line } = convertOne(cabinetRequestLine({ cabinet_spec: cabinetSpecFromDesignItem(noHeights) }));
  assert.deepEqual(line.cabinet_config.shelf_heights_mm, [373]);
});

test("a cabinet from a design arrives costed from its cut list", () => {
  const { line, row } = convertOne(cabinetRequestLine());
  const config = line.cabinet_config;
  assert.ok(config.calculated_cut_list.length > 0, "no cut list, so nothing to make it from or price it on");
  assert.equal(config.cost_per_sqm_carcass, 55.5, "the carcass was costed at something other than its board rate");
  assert.ok(config.calculated_material_cost_ex_gst > 0, "a fully specified cabinet still costed nothing");
  // The line is priced from the cut list, never as width x height x rate.
  assert.equal(row.product_unit_cost_ex_gst, config.calculated_material_cost_ex_gst);
  assert.equal(row.unit_cost_mode, "auto");
  assert.equal(row.width_mm, null, "a cabinet line took on dimensions, which lets it be repriced as a flat sheet");
  assert.equal(row.height_mm, null);
  assert.ok(row.line_total_ex_gst > 0, "the cabinet totalled zero on the quote");
});

test("a cabinet's description says its size, height first", () => {
  const { row } = convertOne(cabinetRequestLine());
  assert.match(row.description, /745mm high x 470mm wide x 470mm deep/);
  assert.match(row.description, /16mm carcass/);
  assert.match(row.description, /1 shelf/);
});

test("a shelf is priced from its own board, not assumed to be the carcass", () => {
  const shelfInAnotherBoard = {
    ...drawnCabinet,
    shelf_material: "decorative board",
    shelf_finish: "Matt",
    shelf_colour: "Classic White",
    shelf_thickness_mm: 18,
  };
  const { line } = convertOne(cabinetRequestLine({ cabinet_spec: cabinetSpecFromDesignItem(shelfInAnotherBoard) }));
  assert.equal(line.cabinet_config.cost_per_sqm_shelf, 60.74, "the shelf was costed at the carcass rate");
  assert.equal(line.cabinet_config.cost_per_sqm_carcass, 55.5);
});

test("a cabinet with a board we hold no price for still arrives measured", () => {
  // The library is half unpriced and that is normal. A missing price must cost
  // somebody a rate to type, never the whole cabinet.
  const { line } = convertOne(cabinetRequestLine({
    colour_library_id: "lib-natura-oak",
    material: "Thermolaminate",
    thickness: "18mm",
    finish: "Natura",
    colour: "Bottega Oak",
  }));
  assert.equal(line.cabinet_config.height_mm, 745);
  assert.equal(line.cabinet_config.shelf_qty, 1);
  assert.equal(line.cabinet_config.cost_per_sqm_carcass, 0);
  assert.equal(line.unit_cost_mode, "manual", "a cabinet with no board price was left looking priced");
});

test("a cabinet with no box on it converts the way it always did", () => {
  // Requests taken before this existed, and any line added by hand, carry no
  // spec. They must still convert, just without a cabinet built for them.
  const { line, row } = convertOne(cabinetRequestLine({ cabinet_spec: null, design_item_id: null }));
  assert.equal(line.cabinet_config, undefined);
  assert.equal(row.unit_cost_per_sqm_ex_gst, 55.5, "the carcass board rate was lost");
  assert.equal(row.calculated_unit_cost_ex_gst, 0, "a cabinet was costed as a flat sheet");
});

test("asking for hinges to be supplied is not silently dropped", () => {
  // A quote line cannot carry it: hinge_supply is forced to false on every
  // write path because we drill for hinges and do not supply them. What must
  // not happen is the customer's answer disappearing without trace.
  const { row } = convertOne(requestLine({ hinge_supply: true }));
  assert.equal(row.hinge_supply, false, "a quote line started carrying hinge supply");
  assert.match(row.notes, /hinges to be supplied/i, "the customer asked for hinges and nothing on the quote says so");
  assert.match(row.notes, /2 hinges/, "how many hinges they asked for was lost");
  assert.match(row.notes, /Handles on the left/, "their own note was overwritten");
});

test("no note is added when they did not ask for hinges", () => {
  assert.equal(withHingeSupplyNote("Just the doors.", { hinge_supply: false }), "Just the doors.");
  assert.equal(withHingeSupplyNote("", { hinge_supply: false }), "");
});

test("a design-sourced request tags its lines back to the design", () => {
  const entry = convertedQuoteLine(requestLine(), {
    resolveBoard,
    quoteRequest: { ...quoteRequest, design_project_id: "design-9" },
    businessDefaults,
  });
  // This is what makes re-importing the design REPLACE these lines instead of
  // adding a second copy of the whole design.
  assert.equal(entry.line.design_project_id, "design-9");
});

// ── The rule that stops an unquotable line being taken in the first place ──

test("a line is only ready when we could actually price it", () => {
  const ready = { productType: "Door", material: "Decorative Board", thickness: "18mm", colour: "Classic White", width: 597, height: 715 };
  assert.equal(lineIsReady(ready), true);

  assert.deepEqual(lineGaps({ ...ready, colour: "" }).map((gap) => gap.field), ["colour"]);
  assert.deepEqual(lineGaps({ ...ready, thickness: "" }).map((gap) => gap.field), ["thickness"]);
  assert.deepEqual(lineGaps({ ...ready, material: "" }).map((gap) => gap.field), ["material"]);
  assert.deepEqual(lineGaps({ ...ready, width: 0, height: 0 }).map((gap) => gap.field), ["width", "height"]);

  // The exact row that has been getting through: a board and a thickness and
  // nothing to price against.
  assert.deepEqual(
    lineGaps({ productType: "Door", material: "Thermolaminate", thickness: "18mm", finish: "Natura", width: 500, height: 700 }).map((gap) => gap.field),
    ["colour"]
  );
});

test("the readiness rule reads the same line whatever shape it is in", () => {
  // The form uses width / height, the stored row uses width_mm / height_mm.
  const stored = { product_type: "Door", material: "Decorative Board", thickness: "18mm", colour: "Classic White", width_mm: 597, height_mm: 715 };
  assert.equal(lineIsReady(stored), true);
  assert.equal(lineIsReady({ ...stored, width_mm: null }), false);
});

test("hardware and cabinets are the two things a board rule does not apply to", () => {
  // Hardware is a unit cost and a benchtop is priced from its own material
  // list, so no board rule reaches either.
  assert.equal(
    lineIsReady({ productType: "Hardware", hardwareCatalogueId: "abc", material: "", colour: "" }),
    true
  );
  assert.equal(lineIsReady({ productType: "Benchtop", material: "", colour: "" }), true);

  // WHICH hardware, though, is a real question, and it used to go unasked.
  // A line saying only "Hardware" counted as ready to price, so somebody had
  // to email and ask which handles, which is what the form is for. The public
  // form offers the catalogue now, so the answer is there to be given.
  assert.equal(lineIsReady({ productType: "Hardware", material: "", colour: "" }), false);
  assert.deepEqual(missingFields({ productType: "Hardware" }), ["hardware"]);

  // And nothing else is asked of it. A handle has no board, no size and no
  // finish, and asking anyway is what left the old form unfinishable.
  assert.deepEqual(missingFields({ productType: "Hardware", hardwareCatalogueId: "abc" }), []);

  // A cabinet is priced from its cut list, carries no size on purpose, and on a
  // carcass the customer already owns we are not making the box at all, so a
  // blank board on it is correct rather than missing.
  assert.equal(lineIsReady({ productType: "base_cabinet" }), true);

  // It still has to say that it IS a cabinet.
  assert.equal(lineIsReady({ productType: "", material: "Decorative Board", thickness: "16mm", colour: "Carcass" }), false);
});

test("sizes are required where a person types them and not where they are worked out", () => {
  const noSize = { productType: "Door", material: "Decorative Board", thickness: "18mm", colour: "Classic White" };

  // The website form asks for both, so leaving one out is something the
  // customer can fix before sending.
  assert.deepEqual(lineGaps(noSize).map((gap) => gap.field), ["width", "height"]);

  // A design planner works every size out from what was drawn. A filler panel
  // closing a gap that has to be measured on site goes through on purpose, with
  // the reason written on the line, rather than costing us the whole lead.
  assert.deepEqual(lineGaps(noSize, { requireSize: false }), []);

  // The board spec is required either way. That is the case that started this.
  assert.deepEqual(
    lineGaps({ productType: "Door", material: "Thermolaminate", thickness: "18mm", finish: "Natura" }, { requireSize: false }).map((gap) => gap.field),
    ["colour"]
  );
});

test("what is missing is said in words a customer can act on", () => {
  // Noun phrases, because the same words have to read correctly in three
  // different sentences: "Door is missing ___", "Please add ___", "Needs ___".
  const gaps = lineGaps({ productType: "Door", width: 500, height: 700 });
  assert.equal(describeGaps(gaps), "a material, a thickness and a colour");
  assert.equal(describeGaps(lineGaps({ productType: "Door", material: "Decorative Board", thickness: "18mm", width: 5, height: 7 })), "a colour");
  assert.equal(describeGaps([]), "");
});

test("every incomplete line is named, not just the first", () => {
  const lines = [
    { productType: "Door", material: "Decorative Board", thickness: "18mm", colour: "Classic White", width: 500, height: 700 },
    { productType: "Panel", material: "Decorative Board", thickness: "18mm", width: 500, height: 700 },
    { productType: "Drawer front", material: "Decorative Board", width: 500, height: 700 },
  ];
  const notReady = unreadyLines(lines, (line, index) => line.productType || `Line ${index + 1}`);
  assert.deepEqual(notReady.map((entry) => entry.index), [1, 2]);
  assert.deepEqual(notReady.map((entry) => entry.label), ["Panel", "Drawer front"]);
  assert.deepEqual(notReady[2 - 1].gaps.map((gap) => gap.field), ["thickness", "colour"]);
});

test("a line with no product type is not ready either", () => {
  // It would land on the quote with a blank Type, which is what decides how the
  // line is priced and cut.
  const gaps = lineGaps({ material: "Decorative Board", thickness: "18mm", colour: "Classic White", width: 597, height: 715 });
  assert.deepEqual(gaps.map((gap) => gap.field), ["type"]);
});

// ── The backstop: the one place a request is written ──────────────────────
//
// The rule is applied in the browser, again in the API and again here. This
// last one is the one a new submit path cannot forget, because there is no way
// to write a quote request without going through it.

test("nothing at all is written when a line cannot be quoted", async () => {
  // A supabase that fails loudly if it is touched. Reaching it would mean a
  // customer row, a request row or a line had already been written before the
  // request was found to be incomplete.
  const untouchable = new Proxy({}, {
    get() {
      throw new Error("insertQuoteRequest reached the database with an incomplete request");
    },
  });

  // The exact request that started this: a material, a thickness and a finish,
  // and no colour on any line.
  const payload = {
    source: "request_quote",
    customerName: "A Customer",
    lines: [
      { productType: "Door", productName: "Door", material: "Thermolaminate", thickness: "18mm", finish: "Natura", colour: "", width: 597, height: 715 },
      { productType: "Drawer front", productName: "Drawer front", material: "Thermolaminate", thickness: "18mm", finish: "Natura", colour: "", width: 597, height: 280 },
    ],
  };

  await assert.rejects(
    () => insertQuoteRequest(untouchable, payload),
    (error) => {
      assert.equal(error.name, "IncompleteQuoteRequestError");
      assert.match(error.message, /Door is missing a colour/);
      assert.deepEqual(error.incompleteLines.map((line) => line.label), ["Door", "Drawer front"]);
      assert.deepEqual(error.incompleteLines[0].missing, ["colour"]);
      return true;
    }
  );
});

test("a complete request is not stopped by the backstop", async () => {
  // Proves the check is the thing that lets it through, not the absence of one:
  // this gets past the rule and is only stopped by the stub database.
  const stub = { from: () => { throw new Error("reached the database"); } };
  await assert.rejects(
    () => insertQuoteRequest(stub, {
      customerName: "A Customer",
      lines: [{ productType: "Door", material: "Decorative Board", thickness: "18mm", colour: "Classic White", width: 597, height: 715 }],
    }),
    (error) => {
      assert.notEqual(error.name, "IncompleteQuoteRequestError", "a complete line was rejected as incomplete");
      return true;
    }
  );
});

test("a colour we hold no price for is still a complete request", () => {
  // Most of the colour library has no cost against it yet and those lines are
  // costed by hand at quote time. That is work to do, not a broken request, so
  // it must never stop a customer sending one.
  const line = { productType: "Door", material: "Thermolaminate", thickness: "18mm", finish: "Natura", colour: "Bottega Oak", width: 597, height: 715 };
  assert.equal(lineIsReady(line), true);

  const entry = convertedQuoteLine(
    { ...line, product_type: line.productType, width_mm: line.width, height_mm: line.height, colour_library_id: "lib-natura-oak" },
    { resolveBoard, quoteRequest, businessDefaults }
  );
  assert.equal(entry.match.ok, false, "expected this board to have no price in the test library");
  assert.equal(entry.match.reason, "unpriced");
  assert.equal(entry.line.unit_cost_mode, "manual", "a line waiting to be costed should be left manual, ready to type into");
});
