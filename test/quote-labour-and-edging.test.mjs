// Two business defaults that price themselves off the quote lines.
//
// Both answer the same question — which lines are decorative board our own
// workshop makes — and both used to be absorbed into the board price or simply
// forgotten:
//
//   * IN-HOUSE PROCESSING TIME, hours per door, drawer front or panel we cut
//     from board, added to the quote's labour hours.
//   * ABS EDGING, per lineal metre of taped edge, added as a quote-level cost.
//
// The traps these lock down: charging a cabinet twice (its per-cabinet hours
// already cover making it), counting board we do not cut ourselves, and an
// override of 0 being mistaken for "not overridden" so a recalculation puts the
// calculated cost back on a job that was meant to carry none.

import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateQuoteTotals,
  edgingLinealMetres,
  edgingTotals,
  isDecorativeBoardLine,
} from "../lib/pcd-quote-utils.js";

const DEFAULTS = {
  markup_percent: 40,
  worker_hourly_rate: 100,
  labour_hours_per_cabinet: 1.5,
  inhouse_processing_hours_per_piece: 0.25,
  abs_edging_cost_per_lineal_metre_ex_gst: 1.8,
};

const cabinet = { product_type: "base_cabinet", material: "Decorative Board", width_mm: 600, height_mm: 720, qty: 3 };
const door = { product_type: "Door", material: "Decorative Board", width_mm: 600, height_mm: 720, qty: 4 };
const panel = { product_type: "Panel", material: "Decorative Board", width_mm: 900, height_mm: 720, qty: 1 };
const thermoDoor = { product_type: "Door", material: "Thermolaminate", width_mm: 600, height_mm: 720, qty: 2 };
const hardware = { product_type: "Hardware", material: "", qty: 10 };

// ── Which lines count ────────────────────────────────────────────────────────

test("decorative board in any thickness counts, other materials do not", () => {
  assert.equal(isDecorativeBoardLine({ product_type: "Door", material: "Decorative Board" }), true);
  assert.equal(isDecorativeBoardLine({ product_type: "Panel", material: "16mm" }), true);
  assert.equal(isDecorativeBoardLine({ product_type: "Door", material: "18mm" }), true);
  assert.equal(isDecorativeBoardLine(thermoDoor), false);
  assert.equal(isDecorativeBoardLine({ product_type: "Door", material: "Compact Laminate" }), false);
});

test("hardware and benchtops never count, whatever their material says", () => {
  assert.equal(isDecorativeBoardLine(hardware), false);
  assert.equal(isDecorativeBoardLine({ product_type: "Hardware", material: "Decorative Board" }), false);
  assert.equal(isDecorativeBoardLine({ product_type: "Benchtop", material: "Decorative Board" }), false);
});

// ── Processing hours ─────────────────────────────────────────────────────────

test("every decorative board front and panel carries the processing time, x qty", () => {
  const totals = calculateQuoteTotals([door, panel], 0.1, { business_defaults: DEFAULTS });
  // 4 doors + 1 panel = 5 pieces at 0.25h
  assert.equal(totals.processing_labour_hours, 1.25);
});

test("a cabinet is not charged processing on top of its per-cabinet hours", () => {
  // The per-cabinet default is the time to make the cabinet. Charging both
  // would bill the same work twice.
  const totals = calculateQuoteTotals([cabinet], 0.1, { business_defaults: DEFAULTS });
  assert.equal(totals.cabinet_labour_hours, 4.5);
  assert.equal(totals.processing_labour_hours, 0);
});

test("cabinet hours and processing hours add together, on top of the manual figure", () => {
  const totals = calculateQuoteTotals([cabinet, door, panel, thermoDoor, hardware], 0.1, {
    business_defaults: DEFAULTS,
    manual_labour_hours: 2,
  });
  assert.equal(totals.cabinet_labour_hours, 4.5);
  assert.equal(totals.processing_labour_hours, 1.25);
  assert.equal(totals.labour_hours, 7.75);
  assert.equal(totals.labour_cost_ex_gst, 775);
});

test("board we do not cut ourselves is not charged processing", () => {
  const totals = calculateQuoteTotals([thermoDoor, hardware], 0.1, { business_defaults: DEFAULTS });
  assert.equal(totals.processing_labour_hours, 0);
});

test("hours typed against a line by hand are kept, not replaced", () => {
  const totals = calculateQuoteTotals([{ ...door, labour_hours: 3 }], 0.1, { business_defaults: DEFAULTS });
  assert.equal(totals.line_labour_hours, 4);
});

test("nothing is added until the default is set", () => {
  const totals = calculateQuoteTotals([door, panel], 0.1, {
    business_defaults: { ...DEFAULTS, inhouse_processing_hours_per_piece: 0 },
  });
  assert.equal(totals.processing_labour_hours, 0);
});

// ── Edging metres ────────────────────────────────────────────────────────────

test("a piece contributes all four of its edges, x qty", () => {
  // 2 x (600 + 720) = 2640mm each, four of them.
  assert.equal(edgingLinealMetres(door), 10.56);
  assert.equal(edgingLinealMetres(panel), 3.24);
});

test("a cabinet contributes the perimeter of its face, which is its taped front edges", () => {
  assert.equal(edgingLinealMetres(cabinet), 7.92);
});

test("a line with no size contributes nothing rather than a guess", () => {
  assert.equal(edgingLinealMetres({ product_type: "Panel", material: "Decorative Board", qty: 2 }), 0);
  assert.equal(edgingLinealMetres(hardware), 0);
});

test("the quote's metres are the lines added up", () => {
  const totals = calculateQuoteTotals([cabinet, door, panel, thermoDoor, hardware], 0.1, {
    business_defaults: DEFAULTS,
  });
  assert.equal(totals.edging_lineal_metres, 21.72);
});

// ── Edging cost ──────────────────────────────────────────────────────────────

test("the cost is the metres at the configured rate, and it reaches the subtotal", () => {
  const lines = [cabinet, door, panel];
  const totals = calculateQuoteTotals(lines, 0.1, { business_defaults: DEFAULTS });
  assert.equal(totals.edging_rate_per_lm_ex_gst, 1.8);
  assert.equal(totals.edging_calculated_cost_ex_gst, 39.1);
  assert.equal(totals.edging_cost_ex_gst, 39.1);

  const without = calculateQuoteTotals(lines, 0.1, {
    business_defaults: { ...DEFAULTS, abs_edging_cost_per_lineal_metre_ex_gst: 0 },
  });
  assert.equal(
    Number((totals.subtotal_ex_gst - without.subtotal_ex_gst).toFixed(2)),
    39.1,
    "the edging cost has to be in the subtotal, not just reported"
  );
});

test("the rate already carries our uplift, so the edging cost is never marked up again", () => {
  const withEdging = calculateQuoteTotals([door], 0.1, { business_defaults: DEFAULTS });
  const withoutEdging = calculateQuoteTotals([door], 0.1, {
    business_defaults: { ...DEFAULTS, abs_edging_cost_per_lineal_metre_ex_gst: 0 },
  });
  assert.equal(withEdging.markup_amount_ex_gst, withoutEdging.markup_amount_ex_gst);
});

test("the metres are still reported when no rate is set, so the figure can be checked first", () => {
  const totals = calculateQuoteTotals([door], 0.1, {
    business_defaults: { ...DEFAULTS, abs_edging_cost_per_lineal_metre_ex_gst: 0 },
  });
  assert.equal(totals.edging_lineal_metres, 10.56);
  assert.equal(totals.edging_cost_ex_gst, 0);
});

// ── The override ─────────────────────────────────────────────────────────────

test("a typed figure wins and the calculation is still reported beside it", () => {
  const totals = calculateQuoteTotals([door], 0.1, {
    business_defaults: DEFAULTS,
    edging_cost_override_ex_gst: 25,
  });
  assert.equal(totals.edging_cost_ex_gst, 25);
  assert.equal(totals.edging_calculated_cost_ex_gst, 19.01);
  assert.equal(totals.edging_cost_override_ex_gst, 25);
});

test("an override of zero means charge nothing, and survives a recalculation", () => {
  // The one that matters. If 0 read as "not overridden" the calculated cost
  // would come straight back on a job someone had deliberately zeroed.
  const totals = calculateQuoteTotals([door], 0.1, {
    business_defaults: DEFAULTS,
    edging_cost_override_ex_gst: 0,
  });
  assert.equal(totals.edging_cost_ex_gst, 0);
  assert.equal(totals.edging_cost_override_ex_gst, 0);
});

test("blank, null and absent all mean follow the lines", () => {
  for (const value of ["", null, undefined]) {
    const totals = calculateQuoteTotals([door], 0.1, {
      business_defaults: DEFAULTS,
      edging_cost_override_ex_gst: value,
    });
    assert.equal(totals.edging_cost_ex_gst, 19.01, `${String(value)} should not pin the cost`);
    assert.equal(totals.edging_cost_override_ex_gst, null);
  }
});

test("edgingTotals reads a line's own metres when it has them", () => {
  // The add-one-line save path passes a running total this way rather than
  // re-reading every line on the quote.
  const totals = edgingTotals([{ edging_lineal_metres: 10 }], DEFAULTS, {});
  assert.equal(totals.edging_lineal_metres, 10);
  assert.equal(totals.edging_cost_ex_gst, 18);
});
