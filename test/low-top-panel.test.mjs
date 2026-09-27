// A finished top panel on a low run: white carcasses with our own finished
// board on top, quoted as a panel. Not a benchtop.
//
// The panel is part of the cabinet's overall height, so everything that
// measures (snapping, space between, clash checks, the filler above a wall
// cabinet) has to read it. These check the one place each of those comes from.
import test from "node:test";
import assert from "node:assert/strict";
import {
  hasTopPanel, topPanelAllowedFor, topSurfacePatch, occupiedVerticalSpanMm,
  overallHeightMm, topPanelThicknessMm, computeTopPanelRun, computeAllTopPanelRuns,
} from "../lib/pcd-toppanel-utils.js";
import { cabinetVerticalSpanMm } from "../lib/pcd-kickboard-utils.js";
import { cabinetVerticalRange, findFreeWallSlot } from "../lib/pcd-plan-geometry.js";
import { fillerPanelGapMm } from "../lib/pcd-fillerpanel-utils.js";
import { finishedTopPanelDepthMm } from "../lib/pcd-door-utils.js";
import { enabledPanels } from "../lib/pcd-panel-options.js";
import { topPanelLinesForCabinet } from "../lib/pcd-design-to-lines.js";
import { computeCutList } from "../lib/pcd-cut-list.js";

// The example from the brief: a 400 carcass on a 120 kickboard with an 18 top.
const low = (over = {}) => ({
  id: "a", room_id: "r", item_type: "base_cabinet", wall: "top",
  x_mm: 0, y_mm: 0, width_mm: 600, height_mm: 400, depth_mm: 560,
  has_kickboard: true, kickboard_height_mm: 120,
  has_top_panel: true, has_benchtop: false,
  finish_panel_style: { material: "decorative board", finish: "Matt", colour: "Oak", thickness_mm: 18 },
  ...over,
});

test("a 400 carcass on a 120 kickboard with an 18 top is 538 overall", () => {
  assert.equal(overallHeightMm(low()), 538);
  assert.deepEqual(occupiedVerticalSpanMm(low()), [120, 538]);
  assert.deepEqual(cabinetVerticalSpanMm(low()), [120, 520], "the carcass itself does not move");
  assert.equal(overallHeightMm(low({ has_top_panel: false })), 520, "off, it reads the carcass");
});

test("the top panel's own board decides its thickness", () => {
  assert.equal(topPanelThicknessMm(low({ top_panel_style: { thickness_mm: 33 } })), 33);
  assert.equal(overallHeightMm(low({ top_panel_style: { thickness_mm: 33 } })), 553);
});

test("base and blind corner cabinets take a top panel; tall and corner base do not", () => {
  assert.ok(topPanelAllowedFor("base_cabinet"));
  assert.ok(topPanelAllowedFor("blind_corner_cabinet"));
  assert.ok(topPanelAllowedFor("wall_cabinet"));
  assert.ok(!topPanelAllowedFor("tall_cabinet"));
  assert.ok(!topPanelAllowedFor("corner_base_cabinet"));
  assert.ok(!hasTopPanel(low({ item_type: "tall_cabinet" })), "a stray flag on a tall cabinet counts for nothing");
  assert.ok(enabledPanels(low()).some((p) => p.key === "top"), "the Panels window lists it");
});

test("a benchtop and a top panel never share a cabinet", () => {
  assert.deepEqual(topSurfacePatch("has_top_panel", true), { has_top_panel: true, has_benchtop: false });
  assert.deepEqual(topSurfacePatch("has_benchtop", true), { has_benchtop: true, has_top_panel: false });
  assert.deepEqual(topSurfacePatch("has_top_panel", false), { has_top_panel: false }, "turning one off leaves the other alone");
});

test("the top overhangs the front by exactly the fronts on the cabinet", () => {
  assert.equal(finishedTopPanelDepthMm(low({ front_type: "none" })), 560, "open cabinet: flush with the carcass");
  assert.equal(finishedTopPanelDepthMm(low({ front_type: "doors", door_style: { thickness_mm: 16 } })), 576, "16 door, 16 overhang");
  assert.equal(finishedTopPanelDepthMm(low({ front_type: "doors", door_style: { thickness_mm: 16 }, drawer_style: { thickness_mm: 25 } })), 576,
    "a drawer board left on a doors-only cabinet does not count");
  assert.equal(finishedTopPanelDepthMm(low({ front_type: "drawers", drawer_style: { thickness_mm: 22 } })), 582);
  assert.equal(finishedTopPanelDepthMm(low({ front_type: "mixed", door_style: { thickness_mm: 18 }, drawer_style: { thickness_mm: 22 } })), 582, "mixed takes the thicker");
});

test("the top overhangs each finished end by that end's thickness, and no other side", () => {
  const a = low({ top_panel_span: "individual" });
  const width = (item) => topPanelLinesForCabinet(item, [item], "Kitchen")[0].width_mm;
  assert.equal(width(a), 600);
  assert.equal(width({ ...a, end_panel_right: true }), 618);
  assert.equal(width({ ...a, end_panel_left: true, end_panel_right: true }), 636);
});

test("the top covers the fronts and a finished back, like the ends", () => {
  const withDoor = low({ front_type: "doors", door_style: { thickness_mm: 18 } });
  assert.equal(finishedTopPanelDepthMm(withDoor), 578);
  assert.equal(finishedTopPanelDepthMm({ ...withDoor, has_back_panel: true }), 596);
});

test("a continuous low run is one board, quoted once, across the finished end", () => {
  const a = low({ end_panel_left: true });
  const b = low({ id: "b", x_mm: 600 });
  const run = computeTopPanelRun(a, [a, b]);
  assert.equal(run.count, 2);
  assert.equal(run.totalWidth, 1218, "two carcasses plus the 18 end it sits over");

  const lines = topPanelLinesForCabinet(a, [a, b], "Kitchen");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].product_type, "Panel");
  assert.equal(lines[0].width_mm, 1218);
  assert.equal(lines[0].height_mm, 560);
  assert.match(lines[0].notes, /top panel/i);
  assert.equal(topPanelLinesForCabinet(b, [a, b], "Kitchen").length, 0, "the second cabinet does not quote it again");
});

test("an individual top stays on its own cabinet's cut list", () => {
  const a = low({ top_panel_span: "individual" });
  const part = computeCutList(a, [a]).find((p) => /Top Panel/.test(p.name));
  assert.ok(part, "on the cut list");
  assert.equal(part.dim1, 600);
});

test("a wall cabinet's top never joins the low run's top under it", () => {
  const base = low();
  const wall = low({ id: "w", item_type: "wall_cabinet", has_kickboard: false, mount_height_mm: 1500, height_mm: 700 });
  assert.equal(computeTopPanelRun(base, [base, wall]).count, 1);
  assert.equal(computeAllTopPanelRuns([base, wall]).length, 0);
});

test("clash checks and free slots measure to the top of the panel", () => {
  assert.deepEqual(cabinetVerticalRange(low()), [120, 538]);
  // A shelf-height wall cabinet whose underside sits at 530 is in the way of
  // the panel, though it clears the carcass by 10.
  const over = { id: "w", room_id: "r", item_type: "wall_cabinet", wall: "top", width_mm: 600, height_mm: 300, depth_mm: 300, mount_height_mm: 530 };
  const slot = findFreeWallSlot("top", over, [low()], { width_mm: 3000, depth_mm: 3000 });
  assert.equal(slot.x_mm, 600, "pushed along past the low cabinet");
  const clear = findFreeWallSlot("top", { ...over, mount_height_mm: 540 }, [low()], { width_mm: 3000, depth_mm: 3000 });
  assert.equal(clear.x_mm, 0, "above the panel it fits over it");
});

test("a filler above a wall cabinet starts on its top panel", () => {
  const wall = { id: "w", room_id: "r", item_type: "wall_cabinet", wall: "top", x_mm: 0, width_mm: 600, height_mm: 700, depth_mm: 300, mount_height_mm: 1500, has_filler_panel: true, finish_panel_style: { thickness_mm: 18 } };
  const room = { height_mm: 2400 };
  assert.equal(fillerPanelGapMm(wall, room, []), 200);
  assert.equal(fillerPanelGapMm({ ...wall, has_top_panel: true }, room, []), 182);
});
