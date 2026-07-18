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

// Whether a cabinet has door fronts (drives the filler's default match).
export function cabinetHasDoors(item) {
  return item?.front_type === "doors" || item?.front_type === "mixed" || Boolean(item?.door_style?.colour);
}

// The (material, finish, colour) for one panel slot of an item. Finishing
// pieces default to a "match" (carcass, or the door for end panels and for a
// filler on a doored cabinet) but each carries its own optional *_style
// override — set it and that piece takes its own colour instead of matching.
export function slotColourFields(item, slot) {
  const from = (obj) => ({ material: obj?.material, finish: obj?.finish, colour: obj?.colour });
  const carcass = { material: item?.material, finish: item?.finish, colour: item?.colour };
  const set = (s) => Boolean(s?.material || s?.colour);
  const styleOr = (style, fallback) => (set(style) ? from(style) : fallback);
  switch (slot) {
    case "door":   return from(item?.door_style);
    case "drawer": return from(item?.drawer_style || item?.door_style);
    // Finished END panels default to the DOOR (a finished end normally matches
    // the doors) unless overridden.
    case "endpanel":  return styleOr(item?.finish_panel_style, from(item?.door_style));
    // A filler above a wall/tall cabinet is front-facing: match the doors when
    // the cabinet has any, otherwise the carcass. Override wins either way.
    case "filler":    return styleOr(item?.filler_panel_style, cabinetHasDoors(item) ? from(item?.door_style) : carcass);
    case "kickboard": return styleOr(item?.kickboard_style, carcass);
    case "underside": return styleOr(item?.bottom_panel_style, carcass);
    case "back":      return styleOr(item?.back_panel_style, carcass);
    case "shelf":  return {
      material: item?.shelf_material || item?.material,
      finish:   item?.shelf_finish   || item?.finish,
      colour:   item?.shelf_colour   || item?.colour,
    };
    case "carcass":
    default:       return carcass;
  }
}

// The tile image URL for an item's slot, or "" when it can't be resolved.
export function resolveColourSrc(map, item, slot) {
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
