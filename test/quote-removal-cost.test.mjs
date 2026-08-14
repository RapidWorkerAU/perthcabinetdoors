// The door removal and disposal cost is a quote-level cost like painting and
// glass: entered in the quote editor, added to the subtotal, and shown to the
// customer ONLY when it has a figure in it.
//
// Two things are easy to get wrong with a new cost field, and both are silent.
// If it is left out of the sum, the editor shows the figure but the customer is
// never charged it. If it is not filtered on the customer's side, every quote
// we never charge removal on grows a "$0.00" line. These lock both.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateQuoteTotals } from "../lib/pcd-quote-utils.js";

const GST = 0.1;
const LINE = { product_type: "door", qty: 1, labour_hours: 0 };

test("the cost reaches the totals and is added to the subtotal", () => {
  const without = calculateQuoteTotals([LINE], GST, {});
  const with250 = calculateQuoteTotals([LINE], GST, { removal_cost_ex_gst: 250 });

  assert.equal(with250.removal_cost_ex_gst, 250);
  assert.equal(with250.subtotal_ex_gst, without.subtotal_ex_gst + 250);
  assert.equal(with250.total_inc_gst, Math.round((with250.subtotal_ex_gst * 1.1 + Number.EPSILON) * 100) / 100);
});

test("it is zero, not undefined, when nothing was entered", () => {
  const totals = calculateQuoteTotals([LINE], GST, {});
  assert.equal(totals.removal_cost_ex_gst, 0);
});

test("the camelCase form is accepted, the same as every other cost", () => {
  assert.equal(calculateQuoteTotals([LINE], GST, { removalCostExGst: 120 }).removal_cost_ex_gst, 120);
});

test("a blank field from the editor is treated as nothing, not as NaN", () => {
  // The admin form holds "" until someone types a number.
  const totals = calculateQuoteTotals([LINE], GST, { removal_cost_ex_gst: "" });
  assert.equal(totals.removal_cost_ex_gst, 0);
  assert.ok(Number.isFinite(totals.subtotal_ex_gst));
});

// ── only shown when it has a figure ─────────────────────────────────────────
//
// Both customer-facing surfaces build their cost breakdown as an array and then
// drop the zero rows. Reading the source is how we catch someone adding the row
// to a list that is NOT filtered, which is the way this regresses.

test("the customer quote page lists it inside the filtered rows", () => {
  const src = readFileSync(new URL("../app/(site)/quotes/QuoteApprovalClient.js", import.meta.url), "utf8");
  const index = src.indexOf("removal_cost_ex_gst");
  assert.ok(index > 0, "the row must exist on the customer page");
  const after = src.slice(index, index + 400);
  assert.match(after, /\.filter\(\(row\) => row\.always \|\| row\.amount > 0\)/, "the row must sit in a list that drops zeros");
});

test("the PDF lists it inside the filtered breakdown", () => {
  const src = readFileSync(new URL("../lib/pcd-cabinet-pdf.js", import.meta.url), "utf8");
  const index = src.indexOf("totals.removal_cost_ex_gst");
  assert.ok(index > 0, "the row must exist in the PDF breakdown");
  const after = src.slice(index, index + 800);
  assert.match(after, /breakdown\.filter\(\(\[, value\]\) => toNumber\(value\) > 0\)/, "the row must sit in a breakdown that drops zeros");
});
