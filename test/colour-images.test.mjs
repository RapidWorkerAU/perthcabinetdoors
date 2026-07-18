// Resolving a cabinet's stored colour selection to a colour-library tile.
//
// The design item stores only material/finish/colour NAMES; the tile image
// (src) lives in the library. These check the lookup the "show colours" toggle
// depends on, including the finish-less fallback and safe degradation.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildColourImageMap,
  resolveColourSrc,
  colourKey,
  slotColourFields,
  cabinetHasDoors,
} from "../lib/pcd-colour-images.js";

const ENTRIES = [
  {
    material: "decorative board",
    groups: [
      { label: "Matt", colours: [
        { name: "Snowdrift", src: "https://cdn/snowdrift.jpg" },
        { name: "Char Oak", src: "https://cdn/charoak.jpg" },
      ] },
      { label: "Gloss", colours: [{ name: "Snowdrift", src: "https://cdn/snowdrift-gloss.jpg" }] },
    ],
  },
  {
    material: "thermolaminate",
    groups: [{ label: "Matt", colours: [{ name: "Dune", src: "https://cdn/dune.jpg" }] }],
  },
];

test("colourKey normalises case and whitespace", () => {
  assert.equal(colourKey("Decorative Board", " Matt ", "Snowdrift"), "decorative board|matt|snowdrift");
});

test("full key resolves the exact finish's tile", () => {
  const map = buildColourImageMap(ENTRIES);
  const item = { material: "decorative board", finish: "Gloss", colour: "Snowdrift" };
  assert.equal(resolveColourSrc(map, item, "carcass"), "https://cdn/snowdrift-gloss.jpg");
});

test("a missing finish falls back to the first tile of that colour name", () => {
  const map = buildColourImageMap(ENTRIES);
  const item = { material: "decorative board", colour: "Char Oak" }; // no finish stored
  assert.equal(resolveColourSrc(map, item, "carcass"), "https://cdn/charoak.jpg");
});

test("door / drawer / shelf slots read their own style objects", () => {
  const map = buildColourImageMap(ENTRIES);
  const item = {
    material: "decorative board", finish: "Matt", colour: "Char Oak",       // carcass
    door_style:   { material: "decorative board", finish: "Matt", colour: "Snowdrift" },
    drawer_style: { material: "thermolaminate",    finish: "Matt", colour: "Dune" },
  };
  assert.equal(resolveColourSrc(map, item, "carcass"), "https://cdn/charoak.jpg");
  assert.equal(resolveColourSrc(map, item, "door"),    "https://cdn/snowdrift.jpg");
  assert.equal(resolveColourSrc(map, item, "drawer"),  "https://cdn/dune.jpg");
});

test("shelf falls back to carcass fields when no shelf-specific colour is set", () => {
  const item = { material: "thermolaminate", finish: "Matt", colour: "Dune" };
  assert.deepEqual(slotColourFields(item, "shelf"), { material: "thermolaminate", finish: "Matt", colour: "Dune" });
});

test("unresolvable selections degrade to empty string, never throw", () => {
  const map = buildColourImageMap(ENTRIES);
  assert.equal(resolveColourSrc(map, { material: "decorative board", colour: "Nonexistent" }, "carcass"), "");
  assert.equal(resolveColourSrc(map, {}, "carcass"), "");
  assert.equal(resolveColourSrc(null, { material: "x", colour: "y" }, "carcass"), "");
});

test("finishing pieces match their default part, override wins", () => {
  const carc = { material: "board", finish: "matt", colour: "White" };
  const doorItem = {
    ...carc, front_type: "doors",
    door_style: { material: "board", finish: "matt", colour: "Oak" },
  };
  // Kickboard / underside / back default to the carcass.
  assert.equal(slotColourFields(doorItem, "kickboard").colour, "White");
  assert.equal(slotColourFields(doorItem, "underside").colour, "White");
  assert.equal(slotColourFields(doorItem, "back").colour, "White");
  // Filler on a doored cabinet matches the doors; on a doorless one, the carcass.
  assert.equal(slotColourFields(doorItem, "filler").colour, "Oak");
  const drawerItem = { ...carc, front_type: "drawers", drawer_style: { colour: "Grey" } };
  assert.equal(cabinetHasDoors(drawerItem), false);
  assert.equal(slotColourFields(drawerItem, "filler").colour, "White");
  // An explicit override beats the match on any piece.
  const overridden = { ...doorItem, kickboard_style: { material: "board", finish: "matt", colour: "Black" } };
  assert.equal(slotColourFields(overridden, "kickboard").colour, "Black");
  // End panels default to the door, or their own finish_panel_style.
  assert.equal(slotColourFields(doorItem, "endpanel").colour, "Oak");
  assert.equal(slotColourFields({ ...doorItem, finish_panel_style: { colour: "Charcoal", material: "board" } }, "endpanel").colour, "Charcoal");
});

test("colours without a src are skipped, not mapped to undefined", () => {
  const map = buildColourImageMap([
    { material: "decorative board", groups: [{ label: "Matt", colours: [{ name: "NoImage" }] }] },
  ]);
  assert.equal(resolveColourSrc(map, { material: "decorative board", finish: "Matt", colour: "NoImage" }, "carcass"), "");
});
