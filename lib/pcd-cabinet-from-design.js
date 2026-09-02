// A DESIGN ITEM'S CABINET, in the shape the quote understands.
//
// WHY THIS EXISTS. A cabinet is not priced like a board. It has a cut list, and
// that cut list is worked out from the box: height, width, depth, carcass
// thickness, whether there is a back, how many shelves and where they sit. All
// of that lives on the design item, and the quote keeps it in a cabinet config
// row attached to the line.
//
// There are two ways a design becomes a quote and until now only one of them
// carried the box:
//
//   * We draw it, then Import to quote. The importer built the config, ran the
//     cut list and the cabinet arrived costed.
//   * The customer draws it on the website and sends it. The request builder
//     wrote the size into a SENTENCE in the notes and dropped everything else,
//     and the conversion had no cabinet handling at all. So the cabinet landed
//     with no height, no width, no depth and no shelves, and whoever opened the
//     configurator got its built-in starting values (720 high x 900 wide x 560
//     deep, no shelves) with no sign that anything had been lost. On one real
//     quote that was three cabinets re-entered by hand from the description.
//
// Two paths, two answers, from the same drawing. So the box is built HERE now,
// once, and both paths call it. Neither can drift from the other again.
//
// Rates are deliberately NOT part of this. What a cabinet is made of is a fact
// about the drawing; what the board costs is a fact about today's colour
// library, and the two are resolved at different moments by different callers.
// Pass them in through `rates` when you have them.

import { bayShelfCount, bayShelfHeightsMm } from "./pcd-door-utils";
import { isCornerType } from "./pcd-kickboard-utils";
import { materialLabelForType } from "./pcd-colour-library";

function num(value) {
  return Number(value) || 0;
}

/**
 * The cabinet half of a design item, ready to become a pcd_cabinet_configs row.
 *
 * @param {object} item   a pcd_design_items row
 * @param {object} rates  { carcass, shelf } per m² ex GST, when they are known
 * @returns {object} the cabinet config, without its cut list
 */
export function cabinetSpecFromDesignItem(item = {}, { carcassRate = 0, shelfRate = 0 } = {}) {
  // Title Case, the same conversion every quote line gets. The design tool
  // stores materials lowercase ("decorative board") and the quote side reads
  // Title Case, so converting here keeps the config reading the same way the
  // line beside it does.
  const carcassMaterial = item.material ? materialLabelForType(item.material) : "";
  const shelfMaterial = item.shelf_material ? materialLabelForType(item.shelf_material) : carcassMaterial;

  return {
    label: item.label || null,
    is_corner: isCornerType(item),
    corner_style: item.corner_style === "diagonal" ? "diagonal" : "l_shape",
    width_mm: num(item.width_mm),
    secondary_width_mm: num(item.secondary_width_mm),
    height_mm: num(item.height_mm),
    depth_mm: num(item.depth_mm),
    carcass_material: carcassMaterial,
    carcass_finish: item.finish || "",
    carcass_colour: item.colour || "",
    carcass_thickness_mm: item.carcass_thickness_mm ?? 16,
    back_panel_included: item.back_panel_included ?? true,
    back_panel_material: carcassMaterial,
    back_panel_thickness_mm: item.back_panel_thickness_mm ?? 16,
    // Shelves sitting inside an OPEN bay of a mixed front count too. The cabinet
    // cost is driven off shelf_qty, so leaving them out drew and cut shelves the
    // quote never charged for.
    shelf_qty: num(item.shelf_qty) + bayShelfCount(item),
    shelf_material: shelfMaterial,
    shelf_finish: item.shelf_finish || item.finish || "",
    shelf_colour: item.shelf_colour || item.colour || "",
    shelf_thickness_mm: item.shelf_thickness_mm ?? 16,
    shelf_heights_mm: [...(item.shelf_heights_mm || []), ...bayShelfHeightsMm(item)],
    has_rangehood: item.has_rangehood ?? false,
    rangehood_housing_height_mm: item.rangehood_housing_height_mm ?? 0,
    rangehood_channel_width_mm: item.rangehood_channel_width_mm ?? 0,
    mount_height_mm: item.mount_height_mm ?? null,
    cost_per_sqm_carcass: num(carcassRate),
    cost_per_sqm_shelf: num(shelfRate) || num(carcassRate),
    notes: item.notes || "",
  };
}

/**
 * The one-line spec that becomes a cabinet line's description, and the subtitle
 * the Cabinets tab shows under a cabinet waiting to be configured.
 *
 * Height first, then width, then depth, the way every size is written here.
 */
export function cabinetDescription(config = {}) {
  const shelfQty = num(config.shelf_qty);
  const shelfText = shelfQty > 0 ? `, ${shelfQty} ${shelfQty === 1 ? "shelf" : "shelves"}` : "";
  const widthText =
    config.is_corner && num(config.secondary_width_mm) > 0
      ? `${config.width_mm}mm x ${config.secondary_width_mm}mm corner`
      : `${config.width_mm}mm wide`;
  return `${config.height_mm}mm high x ${widthText} x ${config.depth_mm}mm deep - ${config.carcass_material || "cabinet board"} ${config.carcass_thickness_mm}mm carcass${shelfText}`;
}
