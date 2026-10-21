// THE SHOP'S OWN MARGIN.
//
// Every piece sold on the web shop is made by Polytec and marked up at the
// margin on its rate card in Settings (Decorative Board Pricing, or
// Thermolaminate Pricing), never at the Business Default, because that number
// prices every quote in the business and moving it would reprice the lot. The
// fixed 100% shop rate on our own board cost was retired on 10 October 2026.
//
// Two things are worth locking, and neither is visible by reading the code:
// that the margin lives on the card, and that it lands ON the line rather than
// on a price. calculateQuoteLine runs a second time on the way into the
// database, and anything written onto a price field is recomputed away between
// the figure the customer agreed to and the figure stored against their order.

import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_POLYTEC_BOARD_CARD, normalizePolytecBoardCard } from "../lib/pcd-polytec-board-pricing.js";
import { calculateQuoteLine, DEFAULT_BUSINESS_DEFAULTS } from "../lib/pcd-quote-utils.js";
import * as shop from "../lib/pcd-shop.js";

test("the decorative board margin is a setting on its rate card, starting at 75%", () => {
  assert.equal(DEFAULT_POLYTEC_BOARD_CARD.margin_percent, 75);
  assert.equal(normalizePolytecBoardCard({ margin_percent: 90 }).margin_percent, 90);
});

test("the fixed shop rate is gone, so nothing can price from it", () => {
  assert.equal("SHOP_MARKUP_PERCENT" in shop, false);
});

// THE PART THAT MATTERS. A line carrying its own markup keeps it when the line
// is priced again; a line left blank falls back to the business default, which
// is exactly what the shop must not do.
test("a line carrying the card's margin keeps it through a recalculation", () => {
  const defaults = { ...DEFAULT_BUSINESS_DEFAULTS, markup_percent: 75 };
  const line = { product_type: "Door", qty: 1, product_unit_cost_ex_gst: 100, markup_percent: 90 };

  const once = calculateQuoteLine(line, defaults);
  assert.equal(once.markup_percent, 90);

  // Run it again on its own output, which is what checkout does.
  const twice = calculateQuoteLine(once, defaults);
  assert.equal(twice.markup_percent, 90, "the margin must not decay to the business default");
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
