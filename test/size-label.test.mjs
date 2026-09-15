// ONE WAY TO WRITE A SIZE ON SCREEN. Height first, unit once.

import test from "node:test";
import assert from "node:assert/strict";

import { sizeLabel } from "../lib/pcd-size-label.js";

test("height first, the unit once", () => {
  assert.equal(sizeLabel(745, 392), "745 × 392mm");
});

test("a cabinet carries its depth third", () => {
  assert.equal(sizeLabel(720, 600, 560), "720 × 600 × 560mm");
});

test("a missing side is a dash, not a smaller size", () => {
  assert.equal(sizeLabel(745, null), "745 × -mm");
  assert.equal(sizeLabel(null, null), "-");
});

test("stored decimals read cleanly", () => {
  assert.equal(sizeLabel("745.00", "392.50"), "745 × 392.5mm");
});
