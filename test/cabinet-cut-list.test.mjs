// Carcass cut sizes — the boards that actually get cut.
//
// A wrong number here is scrap or a shortfall on the shop floor, not a
// cosmetic slip, so these assert that the arithmetic CLOSES: pieces plus
// their thicknesses must add up to the cabinet's stated size.
import test from "node:test";
import assert from "node:assert/strict";
import { calculateCabinetCutList } from "../lib/pcd-cabinet-utils.js";

const piece = (cfg, label) => calculateCabinetCutList(cfg).find((p) => p.label === label);

const CORNER = {
  is_corner: true, width_mm: 900, secondary_width_mm: 900, depth_mm: 600, height_mm: 720,
  carcass_thickness_mm: 16, back_panel_included: true, back_panel_thickness_mm: 16, shelf_qty: 1,
};

test("corner: the wall-2 back spans its whole face", () => {
  // The `secondary_width - depth` subtraction correctly tiles the FOOTPRINT
  // (leg A owns the corner square, so the tops don't double-count). It was
  // also applied to the BACK — a different plane entirely — which left a
  // 600x720 hole in the wall-2 back of every corner cabinet, unbilled.
  assert.equal(piece(CORNER, "Back panel — wall 1 leg").width_mm, 900);
  assert.equal(piece(CORNER, "Back panel — wall 2 leg").width_mm, 884, "900 face less the back it butts into");
});

test("corner: leg A clears the wall-2 back it now butts against", () => {
  // Knock-on from the fix above: leg A's boards start at the wall-2 back's
  // inside face, not at x=0. Fixing the back without this would leave three
  // pieces 16mm too wide.
  assert.equal(piece(CORNER, "Top panel — wall 1 leg").width_mm, 868);
  assert.equal(piece(CORNER, "Bottom panel — wall 1 leg").width_mm, 868);
  assert.equal(piece(CORNER, "Shelf — wall 1 leg").width_mm, 868);
  // Leg B is its own leg and unaffected: 300 open - 16 side.
  assert.equal(piece(CORNER, "Top panel — wall 2 leg").width_mm, 284);
});

test("corner: with no back, leg A reclaims the full span", () => {
  // Both terms must degrade to zero together, or excluding the back would
  // silently under-cut leg A.
  const noBack = { ...CORNER, back_panel_included: false };
  assert.equal(piece(noBack, "Top panel — wall 1 leg").width_mm, 884);
  assert.equal(piece(noBack, "Back panel — wall 2 leg"), undefined);
});

test("rangehood: channel walls fit inside the carcass", () => {
  const base = {
    width_mm: 900, depth_mm: 350, height_mm: 720, carcass_thickness_mm: 16,
    back_panel_included: true, back_panel_thickness_mm: 16, shelf_qty: 0,
    has_rangehood: true, rangehood_channel_width_mm: 300,
  };
  // `height - housing` alone ignored the bottom panel, the housing divider and
  // the top panel — so the wall was cut 120mm for an 88mm gap. It never fitted.
  const wall = piece({ ...base, rangehood_housing_height_mm: 600 }, "Rangehood channel — left wall");
  assert.equal(wall.height_mm, 72);
  assert.equal(16 + 600 + 16 + 72 + 16, 720, "bottom + housing + divider + channel + top");

  // With no housing it was cut the full 720 into a 688 cavity.
  const noHousing = piece({ ...base, rangehood_housing_height_mm: 0 }, "Rangehood channel — left wall");
  assert.ok(noHousing.height_mm <= 720 - 2 * 16, "must fit the cavity between top and bottom");
});

test("a plain box still closes exactly", () => {
  // The straight carcass was already correct — this pins it so the corner and
  // rangehood work above can't quietly disturb it.
  const box = {
    width_mm: 900, depth_mm: 560, height_mm: 720, carcass_thickness_mm: 16,
    back_panel_included: true, back_panel_thickness_mm: 16, shelf_qty: 0,
  };
  const side = piece(box, "Left side panel");
  const top = piece(box, "Top panel");
  const back = piece(box, "Back panel");
  assert.equal(16 + top.width_mm + 16, 900, "sides + internal width = the cabinet");
  assert.equal(side.width_mm + 16, 560, "carcass depth + applied back = the cabinet");
  assert.equal(side.height_mm, 720, "sides run full height");
  assert.equal(back.width_mm, 900, "the back is applied, not inset");
});

test("blind corner is cut as an ordinary box", () => {
  // The whole point: only its FRONT is special. If it ever starts emitting
  // corner-leg pieces, something has mis-routed it to the L-shape path.
  const blind = {
    width_mm: 900, depth_mm: 600, height_mm: 720, carcass_thickness_mm: 16,
    back_panel_included: true, back_panel_thickness_mm: 16, shelf_qty: 0,
  };
  const pieces = calculateCabinetCutList(blind);
  assert.ok(pieces.some((p) => p.label === "Left side panel"));
  assert.ok(!pieces.some((p) => /wall 1 leg|wall 2 leg/.test(p.label)));
  assert.equal(piece(blind, "Back panel").width_mm, 900, "the back spans the full carcass, not the opening");
});
