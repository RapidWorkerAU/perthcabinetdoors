// TAKING ONE OFF A LINE OF TWO.
//
// ── THE TRAP ─────────────────────────────────────────────────────────────────
//
// "Remove" removes the whole line. On a line with a quantity of 2 it takes both
// off the order and credits the full line total. Somebody wanting to drop one
// door of two reaches for Remove, because that is what it is called, and gets
// twice the credit and twice the removal.
//
// Nothing about the result looks wrong on screen. It produces a variation, a
// credit and an approval, exactly like the correct answer does. The customer
// finds out when two doors are missing.
//
// ── THE CORRECT ANSWER ───────────────────────────────────────────────────────
//
// A CHANGE with the quantity reduced. The delta is proposed minus original, and
// the proposed total is recalculated at the new quantity, so a 2 to 1 change
// credits exactly one unit.
//
// This file proves the maths, and that the form steers you there rather than
// letting you fall into Remove.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { variationLineDelta } from "../lib/pcd-order-variations.js";

// ── the maths ──────────────────────────────────────────────────────────────

test("removing a line of two credits BOTH, which is the trap", () => {
  const removeWholeLine = { action: "remove", original_line_total_ex_gst: 200, proposed_line_total_ex_gst: 0 };
  assert.equal(variationLineDelta(removeWholeLine), -200, "the whole line, not one of the two");
});

test("changing the quantity from two to one credits exactly one", () => {
  // 2 x $100. Reduced to 1, the proposed total is recalculated at the new qty.
  const takeOneOff = { action: "change", original_line_total_ex_gst: 200, proposed_line_total_ex_gst: 100 };
  assert.equal(variationLineDelta(takeOneOff), -100, "one unit of credit, not two and not none");
});

test("going the other way adds, using the same rule", () => {
  const addOneMore = { action: "change", original_line_total_ex_gst: 200, proposed_line_total_ex_gst: 300 };
  assert.equal(variationLineDelta(addOneMore), 100);
});

test("a change that alters nothing is worth nothing", () => {
  assert.equal(variationLineDelta({ action: "change", original_line_total_ex_gst: 200, proposed_line_total_ex_gst: 200 }), 0);
});

// A removal is always a credit, whichever way round the stored figure is. A
// positive delta on a removal would ADD money for taking work away.
test("a removal can never come out positive", () => {
  assert.equal(variationLineDelta({ action: "remove", original_line_total_ex_gst: -200 }), -200);
});

// ── the form steers you ────────────────────────────────────────────────────

const EDITOR = readFileSync(
  new URL("../app/admin/orders/[id]/variations/[variationId]/VariationEditor.js", import.meta.url),
  "utf8"
);

test("choosing Remove on a multi-quantity line says what it will actually do", () => {
  assert.match(EDITOR, /removingWholeQty/, "the case has to be recognised at all");
  assert.match(EDITOR, /Removing it takes all \{sourceQty\} off the order/, "and say so in the quantity's own terms");
});

test("the form offers the correct action in one press, rather than only warning", () => {
  assert.match(EDITOR, /Take one off instead, leaving \{sourceQty - 1\}/, "a warning with no way out is a dead end");
  assert.match(
    EDITOR,
    /changeLineDraftAction\("change"\);\s*\n\s*updateLineDraft\(\{ qty: sourceQty - 1 \}\)/,
    "and it has to switch the action AND set the quantity, since either alone is still wrong"
  );
});

// Quantity is the field that does the work here, so it has to stay editable on
// a change. It is correctly locked on a remove, where it means nothing.
test("quantity is editable on a change and locked on a remove", () => {
  assert.match(
    EDITOR,
    /value=\{lineDraft\.qty\} disabled=\{isRemove\}/,
    "locking it on a change would remove the only way to take one off"
  );
});
