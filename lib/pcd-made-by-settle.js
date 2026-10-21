// MADE IN HOUSE OR SUPPLIER MADE, SETTLED ON THE SERVER FOR EVERY LINE WRITTEN.
//
// The editors settle it as a person picks the colour, but a line also arrives
// from a design import, the Excel order form, a new quote, a variation, and
// any route added later. Every one of them goes through this, so a board line
// is answered the same way whoever or whatever wrote it:
//
//   a new line, or one whose board has just changed, takes the library's
//   answer: the only way the colour is made, otherwise supplier made
//   an answer that is still possible is kept, one that is not is corrected
//   a line saved before the question existed, with its board unchanged, is
//   left exactly as it is, so no existing price moves
//
// The price follows the answer. Supplier made decorative board is priced from
// the Polytec decorative board rate card, at the card's margin when it has just
// become supplier made and its markup was only the default. A line with a typed
// price keeps it. See lib/pcd-made-by.js.

import { asksMadeBy, cleanMadeBy, isMadeToOrderBoardLine, madeByOptions, settleMadeBy } from "./pcd-made-by";
import { matchBoardCost } from "./pcd-board-cost";
import { withMadeToOrderBoardPrice } from "./pcd-polytec-board-pricing";
import { roundMoney } from "./pcd-money";

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

function sameBoard(before, line) {
  return ["material", "thickness", "finish", "colour", "supplier_name"].every((field) => same(before?.[field], line?.[field]));
}

function blankMarkup(value, defaultMarkup) {
  return value === "" || value === null || value === undefined || Number(value) === Number(defaultMarkup);
}

/**
 * @param {object} line  the line as it is about to be written
 * @param {object} options
 *   colourRows     active pcd_colour_library rows (the line gate has them)
 *   boardCard      the Polytec decorative board rate card, cleaned, or null
 *   before         the line as it is stored now, or null for a new line
 *   defaultMarkup  the business default markup
 */
export function settleLineMadeBy(line = {}, { colourRows = [], boardCard = null, before = null, defaultMarkup = null } = {}) {
  if (!asksMadeBy(line) || line.product_type === "base_cabinet") return line;
  if (!String(line.colour || "").trim()) return { ...line, made_by: cleanMadeBy(line.made_by) };

  // Saved before the question existed and the board has not changed: as it was.
  if (before && !cleanMadeBy(before.made_by) && !cleanMadeBy(line.made_by) && sameBoard(before, line)) return line;

  const match = matchBoardCost(colourRows, {
    colourLibraryId: line.unit_cost_source_id || line.colour_library_id || null,
    material: line.material,
    thickness: line.thickness,
    finish: line.finish,
    colour: line.colour,
    supplier: line.supplier_name,
  });
  const options = madeByOptions(line, match?.ok ? match.orderTypes : null);
  const next = { ...line, made_by: settleMadeBy(line.made_by, options) };

  const wasMto = before ? isMadeToOrderBoardLine(before) : false;
  const isMto = isMadeToOrderBoardLine(next);
  const auto = next.unit_cost_mode === "auto" || !(Number(next.product_unit_cost_ex_gst) > 0);

  if (isMto) {
    if (boardCard && !wasMto && blankMarkup(line.markup_percent, defaultMarkup)) next.markup_percent = boardCard.margin_percent;
    return boardCard ? withMadeToOrderBoardPrice(next, boardCard, { forceAuto: auto && Number(next.unit_cost_per_sqm_ex_gst) > 0 }) : next;
  }

  // Answered supplier made by whoever sent it and corrected to made in house
  // here: back to the board rate for its area, and the usual markup.
  if (isMadeToOrderBoardLine(line) && auto) {
    const area = (Number(next.width_mm) || 0) * (Number(next.height_mm) || 0) / 1000000;
    const rate = Number(next.unit_cost_per_sqm_ex_gst) || 0;
    if (area > 0 && rate > 0) {
      next.calculated_unit_cost_ex_gst = roundMoney(area * rate);
      next.product_unit_cost_ex_gst = next.calculated_unit_cost_ex_gst;
      next.unit_cost_mode = "auto";
    }
    if (boardCard && Number(next.markup_percent) === Number(boardCard.margin_percent) && defaultMarkup !== null) {
      next.markup_percent = defaultMarkup;
    }
  }
  return next;
}

/**
 * The same, for a route writing many lines at once: one read of the colour
 * library, the rate card and the business defaults, then `settle(line, before)`
 * for each line. Server only.
 */
export async function createMadeBySettler(supabase) {
  const [{ getDatabaseColourRows }, { getPolytecBoardCard }, { getBusinessDefaults }] = await Promise.all([
    import("./pcd-colour-library"),
    import("./pcd-polytec-board-pricing-store"),
    import("./pcd-business-defaults"),
  ]);
  const [colourRows, { card: boardCard }, defaults] = await Promise.all([
    getDatabaseColourRows(supabase, { activeOnly: true }),
    getPolytecBoardCard(supabase),
    getBusinessDefaults(supabase),
  ]);
  return (line, before = null) =>
    settleLineMadeBy(line, { colourRows, boardCard, before, defaultMarkup: defaults?.markup_percent ?? null });
}
