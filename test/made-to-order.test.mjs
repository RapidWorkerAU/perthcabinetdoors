// A BOARD WITH NO RATE IS NOT ALWAYS A BOARD WE FORGOT TO PRICE.
//
// There are two ways we sell a board:
//
//   supply board       we buy it and cut it ourselves, so the colour carries a
//                      cost per m² and every line prices off that.
//   made to order MTO  the job goes to the supplier and comes back priced for
//                      that job. There is no rate to hold and there never will
//                      be. Thermolaminate and compact laminate are both this.
//
// Five separate places tested the PRICE instead of the order type, so every
// made-to-order colour read as a fault: the Board Library said "236 of 490
// colours have no cost", every thermolaminate quote line showed "with no board
// cost" in red, a reprice reported lines it could never have repriced, the same
// lines were reported again on conversion, and the design importer raised a
// pre-flight warning on nearly every design.
//
// None of it was true, and all of it was loud. A warning that is always there
// is a warning nobody reads, which is what makes the real one dangerous.

import assert from "node:assert/strict";
import test from "node:test";

import { matchBoardCost } from "../lib/pcd-board-cost.js";
import { isMadeToOrder, isMissingBoardPrice } from "../lib/pcd-colour-library.js";
import { madeToOrderSummary, unpricedSummary, convertedQuoteLine } from "../lib/pcd-quote-request-convert.js";
import { DEFAULT_BUSINESS_DEFAULTS } from "../lib/pcd-quote-utils.js";

const SUPPLY_PRICED = {
  id: "lib-decor",
  name: "Classic White",
  finish_type: "Matt",
  material_type: "decorative board",
  thickness: "16mm",
  supplier_name: "Polytec",
  order_types: ["supply board"],
  cost_per_sqm_ex_gst: 55.5,
};

const SUPPLY_UNPRICED = {
  ...SUPPLY_PRICED,
  id: "lib-decor-unpriced",
  name: "Raw",
  cost_per_sqm_ex_gst: 0,
};

const MADE_TO_ORDER = {
  id: "lib-thermo",
  name: "Topiary",
  finish_type: "Smooth",
  material_type: "thermolaminate",
  thickness: "21mm",
  supplier_name: "Polytec",
  order_types: ["made to order MTO"],
  cost_per_sqm_ex_gst: 0,
};

const LIBRARY = [SUPPLY_PRICED, SUPPLY_UNPRICED, MADE_TO_ORDER];
const resolveBoard = (spec) => matchBoardCost(LIBRARY, spec);

test("the two ways we sell a board are told apart", () => {
  assert.equal(isMadeToOrder(MADE_TO_ORDER), true);
  assert.equal(isMadeToOrder(SUPPLY_PRICED), false);
  // The older single-value column reads the same way.
  assert.equal(isMadeToOrder({ order_type: "made to order MTO" }), true);
  // A row with nothing on it is supply board, which is what the library defaults
  // to and what every decorative board colour is.
  assert.equal(isMadeToOrder({}), false);
});

test("only a supply board can be missing its price", () => {
  assert.equal(isMissingBoardPrice(SUPPLY_UNPRICED), true, "a supply board with no cost is a real gap");
  assert.equal(isMissingBoardPrice(SUPPLY_PRICED), false);
  assert.equal(isMissingBoardPrice(MADE_TO_ORDER), false, "made to order was counted as a colour we forgot to price");
});

test("a made-to-order board is not reported as unpriced", () => {
  const match = resolveBoard({ colourLibraryId: MADE_TO_ORDER.id });
  assert.equal(match.ok, false, "there is no rate, so it cannot price a line");
  assert.equal(match.reason, "made_to_order");
  assert.match(match.message, /quoted by the supplier/i);
  assert.doesNotMatch(match.message, /no cost per m/i, "it reads as a missing price, which sends someone looking for one");
});

test("a supply board with no cost still says so", () => {
  const match = resolveBoard({ colourLibraryId: SUPPLY_UNPRICED.id });
  assert.equal(match.ok, false);
  assert.equal(match.reason, "unpriced");
  assert.match(match.message, /no cost per m/i);
});

test("a made-to-order line converts unpriced, and is reported apart from a gap", () => {
  const line = (over) => ({
    product_type: "Door",
    product_name: "Door",
    material: "Thermolaminate",
    thickness: "21mm",
    finish: "Smooth",
    colour: "Topiary",
    colour_library_id: MADE_TO_ORDER.id,
    supplier_name: "Polytec",
    width_mm: 597,
    height_mm: 715,
    qty: 1,
    ...over,
  });
  const mto = convertedQuoteLine(line(), {
    resolveBoard,
    quoteRequest: { design_project_id: null },
    businessDefaults: DEFAULT_BUSINESS_DEFAULTS,
  });
  const gap = convertedQuoteLine(
    line({ material: "Decorative Board", thickness: "16mm", finish: "Matt", colour: "Raw", colour_library_id: SUPPLY_UNPRICED.id }),
    { resolveBoard, quoteRequest: { design_project_id: null }, businessDefaults: DEFAULT_BUSINESS_DEFAULTS }
  );

  // Both land manual at zero: neither has a rate to price from.
  assert.equal(mto.line.unit_cost_per_sqm_ex_gst, 0);
  assert.equal(gap.line.unit_cost_per_sqm_ex_gst, 0);

  // But only one of them is somebody's job to go and fix.
  const entries = [mto, gap];
  assert.deepEqual(unpricedSummary(entries).map((e) => e.colour), ["Raw"]);
  assert.deepEqual(madeToOrderSummary(entries).map((e) => e.colour), ["Topiary"]);
});
