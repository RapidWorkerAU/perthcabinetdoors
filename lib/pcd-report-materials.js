// WHAT WE ACTUALLY SELL.
//
// ── THE QUESTION IT ANSWERS ──────────────────────────────────────────────────
//
// Which colours and materials are worth holding, and how much of the work we
// make here versus buy in. Both are answered today by somebody scrolling the
// orders list and guessing.
//
// ── COUNTED IN PIECES, NOT IN LINES ──────────────────────────────────────────
//
// A line for three doors is three doors. Counting lines would rank a colour
// somebody ordered once in a batch of forty below one ordered singly four
// times, which is the opposite of a stocking answer.
//
// ── CANCELLED WORK IS NOT WORK ───────────────────────────────────────────────
//
// A cancelled order's pieces were never made, so they say nothing about what to
// hold. Variation lines that were removed go the same way.

import { toNumber } from "./pcd-quote-utils";

/** An order whose pieces were actually made, or are going to be. */
export const COUNTED_ORDER_STATUSES = ["active", "complete", "on_hold"];

const text = (value) => String(value ?? "").trim();
const pieces = (item) => Math.max(1, Math.round(toNumber(item?.qty, 1)));

/**
 * The colour of a line, as a person would name it.
 *
 * The colour column sometimes carries the finish on the front of it, because
 * the picker writes "Matt - Polar White" into one field. Stripped so the same
 * colour in two finishes is one colour with two finishes, rather than two
 * colours nobody can compare.
 */
export function colourOf(item) {
  const colour = text(item?.colour);
  const finish = text(item?.finish);
  if (finish && colour.toLowerCase().startsWith(`${finish.toLowerCase()} - `)) {
    return colour.slice(finish.length + 3).trim();
  }
  return colour;
}

function tally(map, key, item) {
  if (!key) return;
  const row = map.get(key) || { key, pieces: 0, lines: 0, orders: new Set(), value: 0 };
  row.pieces += pieces(item);
  row.lines += 1;
  row.value += toNumber(item.line_total_ex_gst);
  if (item.order_id) row.orders.add(item.order_id);
  map.set(key, row);
}

const settle = (map) =>
  [...map.values()]
    .map((row) => ({ ...row, orders: row.orders.size }))
    .sort((a, b) => b.pieces - a.pieces || a.key.localeCompare(b.key));

/**
 * @param {Array} items  order line items, already filtered to counted orders
 * @returns {{colours: Array, materials: Array, finishes: Array, fulfilment: object, totals: object}}
 */
export function materialsReport(items = []) {
  const colours = new Map();
  const materials = new Map();
  const finishes = new Map();
  const fulfilment = { in_house: 0, supplier_ready_made: 0, undecided: 0 };

  let totalPieces = 0;
  let totalValue = 0;

  items
    // A variation that removed a line means those pieces are not being made.
    .filter((item) => item && item.variation_status !== "removed")
    .forEach((item) => {
      const count = pieces(item);
      totalPieces += count;
      totalValue += toNumber(item.line_total_ex_gst);

      tally(colours, colourOf(item), item);
      tally(materials, text(item.material), item);
      tally(finishes, text(item.finish), item);

      // null is a real answer here: it means nobody has decided yet, and a
      // planning report that hides the undecided is the one that lets them sit.
      const how = text(item.fulfilment_method);
      if (how === "in_house") fulfilment.in_house += count;
      else if (how === "supplier_ready_made") fulfilment.supplier_ready_made += count;
      else fulfilment.undecided += count;
    });

  return {
    colours: settle(colours),
    materials: settle(materials),
    finishes: settle(finishes),
    fulfilment,
    totals: {
      pieces: totalPieces,
      value: Math.round(totalValue * 100) / 100,
      lines: items.length,
      colours: colours.size,
      materials: materials.size,
    },
  };
}

/** The share of the total, for a bar. Guarded so an empty report draws nothing. */
export function shareOf(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}
