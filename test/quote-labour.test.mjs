// Quote labour aggregation must be IDEMPOTENT, and the figure must be one a
// person can change.
//
// TWO BUGS, ONE AFTER THE OTHER, both of them inflation.
//
// The first: quote.labour_hours was both the manual base AND the persisted
// total, so every recalc re-added the line labour. Fixed by keeping the base in
// manual_labour_hours.
//
// The second, which the first fix hid rather than solved: the hours were
// ADDITIVE. The box on the quote held a base that automatic hours were added
// to, so the total on screen was not a number anybody could edit. Clearing the
// box left the automatic hours behind with no way to be rid of them, and a
// wrong figure could not be corrected from the screen showing it.
//
// The rule now, the same one the edging cost already followed: the lines work
// out a figure, and a typed number replaces it. manual_labour_hours is that
// override and is null when nothing has been typed. These tests lock both
// halves: feeding a computed result back in must not change it, and a typed
// figure must survive a recalculation.

import test from "node:test";
import assert from "node:assert/strict";
import { calculateQuoteTotals } from "../lib/pcd-quote-utils.js";

// A non-cabinet line whose own labour_hours is respected (cabinet lines instead
// derive labour from the per-cabinet business default — tested separately).
const LINE = (labour) => ({ product_type: "door", qty: 1, labour_hours: labour });
const CAB = (qty = 1) => ({ product_type: "base_cabinet", qty });
const GST = 0.1;
const BD = (hoursPerCab) => ({ business_defaults: { labour_hours_per_cabinet: hoursPerCab } });

test("with nothing typed, the total is what the lines work out to", () => {
  const t = calculateQuoteTotals([LINE(4), LINE(6)], GST, {});
  assert.equal(t.line_labour_hours, 10);
  assert.equal(t.calculated_labour_hours, 10);
  assert.equal(t.labour_hours, 10);
  assert.equal(t.manual_labour_hours, null, "nothing typed must read as null, not as zero");
  assert.equal(t.labour_hours_overridden, false);
});

test("a typed figure replaces what the lines work out to", () => {
  // It does not get added to them. That was the bug: the person typed 5,
  // the quote charged 15, and the box still said 5.
  const t = calculateQuoteTotals([LINE(4), LINE(6)], GST, { manual_labour_hours: 5 });
  assert.equal(t.calculated_labour_hours, 10, "the calculated figure is still reported");
  assert.equal(t.labour_hours, 5, "the typed figure wins outright");
  assert.equal(t.manual_labour_hours, 5);
  assert.equal(t.labour_hours_overridden, true);
});

test("recalc is idempotent, feeding the derived total back never inflates", () => {
  const lines = [LINE(4), LINE(6)];
  const first = calculateQuoteTotals(lines, GST, { manual_labour_hours: 5 });
  assert.equal(first.labour_hours, 5);
  // A persisted quote carries BOTH the override and the derived total. Recalc
  // must read the override, never the total.
  const second = calculateQuoteTotals(lines, GST, {
    manual_labour_hours: first.manual_labour_hours,
    labour_hours: first.labour_hours,
  });
  assert.equal(second.labour_hours, 5);
  const third = calculateQuoteTotals(lines, GST, {
    manual_labour_hours: second.manual_labour_hours,
    labour_hours: second.labour_hours,
  });
  assert.equal(third.labour_hours, 5); // still 5 after many recalcs
});

test("a typed 0 means no labour, and a recalculation does not put it back", () => {
  // The whole point of being able to edit the figure. Zero is an answer.
  const t = calculateQuoteTotals([LINE(3)], GST, { manual_labour_hours: 0 });
  assert.equal(t.labour_hours, 0);
  assert.equal(t.calculated_labour_hours, 3, "what it would have been is still reported");
  assert.equal(t.labour_hours_overridden, true);
});

test("a stored total is never mistaken for a typed figure", () => {
  // labour_hours is the derived total. Reading it back as the override is what
  // caused the original runaway inflation, so it must not be a fallback.
  const t = calculateQuoteTotals([LINE(3)], GST, { labour_hours: 999 });
  assert.equal(t.labour_hours, 3);
  assert.equal(t.labour_hours_overridden, false);
});

test("adding a line grows the total by exactly that line, until it is overridden", () => {
  const before = calculateQuoteTotals([LINE(4), LINE(6)], GST, {});
  const after = calculateQuoteTotals([LINE(4), LINE(6), LINE(3)], GST, {});
  assert.equal(after.labour_hours - before.labour_hours, 3);

  // Once a figure is typed, adding a line does not move it. That is what being
  // pinned means, and the calculated figure underneath still updates so the
  // difference is visible.
  const pinned = calculateQuoteTotals([LINE(4), LINE(6), LINE(3)], GST, { manual_labour_hours: 10 });
  assert.equal(pinned.labour_hours, 10);
  assert.equal(pinned.calculated_labour_hours, 13);
});

test("cabinet lines contribute the per-cabinet default × qty", () => {
  const t = calculateQuoteTotals([CAB(2), CAB(1)], GST, { ...BD(1.5) });
  assert.equal(t.line_labour_hours, 4.5); // 2×1.5 + 1×1.5
  assert.equal(t.labour_hours, 4.5);
});

test("cabinet labour falls back to the built-in default (1.5) when none is set", () => {
  const t = calculateQuoteTotals([CAB(1)], GST, {});
  assert.equal(t.labour_hours, 1.5);
});

test("cabinet labour stays idempotent through recalc, typed or not", () => {
  const lines = [CAB(2)];

  const auto = calculateQuoteTotals(lines, GST, { ...BD(2) });
  assert.equal(auto.labour_hours, 4);
  const autoAgain = calculateQuoteTotals(lines, GST, {
    manual_labour_hours: auto.manual_labour_hours,
    labour_hours: auto.labour_hours,
    ...BD(2),
  });
  assert.equal(autoAgain.labour_hours, 4);

  const pinned = calculateQuoteTotals(lines, GST, { manual_labour_hours: 3, ...BD(2) });
  assert.equal(pinned.labour_hours, 3);
  const pinnedAgain = calculateQuoteTotals(lines, GST, {
    manual_labour_hours: pinned.manual_labour_hours,
    labour_hours: pinned.labour_hours,
    ...BD(2),
  });
  assert.equal(pinnedAgain.labour_hours, 3);
});
