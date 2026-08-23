// Resolves a cabinet's stored colour SELECTIONS to the tile images in the
// colour library, so the design views can paint panels with the real colour
// instead of the flat per-type colour.
//
// A design item stores only the colour NAME per material slot (material /
// finish / colour strings) — never the image URL. The URL (image_url, exposed
// as `src`) lives in the colour library, keyed by material → finish → name. So
// this builds a lookup from the library's per-material responses and resolves
// an item's slot (carcass / door / drawer / filler / shelf) to a tile src.
//
// Everything degrades safely: a missing map, slot, or tile returns "", and the
// caller falls back to the flat type colour.

import { ikeaCarcassSrc } from "./pcd-ikea-carcass";

const norm = (s) => String(s || "").trim().toLowerCase();

export function colourKey(material, finish, colour) {
  return `${norm(material)}|${norm(finish)}|${norm(colour)}`;
}

// Looser key for items that never stored a finish — colour names are generally
// unique within a material, so this still resolves most selections.
export function colourKeyLoose(material, colour) {
  return `${norm(material)}|${norm(colour)}`;
}

// Builds { byFull, byLoose } from the colour-library API's per-material
// responses. `entries` is [{ material, groups }] where each group is a finish
// with a `colours` array of { name, src }.
export function buildColourImageMap(entries) {
  const byFull = new Map();
  const byLoose = new Map();
  for (const { material, groups } of entries || []) {
    for (const group of groups || []) {
      for (const colour of group.colours || []) {
        if (!colour?.src) continue;
        byFull.set(colourKey(material, group.label, colour.name), colour.src);
        const loose = colourKeyLoose(material, colour.name);
        if (!byLoose.has(loose)) byLoose.set(loose, colour.src);
      }
    }
  }
  return { byFull, byLoose };
}

// The (material, finish, colour) for one panel slot of an item. Finishing
// pieces default to a "match" (carcass, or the door for end panels and for a
// filler on a doored cabinet) but each carries its own optional *_style
// override — set it and that piece takes its own colour instead of matching.
/**
 * Does this cabinet have doors on it?
 *
 * Decided by whether a door COLOUR has actually been chosen, not by front_type.
 * A mixed front carries doors in some sections and drawers in others, and a
 * cabinet whose front_type says "doors" but which has no door style picked has
 * nothing for a finished end panel to match. What matters to every caller is
 * "is there a door colour to follow", which is this.
 */
export function cabinetHasDoors(item) {
  const style = item?.door_style;
  return Boolean(style?.material || style?.colour);
}

export function slotColourFields(item, slot) {
  const from = (obj) => ({ material: obj?.material, finish: obj?.finish, colour: obj?.colour });
  const carcass = { material: item?.material, finish: item?.finish, colour: item?.colour };
  const set = (s) => Boolean(s?.material || s?.colour);
  const styleOr = (style, fallback) => (set(style) ? from(style) : fallback);
  const finishedFace = styleOr(item?.finish_panel_style, cabinetHasDoors(item) ? from(item?.door_style) : carcass);
  switch (slot) {
    case "door":   return from(item?.door_style);
    case "drawer": return from(item?.drawer_style || item?.door_style);
    // Finished END panels default to the DOOR (a finished end normally matches
    // the doors) unless overridden.
    case "endpanel":  return finishedFace;
    // The two ends are separate boards, so they resolve separately. Each falls
    // back to the shared finishing panel, which is what both did when they had
    // no board of their own.
    case "endpanel_left":  return styleOr(item?.end_left_style, finishedFace);
    case "endpanel_right": return styleOr(item?.end_right_style, finishedFace);
    // A filler above a wall/tall cabinet is a finished face on the front, so it
    // follows the finished-panel colour like the top and underside panels do.
    //
    // It used to skip straight to the doors, which meant changing "Panels" left
    // a top filler sitting in the old door colour with no way to shift it: the
    // public tool has no separate filler colour, so finish_panel_style was the
    // only control there was and this slot never read it. finishedFace still
    // falls through to the doors, and then the carcass, so a cabinet with no
    // finished panels behaves exactly as before.
    case "filler":    return styleOr(item?.filler_panel_style, finishedFace);
    case "kickboard": return styleOr(item?.kickboard_style, carcass);
    // A finished underside panel is visible finishing board, so it should match
    // the finished panel/door colour unless explicitly overridden.
    case "underside": return styleOr(item?.bottom_panel_style, finishedFace);
    case "top":       return styleOr(item?.top_panel_style, finishedFace);
    case "back":      return styleOr(item?.back_panel_style, carcass);
    case "shelf":  return {
      material: item?.shelf_material || item?.material,
      finish:   item?.shelf_finish   || item?.finish,
      colour:   item?.shelf_colour   || item?.colour,
    };
    // Benchtop VISUAL colour — design-tool only, its own library selection.
    // No default match: an unset benchtop colour resolves to "" and the views
    // fall back to the flat benchtop_colour_hex or the default grey.
    case "benchtop": return from(item?.benchtop_colour_style);
    case "carcass":
    default:       return carcass;
  }
}

// The tile image URL for a bare colour style ({material, finish, colour}), or
// "" when it can't be resolved — used to show a swatch next to a ColourField.
export function styleColourSrc(map, style) {
  if (!map || !style) return "";
  const { material, finish, colour } = style;
  if (!material || !colour) return "";
  return (
    map.byFull?.get(colourKey(material, finish, colour)) ||
    map.byLoose?.get(colourKeyLoose(material, colour)) ||
    ""
  );
}

// The tile image URL for an item's slot, or "" when it can't be resolved.
export function resolveColourSrc(map, item, slot) {
  // The carcass of a customer-owned prop is painted from its own IKEA finish,
  // not from our library. Only the box: every other slot resolves normally, so
  // a kickboard or filler on the same cabinet still takes a real colour we make.
  if (slot === "carcass" && item?.prop_carcass_finish) {
    return ikeaCarcassSrc(item.prop_carcass_finish);
  }
  if (!map) return "";
  const { material, finish, colour } = slotColourFields(item, slot);
  if (!material || !colour) return "";
  return (
    map.byFull?.get(colourKey(material, finish, colour)) ||
    map.byLoose?.get(colourKeyLoose(material, colour)) ||
    ""
  );
}

// Materials the design tool offers — fetched once to build the map.
export const COLOUR_IMAGE_MATERIALS = ["decorative board", "thermolaminate", "compact laminate"];
