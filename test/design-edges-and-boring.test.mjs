// BANDED EDGES, HINGE BORING AND THE KIND OF PANEL, FROM A DESIGN.
//
// The quote builder, the quote and the order all carry which edges of a
// decorative board piece are taped, which hinge boring a door takes and what
// kind of panel a panel is. A design carried none of them, so a kitchen drawn
// in the design tool reached the quote with no edges on any piece, no boring on
// any door, and every filler, kickboard and end panel reading "Panel".
//
// Decided 11 September 2026: the edges are set per cabinet's fronts, per
// finishing panel and per standalone piece, and start on all four; the boring
// is set per cabinet; grain is not asked in the design tool; the public planner
// asks none of it and sends the defaults.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { generateImportLines } from "../lib/pcd-design-to-lines.js";
import { requestLinesForItem } from "../lib/pcd-design-request-lines.js";
import { buildPreset, quotableItems, selectedPartKeys } from "../lib/pcd-design-parts.js";
import { buildItemPatch, buildItemRow } from "../lib/pcd-design-item-io.js";
import { withPanelOption } from "../lib/pcd-panel-options.js";

const ROOM = { id: "room-1", name: "Kitchen", width_mm: 4000, depth_mm: 3000, height_mm: 2400 };

const board = { material: "decorative board", finish: "Woodmatt", colour: "Bottega Oak", thickness_mm: 18, edge_mould: "1mm Square Edge" };
const thermo = { material: "thermolaminate", finish: "Natura", colour: "Bottega Oak", thickness_mm: 18, profile_type: "Minimal", profile: "Hamilton" };

function cabinet(over = {}) {
  return {
    id: "c1", room_id: ROOM.id, item_type: "base_cabinet", label: "Base 900", wall: "top", x_mm: 0,
    width_mm: 900, height_mm: 720, depth_mm: 560, qty: 1,
    front_type: "doors", door_config: { columns: 2 }, door_style: board,
    material: "decorative board", finish: "Matt", colour: "Carcass", carcass_thickness_mm: 16,
    has_kickboard: true, kickboard_height_mm: 150, end_panel_right: true,
    ...over,
  };
}

// The admin importer, everything ticked.
function imported(item) {
  return generateImportLines({
    importableItems: [item],
    selections: {},
    selectedCabinetItems: [item],
    roomNameById: new Map([[ROOM.id, ROOM.name]]),
    roomById: new Map([[ROOM.id, ROOM]]),
    items: [item],
  }).map(({ line }) => line);
}

// The public planner's request, everything ticked.
function requested(item) {
  const quotable = quotableItems([item]);
  const selection = buildPreset(quotable, "everything");
  return quotable.flatMap((it) => requestLinesForItem(it, selectedPartKeys(selection, it), { roomName: "Kitchen", roomHeightMm: 2400 }));
}

const ALL = ["Top", "Bottom", "Left", "Right"];

// ── The fronts ──────────────────────────────────────────────────────────────

test("decorative board doors start on all four edges banded", () => {
  const doors = imported(cabinet()).filter((line) => line.product_type === "Door");
  assert.ok(doors.length);
  for (const door of doors) assert.deepEqual(door.banded_edges, ALL);
});

test("changing the fronts' edges reaches every door and drawer front", () => {
  const doors = imported(cabinet({ banded_edges: ["Top", "Left"] })).filter((line) => line.product_type === "Door");
  for (const door of doors) assert.deepEqual(door.banded_edges, ["Top", "Left"]);
  const drawers = imported(cabinet({ front_type: "drawers", drawer_config: { heights_mm: [240, 240, 240] }, drawer_style: board, banded_edges: ["Top"] }))
    .filter((line) => line.product_type === "Drawer front");
  assert.ok(drawers.length);
  for (const drawer of drawers) assert.deepEqual(drawer.banded_edges, ["Top"]);
});

test("a thermolaminate front carries no edges, it is wrapped", () => {
  for (const door of imported(cabinet({ door_style: thermo })).filter((line) => line.product_type === "Door")) {
    assert.equal(door.banded_edges, null);
  }
});

test("the cabinet's hinge boring reaches its drilled doors only", () => {
  const doors = imported(cabinet({ hole_type: "Blum Inserta", door_config: { columns: 2, hinges_qty: [2, 2] } }))
    .filter((line) => line.product_type === "Door");
  for (const door of doors) assert.equal(door.hole_type, door.hinge_holes ? "Blum Inserta" : "");
});

// ── The finishing panels ────────────────────────────────────────────────────

test("finishing panels say what kind of panel they are", () => {
  const lines = imported(cabinet({ end_panel_left: true }));
  const uses = new Set(lines.map((line) => line.panel_use).filter(Boolean));
  assert.ok(uses.has("End panel"), [...uses].join(", "));
  assert.ok(uses.has("Kickboard"), [...uses].join(", "));
});

test("each finishing panel carries its own edges, all four until changed", () => {
  const item = cabinet();
  item.panel_options = withPanelOption(item, "end_right", { banded_edges: ["Top", "Bottom", "Right"] });
  const end = imported(item).find((line) => line.panel_use === "End panel");
  assert.deepEqual(end.banded_edges, ["Top", "Bottom", "Right"], "the one that was changed");
  const kick = imported(item).find((line) => line.panel_use === "Kickboard");
  assert.deepEqual(kick.banded_edges, ALL, "and the one that was not");
});

test("no edges at all is kept as an answer, not dropped as a blank", () => {
  const item = cabinet();
  item.panel_options = withPanelOption(item, "end_right", { banded_edges: [] });
  assert.deepEqual(item.panel_options.end_right.banded_edges, []);
  assert.deepEqual(imported(item).find((line) => line.panel_use === "End panel").banded_edges, []);
});

// ── Standalone pieces and hardware ──────────────────────────────────────────

test("a standalone scribe is a Scribe, with its own edges", () => {
  const scribe = {
    id: "s1", room_id: ROOM.id, item_type: "scribe", width_mm: 18, height_mm: 720, depth_mm: 60, qty: 1,
    material: "decorative board", finish: "Woodmatt", colour: "Bottega Oak", thickness: "18mm", banded_edges: ["Left"],
  };
  const [line] = imported(scribe);
  assert.equal(line.panel_use, "Scribe");
  assert.deepEqual(line.banded_edges, ["Left"]);
});

test("hardware off a cabinet says what kind it is", () => {
  const lines = imported(cabinet({ handle_name: "Castella Bar", handle_cost_ex_gst: 12 }));
  const handle = lines.find((line) => line.product_type === "Hardware");
  assert.equal(handle?.hardware_type, "handle");
});

// ── The public planner sends the defaults ───────────────────────────────────

test("a customer's design carries the defaults to their request", () => {
  const lines = requested(cabinet());
  const door = lines.find((line) => line.productType === "Door");
  assert.deepEqual(door.bandedEdges, ALL, "all four edges on the doors");
  assert.ok(lines.some((line) => line.panelUse === "Kickboard"), "and the kickboard says it is one");
});

// ── Saved on the design ─────────────────────────────────────────────────────

test("the design saves the edges and the boring, and refuses what is not real", () => {
  const row = buildItemRow({ item_type: "base_cabinet", banded_edges: ["left", "Top"], hole_type: "Blum Inserta" }, "p1");
  assert.deepEqual(row.banded_edges, ["Top", "Left"]);
  assert.equal(row.hole_type, "Blum Inserta");
  assert.equal(buildItemRow({ item_type: "base_cabinet" }, "p1").banded_edges, null, "untouched stays null, read as all four");
  assert.equal(buildItemPatch({ hole_type: "a big drill" }).hole_type, null);
  assert.deepEqual(buildItemPatch({ banded_edges: [] }).banded_edges, [], "no edges is an answer");
});

test("the design tool asks it in the three places decided", () => {
  const panel = readFileSync(new URL("../app/admin/design/_components/DesignRightPanel.js", import.meta.url), "utf8");
  assert.match(panel, /value=\{draft\.banded_edges\}\s*\n\s*onChange=\{\(edges\) => setNow\("banded_edges", edges\)\}/, "the fronts");
  assert.match(panel, /withPanelOption\(latestRef\.current, panelKey, \{ banded_edges: edges \}\)/, "each finishing panel");
  assert.match(panel, /<BandedEdgesField value=\{draft\.banded_edges\}/, "a standalone piece");
  assert.ok((panel.match(/Hinge hole type/g) || []).length >= 2, "the boring on a cabinet and a standalone door");
});
