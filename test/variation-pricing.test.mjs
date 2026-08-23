// SENDING A VARIATION MUST NOT BE A DEAD END.
//
// The fault: saving a variation line ALLOWED a hand-typed unit cost and left the
// board rate at zero, which is right, because not every price comes off a board.
// Sending then read the board rate, found the zero, and refused with "uses a
// board without an uploaded price". The board was never the problem. The line
// had a price, the save had accepted it, and the last step in the process
// rejected work every earlier step had allowed, using a message that pointed at
// the wrong thing. There was no way forward and no way to tell why.
//
// Two separate faults, both covered here:
//
//   1. the rule disagreed with itself between saving and sending
//   2. it blocked rather than warned, over a number that only affects our own
//      margin, on a document a customer was waiting for

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { hasAnyCost, isBoardPricedLine, unpricedVariationLines, unpricedWarning } from "../lib/pcd-variation-pricing.js";

// ── the regression ─────────────────────────────────────────────────────────

test("a line priced by hand is not called unpriced", () => {
  // Exactly the line that was blocked: a real cost, typed by a person, so the
  // board rate is zero because no board was involved in the price.
  const handPriced = {
    action: "add",
    product_type: "Door",
    material: "Decorative Board",
    unit_cost_per_sqm_ex_gst: 0,
    product_unit_cost_ex_gst: 48.5,
  };
  assert.equal(hasAnyCost(handPriced), true, "a typed unit cost is a cost");
  assert.deepEqual(
    unpricedVariationLines([handPriced]),
    [],
    "this is the line the send step used to refuse, with a message about a board that was never involved"
  );
});

test("a line priced off a board rate alone is not called unpriced", () => {
  const boardPriced = {
    action: "add",
    product_type: "Door",
    material: "Decorative Board",
    unit_cost_per_sqm_ex_gst: 62,
    product_unit_cost_ex_gst: 0,
  };
  assert.equal(hasAnyCost(boardPriced), true);
  assert.deepEqual(unpricedVariationLines([boardPriced]), []);
});

test("a line with no cost at all is the only one worth mentioning", () => {
  const unpriced = unpricedVariationLines([
    { id: "a", action: "add", product_type: "Door", material: "Decorative Board", title: "Replacement door" },
  ]);
  assert.equal(unpriced.length, 1);
  assert.equal(unpriced[0].label, "Replacement door");
});

// ── what is not a board line ───────────────────────────────────────────────

test("hardware and cabinets are never missing a board cost", () => {
  assert.equal(isBoardPricedLine({ product_type: "Hardware", material: "Steel" }), false, "hardware is bought by the unit");
  assert.equal(
    isBoardPricedLine({ product_type: "base_cabinet", material: "Decorative Board" }),
    false,
    "a cabinet is priced from its cut list, not by area"
  );
  assert.equal(isBoardPricedLine({ product_type: "Door", material: "" }), false, "no material means no board to price");
});

test("removals and price adjustments are not asked for a board cost", () => {
  const lines = [
    { id: "r", action: "remove", product_type: "Door", material: "Decorative Board" },
    { id: "p", action: "price_adjustment", product_type: "Door", material: "Decorative Board" },
    { id: "j", action: "job_cost", product_type: null, material: null },
  ];
  assert.deepEqual(unpricedVariationLines(lines), [], "a removal has nothing to price and an adjustment IS the price");
});

test("nothing at all is not a warning", () => {
  assert.deepEqual(unpricedVariationLines([]), []);
  assert.deepEqual(unpricedVariationLines(), []);
  assert.equal(unpricedWarning([]), "");
});

// ── the warning has to be worth reading ────────────────────────────────────

test("the warning names the lines and says it does not stop the send", () => {
  const message = unpricedWarning([
    { id: "a", label: "Replacement door" },
    { id: "b", label: "End panel" },
  ]);
  assert.match(message, /Replacement door/);
  assert.match(message, /End panel/);
  assert.match(message, /margin/i, "it has to say what the consequence actually is");
  assert.match(message, /Send anyway/i, "it has to say there is a way forward");
  assert.match(message, /price is not affected/i, "the customer's price is a separate number and that matters here");
});

test("a long list is summarised rather than printed in full", () => {
  const many = Array.from({ length: 9 }, (_, index) => ({ id: `${index}`, label: `Line ${index}` }));
  const message = unpricedWarning(many);
  assert.match(message, /and 6 more/, "nine names in a toast is not something anybody reads");
});

// ── the routes ─────────────────────────────────────────────────────────────

const SEND = readFileSync(
  new URL("../app/api/admin/orders/[id]/variations/[variationId]/send/route.js", import.meta.url),
  "utf8"
);
const ADD_LINE = readFileSync(
  new URL("../app/api/admin/orders/[id]/variations/[variationId]/lines/route.js", import.meta.url),
  "utf8"
);
const EDIT_LINE = readFileSync(
  new URL("../app/api/admin/orders/[id]/variations/[variationId]/lines/[lineId]/route.js", import.meta.url),
  "utf8"
);

test("the send step warns and lets you through instead of refusing", () => {
  assert.match(SEND, /needsConfirmation/, "there has to be a way past the warning");
  assert.match(SEND, /payload\.force/, "the second press has to be able to say go ahead");
  assert.doesNotMatch(
    SEND,
    /without an uploaded price/,
    "the old refusal is still here, and it blocked lines that were priced perfectly well"
  );
});

test("saving a variation line never refuses over a missing board cost", () => {
  [
    ["the add route", ADD_LINE],
    ["the edit route", EDIT_LINE],
  ].forEach(([label, source]) => {
    assert.doesNotMatch(
      source,
      /does not have an uploaded price/,
      `${label} still refuses to save a line whose board has no cost, so the line cannot be written down at all`
    );
    assert.doesNotMatch(
      source,
      /Enter width and height before saving/,
      `${label} still refuses to save a line with no size yet, losing whatever was already typed`
    );
  });
});

// The whole point of the shared module. Three files asked this question, two
// rules, and they disagreed. One definition or it happens again.
test("the pricing rule is asked in one place, not copied per route", () => {
  [
    ["the send route", SEND],
    ["the add route", ADD_LINE],
    ["the edit route", EDIT_LINE],
  ].forEach(([label, source]) => {
    const definesItsOwn = /function (?:isBoardVariationLine|hasMissingBoardPricing)\s*\(/.test(source);
    assert.equal(definesItsOwn, false, `${label} defines its own copy of the rule, which is how the two came to disagree`);
  });
});
