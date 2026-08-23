// What a public visitor is allowed to save on an item.
//
// The style blobs and panel_options are jsonb, so whatever arrives in one is
// stored verbatim unless it is filtered. That makes them the way around the
// forbidden-field list: the design importer reads style.cost_per_sqm, so a
// hand-rolled POST could otherwise set the rate its own design is later quoted
// at. Everything a visitor may set is therefore listed rather than blocked.
//
// The bug these tests were written for: profile_type and profile were not on
// the allowed list, so choosing a profile in the public tool PATCHed, returned
// 200 and saved nothing. Silent, because a stripped field looks exactly like a
// successful save from the client's side.
import test from "node:test";
import assert from "node:assert/strict";
import { stripForbiddenItemFields } from "../lib/pcd-public-design.js";
import { buildItemPatch } from "../lib/pcd-design-item-io.js";

test("a chosen profile survives all the way to the row", () => {
  const patch = buildItemPatch(stripForbiddenItemFields({
    door_style: { material: "thermolaminate", thickness_mm: 18, colour: "Deep Forest", profile_type: "Minimal", profile: "Hamilton" },
  }));
  assert.equal(patch.door_style.profile_type, "Minimal");
  assert.equal(patch.door_style.profile, "Hamilton");
  assert.equal(patch.door_style.colour, "Deep Forest");
});

test("a chosen edge mould survives too", () => {
  const clean = stripForbiddenItemFields({ door_style: { material: "thermolaminate", edge_mould: "EM1 6mm Pencil Round" } });
  assert.equal(clean.door_style.edge_mould, "EM1 6mm Pencil Round");
});

test("a price hidden in a style blob is still dropped", () => {
  // The reason the list exists. Adding the profile fields must not have opened
  // the door the list was built to shut.
  const clean = stripForbiddenItemFields({
    door_style: { material: "thermolaminate", colour: "Deep Forest", cost_per_sqm: 1, unit_cost_per_sqm_ex_gst: 2, profile: "Hamilton" },
  });
  assert.equal(clean.door_style.cost_per_sqm, undefined);
  assert.equal(clean.door_style.unit_cost_per_sqm_ex_gst, undefined);
  assert.equal(clean.door_style.profile, "Hamilton", "while the legitimate field is kept");
});

test("EVERY style column is cleaned, not just the ones that existed first", () => {
  // A column missing from the list is not cleaned at all, which is the opposite
  // of the intent. The two end-panel styles and the filler and top were added
  // later and were being passed through raw.
  const columns = [
    "door_style", "drawer_style", "finish_panel_style", "back_panel_style",
    "bottom_panel_style", "top_panel_style", "kickboard_style", "filler_panel_style",
    "end_left_style", "end_right_style", "benchtop_colour_style",
  ];
  for (const col of columns) {
    const clean = stripForbiddenItemFields({ [col]: { colour: "White", cost_per_sqm: 99 } });
    assert.equal(clean[col].cost_per_sqm, undefined, `${col} was not cleaned`);
    assert.equal(clean[col].colour, "White", `${col} lost a legitimate field`);
  }
});

test("panel_options keeps known panels and known fields only", () => {
  const clean = stripForbiddenItemFields({
    panel_options: {
      end_left: { to_floor: true, profile_type: "Minimal", profile: "Hamilton" },
      nonsense_panel: { to_floor: true },
      back: { to_ceiling: true, cost_per_sqm: 99, anything: "else" },
    },
  });
  assert.deepEqual(clean.panel_options.end_left, { to_floor: true, profile_type: "Minimal", profile: "Hamilton" });
  assert.equal(clean.panel_options.nonsense_panel, undefined, "an invented panel is dropped");
  assert.deepEqual(clean.panel_options.back, { to_ceiling: true }, "unknown fields inside a known panel are dropped");
});

test("panel_options reach is coerced to a real boolean", () => {
  // It decides a panel's height in the quote, so "yes" must not read as true
  // in one place and as a string somewhere else.
  const clean = stripForbiddenItemFields({ panel_options: { end_left: { to_floor: "yes", to_ceiling: 0 } } });
  assert.strictEqual(clean.panel_options.end_left.to_floor, true);
  assert.strictEqual(clean.panel_options.end_left.to_ceiling, false);
});

test("junk in panel_options becomes an empty map rather than being stored", () => {
  assert.deepEqual(stripForbiddenItemFields({ panel_options: "nope" }).panel_options, {});
  assert.deepEqual(stripForbiddenItemFields({ panel_options: [1, 2] }).panel_options, {});
  assert.deepEqual(stripForbiddenItemFields({ panel_options: { end_left: "nope" } }).panel_options, {});
});

test("the forbidden top-level fields are still forbidden", () => {
  const clean = stripForbiddenItemFields({
    cost_per_sqm_carcass: 10, unit_cost_per_sqm_ex_gst: 20, handle_cost_ex_gst: 30, width_mm: 600,
  });
  assert.equal(clean.cost_per_sqm_carcass, undefined);
  assert.equal(clean.unit_cost_per_sqm_ex_gst, undefined);
  assert.equal(clean.handle_cost_ex_gst, undefined);
  assert.equal(clean.width_mm, 600, "an ordinary field is untouched");
});
