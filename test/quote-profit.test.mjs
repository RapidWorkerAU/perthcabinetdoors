// What a quote is worth to the business, as shown on the dashboard.
//
// The dashboard used to show revenue only, so a board-heavy month and a
// labour-heavy month of the same size read identically. Profit is the markup
// plus the labour, ex GST; everything else on a quote is money that leaves the
// business.
//
// The trap this guards is double counting. material_cost_ex_gst on a quote
// already contains the markup, because calculateQuoteLine sets a line's
// material_cost_ex_gst to its whole line total. Anything that adds a share of
// material_cost to the markup counts the same dollars twice and reports a
// profit larger than the job.

import test from "node:test";
import assert from "node:assert/strict";
import { calculateQuoteTotals } from "../lib/pcd-quote-utils.js";
import { PROFIT_COMPONENTS, orderProfitExGst, quoteProfitExGst } from "../lib/pcd-quote-profit.js";

const QUOTE = {
  markup_amount_ex_gst: 1900,
  labour_cost_ex_gst: 2470,
  material_cost_ex_gst: 6100,
  travel_cost_ex_gst: 180,
  delivery_cost_ex_gst: 120,
  installation_cost_ex_gst: 180,
  painting_cost_ex_gst: 600,
  glass_cost_ex_gst: 250,
  removal_cost_ex_gst: 100,
  subtotal_ex_gst: 9530,
  total_inc_gst: 10483,
};

test("profit is the markup plus the labour", () => {
  assert.equal(quoteProfitExGst(QUOTE), 1900 + 2470);
});

test("nothing else on the quote counts as profit", () => {
  // Every other cost line is money paid out. Changing any of them must not
  // move the profit figure.
  const paidOut = [
    "material_cost_ex_gst", "travel_cost_ex_gst", "delivery_cost_ex_gst",
    "installation_cost_ex_gst", "painting_cost_ex_gst", "glass_cost_ex_gst",
    "removal_cost_ex_gst",
  ];
  paidOut.forEach((column) => {
    const inflated = { ...QUOTE, [column]: Number(QUOTE[column]) + 5000 };
    assert.equal(quoteProfitExGst(inflated), quoteProfitExGst(QUOTE), `${column} must not count as profit`);
    assert.ok(!PROFIT_COMPONENTS.includes(column));
  });
});

test("the markup is counted once, not once through material cost as well", () => {
  // material_cost_ex_gst on a real quote INCLUDES the markup. Profit must not
  // exceed what a fully-marked-up, zero-cost job could produce.
  const totals = calculateQuoteTotals(
    [{ product_type: "door", qty: 2, product_unit_cost_ex_gst: 500, markup_percent: 40, labour_hours: 3 }],
    0.1,
    { manual_labour_hours: 0, business_defaults: { worker_hourly_rate: 65 } }
  );
  assert.equal(totals.markup_amount_ex_gst, 400, "2 x $500 at 40%");
  assert.ok(
    totals.material_cost_ex_gst > totals.markup_amount_ex_gst,
    "material cost contains the markup, which is exactly why it is not added again"
  );
  assert.equal(quoteProfitExGst(totals), 400 + totals.labour_cost_ex_gst);
  assert.ok(quoteProfitExGst(totals) < totals.subtotal_ex_gst, "profit can never exceed the job");
});

test("profit is ex GST, so GST is never in it", () => {
  const totals = calculateQuoteTotals(
    [{ product_type: "door", qty: 1, product_unit_cost_ex_gst: 1000, markup_percent: 50 }],
    0.1,
    {}
  );
  assert.ok(totals.total_inc_gst > totals.subtotal_ex_gst, "the quote itself carries GST");
  assert.equal(quoteProfitExGst(totals), totals.markup_amount_ex_gst + totals.labour_cost_ex_gst);
});

test("a quote with no markup and no labour is worth nothing, not NaN", () => {
  assert.equal(quoteProfitExGst({ material_cost_ex_gst: 5000 }), 0);
  assert.equal(quoteProfitExGst({}), 0);
  assert.equal(quoteProfitExGst(null), 0);
  assert.equal(quoteProfitExGst({ markup_amount_ex_gst: "not a number" }), 0);
});

test("string amounts from the database are read as numbers, not concatenated", () => {
  // numeric columns come back as strings through PostgREST.
  assert.equal(quoteProfitExGst({ markup_amount_ex_gst: "1900.00", labour_cost_ex_gst: "2470.50" }), 4370.5);
});

// ── orders ──────────────────────────────────────────────────────────────────

test("an order's profit is its quote's profit", () => {
  assert.equal(orderProfitExGst({ id: "o1", pcd_quotes: QUOTE }), 4370);
  // PostgREST returns an embedded row as an object or a single-element array
  // depending on how it reads the relationship. Both have to work.
  assert.equal(orderProfitExGst({ id: "o1", pcd_quotes: [QUOTE] }), 4370);
});

test("an order with no quote is unknown, not zero", () => {
  // Zero would quietly report "no profit" on real revenue. Null lets the
  // dashboard count those orders and say so.
  assert.equal(orderProfitExGst({ id: "o1" }), null);
  assert.equal(orderProfitExGst({ id: "o1", pcd_quotes: null }), null);
  assert.equal(orderProfitExGst({ id: "o1", pcd_quotes: [] }), null);
});

test("a quote that genuinely made nothing is zero, not unknown", () => {
  // The difference matters: this one has a split and it came to nothing.
  assert.equal(orderProfitExGst({ id: "o1", pcd_quotes: { material_cost_ex_gst: 500 } }), 0);
});
