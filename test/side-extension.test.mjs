// A top or a kickboard running past its cabinet to the wall, over or under a
// side filler. One rule, read by the drawing, 3D, the cut list and the quote.
import test from "node:test";
import assert from "node:assert/strict";
import { sideExtensionMm, sideExtensionsAxisMm } from "../lib/pcd-side-extension.js";
import { kickboardSegments, computeKickboardRun } from "../lib/pcd-kickboard-utils.js";
import { topPanelSegment } from "../lib/pcd-toppanel-utils.js";
import { topPanelLinesForCabinet } from "../lib/pcd-design-to-lines.js";
import { outlineHeights, wallCallouts } from "../lib/pcd-elevation-callouts.js";

const ROOM = { id: "r", width_mm: 3000, depth_mm: 3000, height_mm: 2400 };

// 600 wide, standing 50 off the left wall of the top wall, with a left filler.
const cab = (over = {}) => ({
  id: "a", room_id: "r", item_type: "base_cabinet", wall: "top",
  x_mm: 50, y_mm: 0, width_mm: 600, height_mm: 720, depth_mm: 560,
  has_kickboard: true, kickboard_height_mm: 120,
  has_top_panel: true, finish_panel_style: { thickness_mm: 18 },
  side_filler_left: true,
  ...over,
});
const opts = (panel, o) => ({ panel_options: { [panel]: o } });

test("off unless ticked", () => {
  assert.equal(sideExtensionMm(cab(), "kickboard", "left", { room: ROOM, items: [cab()] }), 0);
  assert.equal(kickboardSegments(cab(), ROOM, [cab()])[0].length, 600);
});

test("ticked, it takes the side filler's width, and a typed length wins", () => {
  const a = cab(opts("kickboard", { extend_left: true }));
  assert.equal(sideExtensionMm(a, "kickboard", "left", { room: ROOM, items: [a] }), 50);
  const seg = kickboardSegments(a, ROOM, [a])[0];
  assert.deepEqual([seg.axisPos, seg.length], [0, 650], "runs back to the wall");

  const typed = cab(opts("kickboard", { extend_left: true, extend_left_mm: 30 }));
  assert.equal(kickboardSegments(typed, ROOM, [typed])[0].length, 630);
});

test("with no filler it measures the gap to the next thing", () => {
  const a = cab({ side_filler_left: false, x_mm: 700, ...opts("kickboard", { extend_left: true }) });
  const b = cab({ id: "b", x_mm: 0, side_filler_left: false });
  assert.equal(sideExtensionMm(a, "kickboard", "left", { room: ROOM, items: [a, b] }), 100);
});

test("left is the viewer's left, so it flips on the bottom and left walls", () => {
  const a = cab(opts("top", { extend_left: true, extend_left_mm: 40 }));
  assert.deepEqual(sideExtensionsAxisMm(a, "top", {}, "top"), { lowMm: 40, highMm: 0 });
  assert.deepEqual(sideExtensionsAxisMm(a, "top", {}, "bottom"), { lowMm: 0, highMm: 40 });
});

test("an extended kickboard that reaches the next cabinet joins its run", () => {
  const a = cab({ x_mm: 700, side_filler_left: false, ...opts("kickboard", { extend_left: true }) });
  const b = cab({ id: "b", x_mm: 0, side_filler_left: false });
  const run = computeKickboardRun(a, [a, b], ROOM).legs[0];
  assert.equal(run.count, 2);
  assert.equal(run.totalWidth, 1300);
});

test("the top runs over the filler to the wall, on top of any finished end", () => {
  const a = cab({ end_panel_left: true, x_mm: 68, top_panel_span: "individual", ...opts("top", { extend_left: true }) });
  const ctx = { room: ROOM, items: [a] };
  const seg = topPanelSegment(a, ctx);
  assert.equal(seg.length, 600 + 18 + 50, "carcass, the end, and the 50 filler");
  assert.equal(seg.axisPos, 0);
  const line = topPanelLinesForCabinet(a, [a], "Kitchen", ROOM, [a])[0];
  assert.equal(line.width_mm, 668);
  assert.match(line.notes, /50mm past the left end/);
});

test("corner cabinets never extend", () => {
  const c = cab({ item_type: "corner_base_cabinet", ...opts("kickboard", { extend_left: true, extend_left_mm: 50 }) });
  assert.equal(sideExtensionMm(c, "kickboard", "left", { room: ROOM, items: [c] }), 0);
});

test("the ladder carries the floor, the carcass and the top of the top panel", () => {
  const a = cab({ height_mm: 400 });
  assert.deepEqual(outlineHeights(a).sort((x, y) => x - y), [0, 120, 520, 538]);
  const { ticks } = wallCallouts([a]);
  const ys = ticks.map((t) => t.y);
  assert.ok(ys.includes(538), "overall top");
  assert.ok(ys.includes(0), "floor");
  assert.deepEqual(outlineHeights({ item_type: "obstruction" }), []);
});
