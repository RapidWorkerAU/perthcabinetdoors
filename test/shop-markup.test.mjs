// THE SHOP'S OWN MARKUP.
//
// A door bought off the website is priced by a machine, paid for on the spot
// and posted. A quoted job is priced by hand and looked at before it goes out.
// They are not marked up at the same rate, and the difference has to live on
// the shop's lines rather than in Business Defaults, because that number prices
// every quote in the business and moving it would reprice the lot.
//
// Two things are worth locking, and neither is visible by reading the code:
// that the rate is the shop's alone, and that it lands ON the line rather than
// on a price. calculateQuoteLine runs a second time on the way into the
// database, and anything written onto a price field is recomputed away between
// the figure the customer agreed to and the figure stored against their order.

import test from "node:test";
import assert from "node:assert/strict";

import { SHOP_MARKUP_PERCENT } from "../lib/pcd-shop.js";
import { calculateQuoteLine, DEFAULT_BUSINESS_DEFAULTS } from "../lib/pcd-quote-utils.js";

test("the shop marks up at its own rate", () => {
  assert.equal(SHOP_MARKUP_PERCENT, 100);
});

// If this ever equals the business default, somebody has "tidied up" by
// pointing one at the other, and the shop will silently follow every change
// made to quoting.
test("the shop rate is not the business default wearing another name", () => {
  assert.notEqual(
    SHOP_MARKUP_PERCENT,
    DEFAULT_BUSINESS_DEFAULTS.markup_percent,
    "the shop rate has to be its own number, or changing quoting changes the shop"
  );
});

// THE PART THAT MATTERS. A line carrying its own markup keeps it when the line
// is priced again; a line left blank falls back to the business default, which
// is exactly what the shop must not do.
test("a line carrying the shop rate keeps it through a recalculation", () => {
  const defaults = { ...DEFAULT_BUSINESS_DEFAULTS, markup_percent: 75 };
  const line = { product_type: "Hardware", qty: 1, product_unit_cost_ex_gst: 100, markup_percent: SHOP_MARKUP_PERCENT };

  const once = calculateQuoteLine(line, defaults);
  assert.equal(once.markup_percent, SHOP_MARKUP_PERCENT);

  // Run it again on its own output, which is what checkout does.
  const twice = calculateQuoteLine(once, defaults);
  assert.equal(twice.markup_percent, SHOP_MARKUP_PERCENT, "the rate must not decay to the business default");
  assert.equal(twice.line_total_ex_gst, once.line_total_ex_gst, "and the price must not move on a second pass");
});

test("a line with no markup of its own still falls back to the business default", () => {
  const defaults = { ...DEFAULT_BUSINESS_DEFAULTS, markup_percent: 75 };
  const bare = calculateQuoteLine({ product_type: "Hardware", qty: 1, product_unit_cost_ex_gst: 100 }, defaults);
  assert.equal(bare.markup_percent, 75, "everything that is not the shop keeps quoting's rate");
});

test("100 per cent is cost doubled, not cost plus a doubling", () => {
  const defaults = { ...DEFAULT_BUSINESS_DEFAULTS, markup_percent: 75 };
  const line = calculateQuoteLine(
    { product_type: "Hardware", qty: 1, product_unit_cost_ex_gst: 100, markup_percent: 100 },
    defaults
  );
  assert.equal(line.line_total_ex_gst, 200);
});
