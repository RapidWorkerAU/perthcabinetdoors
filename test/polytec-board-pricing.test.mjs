// Every Polytec portal price we have for a decorative board piece, checked
// against the rate card. Priced 10 October 2026, one piece at a time, Square
// Edge, all four edges banded (1111).
//
// If a change to lib/pcd-polytec-board-pricing.js moves the calculated price
// away from what Polytec actually charged, this is where it shows.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POLYTEC_BOARD_CARD, normalizePolytecBoardCard, pricePolytecBoardPiece, polytecFinishFactor,
} from "../lib/pcd-polytec-board-pricing.js";

const card = normalizePolytecBoardCard({});
const MATT_16 = 60.74; // European Walnut Matt 16mm in the colour library
const piece = (height_mm, width_mm, finish = "Matt", thickness = "16mm") => ({ height_mm, width_mm, finish, thickness });

// [height, width, portal price]
const WALNUT = [
  [176, 353, 22.59], [187, 353, 22.59], [171, 353, 22.59], [580, 340, 32.43],
  [210, 400, 28.59], [300, 400, 28.59], [400, 400, 28.59], [500, 400, 34.56], [600, 400, 34.56],
  [900, 400, 43.56], [1200, 400, 52.54], [2400, 400, 88.55],
  [600, 200, 30.28], [600, 360, 34.56], [600, 600, 43.19], [600, 1200, 68.96],
];

test("every European Walnut Matt portal price, to within 0.1%", () => {
  for (const [h, w, price] of WALNUT) {
    const r = pricePolytecBoardPiece(piece(h, w), card, MATT_16);
    assert.ok(r.ok, `${h}x${w}: ${r.reason}`);
    const off = Math.abs(r.unitCost - price) / price * 100;
    assert.ok(off <= 0.1, `${h}x${w}: portal ${price}, calculated ${r.unitCost} (${off.toFixed(2)}%)`);
  }
});

test("a full 2400 x 1200 sheet prices a little over the portal, never under", () => {
  const r = pricePolytecBoardPiece(piece(2400, 1200), card, MATT_16);
  assert.ok(r.unitCost >= 209.02, `calculated ${r.unitCost}`);
  assert.ok(r.unitCost <= 209.02 * 1.04);
});

test("another finish scales with its board cost: Boston Oak Woodmatt 16mm", () => {
  const r = pricePolytecBoardPiece(piece(600, 400, "Woodmatt"), card, 72.9);
  assert.ok(Math.abs(r.unitCost - 41.47) <= 0.05, `calculated ${r.unitCost}`);
});

// 21 October 2026: every other finish the shop sells, at 400 x 400 and
// 600 x 1200. [thickness, finish, colour, board cost, [small, large]]
const FINISHES = [
  ["16mm", "Sheen", "Alabaster", 75.25, [35.23, 86.63]],
  ["16mm", "Smooth", "Ochre Figured-Wood", 63.78, [30.02, 72.42]],
  ["16mm", "Texture", "Black", 54.92, [26.40, 63.09]],
  ["16mm", "Woodmatt", "Blossom White", 72.9, [null, 82.75]],
  ["18mm", "Gloss", "Cinder", 111.76, [66.18, 165.47]],
  ["18mm", "Legato", "Drifted Oak", 76.88, [39.71, 97.66]],
  ["18mm", "Ravine", "Gossamer White", 82.69, [43.22, 107.00]],
  ["18mm", "Venette", "Cinder", 147.01, [66.18, 165.47]],
  ["18mm", "Woodmatt", "Hazel Oak", 80.2, [37.74, 91.03]],
];

test("every finish is never under the portal, and at most 3.7% over", () => {
  for (const [thickness, finish, , cost, prices] of FINISHES) {
    [[400, 400], [600, 1200]].forEach(([h, w], i) => {
      const portal = prices[i];
      if (portal == null) return;
      const r = pricePolytecBoardPiece(piece(h, w, finish, thickness), card, cost);
      assert.ok(r.ok, `${thickness} ${finish} ${h}x${w}: ${r.reason}`);
      const over = (r.unitCost - portal) / portal * 100;
      assert.ok(over >= -0.05 && over <= 3.7, `${thickness} ${finish} ${h}x${w}: portal ${portal}, calculated ${r.unitCost} (${over.toFixed(2)}%)`);
    });
  }
});

test("a finish factor belongs to its thickness: 16mm Sheen is not 18mm Sheen", () => {
  assert.equal(polytecFinishFactor("Sheen", card, "16mm"), 1.014);
  assert.equal(polytecFinishFactor("Woodmatt", card, "18mm"), 1);
  assert.equal(polytecFinishFactor("gloss", card, "18"), 1.3041);
  const mixed = normalizePolytecBoardCard({ finish_factors: [{ finishes: "Gloss", factor: 1.2 }, { thickness: "18mm", finishes: "Gloss", factor: 1.3 }] });
  assert.equal(polytecFinishFactor("Gloss", mixed, "18mm"), 1.3);
  assert.equal(polytecFinishFactor("Gloss", mixed, "16mm"), 1.2);
});

test("a 100mm strip is a facia, priced by hand (the portal charged $51.59)", () => {
  const r = pricePolytecBoardPiece(piece(100, 400), card, MATT_16);
  assert.equal(r.ok, false);
  assert.equal(r.code, "facia");
});

test("a long low panel is priced turned round; past a sheet is priced by hand", () => {
  const long = pricePolytecBoardPiece(piece(400, 2000), card, MATT_16);
  assert.ok(long.ok);
  assert.equal(long.chargedHeight, 2100);
  assert.equal(long.chargedWidth, 400);
  assert.equal(pricePolytecBoardPiece(piece(2500, 600), card, MATT_16).code, "oversize");
});

test("no board cost or no card prices nothing, never a guess", () => {
  assert.equal(pricePolytecBoardPiece(piece(600, 400), card, 0).code, "no_cost");
  assert.equal(pricePolytecBoardPiece(piece(600, 400), null, MATT_16).code, "unavailable");
});

test("a half-filled card keeps the measured values, and a safety margin lands on cost", () => {
  const partial = normalizePolytecBoardCard({ area_factor: "nonsense", safety_percent: 10 });
  assert.equal(partial.area_factor, DEFAULT_POLYTEC_BOARD_CARD.area_factor);
  const base = pricePolytecBoardPiece(piece(600, 400), card, MATT_16).unitCost;
  const safer = pricePolytecBoardPiece(piece(600, 400), partial, MATT_16).unitCost;
  assert.ok(Math.abs(safer - base * 1.1) <= 0.01);
});
