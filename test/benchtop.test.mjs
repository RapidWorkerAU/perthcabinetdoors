// Benchtops: derived from the cabinet run, drawn, and NEVER quoted.
//
// The last of those is the load-bearing one. PCD doesn't supply benchtops, so
// a benchtop appearing in a cut list or on a quote would be billing for
// something nobody makes. These tests exist to keep that true as the feature
// grows — it's the sort of promise that quietly rots the first time someone
// adds a "benchtop material" field.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BENCHTOP_THICKNESS_MM, DEFAULT_BENCHTOP_OVERHANG_MM,
  benchtopThicknessMm, benchtopOverhangMm, benchtopDepthMm, benchtopUndersideMm,
  benchtopSegment, computeBenchtopRun, benchtopCutouts,
  benchtopWaterfallSides, benchtopWaterfallElevationSides, benchtopRunWaterfallEnds,
} from "../lib/pcd-benchtop-utils.js";
import { calculateCabinetCutList } from "../lib/pcd-cabinet-utils.js";

const cab = (over = {}) => ({
  id: "a", room_id: "r", item_type: "base_cabinet", wall: "top",
  x_mm: 0, y_mm: 0, width_mm: 900, depth_mm: 560, height_mm: 720,
  has_benchtop: true, front_type: "doors", door_style: { thickness_mm: 18 },
  ...over,
});

test("a benchtop NEVER reaches the cut list", () => {
  // The whole premise. If this ever fails, the tool has started quoting a
  // product that doesn't exist.
  const withTop = {
    width_mm: 900, depth_mm: 560, height_mm: 720, carcass_thickness_mm: 16,
    back_panel_included: true, back_panel_thickness_mm: 16, shelf_qty: 0,
    has_benchtop: true, benchtop_thickness_mm: 40,
  };
  const pieces = calculateCabinetCutList(withTop);
  assert.ok(!pieces.some((p) => /bench/i.test(p.label)), "no benchtop piece is cut");
  // And it changes nothing else about the cabinet either.
  const without = calculateCabinetCutList({ ...withTop, has_benchtop: false });
  assert.deepEqual(pieces, without, "ticking a benchtop must not alter a single cut size");
});

test("depth is derived from the cabinet, past the DOOR face", () => {
  // Overhang is measured past the front of the door, not the carcass — that's
  // the dimension a joiner quotes. Deriving it means the top can't silently
  // disagree with the cabinet it sits on.
  assert.equal(benchtopOverhangMm(cab()), DEFAULT_BENCHTOP_OVERHANG_MM);
  assert.equal(benchtopDepthMm(cab()), 598, "560 carcass + 18 door + 20 overhang");
  assert.equal(benchtopDepthMm(cab({ benchtop_overhang_mm: 30 })), 608);
  // A cabinet with no front has nothing standing proud of the carcass.
  assert.equal(benchtopDepthMm(cab({ front_type: "none" })), 580, "560 + 20, no door");
  // A drawer bank is measured off its own board.
  assert.equal(
    benchtopDepthMm(cab({ front_type: "drawers", drawer_style: { thickness_mm: 21 } })),
    601, "560 + 21 + 20"
  );
  // 0 is a legitimate overhang (flush front); it must not fall back to 20.
  assert.equal(benchtopDepthMm(cab({ benchtop_overhang_mm: 0 })), 578);
});

test("thickness defaults, and the underside sits on the carcass top", () => {
  assert.equal(benchtopThicknessMm(cab()), DEFAULT_BENCHTOP_THICKNESS_MM);
  assert.equal(benchtopThicknessMm(cab({ benchtop_thickness_mm: 20 })), 20);
  // Bench height = carcass top + the top itself, and the carcass top already
  // includes the kickboard.
  assert.equal(benchtopUndersideMm(cab({ mount_height_mm: 0 })), 720);
  assert.equal(
    benchtopUndersideMm(cab({ mount_height_mm: 0, has_kickboard: true, kickboard_height_mm: 150 })),
    870, "the kickboard lifts the top with the carcass"
  );
});

test("only cabinets with a working top get one", () => {
  assert.ok(benchtopSegment(cab({ item_type: "base_cabinet" })));
  assert.ok(benchtopSegment(cab({ item_type: "corner_base_cabinet" })));
  assert.ok(benchtopSegment(cab({ item_type: "blind_corner_cabinet" })));
  // A tall cabinet runs past bench height; a wall cabinet has nothing to sit on.
  assert.equal(benchtopSegment(cab({ item_type: "tall_cabinet" })), null);
  assert.equal(benchtopSegment(cab({ item_type: "wall_cabinet" })), null);
  assert.equal(benchtopSegment(cab({ has_benchtop: false })), null);
});

test("continuous cabinets merge into one top; the first one owns it", () => {
  // Same ownership rule as the kickboard: only the run's first cabinet draws
  // the merged top, so a run isn't drawn once per cabinet on top of itself.
  const a = cab({ id: "a", x_mm: 0, width_mm: 600 });
  const b = cab({ id: "b", x_mm: 600, width_mm: 900 });
  const c = cab({ id: "c", x_mm: 1500, width_mm: 600 });
  const all = [a, b, c];

  const run = computeBenchtopRun(a, all);
  assert.equal(run.count, 3);
  assert.equal(run.totalWidth, 2100, "600 + 900 + 600 as one top");
  assert.equal(run.firstItemId, "a");
  assert.equal(computeBenchtopRun(b, all).firstItemId, "a", "b defers to a");

  // "individual" never merges — it comes back as its own count:1 result.
  const solo = cab({ id: "s", x_mm: 0, width_mm: 600, benchtop_span: "individual" });
  const soloRun = computeBenchtopRun(solo, [solo, b]);
  assert.equal(soloRun.count, 1);
  assert.equal(soloRun.totalWidth, 600);
});

test("a gap in the run breaks the top in two", () => {
  // A dishwasher space between cabinets is two tops, not one 2100 slab.
  const a = cab({ id: "a", x_mm: 0, width_mm: 600 });
  const far = cab({ id: "f", x_mm: 1600, width_mm: 600 });
  const run = computeBenchtopRun(a, [a, far]);
  assert.equal(run.count, 1, "not adjacent, so not one run");
  assert.equal(run.totalWidth, 600);
});

test("a cabinet without a benchtop doesn't join the run", () => {
  const a = cab({ id: "a", x_mm: 0, width_mm: 600 });
  const bare = cab({ id: "n", x_mm: 600, width_mm: 900, has_benchtop: false });
  assert.equal(computeBenchtopRun(a, [a, bare]).count, 1);
});

test("cutouts are sanitised, not trusted", () => {
  const cuts = benchtopCutouts(cab({
    benchtop_cutouts: [
      { type: "sink", width_mm: 800, depth_mm: 450 },
      { type: "cooktop", width_mm: 600, depth_mm: 520 },
      { type: "nonsense", width_mm: 100, depth_mm: 100 },  // unknown -> sink
      { type: "sink", width_mm: 0, depth_mm: 450 },         // zero -> dropped
      { type: "sink" },                                     // no size -> dropped
    ],
  }));
  assert.equal(cuts.length, 3);
  assert.deepEqual(cuts.map((c) => c.type), ["sink", "cooktop", "sink"]);
  assert.deepEqual(benchtopCutouts(cab()), [], "no cutouts by default");
  assert.deepEqual(benchtopCutouts(cab({ benchtop_cutouts: null })), [], "junk in, empty out");
});

test("waterfall ends: the plan flips the axis, the elevation must not", () => {
  // Same dual as the end panels. "Left" is the viewer's left; the plan has to
  // map that onto room space (where the bottom/left walls are mirrored), while
  // the elevation's axis is already flipped by getWallPos. If these two ever
  // agree on a mirrored wall, one of them is wrong.
  const wf = (over) => cab({ benchtop_waterfall_left: true, ...over });
  assert.deepEqual(benchtopWaterfallSides(wf({ wall: "top" })), { low: true, high: false });
  assert.deepEqual(benchtopWaterfallSides(wf({ wall: "bottom" })), { low: false, high: true }, "plan flips");
  assert.deepEqual(benchtopWaterfallElevationSides(wf({ wall: "bottom" })), { low: true, high: false }, "elevation does not");
  assert.deepEqual(benchtopWaterfallSides(cab()), { low: false, high: false });
});

test("a waterfall set on the END cabinet of a run is not lost", () => {
  // Two-cabinet continuous run on the top wall; the waterfall is set on the
  // SECOND cabinet's right end (the exposed end), not the run owner (first).
  const a = cab({ id: "a", x_mm: 0,   width_mm: 900 });
  const b = cab({ id: "b", x_mm: 900, width_mm: 900, benchtop_waterfall_right: true });
  const items = [a, b];

  // The owner is the first cabinet, and its own flags are empty...
  const run = computeBenchtopRun(a, items);
  assert.equal(run.firstItemId, "a");
  assert.deepEqual(benchtopWaterfallSides(a, "top"), { low: false, high: false });

  // ...but aggregated across the run, the right waterfall is picked up.
  const ends = benchtopRunWaterfallEnds(a, items);
  assert.deepEqual(ends, { left: false, right: true });
  assert.deepEqual(benchtopWaterfallSides(a, "top", ends), { low: false, high: true });
  assert.deepEqual(benchtopWaterfallElevationSides(a, ends), { low: false, high: true });
});

test("run aggregation respects the wall flip for the plan", () => {
  // Bottom wall flips the along-axis, so a viewer-left waterfall lands high.
  const a = cab({ id: "a", wall: "bottom", benchtop_waterfall_left: true });
  const ends = benchtopRunWaterfallEnds(a, [a]);
  assert.deepEqual(benchtopWaterfallSides(a, "bottom", ends), { low: false, high: true });
});
