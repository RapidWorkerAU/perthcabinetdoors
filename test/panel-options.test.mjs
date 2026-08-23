// Per-panel reach and profile.
//
// Each applied panel decides for itself whether it runs to the floor or the
// ceiling — the exposed left end goes to the floor while the right end dies
// into a dishwasher. Panels with no answer of their own fall back to the old
// cabinet-wide flags, which is what keeps every design drawn before this
// rendering and pricing exactly as it did.
import test from "node:test";
import assert from "node:assert/strict";
import {
  enabledPanels,
  panelReach,
  panelProfile,
  panelFrontProfile,
  panelTakesFrontProfile,
  withPanelOption,
  panelNeedsKickboard,
  panelDef,
} from "../lib/pcd-panel-options.js";
import { finishPanelVerticalSpanMm } from "../lib/pcd-finishpanel-utils.js";

const ROOM_H = 2400;

// 720 high on a 150 kickboard: the carcass runs 150 to 870.
const base = (over = {}) => ({
  item_type: "base_cabinet",
  width_mm: 600, height_mm: 720, depth_mm: 600,
  kickboard_height_mm: 150, has_kickboard: true,
  carcass_thickness_mm: 16,
  finish_panel_style: { thickness_mm: 18 },
  end_panel_left: true, end_panel_right: true, has_back_panel: true,
  ...over,
});

test("with nothing set, every panel follows the cabinet-wide flags", () => {
  const item = base({ panel_to_floor: true });
  for (const key of ["end_left", "end_right", "back"]) {
    assert.equal(panelReach(item, key).toFloor, true, key);
    assert.equal(finishPanelVerticalSpanMm(item, ROOM_H, key).bottomMm, 0, key);
  }
});

test("one end can run to the floor while the other stops at the carcass", () => {
  const item = base({ panel_options: { end_left: { to_floor: true } } });
  assert.equal(finishPanelVerticalSpanMm(item, ROOM_H, "end_left").bottomMm, 0);
  assert.equal(finishPanelVerticalSpanMm(item, ROOM_H, "end_right").bottomMm, 150);
});

test("a panel can opt OUT of a cabinet-wide flag", () => {
  // The cabinet says every panel runs to the floor; this one says no. An
  // explicit false has to beat the inherited true, otherwise the per-panel
  // control could only ever add reach, never take it away.
  const item = base({ panel_to_floor: true, panel_options: { end_right: { to_floor: false } } });
  assert.equal(panelReach(item, "end_left").toFloor, true);
  assert.equal(panelReach(item, "end_right").toFloor, false);
  assert.equal(finishPanelVerticalSpanMm(item, ROOM_H, "end_right").bottomMm, 150);
});

test("floor and ceiling are independent per panel", () => {
  const item = base({
    panel_options: {
      end_left: { to_floor: true },
      end_right: { to_ceiling: true },
    },
  });
  const left = finishPanelVerticalSpanMm(item, ROOM_H, "end_left");
  const right = finishPanelVerticalSpanMm(item, ROOM_H, "end_right");
  assert.equal(left.bottomMm, 0);
  assert.equal(left.topMm, 870);
  assert.equal(right.bottomMm, 150);
  assert.equal(right.topMm, ROOM_H);
});

test("naming no panel gives the cabinet-wide answer", () => {
  // Callers that don't know which panel they are measuring keep working.
  const item = base({ panel_to_ceiling: true, panel_options: { end_left: { to_ceiling: false } } });
  assert.equal(finishPanelVerticalSpanMm(item, ROOM_H).topMm, ROOM_H);
  assert.equal(finishPanelVerticalSpanMm(item, ROOM_H, "end_left").topMm, 870);
});

test("only the panels that stop short need a kickboard piece behind them", () => {
  const item = base({ panel_options: { end_left: { to_floor: true } } });
  assert.equal(panelNeedsKickboard(item, "end_left"), false);
  assert.equal(panelNeedsKickboard(item, "end_right"), true);
  // No kickboard on the cabinet at all means no pieces either way.
  assert.equal(panelNeedsKickboard(base({ has_kickboard: false }), "end_right"), false);
});

test("the menu lists exactly the panels that are switched on", () => {
  const keys = (item) => enabledPanels(item).map((d) => d.key);
  assert.deepEqual(keys(base()), ["end_left", "end_right", "back", "kickboard"]);
  assert.deepEqual(keys(base({ end_panel_right: false, has_back_panel: false })), ["end_left", "kickboard"]);
  // A wall cabinet can't have a kickboard or a finished back, so neither is offered.
  assert.deepEqual(
    keys({ item_type: "wall_cabinet", end_panel_left: true, has_back_panel: true, has_kickboard: true, has_top_panel: true }),
    ["end_left", "top"]
  );
});

test("panel labels name the side, and the wall on a corner", () => {
  const label = (item, key) => enabledPanels(item).find((d) => d.key === key)?.label;
  assert.equal(label(base(), "end_left"), "Left end panel");
  assert.equal(label({ item_type: "wall_cabinet", end_panel_left: true }, "end_left"), "Left side panel");
  assert.equal(
    label({ item_type: "corner_base_cabinet", wall: "top", secondary_wall: "left", end_panel_left: true }, "end_left"),
    "Wall 1 end panel (top)"
  );
});

test("writing one panel's setting leaves the others alone", () => {
  const item = base({ panel_options: { end_left: { to_floor: true } } });
  const next = withPanelOption(item, "end_right", { to_ceiling: true });
  assert.deepEqual(next, { end_left: { to_floor: true }, end_right: { to_ceiling: true } });
});

test("clearing a panel's last setting drops it back to inheriting", () => {
  // An empty entry would read as "this panel has answers" forever, so it goes.
  const item = base({ panel_options: { end_left: { profile_type: "Shaker" } } });
  assert.deepEqual(withPanelOption(item, "end_left", { profile_type: "" }), {});
  // But an explicit false is an answer, not a blank, and must survive.
  const off = withPanelOption(base({ panel_to_floor: true }), "end_left", { to_floor: false });
  assert.deepEqual(off, { end_left: { to_floor: false } });
});

test("the profile is per panel, so two ends off one board can differ", () => {
  const item = base({ panel_options: { end_left: { profile_type: "Shaker", profile: "Shaker 60" } } });
  assert.deepEqual(panelProfile(item, "end_left"), { profile_type: "Shaker", profile: "Shaker 60" });
  assert.deepEqual(panelProfile(item, "end_right"), { profile_type: "", profile: "" });
});

test("a kickboard and a filler have no reach to set", () => {
  // They already sit on the floor and run to the ceiling respectively, so the
  // window shows them a profile and their sizes but no floor/ceiling ticks.
  assert.equal(panelDef("kickboard").vertical, false);
  assert.equal(panelDef("filler").vertical, false);
  assert.equal(panelDef("top").vertical, false);
  assert.equal(panelDef("underside").vertical, false);
  assert.equal(panelDef("end_left").vertical, true);
  assert.equal(panelDef("back").vertical, true);
});

test("the visual 3D profile is separate from the routed one", () => {
  // Two different jobs: the routed profile names a real library profile and
  // reaches the quote and the cut list; the 3D one is a drawing choice and
  // reaches nothing else. A panel can carry one, the other, both or neither.
  const item = base({
    panel_options: {
      end_left:  { profile_type: "Shaker", profile: "Shaker 60" },
      end_right: { front_profile: "vj" },
      back:      { profile_type: "Bevel", profile: "Bevel 20", front_profile: "shaker" },
    },
  });

  assert.equal(panelProfile(item, "end_left").profile, "Shaker 60");
  assert.equal(panelFrontProfile(item, "end_left"), "slab", "routed only, nothing drawn");

  assert.equal(panelProfile(item, "end_right").profile, "", "drawn only, nothing routed");
  assert.equal(panelFrontProfile(item, "end_right"), "vj");

  assert.equal(panelProfile(item, "back").profile, "Bevel 20", "both, and they disagree on purpose");
  assert.equal(panelFrontProfile(item, "back"), "shaker");
});

test("a panel nobody shaped is drawn as a slab", () => {
  assert.equal(panelFrontProfile(base(), "end_left"), "slab");
  assert.equal(panelFrontProfile(base({ panel_options: {} }), "back"), "slab");
});

test("only panels with an upright face can be shaped", () => {
  // A top or an underside panel lies flat, so there is no face for a shaker
  // rail or a VJ groove to be cut into and the control isn't offered.
  for (const k of ["end_left", "end_right", "back", "kickboard", "filler", "side_filler_left"]) {
    assert.equal(panelTakesFrontProfile(k), true, k);
  }
  assert.equal(panelTakesFrontProfile("top"), false);
  assert.equal(panelTakesFrontProfile("underside"), false);
  assert.equal(panelTakesFrontProfile("nonsense"), false);
});
