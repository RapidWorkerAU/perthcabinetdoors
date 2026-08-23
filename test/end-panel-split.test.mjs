// A cabinet's two end panels are two separate boards.
//
// They shared one finish_panel_style, so they could differ in how far they ran
// but never in what they were made of. That is not how a kitchen is built, and
// it mattered downstream too: two ends on different boards are two different
// quote lines, and with one shared style there was no way for them to arrive as
// anything but one.
import test from "node:test";
import assert from "node:assert/strict";
import { finishPanelBoard, panelBoardFields } from "../lib/pcd-panel-board.js";
import { panelDef } from "../lib/pcd-panel-options.js";
import { slotColourFields } from "../lib/pcd-colour-images.js";

const cab = (over = {}) => ({
  item_type: "base_cabinet",
  width_mm: 900, height_mm: 720, depth_mm: 600,
  material: "melamine", finish: "Matt", colour: "White", carcass_thickness_mm: 16, cost_per_sqm_carcass: 40,
  end_panel_left: true, end_panel_right: true,
  door_style: { material: "decorative board", finish: "Woodmatt", colour: "Ecru Oak", thickness_mm: 18, cost_per_sqm: 90 },
  ...over,
});

test("each end names its own style", () => {
  assert.equal(panelDef("end_left").styleKey, "end_left_style");
  assert.equal(panelDef("end_right").styleKey, "end_right_style");
  assert.notEqual(panelDef("end_left").styleKey, panelDef("end_right").styleKey);
});

test("with neither side set, both ends follow the finishing panel", () => {
  // The old behaviour, which every design drawn before the split relies on.
  const item = cab({ finish_panel_style: { material: "decorative board", colour: "Notaio Walnut", thickness_mm: 18, cost_per_sqm: 105 } });
  const left = finishPanelBoard(item, "end_left_style", "end_left");
  const right = finishPanelBoard(item, "end_right_style", "end_right");
  assert.equal(left.colour, "Notaio Walnut");
  assert.equal(right.colour, "Notaio Walnut");
  assert.equal(left.rate, 105);
});

test("the two ends can be genuinely different boards", () => {
  // The exposed end on show, and the plain end that dies into a run.
  const item = cab({
    end_left_style:  { material: "thermolaminate", finish: "Matt", colour: "Deep Forest", thickness_mm: 18, cost_per_sqm: 120 },
    end_right_style: { material: "decorative board", finish: "Matt", colour: "Classic White", thickness_mm: 18, cost_per_sqm: 70 },
  });
  const left = finishPanelBoard(item, "end_left_style", "end_left");
  const right = finishPanelBoard(item, "end_right_style", "end_right");
  assert.equal(left.material, "thermolaminate");
  assert.equal(left.colour, "Deep Forest");
  assert.equal(right.material, "decorative board");
  assert.equal(right.colour, "Classic White");
  assert.notEqual(left.rate, right.rate, "and they are priced differently");
});

test("setting one side leaves the other following the finishing panel", () => {
  const item = cab({
    finish_panel_style: { material: "decorative board", colour: "Ecru Oak", thickness_mm: 18, cost_per_sqm: 90 },
    end_left_style: { material: "thermolaminate", colour: "Deep Forest", thickness_mm: 18, cost_per_sqm: 120 },
  });
  assert.equal(finishPanelBoard(item, "end_left_style", "end_left").colour, "Deep Forest");
  assert.equal(finishPanelBoard(item, "end_right_style", "end_right").colour, "Ecru Oak");
});

test("each end carries its own profile as well as its own board", () => {
  const item = cab({
    end_left_style: { material: "thermolaminate", colour: "Deep Forest", thickness_mm: 18, cost_per_sqm: 120 },
    panel_options: { end_left: { profile_type: "Detailed", profile: "Hampton" } },
  });
  const left = panelBoardFields(finishPanelBoard(item, "end_left_style", "end_left"));
  const right = panelBoardFields(finishPanelBoard(item, "end_right_style", "end_right"));
  assert.equal(left.profile, "Hampton");
  assert.equal(right.profile, "", "the other end is not dragged along with it");
});

test("the drawing resolves each end separately too", () => {
  // The views read colour through slotColourFields, so a split that only
  // reached the quote would show two ends the same colour on screen and two
  // different ones on the invoice.
  const item = cab({
    finish_panel_style: { material: "decorative board", colour: "Ecru Oak" },
    end_left_style: { material: "thermolaminate", colour: "Deep Forest" },
  });
  assert.equal(slotColourFields(item, "endpanel_left").colour, "Deep Forest");
  assert.equal(slotColourFields(item, "endpanel_right").colour, "Ecru Oak");
  // The old shared slot still answers, so anything not yet split keeps working.
  assert.equal(slotColourFields(item, "endpanel").colour, "Ecru Oak");
});

test("a blank side override is not treated as a choice", () => {
  // An empty object left on an item must not strand that end with no board.
  const item = cab({
    finish_panel_style: { material: "decorative board", colour: "Ecru Oak", thickness_mm: 18, cost_per_sqm: 90 },
    end_left_style: {},
  });
  assert.equal(finishPanelBoard(item, "end_left_style", "end_left").colour, "Ecru Oak");
  assert.equal(slotColourFields(item, "endpanel_left").colour, "Ecru Oak");
});
