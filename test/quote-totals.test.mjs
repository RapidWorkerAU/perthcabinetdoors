import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { calculateQuoteTotals } from "../lib/pcd-quote-utils.js";


// ── THE HEADER AND THE LINES ARE WRITTEN TOGETHER ───────────────────────────
//
// PCD-O-2026-652917, 13 September 2026. The quote was built on 9 July with
// hinge drilling at $15 a hole and sent at $2,306.00 ex GST. The drilling
// default was later changed to $5. Marking the quote approved on 5 August
// recalculated the HEADER to $2,106.00 and left the nine line rows priced at
// $15, because recalculateQuoteTotals re-priced every line on its way to a
// subtotal and then saved only the quote.
//
// The two disagreed from that moment on, silently, and nothing read them side
// by side until a tax invoice tried to print two months later and refused.
//
// A quote's own arithmetic has to hold. Anything that moves the header moves
// the lines with it.

test("a recalculation that moves a line's money saves that line too", () => {
  const source = readFileSync(
    new URL("../app/api/admin/quotes/[id]/_quote-line-save.js", import.meta.url),
    "utf8"
  );
  // From the function onwards. Everything before it is unrelated helpers, and
  // the order of the two writes inside it is the thing being checked.
  const body = source.slice(source.indexOf("export async function recalculateQuoteTotals"));

  assert.match(body, /from\("pcd_quote_line_items"\)\.update\(patch\)\.eq\("id", stored\.id\)/,
    "the lines are written, not just read on the way to a subtotal");
  // The lines go first, so a failure cannot leave the header moved and the
  // lines behind: that is the exact state this bug left a real order in.
  assert.ok(
    body.indexOf('from("pcd_quote_line_items")') < body.indexOf('from("pcd_quotes")'),
    "the lines are saved before the header"
  );
  // Only the columns the calculation owns. Nothing a person typed.
  assert.match(source, /const DERIVED_LINE_COLUMNS = \[/);
  ["line_total_ex_gst", "material_cost_ex_gst", "hinge_drilling_cost_ex_gst", "markup_amount_ex_gst"]
    .forEach((column) => assert.match(source, new RegExp(`"${column}"`), `${column} is kept in step`));
  assert.ok(!/"product_unit_cost_ex_gst"/.test(source.slice(source.indexOf("DERIVED_LINE_COLUMNS"), source.indexOf("]", source.indexOf("DERIVED_LINE_COLUMNS")))),
    "a typed unit cost is not overwritten");
  // A cent of rounding across several figures is not a change worth a write.
  assert.match(body, /Math\.abs\(was - now\) > 0\.005/);
});

test("a line total is its parts, drilling included", () => {
  // The sum that stopped adding up. A door at $53, 75% markup, 4 hinges at $5
  // a hole is 53 + 39.75 + 20. At the $15 it was quoted at it was 53 + 39.75 +
  // 60, which is the $152.75 that sat on that order for two months.
  const [line] = calculateQuoteTotals(
    [{ product_type: "Door", qty: 1, product_unit_cost_ex_gst: 53, markup_percent: 75, hinge_holes: true, hinge_qty: "4 hinges" }],
    0.1,
    { business_defaults: { hinge_drilling_unit_cost_ex_gst: 5, markup_percent: 75 } }
  ).lines;
  assert.equal(line.hinge_drilling_cost_ex_gst, 20);
  assert.equal(line.line_total_ex_gst, 112.75);
  assert.equal(line.material_cost_ex_gst, line.line_total_ex_gst, "the two are the same figure");

  const [dearer] = calculateQuoteTotals(
    [{ product_type: "Door", qty: 1, product_unit_cost_ex_gst: 53, markup_percent: 75, hinge_holes: true, hinge_qty: "4 hinges" }],
    0.1,
    { business_defaults: { hinge_drilling_unit_cost_ex_gst: 15, markup_percent: 75 } }
  ).lines;
  assert.equal(dearer.line_total_ex_gst, 152.75, "which is what the old rate produced");
});
