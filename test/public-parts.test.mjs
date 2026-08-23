// What the public design tool decides for a customer rather than asking them.
//
// Three rules, all of which exist because a customer being asked the wrong
// question costs more than a customer not being asked at all:
//   the carcass is ours, always the same board, never offered;
//   shelves start on that board but are theirs to change;
//   a benchtop is drawn but never supplied, and every place it appears says so.
import test from "node:test";
import assert from "node:assert/strict";
import {
  PUBLIC_CARCASS_THICKNESS_MM,
  PUBLIC_SHELF_THICKNESS_MM,
  BENCHTOP_NOT_SUPPLIED,
  carcassIsConfigurable,
  bodyIsTheProduct,
  publicCarcassPatch,
  publicShelfDefaults,
  publicItemDefaults,
  isRoomReference,
} from "../lib/pcd-public-parts.js";

const CARCASS = { material: "decorative board", finish: "Matt", colour: "Carcass" };
const cab = (over = {}) => ({ item_type: "base_cabinet", ...over });

test("the carcass is never a customer's choice on a cabinet", () => {
  for (const t of ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet", "blind_corner_cabinet"]) {
    assert.equal(carcassIsConfigurable({ item_type: t }), false, t);
  }
});

test("but a board that IS the product stays the customer's choice", () => {
  // A standalone panel or a floating shelf has no carcass — the board is the
  // thing being bought, so refusing to let them pick it would be nonsense.
  for (const t of ["panel", "floating_shelf", "shelf", "shelf_rail"]) {
    assert.equal(bodyIsTheProduct({ item_type: t }), true, t);
    assert.equal(carcassIsConfigurable({ item_type: t }), true, t);
  }
});

test("every cabinet is built on the same 18mm carcass board", () => {
  const patch = publicCarcassPatch(CARCASS);
  assert.equal(patch.carcass_thickness_mm, 18);
  assert.equal(patch.material, "decorative board");
  assert.equal(patch.colour, "Carcass");
});

test("the carcass is enforced, not merely defaulted", () => {
  // Someone who picked a fancy carcass before this rule existed is brought back
  // to the standard board rather than keeping it. That is the point of the rule.
  const patch = publicCarcassPatch(CARCASS);
  const wandered = cab({ material: "thermolaminate", colour: "Deep Forest", carcass_thickness_mm: 16 });
  const after = { ...wandered, ...publicItemDefaults(wandered, CARCASS) };
  assert.equal(after.material, "decorative board");
  assert.equal(after.colour, "Carcass");
  assert.equal(after.carcass_thickness_mm, 18);
  assert.equal(after.carcass_thickness_mm, patch.carcass_thickness_mm);
});

test("shelves start on the carcass board", () => {
  const d = publicShelfDefaults(cab(), CARCASS);
  assert.equal(d.shelf_thickness_mm, PUBLIC_SHELF_THICKNESS_MM);
  assert.equal(d.shelf_material, "decorative board");
  assert.equal(d.shelf_colour, "Carcass");
});

test("but a shelf colour the customer chose is left alone", () => {
  // The one difference from the carcass: shelves are visible in an open
  // cabinet and people do want them to match the fronts.
  const chosen = cab({ shelf_material: "thermolaminate", shelf_finish: "Matt", shelf_colour: "Deep Forest", shelf_thickness_mm: 18 });
  assert.deepEqual(publicShelfDefaults(chosen, CARCASS), {});
  const after = { ...chosen, ...publicItemDefaults(chosen, CARCASS) };
  assert.equal(after.shelf_colour, "Deep Forest", "a chosen shelf colour survives");
  assert.equal(after.colour, "Carcass", "while the carcass is still forced back");
});

test("a half-chosen shelf is topped up without losing what was set", () => {
  const half = cab({ shelf_colour: "Ecru Oak" });
  const d = publicShelfDefaults(half, CARCASS);
  assert.equal(d.shelf_colour, undefined, "the chosen colour is not overwritten");
  assert.equal(d.shelf_thickness_mm, 18, "the missing thickness is filled");
});

test("room references are left completely alone", () => {
  // A fridge space, a window, a doorway: nothing is made, so nothing is set.
  for (const t of ["appliance", "window", "door_opening"]) {
    assert.equal(isRoomReference({ item_type: t }), true, t);
    assert.deepEqual(publicItemDefaults({ item_type: t }, CARCASS), {}, t);
  }
});

test("standalone boards are not given a carcass either", () => {
  assert.deepEqual(publicItemDefaults({ item_type: "panel" }, CARCASS), {});
  assert.deepEqual(publicItemDefaults({ item_type: "floating_shelf" }, CARCASS), {});
});

test("the benchtop warning actually says we do not supply them", () => {
  // Weak wording here is how someone ends up expecting a benchtop, so the
  // sentence is pinned rather than left to whoever edits the copy next.
  assert.match(BENCHTOP_NOT_SUPPLIED, /don't supply benchtops/i);
  assert.match(BENCHTOP_NOT_SUPPLIED, /never quoted or made/i);
});

test("a missing carcass default still produces a usable board", () => {
  // The colour library is fetched at runtime, so the patch has to stand up
  // before it arrives rather than writing blanks onto every cabinet.
  const patch = publicCarcassPatch(null);
  assert.ok(patch.material && patch.finish && patch.colour);
  assert.equal(patch.carcass_thickness_mm, 18);
});

test("a bookcase keeps its own board, because the box IS the product", () => {
  // An open bookcase is bought for the finish you can see, which is the
  // carcass. Forcing it to carcass white would overwrite the one choice that
  // cabinet exists for — and the panel still offers it, so the rule and the UI
  // would have disagreed.
  assert.equal(bodyIsTheProduct({ item_type: "bookcase" }), true);
  assert.equal(carcassIsConfigurable({ item_type: "bookcase" }), true);
  const chosen = { item_type: "bookcase", material: "decorative board", finish: "Woodmatt", colour: "Ecru Oak", carcass_thickness_mm: 18 };
  assert.deepEqual(publicItemDefaults(chosen, CARCASS), {}, "left completely alone");
});
