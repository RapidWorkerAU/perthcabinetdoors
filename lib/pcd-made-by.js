// WHO MAKES A PIECE: US, FROM A BOARD WE BUY (SUPPLY), OR THE SUPPLIER (MTO).
//
// One question on every board line of a quote and a variation, answered after
// the colour, because the colour decides what is possible. The Board Library
// ticks each colour supply board, made to order, or both:
//
//   thermolaminate, compact laminate   always made to order, never supply
//   decorative board                   whatever the library has ticked
//
// Only what is possible is offered. One possibility is the answer, set and not
// changeable. Where both are, a new line starts as made to order (Ashleigh,
// 21 October 2026) and can be changed.
//
// The answer decides two things, so they can never disagree:
//
//   the price   supply prices from the board rate per m2, plus edging and
//               workshop time; made to order decorative board prices from the
//               Polytec decorative board rate card, which includes the banding,
//               and thermolaminate from its own card
//   the order   supply lands as made in house, made to order as supplier made
//
// A line saved before the question existed has no answer. It reads as the way
// it was priced then: made to order for thermolaminate and compact laminate,
// supply for decorative board. So no existing quote moves.

import { normaliseMaterialKey } from "./pcd-materials";
import { normaliseOrderTypes } from "./pcd-colour-library";

export const SUPPLY = "supply";
export const MTO = "mto";

// The same words the order page plans with.
export const MADE_BY_LABELS = { [SUPPLY]: "Made in house", [MTO]: "Supplier made" };

const ALWAYS_MTO = new Set(["thermolaminate", "compact_laminate"]);
const NOT_A_BOARD = new Set(["hardware", "benchtop", "base_cabinet"]);

function productTypeKey(line = {}) {
  return String(line.product_type ?? line.productType ?? "").trim().toLowerCase();
}

/** "supply", "mto" or "" for anything else. */
export function cleanMadeBy(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === SUPPLY || v === "supply board") return SUPPLY;
  if (v === MTO || v.includes("made to order")) return MTO;
  return "";
}

/** Whether the question applies to this line at all. Cabinets are always built here. */
export function asksMadeBy(line = {}) {
  if (NOT_A_BOARD.has(productTypeKey(line))) return false;
  const key = normaliseMaterialKey(line.material);
  return key === "decorative_board" || ALWAYS_MTO.has(key);
}

/**
 * What this line can be, from its material and the colour's ticks in the
 * Board Library (`orderTypes`, the row's order_types). Supply first.
 * Empty when the question does not apply.
 */
export function madeByOptions(line = {}, orderTypes = null) {
  if (!asksMadeBy(line)) return [];
  if (ALWAYS_MTO.has(normaliseMaterialKey(line.material))) return [MTO];
  // No colour picked, or a colour the library does not know: we can always
  // buy decorative board and cut it.
  if (!orderTypes) return [SUPPLY];
  const types = normaliseOrderTypes(Array.isArray(orderTypes) ? orderTypes : { order_types: orderTypes });
  const options = [];
  if (types.some((t) => cleanMadeBy(t) === SUPPLY)) options.push(SUPPLY);
  if (types.some((t) => cleanMadeBy(t) === MTO)) options.push(MTO);
  return options.length ? options : [SUPPLY];
}

/**
 * The answer a line should carry given what is possible: its own answer if
 * that is still possible, the only possibility if there is one, otherwise made
 * to order. "" when the question does not apply.
 */
export function settleMadeBy(current, options = []) {
  if (!options.length) return "";
  const mine = cleanMadeBy(current);
  if (mine && options.includes(mine)) return mine;
  if (options.length === 1) return options[0];
  return options.includes(MTO) ? MTO : options[0];
}

/**
 * The answer a line stands on, for pricing and the order. A saved answer wins;
 * a line with none reads as the way it was always priced.
 */
export function effectiveMadeBy(line = {}) {
  if (!asksMadeBy(line)) return "";
  if (ALWAYS_MTO.has(normaliseMaterialKey(line.material))) return MTO;
  return cleanMadeBy(line.made_by ?? line.madeBy) || SUPPLY;
}

/** Decorative board the supplier makes, priced from the Polytec rate card. */
export function isMadeToOrderBoardLine(line = {}) {
  return normaliseMaterialKey(line.material) === "decorative_board" && effectiveMadeBy(line) === MTO;
}

/**
 * The order's fulfilment method for a line: in_house, supplier_ready_made, or
 * null. Only from a real answer: a decorative line saved before the question
 * existed lands as not decided, the same as it always has.
 */
export function fulfilmentForMadeBy(line = {}) {
  if (!asksMadeBy(line)) return null;
  const always = ALWAYS_MTO.has(normaliseMaterialKey(line.material));
  const made = always ? MTO : cleanMadeBy(line.made_by ?? line.madeBy);
  if (made === MTO) return "supplier_ready_made";
  if (made === SUPPLY) return "in_house";
  return null;
}

// WHAT EACH COLOUR CAN BE, for an editor. `items` is the Board Library as
// /api/colour-library?items=1 serves it. Found by the library row the picker
// recorded, and by the board's name where there is none.
const boardKey = (row) =>
  [row.material, row.thickness, row.finish, row.colour].map((v) => String(v || "").trim().toLowerCase()).join("|");

export function colourOrderTypesIndex(items = []) {
  const byId = new Map();
  const byName = new Map();
  (items || []).forEach((item) => {
    if (item.id) byId.set(item.id, item.orderTypes);
    byName.set(boardKey(item), item.orderTypes);
  });
  return { byId, byName };
}

/** The options for a line in an editor, given colourOrderTypesIndex. */
export function madeByOptionsForLine(line = {}, index = null) {
  if (!asksMadeBy(line)) return [];
  if (!String(line.colour || "").trim()) return madeByOptions(line, null);
  const types =
    (line.unit_cost_source_id && index?.byId.get(line.unit_cost_source_id)) ||
    index?.byName.get(boardKey(line)) ||
    null;
  return madeByOptions(line, types);
}
