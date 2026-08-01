// Shelf & Rail — the wardrobe module that spans an opening on cleats.
//
// These lock the three things that make it structural rather than decorative:
// the board breakdown (including that cleats stop at the front rail), the
// derived height (there is no height field — it's cleat + board, both fixed),
// and the warnings, which are the whole reason the item knows what each end
// lands on.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CLEAT_THICKNESS_MM,
  SHELF_RAIL_DEFAULTS,
  SPAN_LIMITS_MM,
  shelfRailConfig,
  shelfRailBoards,
  shelfRailHeightMm,
  shelfTopMm,
  mountForShelfTopMm,
  shelfRailWarnings,
  shelfRailBlockingErrors,
  spanLimitMm,
  detectSupports,
  fitToOpeningMm,
  cleatStyle,
} from "../lib/pcd-shelf-rail-utils.js";
import { computeCutList } from "../lib/pcd-cut-list.js";
import { VALID_ITEM_TYPES, buildItemRow } from "../lib/pcd-design-item-io.js";
import { CABINET_MOUNT_MM } from "../lib/pcd-kickboard-utils.js";

const sr = (over = {}, cfg = {}) => ({
  id: "sr1",
  item_type: "shelf_rail",
  room_id: "r1",
  wall: "top",
  x_mm: 0,
  width_mm: 900,
  depth_mm: 500,
  carcass_thickness_mm: 18,
  mount_height_mm: 1682,
  shelf_rail_config: {
    left_support: "wall", right_support: "wall",
    back_cleat: true, end_cleat_left: true, end_cleat_right: true,
    rail_height_mm: 100,
    front_rail: { on: true, setback_mm: 20 },
    ...cfg,
  },
  ...over,
});

test("shelf_rail is a persistable item type", () => {
  assert.ok(VALID_ITEM_TYPES.includes("shelf_rail"));
  const row = buildItemRow({ item_type: "shelf_rail", width_mm: 900, depth_mm: 500, shelf_rail_config: { rail_height_mm: 100 } }, "p1");
  assert.equal(row.carcass_thickness_mm, 18);
  assert.deepEqual(row.shelf_rail_config, { rail_height_mm: 100 });
});

// There is no height field on the form: the assembly is exactly one cleat
// height plus one board thickness, and both are fixed standards.
test("the height is derived, not entered", () => {
  assert.equal(shelfRailHeightMm(sr()), 118, "100mm cleat + 18mm shelf");
  assert.equal(shelfRailHeightMm(sr({ carcass_thickness_mm: 16 })), 116, "a 16mm board changes it");
  assert.equal(shelfRailHeightMm(sr({}, { rail_height_mm: 65 })), 83, "so does a shorter rail");
});

// The form asks for the top of the shelf (what's on a robe drawing); the tool
// stores the underside of the assembly like every other item.
test("shelf top and mount height convert both ways", () => {
  const item = sr();
  assert.equal(shelfTopMm(item), 1800, "the classic AU single-hang height");
  assert.equal(CABINET_MOUNT_MM.shelf_rail, 1682, "and that's the default mount");
  assert.equal(mountForShelfTopMm(item, 2100), 2100 - 118);
  const raised = { ...item, mount_height_mm: mountForShelfTopMm(item, 2100) };
  assert.equal(shelfTopMm(raised), 2100, "round-trips");
});

test("the boards are the shelf, three cleats and the front rail", () => {
  const boards = shelfRailBoards(sr());
  assert.deepEqual(boards.map((b) => b.part), ["shelf", "cleat-back", "cleat-left", "cleat-right", "front-rail"]);

  const [shelf, back, left, , front] = boards;
  assert.deepEqual([shelf.width_mm, shelf.height_mm], [900, 500], "shelf is span × depth");
  assert.deepEqual([back.width_mm, back.height_mm], [900, 100], "back cleat runs the full span");
  assert.deepEqual([front.width_mm, front.height_mm], [900, 100], "so does the front rail");
  // End cleats stop at the BACK FACE of the front rail — the rail runs between
  // them, so they can't also run the full depth.
  assert.equal(left.width_mm, 500 - 20 - CLEAT_THICKNESS_MM, "end cleat stops at the rail");
});

test("with no front rail the end cleats run the full depth", () => {
  const boards = shelfRailBoards(sr({}, { front_rail: { on: false, setback_mm: 20 } }));
  assert.ok(!boards.some((b) => b.part === "front-rail"));
  assert.equal(boards.find((b) => b.part === "cleat-left").width_mm, 500);
});

test("each cleat's note names the face it fixes to", () => {
  const onCabinet = shelfRailBoards(sr({}, { left_support: "cabinet" }));
  assert.match(onCabinet.find((b) => b.part === "cleat-left").note, /gable FACE/i,
    "screwing into the EDGE of particleboard is the weak fixing to avoid");
  const onPanel = shelfRailBoards(sr({}, { right_support: "panel" }));
  assert.match(onPanel.find((b) => b.part === "cleat-right").note, /restrained top and bottom/i);
});

test("the cut list is the boards, tagged for pricing", () => {
  const parts = computeCutList(sr());
  assert.deepEqual(parts.map((p) => p.name), ["Shelf", "Back cleat", "End cleat — left", "End cleat — right", "Front rail"]);
  assert.equal(parts[0].material, "shelf");
  assert.ok(parts.slice(1).every((p) => p.material === "cleat"), "cleats price on their own rate");
});

// ---- The structural warnings ----

test("the span guide tightens on a 16mm board and loosens with a front rail", () => {
  assert.equal(spanLimitMm(sr()), SPAN_LIMITS_MM[18].railed);
  assert.equal(spanLimitMm(sr({}, { front_rail: { on: false } })), SPAN_LIMITS_MM[18].bare);
  assert.equal(spanLimitMm(sr({ carcass_thickness_mm: 16 })), SPAN_LIMITS_MM[16].railed);
  assert.equal(spanLimitMm(sr({ carcass_thickness_mm: 16 }, { front_rail: { on: false } })), SPAN_LIMITS_MM[16].bare);
});

test("an over-span bare shelf is warned and told the front rail fixes it", () => {
  const item = sr({ width_mm: 1100 }, { front_rail: { on: false } });
  const w = shelfRailWarnings(item).find((x) => x.code === "span-bare");
  assert.ok(w, "warned");
  assert.equal(w.level, "warn", "a warning, never a block — the drawing can't see the studs");
  assert.match(w.message, /1200mm/, "points at what turning the rail on buys");
});

test("an end with nothing to land on blocks the import", () => {
  const item = sr({}, { right_support: "open" });
  const errs = shelfRailBlockingErrors(item);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].code, "right-open");
  // Errors sort above warnings so the blocking one is read first.
  assert.equal(shelfRailWarnings(sr({ width_mm: 2000 }, { right_support: "open" }))[0].level, "error");
});

test("landing on a panel warns about restraint rather than blocking", () => {
  const w = shelfRailWarnings(sr({}, { left_support: "panel" })).find((x) => x.code === "left-panel");
  assert.equal(w.level, "warn");
  assert.match(w.message, /fixed top and bottom|rack/i);
});

test("switching every cleat off is an error, not a shelf", () => {
  const item = sr({}, { back_cleat: false, end_cleat_left: false, end_cleat_right: false });
  assert.ok(shelfRailBlockingErrors(item).some((e) => e.code === "no-cleats"));
});

// ---- Detecting what it spans between ----

const tower = (id, x, over = {}) => ({
  id, item_type: "tall_cabinet", room_id: "r1", wall: "top",
  x_mm: x, width_mm: 600, height_mm: 2100, depth_mm: 560, mount_height_mm: 0, ...over,
});

test("a shelf between two towers detects a cabinet gable at each end", () => {
  const item = sr({ x_mm: 600, width_mm: 900 });
  const found = detectSupports(item, [tower("a", 0), tower("b", 1500)], { width_mm: 4000, depth_mm: 3000 });
  assert.deepEqual(found, { left: "cabinet", right: "cabinet" });
});

test("a tower that doesn't reach the shelf height isn't a support", () => {
  const item = sr({ x_mm: 600, width_mm: 900 });
  // A base cabinet only reaches 720 — the shelf sits at 1800.
  const low = tower("a", 0, { item_type: "base_cabinet", height_mm: 720 });
  const found = detectSupports(item, [low, tower("b", 1500)], { width_mm: 4000, depth_mm: 3000 });
  assert.equal(found.left, "open", "nothing at that height, so nothing to land on");
  assert.equal(found.right, "cabinet");
});

test("running into the end of the wall counts as a wall", () => {
  const item = sr({ x_mm: 0, width_mm: 900 });
  const found = detectSupports(item, [tower("b", 900)], { width_mm: 4000, depth_mm: 3000 });
  assert.equal(found.left, "wall");
  assert.equal(found.right, "cabinet");
});

test("fit to opening measures the clear gap between the towers", () => {
  const item = sr({ x_mm: 700, width_mm: 300 });
  const fit = fitToOpeningMm(item, [tower("a", 0), tower("b", 1500)], { width_mm: 4000, depth_mm: 3000 });
  assert.deepEqual(fit, { x_mm: 600, width_mm: 900 }, "from the left tower's end to the right tower's start");
});

// ---- Colours ----

test("cleats fall back to the shelf colour but never to its thickness", () => {
  const item = sr({ material: "decorative board", finish: "matt", colour: "Oak", carcass_thickness_mm: 16, cost_per_sqm_carcass: 50 });
  const c = cleatStyle(item);
  assert.equal(c.colour, "Oak", "matches the shelf when nothing else is picked");
  assert.equal(c.thickness_mm, CLEAT_THICKNESS_MM, "but cleats are always 18mm — they're structural");
});

test("a cleat colour of its own wins", () => {
  const item = sr({ colour: "Oak" }, { cleat_style: { material: "decorative board", colour: "White", cost_per_sqm: 40 } });
  const c = cleatStyle(item);
  assert.equal(c.colour, "White");
  assert.equal(c.thickness_mm, CLEAT_THICKNESS_MM);
});

test("defaults are the agreed robe numbers", () => {
  assert.equal(SHELF_RAIL_DEFAULTS.depth_mm, 500);
  assert.equal(SHELF_RAIL_DEFAULTS.rail_height_mm, 100);
  assert.equal(SHELF_RAIL_DEFAULTS.front_rail_setback_mm, 20);
  assert.equal(shelfRailConfig({}).cleat_thickness_mm, CLEAT_THICKNESS_MM);
});
