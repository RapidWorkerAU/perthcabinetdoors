// THE DRAWING HAS TO BE THE CABINET THAT WAS CONFIGURED.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// The cabinet configurator shows three line drawings under the panel list.
// They were a plain rectangle with shelves in it, always. Tick "Houses a
// rangehood" and the panel list grew a housing divider, two channel walls and a
// split pair of shelves, while the drawing beside it stayed an empty box. Tick
// "Corner cabinet" and the panels became two legs; the drawing stayed an empty
// box. A customer looking at that screen was told two different things at once,
// and the picture was the one they believed.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// The drawing and the cut list read the SAME geometry. rangehoodLayoutMm and
// cornerFootprintMm are the one definition of what shape a cabinet is; the cut
// list cuts to them and the schematic draws to them. Neither works the shape
// out for itself, so neither can drift.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  calculateCabinetCutList,
  cornerFootprintMm,
  rangehoodLayoutMm,
} from "../lib/pcd-cabinet-utils.js";

const SCHEMATIC = readFileSync(
  new URL("../components/admin/CabinetSchematic.js", import.meta.url),
  "utf8"
);

const RANGEHOOD = {
  label: "Rangehood",
  width_mm: 800,
  height_mm: 600,
  depth_mm: 350,
  carcass_thickness_mm: 16,
  back_panel_included: true,
  back_panel_thickness_mm: 16,
  has_rangehood: true,
  rangehood_housing_height_mm: 263,
  rangehood_channel_width_mm: 250,
  shelf_qty: 1,
};

const CORNER = {
  is_corner: true,
  width_mm: 900,
  secondary_width_mm: 1000,
  depth_mm: 600,
  height_mm: 720,
  carcass_thickness_mm: 16,
  back_panel_included: true,
  back_panel_thickness_mm: 16,
};

const piece = (cfg, label) => calculateCabinetCutList(cfg).find((p) => p.label === label);

// ── The shape the drawing reads is the shape the saw cuts ────────────────────

test("the flue channel is drawn at the height the channel walls are cut", () => {
  const layout = rangehoodLayoutMm(RANGEHOOD);
  const wall = piece(RANGEHOOD, "Rangehood channel — left wall");

  assert.equal(wall.height_mm, layout.channelHeight);
  // The drawing spans the channel between these two heights, so they have to
  // describe the same board or the picture is taller or shorter than the part.
  assert.equal(layout.channelTop - layout.channelBottom, layout.channelHeight);
});

test("the shelves are drawn split exactly where they are cut split", () => {
  const layout = rangehoodLayoutMm(RANGEHOOD);

  assert.equal(piece(RANGEHOOD, "Shelf — left of channel").width_mm, layout.leftShelfWidth);
  assert.equal(piece(RANGEHOOD, "Shelf — right of channel").width_mm, layout.rightShelfWidth);
  // Both halves plus the channel span fill the cavity: no gap, no overlap.
  assert.equal(
    layout.leftShelfWidth + layout.rightShelfWidth + layout.channelWidth,
    layout.internalWidth
  );
  // And there is no full width shelf to draw, because none is cut.
  assert.equal(piece(RANGEHOOD, "Shelf"), undefined);
});

test("the housing opening is the clear opening the appliance is checked against", () => {
  const layout = rangehoodLayoutMm(RANGEHOOD);
  const T = RANGEHOOD.carcass_thickness_mm;

  // Measured from the inside floor, not the underside of the carcass: the
  // bottom panel sits below it and the divider closes it off above.
  assert.equal(layout.openingBottom, T);
  assert.equal(layout.openingTop - layout.openingBottom, RANGEHOOD.rangehood_housing_height_mm);
  assert.equal(layout.channelBottom - layout.openingTop, T);
  // Everything stacks up to the cabinet: floor, opening, divider, flue, top.
  assert.equal(layout.channelTop + T, RANGEHOOD.height_mm);
});

test("a plain box has no rangehood layout to draw", () => {
  assert.equal(rangehoodLayoutMm({ ...RANGEHOOD, has_rangehood: false }), null);
  // Ticked but never dimensioned is not a rangehood cabinet, and the cut list
  // agrees: no divider is cut for it either.
  const undimensioned = { ...RANGEHOOD, rangehood_channel_width_mm: 0 };
  assert.equal(rangehoodLayoutMm(undimensioned), null);
  assert.equal(piece(undimensioned, "Rangehood housing divider"), undefined);
});

test("a corner carcass is drawn as a corner, not as a box with a rangehood in it", () => {
  // The corner cut list has no rangehood in it, so the drawing must not add one.
  assert.equal(rangehoodLayoutMm({ ...CORNER, ...{ has_rangehood: true, rangehood_channel_width_mm: 250 } }), null);
});

// ── The corner footprint ─────────────────────────────────────────────────────

test("an L shape corner keeps its concave vertex, a diagonal one does not", () => {
  const l = cornerFootprintMm(CORNER);
  const d = cornerFootprintMm({ ...CORNER, corner_style: "diagonal" });

  assert.equal(l.points.length, 6);
  assert.equal(d.points.length, 5);
  // The chamfer is the L minus its inner corner: every other point is shared.
  const asText = (points) => points.map((p) => p.join(",")).join(" ");
  assert.equal(asText(d.points), asText(l.points.filter((_, i) => i !== 3)));
});

test("the corner footprint fills the box the plan is drawn in", () => {
  const { points, boundingWidth, boundingDepth, legDepth } = cornerFootprintMm(CORNER);

  assert.equal(boundingWidth, CORNER.width_mm);
  assert.equal(boundingDepth, CORNER.secondary_width_mm);
  assert.equal(legDepth, CORNER.depth_mm);
  assert.equal(Math.max(...points.map(([x]) => x)), CORNER.width_mm);
  assert.equal(Math.max(...points.map(([, y]) => y)), CORNER.secondary_width_mm);
  assert.ok(points.every(([x, y]) => x >= 0 && y >= 0), "no point sits outside the plan");
});

test("a leg deeper than the cabinet is long cannot fold the footprint back on itself", () => {
  const { legDepth, points } = cornerFootprintMm({ ...CORNER, depth_mm: 2000 });
  assert.equal(legDepth, 900);
  assert.ok(points.every(([x, y]) => x <= 900 && y <= 1000));
});

test("a cabinet that is not a corner has no footprint to draw", () => {
  assert.equal(cornerFootprintMm({ ...CORNER, is_corner: false }), null);
  // Ticked with no second leg is not a corner, and the cut list agrees.
  assert.equal(cornerFootprintMm({ ...CORNER, secondary_width_mm: 0 }), null);
});

// ── The schematic reads the shared shape rather than keeping its own ─────────

test("the schematic asks the shared helpers what shape the cabinet is", () => {
  assert.match(SCHEMATIC, /import\s*\{[^}]*rangehoodLayoutMm[^}]*\}\s*from\s*"\.\.\/\.\.\/lib\/pcd-cabinet-utils"/s);
  assert.match(SCHEMATIC, /import\s*\{[^}]*cornerFootprintMm[^}]*\}\s*from\s*"\.\.\/\.\.\/lib\/pcd-cabinet-utils"/s);
  // Nothing in the drawing works the shape out for itself.
  assert.ok(
    !/rangehood_channel_width_mm|rangehood_housing_height_mm|corner_style\s*===/.test(SCHEMATIC),
    "the schematic must read the helpers, not the raw shape fields"
  );
});

test("the drawing names the cabinet it is drawing", () => {
  // The complaint that started this: the panels said rangehood and the picture
  // said nothing at all.
  for (const label of ["RANGEHOOD", "FLUE", "RETURN", "Rangehood cabinet", "L shape corner", "Diagonal corner"]) {
    assert.ok(SCHEMATIC.includes(label), `the schematic should be able to show "${label}"`);
  }
});

test("every view still carries its measurements", () => {
  // Three drawings, each with a width dimension and a height or depth one, plus
  // the shelf gap column. Losing these to make room for the shape would be a
  // trade nobody asked for.
  assert.equal((SCHEMATIC.match(/bottomLabel=\{/g) || []).length, 3);
  assert.equal((SCHEMATIC.match(/sideLabel=\{/g) || []).length, 3);
  assert.match(SCHEMATIC, /<ShelfGapDimensions/);
});
