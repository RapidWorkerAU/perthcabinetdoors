// Bookcase — a floor-standing open carcass with a solid back and internal
// shelves. It is a CABINET in the data model (so it cuts, prices and imports
// like one) but it is always open-fronted and never takes a door, a drawer or a
// benchtop. These lock that: the piece list the bench cuts from, the fact that
// the two colours stay independent, and that no front ever sneaks in.
import test from "node:test";
import assert from "node:assert/strict";
import { computeCutList } from "../lib/pcd-cut-list.js";
import { CABINET_TYPES, buildItemRow, applyMaterialDefaults } from "../lib/pcd-design-item-io.js";
import {
  cabinetVerticalSpanMm,
  CABINET_MOUNT_MM,
  kickboardOffsetMm,
  kickboardHeightMm,
  kickboardSpanMm,
  computeKickboardRun,
  computeAllKickboardRuns,
} from "../lib/pcd-kickboard-utils.js";

const bookcase = (over = {}) => ({
  item_type: "bookcase",
  width_mm: 800, height_mm: 2000, depth_mm: 300,
  carcass_thickness_mm: 18, shelf_thickness_mm: 18,
  back_panel_included: true, back_panel_thickness_mm: 16,
  front_type: "none",
  shelf_qty: 4,
  ...over,
});

test("a bookcase counts as a cabinet", () => {
  assert.ok(CABINET_TYPES.includes("bookcase"));
  assert.equal(CABINET_MOUNT_MM.bookcase, 0);
  assert.deepEqual(cabinetVerticalSpanMm(bookcase()), [0, 2000]);
});

// A bookcase's sides are waterfall ends: they run to the FLOOR and the plinth is
// a recessed rail between them. So a kickboard must not lift the carcass, and
// the height typed in stays the true overall height — unlike a kitchen cabinet,
// which sits on top of its kickboard and ends up that much taller.
test("a kickboard does not lift a bookcase — the sides still reach the floor", () => {
  const withPlinth = bookcase({ has_kickboard: true, kickboard_height_mm: 120 });
  assert.equal(kickboardOffsetMm(withPlinth), 0, "carcass is never lifted");
  assert.equal(kickboardHeightMm(withPlinth), 120, "but the board is still 120 tall");
  assert.deepEqual(cabinetVerticalSpanMm(withPlinth), [0, 2000], "2000 typed = 2000 overall");

  // A base cabinet is unchanged: it sits ON its kickboard.
  const base = { item_type: "base_cabinet", width_mm: 600, height_mm: 720, depth_mm: 560, has_kickboard: true, kickboard_height_mm: 150 };
  assert.equal(kickboardOffsetMm(base), 150);
  assert.deepEqual(cabinetVerticalSpanMm(base), [150, 870]);
});

test("the plinth rail spans between the sides, not the full width", () => {
  const item = bookcase({ has_kickboard: true, kickboard_height_mm: 120 });
  assert.equal(kickboardSpanMm(item), 800 - 2 * 18, "inner width, not 800");

  const parts = computeCutList(item);
  const plinth = parts.find((p) => p.material === "kickboard");
  assert.ok(plinth, "the plinth is cut");
  assert.deepEqual([plinth.dim1, plinth.dim2], [800 - 2 * 18, 120]);
  assert.match(plinth.name, /between sides/i, "named so the bench doesn't cut it full width");
});

test("a bookcase plinth never merges into a run with the cabinet beside it", () => {
  const wall = { wall: "top", room_id: "r1", has_kickboard: true, kickboard_height_mm: 120 };
  const bc = { ...bookcase(), ...wall, id: "bc", x_mm: 0 };
  // A base cabinet butted right up against it, same spec — would merge if the
  // plinth were an external strip.
  const neighbour = { id: "bx", item_type: "base_cabinet", ...wall, x_mm: 800, width_mm: 600, height_mm: 720, depth_mm: 560, carcass_thickness_mm: 16 };
  const items = [bc, neighbour];

  const { legs } = computeKickboardRun(bc, items, null);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].count, 1, "stays on its own");
  assert.equal(legs[0].totalWidth, 800 - 2 * 18, "and keeps its inner width");

  // It also never shows up as a shared multi-cabinet run in the room list.
  const runs = computeAllKickboardRuns(items, null);
  const inAnyRun = Object.values(runs).flat().some((r) => (r.segments || r).some?.((s) => s.itemId === "bc"));
  assert.ok(!inAnyRun, "not offered as part of a continuous run");
});

test("the cut list is two sides, a top, a bottom, a back and every shelf", () => {
  const parts = computeCutList(bookcase());
  const names = parts.map((p) => p.name);
  assert.deepEqual(names, [
    "Left Side", "Right Side", "Top", "Bottom", "Back Panel",
    "Shelf 1", "Shelf 2", "Shelf 3", "Shelf 4",
  ]);

  // Sides run the full height; their depth is the carcass depth less the back,
  // which sits flush against the rear edges rather than in a groove.
  const [left, right, top, bottom, back] = parts;
  assert.deepEqual([left.dim1, left.dim2], [2000, 300 - 16]);
  assert.deepEqual([right.dim1, right.dim2], [2000, 300 - 16]);
  // Top/bottom span BETWEEN the sides.
  assert.deepEqual([top.dim1, top.dim2], [800 - 2 * 18, 300 - 16]);
  assert.deepEqual([bottom.dim1, bottom.dim2], [800 - 2 * 18, 300 - 16]);
  // The back is the full outside footprint.
  assert.deepEqual([back.dim1, back.dim2], [800, 2000]);
  assert.equal(back.material, "back");
});

test("shelves are tagged as shelf stock so they price off the shelf rate", () => {
  const shelves = computeCutList(bookcase()).filter((p) => p.material === "shelf");
  assert.equal(shelves.length, 4);
  for (const s of shelves) {
    assert.deepEqual([s.dim1, s.dim2], [800 - 2 * 18, 300 - 16], "shelves span between the sides");
  }
});

test("turning the solid back off drops the back board", () => {
  const parts = computeCutList(bookcase({ back_panel_included: false }));
  assert.ok(!parts.some((p) => p.material === "back"));
  // With no back, the sides/top/bottom run the full depth.
  assert.equal(parts.find((p) => p.name === "Left Side").dim2, 300);
});

test("a bookcase never generates a door or drawer front", () => {
  // Even if stale door config is hanging around, front_type "none" wins.
  const parts = computeCutList(bookcase({ door_config: { columns: 2, rows: 1 } }));
  assert.ok(!parts.some((p) => p.material === "door" || p.material === "drawer"));
});

test("a new bookcase is built from 18mm board without being told to", () => {
  const row = buildItemRow({ item_type: "bookcase", width_mm: 800, height_mm: 2000, depth_mm: 300 }, "proj-1");
  assert.equal(row.carcass_thickness_mm, 18);
  assert.equal(row.shelf_thickness_mm, 18);
  assert.equal(row.back_panel_included, true);
  assert.equal(row.front_type, "none");
  // A kitchen carcass is unchanged at 16mm.
  const base = buildItemRow({ item_type: "base_cabinet", width_mm: 600, height_mm: 720, depth_mm: 560 }, "proj-1");
  assert.equal(base.carcass_thickness_mm, 16);
});

test("the bookcase colour and the shelf colour are filled in independently", () => {
  const merged = applyMaterialDefaults(
    { item_type: "bookcase" },
    {
      carcass: { bookcase: { material: "decorative board", finish: "matt", colour: "Oak", thickness_mm: 18, cost_per_sqm: 55 } },
      shelf: { material: "decorative board", finish: "matt", colour: "White", thickness_mm: 18, cost_per_sqm: 48 },
    },
  );
  assert.equal(merged.colour, "Oak");
  assert.equal(merged.shelf_colour, "White");
  assert.equal(merged.cost_per_sqm_carcass, 55);
  assert.equal(merged.cost_per_sqm_shelf, 48);
});
