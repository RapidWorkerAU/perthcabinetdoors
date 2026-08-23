// A colour picked in the design tool, turned into the flat columns a cabinet's
// carcass and shelves are stored in.
//
// WHY THIS EXISTS. A cabinet's fronts and panels keep their board in a JSON
// column (door_style, kickboard_style and so on), so whatever the colour picker
// hands back is stored whole. The carcass and the shelves are older: they live
// in separate flat columns, so every place that sets one has to spell the
// mapping out. There are six of those places in DesignRightPanel alone, and
// they were six copies of the same six lines.
//
// That mattered when the picker started handing back WHICH library row was
// chosen, not just its name. A colour name is not unique across suppliers, so
// without the row's id a carcass can only be matched back to the library by
// name, and two brands stocking the same colour at different prices cannot be
// told apart. Adding that to six copies by hand is how five of them end up with
// it and one does not.

/**
 * @param {object} style   what ColourPickerModal handed back
 * @param {object} current the item as it stands, for the values to fall back to
 * @param {number} thicknessDefault what this item type is normally cut from
 */
export function carcassColumnsFromStyle(style, current = {}, thicknessDefault = 16) {
  const s = style || {};
  return {
    material: s.material || "",
    finish: s.finish || "",
    colour: s.colour || "",
    carcass_thickness_mm: s.thickness_mm || current.carcass_thickness_mm || thicknessDefault,
    cost_per_sqm_carcass: s.cost_per_sqm ?? current.cost_per_sqm_carcass ?? 0,
    // Which library row it is, and whose board it is. Null rather than left
    // alone: clearing the colour has to clear these too, or the next price
    // lookup matches the board that used to be on here.
    colour_library_id: s.colour_library_id || null,
    supplier_name: s.supplier || null,
  };
}

export function shelfColumnsFromStyle(style, current = {}, thicknessDefault = 16) {
  const s = style || {};
  return {
    shelf_material: s.material || "",
    shelf_finish: s.finish || "",
    shelf_colour: s.colour || "",
    shelf_thickness_mm: s.thickness_mm || current.shelf_thickness_mm || thicknessDefault,
    cost_per_sqm_shelf: s.cost_per_sqm ?? current.cost_per_sqm_shelf ?? 0,
    shelf_colour_library_id: s.colour_library_id || null,
    shelf_supplier_name: s.supplier || null,
  };
}
