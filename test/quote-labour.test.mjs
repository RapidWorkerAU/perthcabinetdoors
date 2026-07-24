// Quote labour aggregation must be IDEMPOTENT.
//
// The bug (p2-6): quote.labour_hours was both the manual base AND the persisted
// total, so every recalc re-added the line labour → runaway inflation. The fix
// keeps the manual base in manual_labour_hours; labour_hours is the derived
// total (base + Σ line labour) and is never read back as the base. These tests
// lock that: feeding a computed result back in must not change it.

import test from "node:test";
import assert from "node:assert/strict";
import { calculateQuoteTotals } from "../lib/pcd-quote-utils.js";

// A non-cabinet line whose own labour_hours is respected (cabinet lines instead
// derive labour from the per-cabinet business default — tested separately).
const LINE = (labour) => ({ product_type: "door", qty: 1, labour_hours: labour });
const CAB = (qty = 1) => ({ product_type: "base_cabinet", qty });
const GST = 0.1;
const BD = (hoursPerCab) => ({ business_defaults: { labour_hours_per_cabinet: hoursPerCab } });

test("labour total = manual base + sum of line labour", () => {
  const t = calculateQuoteTotals([LINE(4), LINE(6)], GST, { manual_labour_hours: 5 });
  assert.equal(t.manual_labour_hours, 5);
  assert.equal(t.line_labour_hours, 10);
  assert.equal(t.labour_hours, 15);
});

test("recalc is idempotent — feeding the derived total back never inflates", () => {
  const lines = [LINE(4), LINE(6)];
  const first = calculateQuoteTotals(lines, GST, { manual_labour_hours: 5 });
  assert.equal(first.labour_hours, 15);
  // A persisted quote carries BOTH the base and the (derived) total. Recalc
  // must read the base, not the total.
  const second = calculateQuoteTotals(lines, GST, {
    manual_labour_hours: first.manual_labour_hours,
    labour_hours: first.labour_hours,
  });
  assert.equal(second.labour_hours, 15); // not 25
  const third = calculateQuoteTotals(lines, GST, {
    manual_labour_hours: second.manual_labour_hours,
    labour_hours: second.labour_hours,
  });
  assert.equal(third.labour_hours, 15); // still 15 after many recalcs
});

test("a manual base of 0 is respected, never falls through to labour_hours", () => {
  // ?? (not ||) — a real 0 base must win over a stale labour_hours total.
  const t = calculateQuoteTotals([LINE(3)], GST, { manual_labour_hours: 0, labour_hours: 999 });
  assert.equal(t.labour_hours, 3);
});

test("transitional fallback: pre-migration row (no manual base) with no line labour is safe", () => {
  const t = calculateQuoteTotals([LINE(0)], GST, { labour_hours: 8 });
  assert.equal(t.labour_hours, 8); // base taken from labour_hours, nothing re-added
});

test("adding a line's labour grows the total by exactly that line", () => {
  const before = calculateQuoteTotals([LINE(4), LINE(6)], GST, { manual_labour_hours: 5 });
  const after = calculateQuoteTotals([LINE(4), LINE(6), LINE(3)], GST, { manual_labour_hours: 5 });
  assert.equal(after.labour_hours - before.labour_hours, 3);
});

test("cabinet lines contribute the per-cabinet default × qty", () => {
  const t = calculateQuoteTotals([CAB(2), CAB(1)], GST, { manual_labour_hours: 0, ...BD(1.5) });
  assert.equal(t.line_labour_hours, 4.5); // 2×1.5 + 1×1.5
  assert.equal(t.labour_hours, 4.5);
});

test("cabinet labour falls back to the built-in default (1.5) when none is set", () => {
  const t = calculateQuoteTotals([CAB(1)], GST, { manual_labour_hours: 0 });
  assert.equal(t.labour_hours, 1.5);
});

test("cabinet labour + manual base stays idempotent through recalc", () => {
  const lines = [CAB(2)];
  const first = calculateQuoteTotals(lines, GST, { manual_labour_hours: 3, ...BD(2) });
  assert.equal(first.labour_hours, 7); // manual 3 + 2 cabinets × 2h
  const second = calculateQuoteTotals(lines, GST, {
    manual_labour_hours: first.manual_labour_hours,
    labour_hours: first.labour_hours,
    ...BD(2),
  });
  assert.equal(second.labour_hours, 7); // not 11
});
