// What the PUBLIC design tool lets someone configure, and what it decides for
// them.
//
// The public tool is not a smaller copy of the admin one. Some things a
// customer should never be asked (the carcass), some they should be offered but
// warned about (a benchtop, which we do not supply), and some are defaults they
// may change (the shelves). Those rules live here rather than being spelled out
// at each call site, so the planner, the submitted request and any test all
// agree on them.

import { ROOM_REFERENCE_TYPES } from "./pcd-design-parts";
import { isCornerType } from "./pcd-kickboard-utils";

// ---- The carcass ----
//
// Never configured by a customer. Every cabinet we make is built from the same
// 18mm carcass board in our standard white texture, and offering that as a
// choice only invites someone to pick something we then have to talk them out
// of. It is still SHOWN on the drawing, and staff can still change it in the
// admin tool; it is just not a question the public tool asks.
export const PUBLIC_CARCASS_THICKNESS_MM = 18;

// ---- Shelves ----
//
// Default to the same board as the carcass, because that is what they are
// normally made from, but this one IS the customer's to change: shelves are
// visible in an open cabinet and people do want them to match the fronts.
export const PUBLIC_SHELF_THICKNESS_MM = 18;

// ---- The benchtop ----
//
// We don't supply benchtops. It stays in the tool because a kitchen drawn
// without one reads wrong and people plan around it, but every place it appears
// has to say so, or we get asked to quote for one.
export const BENCHTOP_NOT_SUPPLIED =
  "We don't supply benchtops. This one is here so your kitchen looks right while you plan it, and it is never quoted or made.";
export const BENCHTOP_NOT_SUPPLIED_SHORT = "Drawing only — we don't supply benchtops";

// Item types that ARE a board rather than a box: the thing itself is the
// product, so its own material/finish/colour is the customer's choice and the
// carcass rule does not apply to them.
// A bookcase belongs here too: it is an open box, so the carcass IS the face
// you look at and the thing being bought. Forcing it to carcass white would
// overwrite the one finish that cabinet is chosen for.
const BODY_IS_THE_PRODUCT = new Set(["panel", "floating_shelf", "shelf", "shelf_rail", "bookcase"]);

export function bodyIsTheProduct(item) {
  return BODY_IS_THE_PRODUCT.has(item?.item_type);
}

// Whether the customer may pick this item's own carcass colour. False for every
// cabinet — that is the carcass rule — and true for the standalone boards,
// where "body" means the board they are actually buying.
export function carcassIsConfigurable(item) {
  if (!item) return false;
  return bodyIsTheProduct(item);
}

// The carcass fields every cabinet is created with. Applied on add and on load,
// so a design drawn before this rule existed is brought into line rather than
// keeping whatever it had.
export function publicCarcassPatch(carcassDefault) {
  const d = carcassDefault || {};
  return {
    carcass_thickness_mm: PUBLIC_CARCASS_THICKNESS_MM,
    material: d.material || "decorative board",
    finish: d.finish || "Matt",
    colour: d.colour || "Carcass",
  };
}

// Shelves start as the carcass board. Only fills blanks, so a customer who has
// already chosen a shelf colour keeps it.
export function publicShelfDefaults(item, carcassDefault) {
  const d = carcassDefault || {};
  const patch = {};
  if (!item?.shelf_thickness_mm) patch.shelf_thickness_mm = PUBLIC_SHELF_THICKNESS_MM;
  if (!item?.shelf_material) patch.shelf_material = d.material || "decorative board";
  if (!item?.shelf_finish) patch.shelf_finish = d.finish || "Matt";
  if (!item?.shelf_colour) patch.shelf_colour = d.colour || "Carcass";
  return patch;
}

// Everything the public tool decides for a cabinet the moment it is added, in
// one call. Returns only the fields that need setting.
export function publicItemDefaults(item, carcassDefault) {
  if (!item || bodyIsTheProduct(item) || isRoomReference(item)) return {};
  return { ...publicCarcassPatch(carcassDefault), ...publicShelfDefaults(item, carcassDefault) };
}

// A fridge space, a window, a doorway, a wall: references to what is already in
// the room. Nothing is made, so nothing is chosen. The list is
// ROOM_REFERENCE_TYPES in pcd-design-parts, not a second copy of it, because the
// two copies had already drifted apart.
export function isRoomReference(item) {
  return ROOM_REFERENCE_TYPES.has(item?.item_type);
}

// Cabinet types that can carry a benchtop, kept here so the warning and the
// toggle can never disagree about which items show it.
const BENCHTOP_TYPES = new Set(["base_cabinet", "corner_base_cabinet", "blind_corner_cabinet"]);
export function hasBenchtopOption(item) {
  return BENCHTOP_TYPES.has(item?.item_type) || (isCornerType(item) && item?.item_type !== "corner_tall_cabinet");
}
