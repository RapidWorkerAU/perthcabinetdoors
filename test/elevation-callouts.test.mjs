// WHAT IS INSIDE A CABINET, WRITTEN BESIDE THE ELEVATION.
//
// An approval drawing shows closed doors, so everything the customer is buying
// inside them was invisible: which rails, how high, how tall each drawer, how
// much hanging space. Decided 13 September 2026 off the Teina Jenkins robe.
//
// Two rules the whole thing hangs off:
//
//   EVERY HEIGHT IS ABOVE THE FINISHED FLOOR. The tool stores heights up from
//   the carcass, which sits on its kickboard. A customer measures from the
//   floor, so that is the only datum printed.
//
//   NOTHING IS DRAWN OVER THE CABINET. The ladder takes the left margin, the
//   names take the right, and the drawing between them is left alone.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  MIN_GAP_MM, itemBaseMm, itemGaps, itemLevels, itemStops, wallCallouts,
} from "../lib/pcd-elevation-callouts.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ELEV = read("app/admin/design/_components/FrontElevationView.js");
const EXPORT = read("app/admin/design/_components/DesignPlanExportModal.js");

// The real wardrobe: 2430 carcass on a 120 kickboard, so the inside runs
// 136 to 2534 above the floor.
const RAIL = { id: "r1", hardware_id: "hw-rail", name: "Oval Hanging Rail", type: "wardrobe_hanging_rail", qty: 1 };
function wardrobe(over = {}) {
  return {
    id: "c1", item_type: "tall_cabinet", label: "Wardrobe Centre", wall: "top", x_mm: 0,
    width_mm: 960, height_mm: 2430, depth_mm: 580, carcass_thickness_mm: 16,
    mount_height_mm: 0, has_kickboard: true, kickboard_height_mm: 120,
    front_type: "doors", shelf_qty: 1, shelf_heights_mm: [2130],
    accessories: [{ ...RAIL, height_mm: 2000 }],
    ...over,
  };
}

// ── The datum ───────────────────────────────────────────────────────────────

test("every height is above the floor, not up from the carcass", () => {
  const item = wardrobe();
  assert.equal(itemBaseMm(item), 120, "the carcass sits on its kickboard");
  const levels = itemLevels(item);
  assert.equal(levels.length, 2);
  // The tool stores the shelf at 2130 and the rail at 2000, both from the
  // carcass bottom. On the drawing they are 120 higher.
  assert.deepEqual(levels.map((l) => Math.round(l.y)), [2250, 2120]);
  assert.deepEqual(levels.map((l) => l.name), ["Shelf", "Oval Hanging Rail"]);
  assert.equal(levels.insideBottom, 136);
  assert.equal(levels.insideTop, 2534);
});

// ── What gets a line ────────────────────────────────────────────────────────

test("a double hang reads as two rails and the hanging between them", () => {
  const item = wardrobe({ accessories: [{ ...RAIL, height_mm: 2000 }, { ...RAIL, id: "r2", height_mm: 1002 }] });
  const gaps = itemGaps(item);
  const hanging = gaps.filter((g) => g.name === "Hanging").map((g) => g.clear);
  assert.deepEqual(hanging, [998, 986], "under the top rail, then under the bottom one to the floor");
  // And the shelf above still gets its own clearance.
  assert.ok(gaps.some((g) => g.name === "Clear" && g.clear === 284), "and the space above the shelf is dimensioned too");
});

test("a shoe rack takes the space it occupies, not just a line", () => {
  const shoe = { id: "s1", hardware_id: "hw-shoe", name: "Finista Shoe Rack", type: "pull_out_shoe_rail",
    qty: 1, height_mm: 38, size: { width_mm: 900, height_mm: 300, depth_mm: 500 } };
  const item = wardrobe({ accessories: [{ ...RAIL, height_mm: 1002 }, shoe] });
  const levels = itemLevels(item);
  const rack = levels.find((l) => l.name === "Finista Shoe Rack");
  assert.equal(Math.round(rack.y), 158, "its base, above the floor");
  assert.equal(rack.boxH, 300, "and how tall it is, so the hanging above it is honest");
  // 1122 rail down to the top of the rack at 458.
  assert.ok(itemGaps(item).some((g) => g.name === "Hanging" && g.clear === 664));
});

test("drawer fronts are laid out the way the elevation lays them out", () => {
  // Six fronts stored at 204 × 5 and 195, in a 1215 bay with a 20mm reveal
  // above each: the FRONT is 184, not 204, and that is the number beside it.
  const item = wardrobe({
    label: "Wardrobe LHS Drawers", front_type: "mixed", shelf_qty: 0, shelf_heights_mm: [], accessories: [],
    section_config: { sections: [
      { type: "open", height_mm: 1215 },
      { type: "drawers", height_mm: 1215, drawer: { gap_mm: 20, gap_enabled: true, heights_mm: [204, 204, 204, 204, 204, 195] } },
    ] },
  });
  const levels = itemLevels(item);
  const drawers = levels.filter((l) => l.kind === "drawer");
  assert.equal(drawers.length, 6);
  assert.deepEqual(drawers.map((d) => d.name), ["Drawer 1", "Drawer 2", "Drawer 3", "Drawer 4", "Drawer 5", "Drawer 6"]);
  assert.deepEqual(drawers.map((d) => d.height), [184, 184, 184, 184, 184, 175], "the front, not the opening");
  assert.equal(Math.round(drawers[0].y), 1131, "drawer 1 is the top one, and it is above the floor");
  // The open bay above says how tall it is, which is the other half of the ask.
  const open = levels.find((l) => l.kind === "open");
  assert.equal(open.height, 1215);
  assert.equal(Math.round(open.y), 1335);
});

test("a shelf and rail is its own shelf, and never comes out NaN", () => {
  // Four of them stacked in the linen cupboard. The item IS the shelf, so its
  // inside is itself; leaving that unset put NaN through the whole ladder.
  const shelf = (mount) => ({ id: "s" + mount, item_type: "shelf_rail", wall: "left",
    width_mm: 930, height_mm: 118, mount_height_mm: mount, shelf_rail_config: { rail_height_mm: 100 } });
  const levels = itemLevels(shelf(866));
  assert.equal(Math.round(levels[0].y), 984, "the top of the board");
  assert.ok(Number.isFinite(levels.insideTop) && Number.isFinite(levels.insideBottom));

  const { ticks } = wallCallouts([shelf(298), shelf(866), shelf(1434), shelf(2002)]);
  assert.ok(ticks.every((t) => Number.isFinite(t.y) && Number.isFinite(t.clear)));
  // 450 clear between one shelf and the cleats of the next: the number the
  // customer is really asking for.
  assert.equal(ticks.filter((t) => t.clear === 450).length, 3);
});

test("a gap too small to matter is not dimensioned", () => {
  assert.equal(MIN_GAP_MM, 90);
  const item = wardrobe({ accessories: [{ ...RAIL, height_mm: 2000 }, { ...RAIL, id: "r2", height_mm: 1960 }] });
  assert.ok(!itemGaps(item).some((g) => g.clear < MIN_GAP_MM));
});

// ── The wall as a whole ─────────────────────────────────────────────────────

test("three matching wardrobes say each thing once, with a count", () => {
  const wall = [
    wardrobe({ id: "a", label: "Blind Wardrobe Left", accessories: [{ ...RAIL, height_mm: 2000 }] }),
    wardrobe({ id: "b", label: "Wardrobe Centre", accessories: [{ ...RAIL, height_mm: 2000 }] }),
    wardrobe({ id: "c", label: "Blind Wardrobe Right", accessories: [{ ...RAIL, height_mm: 2000 }] }),
  ];
  const { notes } = wallCallouts(wall);
  const rails = notes.filter((n) => n.label === "Oval Hanging Rail");
  assert.equal(rails.length, 1, "one line, not three");
  assert.equal(rails[0].count, 3);
  assert.equal(rails[0].where, "", "and no cabinet named, because it is all of them");
});

test("something in only one cabinet says which one", () => {
  const wall = [
    wardrobe({ id: "a", label: "Blind Wardrobe Left", accessories: [{ ...RAIL, height_mm: 2000 }] }),
    wardrobe({ id: "b", label: "Wardrobe Centre",
      accessories: [{ ...RAIL, height_mm: 2000 }, { ...RAIL, id: "r2", height_mm: 1002 }] }),
  ];
  const { notes } = wallCallouts(wall);
  const lower = notes.find((n) => n.label === "Oval Hanging Rail" && Math.round(n.y) === 1122);
  assert.equal(lower.count, 1);
  assert.equal(lower.where, "Wardrobe Centre", "so nobody has to guess which one it is on");
});

test("the ladder does not print a rung for a drawer reveal", () => {
  // A 20mm reveal above every front is real and on the cut list. Ticking it
  // turned the ladder into seventeen rungs alternating 20 and 184.
  const item = wardrobe({
    front_type: "mixed", shelf_qty: 0, shelf_heights_mm: [], accessories: [],
    section_config: { sections: [
      { type: "open", height_mm: 1215 },
      { type: "drawers", height_mm: 1215, drawer: { gap_mm: 20, gap_enabled: true, heights_mm: [204, 204, 204, 204, 204, 195] } },
    ] },
  });
  const { ticks } = wallCallouts([item]);
  assert.ok(!ticks.some((t) => t.clear > 0 && t.clear < 40), "no 20mm rungs");
  assert.ok(ticks.length < 12, "a readable ladder, not one rung per reveal");
});

test("a cabinet with nothing in it is not annotated", () => {
  const bare = wardrobe({ shelf_qty: 0, shelf_heights_mm: [], accessories: [] });
  assert.deepEqual(itemLevels(bare), []);
  assert.deepEqual(itemStops(bare), []);
  const { ticks, notes } = wallCallouts([bare]);
  assert.equal(ticks.length, 0);
  assert.equal(notes.length, 0);
});

// ── On the drawing ──────────────────────────────────────────────────────────

test("the callouts live in the margins and nowhere else", () => {
  // The sheet is widened on both sides and the layer is placed in the gutters;
  // writing across a cabinet is harder to read than no writing at all.
  assert.match(ELEV, /const CALLOUT_PAD_L = callouts \? 132 : 0/);
  assert.match(ELEV, /const CALLOUT_PAD_R = callouts \? 300 : 0/);
  assert.match(ELEV, /viewBox=\{`\$\{-CALLOUT_PAD_L\} 0 \$\{VIEW_W \+ CALLOUT_PAD_L \+ CALLOUT_PAD_R\} \$\{VIEW_H\}`\}/);
  // Off by default, so every other use of this elevation is unchanged.
  assert.match(ELEV, /callouts = false \}\) \{/);
  assert.match(ELEV, /function CalloutLayer\(/);
  assert.match(ELEV, /\{callouts && \(\s*<CalloutLayer/);
  // Drawn from the shared list rather than worked out here.
  assert.match(ELEV, /wallCallouts\(items \|\| \[\]\)/);
});

test("the PDF export offers it, and takes it by default", () => {
  assert.match(EXPORT, /const \[callouts, setCallouts\] = useState\(true\)/);
  assert.match(EXPORT, /callouts=\{callouts\}/);
  assert.match(EXPORT, /Heights and names on the elevations/);
});
