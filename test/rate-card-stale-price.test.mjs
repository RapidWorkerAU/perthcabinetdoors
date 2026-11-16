// A ROW THE RATE CARD CANNOT PRICE MUST NOT KEEP THE LAST SIZE'S PRICE.
//
// Found on real quotes: supplier made decorative board rows priced at one size
// and then changed to a size the card prices by hand kept the old price. A 30mm
// scribe at $43.08, a 46mm panel at $34.47, drawer fronts under 150mm high.

import test from "node:test";
import assert from "node:assert/strict";
import { withRateCardResult } from "../lib/pcd-thermo-pricing.js";
import { DEFAULT_POLYTEC_BOARD_CARD, normalizePolytecBoardCard, withMadeToOrderBoardPrice } from "../lib/pcd-polytec-board-pricing.js";

const CARD = normalizePolytecBoardCard(DEFAULT_POLYTEC_BOARD_CARD);

const ok = { ok: true, unitCost: 46.69, label: "card" };
const facia = { ok: false, reason: "Under 150mm in one direction Polytec makes it as a facia, which is priced by hand.", code: "facia" };

test("an automatic price the card cannot give is cleared, not kept", () => {
  const next = withRateCardResult({ unit_cost_mode: "auto", product_unit_cost_ex_gst: 43.08 }, facia);
  assert.equal(next.product_unit_cost_ex_gst, "");
  assert.equal(next.calculated_unit_cost_ex_gst, 0);
});

test("a typed price is never cleared, even when forced back to automatic", () => {
  const typed = { unit_cost_mode: "manual", product_unit_cost_ex_gst: 20 };
  for (const forceAuto of [false, true]) {
    const next = withRateCardResult(typed, facia, { forceAuto });
    assert.equal(next.product_unit_cost_ex_gst, 20);
    assert.equal(next.unit_cost_mode, "manual");
  }
});

test("a price the card can give still lands, and a typed one still wins", () => {
  assert.equal(withRateCardResult({ unit_cost_mode: "auto", product_unit_cost_ex_gst: 10 }, ok).product_unit_cost_ex_gst, 46.69);
  assert.equal(withRateCardResult({ unit_cost_mode: "manual", product_unit_cost_ex_gst: 10 }, ok).product_unit_cost_ex_gst, 10);
  assert.equal(withRateCardResult({ unit_cost_mode: "manual", product_unit_cost_ex_gst: "" }, ok).product_unit_cost_ex_gst, 46.69);
});

test("a supplier made scribe changed from a door size drops the door's price", () => {
  const door = {
    material: "Decorative Board", made_by: "mto", product_type: "Panel",
    height_mm: 757, width_mm: 448, thickness: "16mm", finish: "Matt",
    unit_cost_per_sqm_ex_gst: 60.74, unit_cost_mode: "auto", product_unit_cost_ex_gst: "",
  };
  const priced = withMadeToOrderBoardPrice(door, CARD, { forceAuto: true });
  assert.ok(Number(priced.product_unit_cost_ex_gst) > 0, "the door prices");
  const scribe = withMadeToOrderBoardPrice({ ...priced, width_mm: 30 }, CARD);
  assert.equal(scribe.product_unit_cost_ex_gst, "", "the scribe is blank, not the door's price");
});
