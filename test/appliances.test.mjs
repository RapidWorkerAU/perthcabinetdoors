// Appliance shapes — mainly the rangehood, whose two parts deliberately do not
// scale together. The catalogue tile, the elevation and the 3D view all draw
// from rangehoodGeometry(), so these rules are checked once here instead of
// three times over in three drawings that could drift apart.
import test from "node:test";
import assert from "node:assert/strict";
import {
  rangehoodGeometry,
  rangehoodParts,
  applianceKindDefaults,
  applianceKindLabel,
  APPLIANCE_KINDS,
  RANGEHOOD_CANOPY_HEIGHT_MM,
  RANGEHOOD_FLUE_WIDTH_MM,
} from "../lib/pcd-appliance-utils.js";

const hood = (over = {}) => ({ width_mm: 900, height_mm: 900, depth_mm: 500, ...over });

test("taller hood: the flue grows, the canopy does not", () => {
  const short = rangehoodGeometry(hood({ height_mm: 700 }));
  const tall  = rangehoodGeometry(hood({ height_mm: 1200 }));
  assert.equal(short.canopyH, RANGEHOOD_CANOPY_HEIGHT_MM);
  assert.equal(tall.canopyH, RANGEHOOD_CANOPY_HEIGHT_MM, "the canopy is a fixed slab");
  assert.equal(tall.flueH - short.flueH, 500, "the extra height all went to the flue");
});

test("wider hood: the canopy opening widens, the flue stays put", () => {
  const narrow = rangehoodGeometry(hood({ width_mm: 600 }));
  const wide   = rangehoodGeometry(hood({ width_mm: 1200 }));
  assert.equal(narrow.width, 600);
  assert.equal(wide.width, 1200);
  assert.equal(narrow.flueW, RANGEHOOD_FLUE_WIDTH_MM);
  assert.equal(wide.flueW, RANGEHOOD_FLUE_WIDTH_MM, "the duct section never fattens");
});

test("deeper hood: the canopy opening deepens, the flue stays put", () => {
  const shallow = rangehoodGeometry(hood({ depth_mm: 400 }));
  const deep    = rangehoodGeometry(hood({ depth_mm: 700 }));
  assert.equal(shallow.depth, 400);
  assert.equal(deep.depth, 700);
  assert.equal(shallow.flueD, deep.flueD, "the duct section never deepens");
});

test("the flare follows from the two openings, it is never set directly", () => {
  // The canopy height is fixed and the flue is fixed, so widening the hood
  // makes the taper shallower on its own — which is how a real one is made.
  const g = rangehoodGeometry(hood({ width_mm: 1200 }));
  const runPerSide = (g.width - g.flueW) / 2;
  assert.equal(runPerSide, (1200 - RANGEHOOD_FLUE_WIDTH_MM) / 2);
  assert.equal(g.canopyH, RANGEHOOD_CANOPY_HEIGHT_MM, "rise is fixed, so the angle came from the run");
});

test("a hood narrower than its own duct is a straight box, not an inside-out one", () => {
  const g = rangehoodGeometry(hood({ width_mm: 200, depth_mm: 200 }));
  assert.equal(g.flueW, 200, "the flue is clamped to the hood");
  assert.equal(g.flueD, 200);
});

test("a hood shorter than its canopy has no flue rather than a negative one", () => {
  const g = rangehoodGeometry(hood({ height_mm: 120 }));
  assert.equal(g.canopyH, 120);
  assert.equal(g.flueH, 0);
});

test("a missing or junk size falls back rather than collapsing to zero", () => {
  const g = rangehoodGeometry({});
  assert.ok(g.width > 0 && g.depth > 0 && g.height > 0);
  assert.equal(rangehoodGeometry({ width_mm: 0, height_mm: null, depth_mm: "" }).width, 900);
});

test("the catalogue offers specific appliances and no generic box", () => {
  const kinds = APPLIANCE_KINDS.map((a) => a.kind);
  assert.ok(kinds.includes("freestanding_cooker"));
  assert.ok(kinds.includes("washer_front"));
  assert.ok(kinds.includes("washer_top"));
  assert.ok(!kinds.includes("other"), "no generic appliance to fall into");
  // Every offered kind has a size to start from.
  for (const k of kinds) {
    const d = applianceKindDefaults(k);
    assert.ok(d.width_mm > 0 && d.height_mm > 0 && d.depth_mm > 0, k);
  }
});

test("retired kinds still have sizes and names, so old items keep working", () => {
  // "other", "oven", "microwave" and friends are no longer offered, but items
  // already drawn with them must not lose their footprint or their label.
  for (const k of ["other", "oven", "cooktop", "microwave", "washing_machine", "freezer"]) {
    assert.ok(applianceKindDefaults(k).width_mm > 0, k);
    assert.ok(applianceKindLabel(k).length > 0, k);
  }
  assert.equal(applianceKindLabel("rangehood"), "Rangehood");
  assert.equal(applianceKindLabel("washer_top"), "Washer — top loader");
});

test("the flue sits exactly on the hole it rises out of", () => {
  // The bug this guards: the canopy's top opening and the flue's footprint were
  // worked out separately and centred differently, so in 3D the flue floated
  // forward of the canopy and the join looked broken. One function returns both
  // now, and they must stay the same rectangle.
  const { canopy, flue } = rangehoodParts(hood());
  assert.equal(canopy.top.x0, flue.x0);
  assert.equal(canopy.top.x1, flue.x1);
  assert.equal(canopy.top.z0, flue.z0);
  assert.equal(canopy.top.z1, flue.z1);
  assert.equal(canopy.y1, flue.y0, "the flue starts where the canopy ends");
});

test("the flue stands against the wall, not in the middle of the hood", () => {
  // A wall hood ducts out the back, so the canopy is a steep slope at the front
  // and almost none at the back.
  const { canopy, flue, depth } = rangehoodParts(hood());
  assert.equal(flue.z0, -depth, "hard against the back");
  assert.equal(canopy.bottom.z1, 0, "the canopy reaches the front face");
  assert.ok(flue.z1 < 0, "and the flue does not");
});

test("the canopy's bottom is the full hood footprint", () => {
  const { canopy } = rangehoodParts(hood({ width_mm: 1200, depth_mm: 600 }));
  assert.equal(canopy.bottom.x1 - canopy.bottom.x0, 1200);
  assert.equal(canopy.bottom.z1 - canopy.bottom.z0, 600);
});

test("a hood with no room for a flue still returns a usable canopy", () => {
  const { canopy, flue, flueH } = rangehoodParts(hood({ height_mm: 100 }));
  assert.equal(flueH, 0);
  assert.equal(flue.y0, flue.y1, "a zero-height flue, not a negative one");
  assert.ok(canopy.y1 > canopy.y0);
});
