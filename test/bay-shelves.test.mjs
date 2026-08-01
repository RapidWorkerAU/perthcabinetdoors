// Shelves inside an OPEN bay of a mixed front.
//
// A tall cabinet split into bays can have an open bay carrying its own shelves.
// The tricky part is the direction: sections are stored TOP-first (index 0 is
// the top bay), while every measuring consumer — shelf_heights_mm, the 3D view,
// cabinetVerticalSpanMm — works from the BOTTOM up. These pin that conversion,
// the even spread inside a bay, and the fact that the shelves reach the cut
// list and the quote rather than only the drawing.
import test from "node:test";
import assert from "node:assert/strict";
import { mixedBaySections, openBaySections, bayShelfHeightsMm, bayShelfCount } from "../lib/pcd-door-utils.js";
import { computeCutList } from "../lib/pcd-cut-list.js";

const cab = (sections, over = {}) => ({
  item_type: "tall_cabinet",
  width_mm: 600, height_mm: 2100, depth_mm: 560,
  carcass_thickness_mm: 16, back_panel_thickness_mm: 16,
  front_type: "mixed",
  section_config: { sections },
  ...over,
});

test("sections are stored top-first but measured from the bottom", () => {
  const bays = mixedBaySections(cab([
    { height_mm: 700, type: "open" },     // top
    { height_mm: 700, type: "open" },     // middle
    { height_mm: 700, type: "drawers" },  // bottom
  ]));
  assert.equal(bays.length, 3);
  assert.deepEqual([bays[0].bottomMm, bays[0].topMm], [1400, 2100], "index 0 is the TOP bay");
  assert.deepEqual([bays[1].bottomMm, bays[1].topMm], [700, 1400]);
  assert.deepEqual([bays[2].bottomMm, bays[2].topMm], [0, 700], "the last is on the floor");
});

test("shelves spread evenly inside their own bay, not the whole cabinet", () => {
  const bays = mixedBaySections(cab([
    { height_mm: 700, type: "open", shelf_qty: 1 },
    { height_mm: 1400, type: "doors" },
  ]));
  // One shelf in a bay running 1400→2100 sits at its midpoint, 1750 — NOT the
  // midpoint of the cabinet.
  assert.deepEqual(bays[0].shelfHeightsMm, [1750]);

  const three = mixedBaySections(cab([{ height_mm: 2100, type: "open", shelf_qty: 3 }]));
  assert.deepEqual(three[0].shelfHeightsMm, [525, 1050, 1575], "quarter points of the bay");
});

test("only open bays hold shelves", () => {
  const item = cab([
    { height_mm: 700, type: "open", shelf_qty: 2 },
    { height_mm: 700, type: "doors", shelf_qty: 5 },   // ignored — it has doors
    { height_mm: 700, type: "appliance", shelf_qty: 3 }, // ignored — it's a recess
  ]);
  assert.equal(openBaySections(item).length, 1);
  assert.equal(bayShelfCount(item), 2);
  assert.equal(bayShelfHeightsMm(item).length, 2);
});

test("sections that don't sum to the cabinet height are scaled to fit", () => {
  // Mid-edit, or the height changed after the bays were set. The elevation
  // scales bays to their own total, so the maths here has to agree or the
  // drawing and the cut list would place shelves differently.
  const bays = mixedBaySections(cab([
    { height_mm: 500, type: "open", shelf_qty: 1 },
    { height_mm: 500, type: "doors" },
  ], { height_mm: 2000 }));
  assert.equal(bays[0].bottomMm, 1000, "500 of 1000 scaled onto a 2000 cabinet");
  assert.equal(bays[0].topMm, 2000);
  assert.deepEqual(bays[0].shelfHeightsMm, [1500]);
});

test("bay shelves reach the cut list, sized like any other shelf", () => {
  const item = cab([
    { height_mm: 1050, type: "open", shelf_qty: 2 },
    { height_mm: 1050, type: "drawers", drawer: { heights_mm: [350, 350, 350] } },
  ]);
  const shelves = computeCutList(item).filter((p) => p.material === "shelf");
  assert.equal(shelves.length, 2, "both bay shelves are cut");
  // Same board as a normal shelf: between the sides, less the back.
  assert.deepEqual([shelves[0].dim1, shelves[0].dim2], [600 - 2 * 16, 560 - 16]);
  assert.match(shelves[0].name, /bay 1/, "named by the bay they sit in");
});

test("a cabinet with no bay shelves is unchanged", () => {
  const item = cab([{ height_mm: 2100, type: "doors" }]);
  assert.equal(bayShelfCount(item), 0);
  assert.equal(computeCutList(item).filter((p) => p.material === "shelf").length, 0);
});

test("bay shelves add to the cabinet's own shelves rather than replacing them", () => {
  // This is what the quote's cabinet_config gets: the item's own shelf_qty plus
  // the bay shelves, since the cabinet cost is driven off that one number.
  const item = cab([{ height_mm: 2100, type: "open", shelf_qty: 3 }], { shelf_qty: 1 });
  assert.equal((item.shelf_qty ?? 0) + bayShelfCount(item), 4);
});

// Bay shelves drag in the elevation like any other shelf, so a dragged height
// has to survive a round trip — and has to be discarded when it no longer
// describes the bay it was saved against.
test("a dragged bay shelf height is kept", () => {
  const bays = mixedBaySections(cab([
    { height_mm: 1050, type: "open", shelf_qty: 2, shelf_heights_mm: [1200, 1800] },
    { height_mm: 1050, type: "doors" },
  ]));
  assert.deepEqual(bays[0].shelfHeightsMm, [1200, 1800], "not re-spread over the top of the drag");
});

test("stored heights are dropped when they no longer fit the bay", () => {
  // Count changed under them — two saved heights, three shelves now.
  const countChanged = mixedBaySections(cab([{ height_mm: 2100, type: "open", shelf_qty: 3, shelf_heights_mm: [700, 1400] }]));
  assert.deepEqual(countChanged[0].shelfHeightsMm, [525, 1050, 1575], "re-spread evenly");

  // The bay moved out from under them — heights now sit outside it.
  const bayMoved = mixedBaySections(cab([
    { height_mm: 1050, type: "doors" },
    { height_mm: 1050, type: "open", shelf_qty: 1, shelf_heights_mm: [1800] },
  ]));
  // The open bay is now the BOTTOM one (0–1050); 1800 is outside it.
  assert.deepEqual(bayMoved[1].shelfHeightsMm, [525], "re-spread rather than clamped to the edge");
});

test("a cabinet with no sections at all is safe", () => {
  assert.deepEqual(mixedBaySections({ item_type: "tall_cabinet", height_mm: 2100 }), []);
  assert.equal(bayShelfCount({}), 0);
  assert.deepEqual(bayShelfHeightsMm({}), []);
});
