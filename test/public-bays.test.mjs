// The public planner's "bays" editor works in COUNTS ("3 drawers"), but every
// consumer downstream — the elevation, the cut list, the quote importer — reads
// heights_mm as real OPENING heights in millimetres and subtracts a reveal from
// them. Storing the count as [1, 1, 1] made each front (1mm − 3mm reveal) clamp
// to zero: the drawers vanished from the elevation and imported as 0mm-high
// drawer fronts priced at nothing.
//
// These lock the conversion, at the two moments the public tool can get it
// wrong: setting the bays, and changing the cabinet height afterwards.
import test from "node:test";
import assert from "node:assert/strict";
import { computeDrawerFrontHeights } from "../lib/pcd-drawer-utils.js";
import { computeDrawerSizesForConfig, DEFAULT_DOOR_REVEAL_MM } from "../lib/pcd-door-utils.js";

// The public client's own helpers, mirrored here so the maths is pinned even
// though the component itself isn't importable in a node test.
const equalDrawers = (heightMm, n) => {
  const total = Number(heightMm) || 720;
  const each = Math.round(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - each * (n - 1) : each));
};
const withEqualHeights = (secs, heightMm) => {
  const n = Math.max(1, secs.length);
  const each = Math.round((Number(heightMm) || 720) / n);
  return secs.map((s) => ({ ...s, height_mm: each }));
};
const withDrawerHeights = (sec) => {
  if (sec.type !== "drawers") return sec;
  const n = Math.max(1, (sec.drawer?.heights_mm || []).length || 1);
  return { ...sec, drawer: { ...(sec.drawer || {}), heights_mm: equalDrawers(sec.height_mm, n) } };
};
const commitBays = (secs, heightMm) => withEqualHeights(secs, heightMm).map(withDrawerHeights);

// What the bay editor produces before conversion: a count, expressed as 1s.
const drawerBay = (n) => ({ type: "drawers", drawer: { heights_mm: Array.from({ length: n }, () => 1) } });

test("the regression: raw counts collapse every drawer front to zero", () => {
  const fronts = computeDrawerFrontHeights([1, 1, 1], false, 0, DEFAULT_DOOR_REVEAL_MM);
  assert.deepEqual(fronts, [0, 0, 0], "1mm opening minus a 3mm reveal — nothing left to draw or cut");
  const sizes = computeDrawerSizesForConfig({ heights_mm: [1, 1, 1] }, 600, 700);
  assert.equal(sizes[0].height, 0, "and it reached the quote as a 0mm front");
});

test("committing bays converts drawer counts into real opening heights", () => {
  const secs = commitBays([drawerBay(3), { type: "doors", door: { columns: 1, rows: 1 } }], 2100);
  const [drawers, doors] = secs;

  assert.equal(drawers.height_mm, 1050, "two bays split a 2100 cabinet evenly");
  assert.equal(doors.height_mm, 1050);
  // The drawer openings fill their own bay exactly.
  assert.equal(drawers.drawer.heights_mm.reduce((a, b) => a + b, 0), 1050);
  assert.equal(drawers.drawer.heights_mm.length, 3);
});

test("converted heights survive the reveal and produce real fronts", () => {
  const [drawers] = commitBays([drawerBay(3)], 2100);
  const fronts = computeDrawerFrontHeights(drawers.drawer.heights_mm, false, 0, DEFAULT_DOOR_REVEAL_MM);
  assert.ok(fronts.every((h) => h > 0), "every front has real height now");
  const sizes = computeDrawerSizesForConfig(drawers.drawer, 600, drawers.height_mm);
  assert.ok(sizes.every((s) => s.height > 0), "and the quote gets real sizes");
});

test("a door bay is left alone", () => {
  const [doors] = commitBays([{ type: "doors", door: { columns: 2, rows: 1 } }], 2100);
  assert.equal(doors.drawer, undefined);
  assert.equal(doors.door.columns, 2);
});

// Changing the height later is the second way this goes wrong: the elevation
// scales bays to whatever they sum to, so a stale layout still LOOKS right
// while the cut list quotes the old sizes.
test("changing the cabinet height re-spreads the bays and the drawers", () => {
  const first = commitBays([drawerBay(3), { type: "doors", door: { columns: 1, rows: 1 } }], 2100);
  const resized = commitBays(first, 2400);

  assert.equal(resized[0].height_mm, 1200, "sections follow the new height");
  assert.equal(resized[0].drawer.heights_mm.reduce((a, b) => a + b, 0), 1200, "so do the drawer openings");
  assert.equal(resized[0].drawer.heights_mm.length, 3, "without changing how many there are");
  const total = resized.reduce((s, x) => s + x.height_mm, 0);
  assert.equal(total, 2400, "and the bays still fill the cabinet");
});

test("a plain drawer bank also follows a height change", () => {
  const before = equalDrawers(720, 3);
  assert.equal(before.reduce((a, b) => a + b, 0), 720);
  const after = equalDrawers(900, before.length);
  assert.equal(after.reduce((a, b) => a + b, 0), 900);
  assert.equal(after.length, 3);
});
