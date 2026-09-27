// Which board each finished piece is cut from when it has no colour of its own,
// and that the drawing paints it the same. Decided 27 September 2026: a filler,
// a finished back and a side filler all follow the finished panels.
import test from "node:test";
import assert from "node:assert/strict";
import {
  doorLinesForCabinet, drawerLinesForCabinet, fillerPanelLinesForCabinet, sideFillerLinesForCabinet,
} from "../lib/pcd-design-to-lines.js";
import { slotColourFields } from "../lib/pcd-colour-images.js";
import { itemDrawerBandedEdges } from "../lib/pcd-panel-options.js";

const ROOM = { id: "r", name: "Kitchen", width_mm: 3000, depth_mm: 3000, height_mm: 2400 };
const board = (colour, t = 18) => ({ material: "decorative board", finish: "Matt", colour, thickness_mm: t });

const cab = (over = {}) => ({
  id: "a", room_id: "r", item_type: "tall_cabinet", wall: "top", x_mm: 0, y_mm: 0,
  width_mm: 600, height_mm: 2100, depth_mm: 560, qty: 1,
  material: "decorative board", finish: "Matt", colour: "White",
  front_type: "doors", door_config: { columns: 1, rows: 1, hinges: ["L"] },
  door_style: board("Oak"),
  finish_panel_style: board("Charcoal"),
  ...over,
});

test("a filler is cut from the finished-panel board, at its own thickness", () => {
  const item = cab({ has_filler_panel: true, filler_panel_height_mm: 200, filler_panel_thickness_mm: 16 });
  const [line] = fillerPanelLinesForCabinet(item, [item], "Kitchen", ROOM, [item]);
  assert.equal(line.colour, "Charcoal");
  assert.equal(line.thickness, "16mm");
  assert.equal(slotColourFields(item, "filler").colour, "Charcoal", "and drawn that colour");
});

test("a finished back is drawn in the finished-panel colour it is cut from", () => {
  assert.equal(slotColourFields(cab({ has_back_panel: true }), "back").colour, "Charcoal");
});

test("a side filler follows its own end, then the finished panels", () => {
  const item = cab({ side_filler_left: true, side_filler_left_width_mm: 50, side_filler_right: true, side_filler_right_width_mm: 40,
    end_right_style: board("Walnut") });
  const lines = sideFillerLinesForCabinet(item, "Kitchen", ROOM, [item]);
  assert.equal(lines.find((l) => /Left/.test(l.product_name)).colour, "Charcoal");
  assert.equal(lines.find((l) => /Right/.test(l.product_name)).colour, "Walnut");
});

test("drawer fronts follow the doors' edges until they are given their own", () => {
  const base = cab({ item_type: "base_cabinet", height_mm: 720, front_type: "drawers",
    drawer_config: { heights_mm: [720] }, drawer_style: board("Oak"), banded_edges: ["Top", "Bottom"] });
  assert.deepEqual(itemDrawerBandedEdges(base), ["Top", "Bottom"]);
  assert.deepEqual(drawerLinesForCabinet(base, "Kitchen")[0].banded_edges, ["Top", "Bottom"]);

  const own = { ...base, drawer_banded_edges: ["Left", "Right"] };
  assert.deepEqual(drawerLinesForCabinet(own, "Kitchen")[0].banded_edges, ["Left", "Right"]);
  const doors = { ...own, front_type: "doors" };
  assert.deepEqual(doorLinesForCabinet(doors, "Kitchen")[0].banded_edges, ["Top", "Bottom"], "the doors keep theirs");
});
