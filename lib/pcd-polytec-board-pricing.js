// WHAT POLYTEC CHARGES US TO MAKE A DECORATIVE BOARD PIECE, worked out rather
// than looked up in their portal.
//
// Every piece sold on the web shop is made by Polytec, not cut here. The shop
// used to price a piece from our own board cost for its area, which is what a
// piece costs us when we cut it from a sheet ourselves. Polytec charges a set
// amount per piece on top, so small pieces sold below what Polytec charged us:
// the first web order, PCD-O-2026-E165EE, lost money on every piece.
//
// ── WHERE THE NUMBERS CAME FROM ──────────────────────────────────────────────
//
// 10 October 2026: seventeen portal prices in European Walnut Matt 16mm, all
// four edges, plus one Woodmatt and one Gloss. test/polytec-board-pricing.test.mjs
// holds every one of them.
//
// ── THE FORMULA ──────────────────────────────────────────────────────────────
//
// 1. Round the size UP to Polytec's steps, the same steps as thermolaminate.
//    Height 200, 400, 600, 750, 900, 1200 ... 2400; width at least 300, then
//    50s to 650, then 800, 1000, 1200. A 176 x 353 drawer front is charged as
//    200 x 400.
//
// 2. price = the colour's board cost per m2 (from the colour library)
//          x finish factor
//          x ( per piece + edge x (height + width) in metres + area x area in m2 )
//
//    The three figures are measured in square metres of that board, which is
//    why one set covers every colour: Woodmatt priced from them came out to the
//    cent. Gloss costs about 27% more again (the finish factor).
//
// Checked against every portal price: within 0.05%, except a full 2400 x 1200
// sheet, which it prices 3.6% over (our side), and pieces under 150mm, which
// Polytec makes as a facia and charges far more for. Those are priced by hand.
//
// 21 October 2026: every finish the shop sells, priced at 400 x 400 and
// 600 x 1200. 16mm Matt, Smooth and Woodmatt and 18mm Woodmatt follow the
// board cost to the cent. Six finishes do not, and Polytec prices 18mm Gloss
// and Venette the same whatever our board costs. Each of the six has its own
// factor, for its thickness, set from whichever size it was furthest out on,
// so it is never under Polytec and at most 3.6% over on the other size.
//
// Polytec does not make every colour to order. Which ones it does is ticked
// in the colour library (made to order), and the shop reads that, not this.
//
// Everything Polytec could change lives in the rate card, stored in Settings
// and cleaned here, so a price rise is a settings change and never a code one.

import { roundMoney } from "./pcd-money";
import { chargedStep } from "./pcd-thermo-pricing";
import { isMadeToOrderBoardLine } from "./pcd-made-by";

export const DEFAULT_POLYTEC_BOARD_CARD = {
  supplier: "Polytec",
  // Our margin on a Polytec made piece, written into the line's markup.
  margin_percent: 75,
  // A small uplift on the calculated cost, if you want every error to fall on
  // our side. The fit is within 0.05%, so it starts at nothing.
  safety_percent: 0,
  effective_from: "2026-10-10",
  height_steps_mm: [200, 400, 600, 750, 900, 1200, 1500, 1800, 2100, 2400],
  width_steps_mm: [300, 350, 400, 450, 500, 550, 600, 650, 800, 1000, 1200],
  facia_below_mm: 150,
  // In square metres of the colour's own board.
  per_piece_sqm: 0.24704,
  edge_sqm_per_m: 0.065229,
  area_factor: 1.07078,
  // A blank thickness means every thickness.
  finish_factors: [
    { thickness: "16mm", finishes: ["Sheen"], factor: 1.014 },
    { thickness: "16mm", finishes: ["Texture"], factor: 1.0216 },
    { thickness: "18mm", finishes: ["Gloss"], factor: 1.3041 },
    { thickness: "18mm", finishes: ["Legato"], factor: 1.1188 },
    { thickness: "18mm", finishes: ["Ravine"], factor: 1.1397 },
    { thickness: "18mm", finishes: ["Venette"], factor: 0.9914 },
  ],
};

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function nonNegative(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function steps(value, fallback) {
  const list = (Array.isArray(value) ? value : String(value ?? "").split(/[\s,]+/))
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  return sorted.length ? sorted : fallback;
}
const clean = (s) => String(s ?? "").trim();
const lower = (s) => clean(s).toLowerCase();

/**
 * A stored card, made safe to price from. Anything missing or nonsense falls
 * back to the measured value, one field at a time.
 */
export function normalizePolytecBoardCard(stored = {}) {
  const s = stored && typeof stored === "object" ? stored : {};
  const d = DEFAULT_POLYTEC_BOARD_CARD;
  const factorSource = Array.isArray(s.finish_factors) ? s.finish_factors : d.finish_factors;
  return {
    supplier: clean(s.supplier) || d.supplier,
    margin_percent: nonNegative(s.margin_percent, d.margin_percent),
    safety_percent: nonNegative(s.safety_percent, d.safety_percent),
    effective_from: clean(s.effective_from) || d.effective_from,
    height_steps_mm: steps(s.height_steps_mm, d.height_steps_mm),
    width_steps_mm: steps(s.width_steps_mm, d.width_steps_mm),
    facia_below_mm: nonNegative(s.facia_below_mm, d.facia_below_mm),
    per_piece_sqm: nonNegative(s.per_piece_sqm, d.per_piece_sqm),
    edge_sqm_per_m: nonNegative(s.edge_sqm_per_m, d.edge_sqm_per_m),
    area_factor: positive(s.area_factor, d.area_factor),
    finish_factors: factorSource
      .map((row) => ({
        thickness: thicknessText(row?.thickness),
        finishes: names(row?.finishes),
        factor: positive(row?.factor, 1),
      }))
      .filter((row) => row.finishes.length),
  };
}

function names(value) {
  return (Array.isArray(value) ? value : String(value ?? "").split(",")).map(clean).filter(Boolean);
}
// "18", "18mm" and "18 mm" are the same thickness. Blank is every thickness.
function thicknessText(value) {
  const mm = parseInt(clean(value), 10);
  return mm > 0 ? `${mm}mm` : "";
}
function rowFits(row, { thickness, finish }) {
  if (row.thickness && row.thickness !== thicknessText(thickness)) return false;
  return row.finishes.some((f) => lower(f) === lower(finish));
}

/**
 * The finish factor for a finish and thickness on this card. A row for that
 * thickness wins over one for every thickness. 1 when it is not listed.
 */
export function polytecFinishFactor(finish, card, thickness = "") {
  const rows = (card?.finish_factors || []).filter((r) => rowFits(r, { thickness, finish }));
  const row = rows.find((r) => r.thickness) || rows[0];
  return row ? row.factor : 1;
}


/**
 * THE PRICE POLYTEC CHARGES FOR ONE DECORATIVE BOARD PIECE, before our margin.
 *
 * @param {{ height_mm, width_mm, thickness, finish }} line
 * @param {object} card a cleaned card
 * @param {number} costPerSqm the colour's board cost per m2, ex GST
 * @returns {{ ok: true, unitCost, chargedHeight, chargedWidth, label }
 *         | { ok: false, reason, code }}
 */
export function pricePolytecBoardPiece(line = {}, card, costPerSqm) {
  const fail = (reason, code) => ({ ok: false, reason, code });
  if (!card) return fail("The Polytec decorative board rate card cannot be read.", "unavailable");
  const rate = Number(costPerSqm);
  if (!(rate > 0)) return fail("This colour has no board cost in the colour library.", "no_cost");

  const height = Number(line.height_mm);
  const width = Number(line.width_mm);
  if (!(height > 0) || !(width > 0)) return fail("Enter the height and width to price this piece.", "size_missing");
  if (Math.min(height, width) < card.facia_below_mm) {
    return fail(`Under ${card.facia_below_mm}mm in one direction ${card.supplier} makes it as a facia, which is priced by hand.`, "facia");
  }

  // A long low panel fits the steps turned round. The formula gives the same
  // answer either way up, so this only decides whether it can be priced.
  let chargedHeight = chargedStep(height, card.height_steps_mm);
  let chargedWidth = chargedStep(width, card.width_steps_mm);
  if (!chargedHeight || !chargedWidth) {
    const turnedHeight = chargedStep(width, card.height_steps_mm);
    const turnedWidth = chargedStep(height, card.width_steps_mm);
    if (!turnedHeight || !turnedWidth) {
      const maxH = card.height_steps_mm[card.height_steps_mm.length - 1];
      const maxW = card.width_steps_mm[card.width_steps_mm.length - 1];
      return fail(`Over ${maxH} x ${maxW} is priced by hand.`, "oversize");
    }
    chargedHeight = turnedHeight;
    chargedWidth = turnedWidth;
  }

  const h = chargedHeight / 1000;
  const w = chargedWidth / 1000;
  const sqm = card.per_piece_sqm + card.edge_sqm_per_m * (h + w) + card.area_factor * h * w;
  const factor = polytecFinishFactor(line.finish, card, line.thickness);
  let cost = rate * factor * sqm;
  if (card.safety_percent) cost *= 1 + card.safety_percent / 100;
  const unitCost = roundMoney(cost);

  return {
    ok: true,
    unitCost,
    chargedHeight,
    chargedWidth,
    factor,
    label: `${card.supplier} made to order: charged as ${chargedHeight} x ${chargedWidth}${factor !== 1 ? `, finish x ${factor}` : ""}`,
  };
}

/**
 * A QUOTE LINE ANSWERED MADE TO ORDER, PRICED FROM THIS CARD.
 *
 * The same automatic and manual behaviour as every other board line: only a
 * line in automatic mode takes the price, a typed cost wins, and the
 * calculated figure sits beside it for Reset. The colour's board cost per m2
 * stays on the line, because it is what the card multiplies. A line that is
 * not decorative board made to order comes back untouched.
 *
 * The markup is left alone. The card's margin goes on when a line is first
 * answered made to order, by whoever answers it, not on every reprice.
 */
export function withMadeToOrderBoardPrice(line = {}, card, { forceAuto = false } = {}) {
  if (!card || !isMadeToOrderBoardLine(line)) return line;
  const result = pricePolytecBoardPiece(line, card, line.unit_cost_per_sqm_ex_gst);
  const next = { ...line, calculated_unit_cost_ex_gst: result.ok ? result.unitCost : 0 };
  const typed = Number(line.product_unit_cost_ex_gst) > 0;
  if (forceAuto || (result.ok && !typed)) next.unit_cost_mode = "auto";
  if (result.ok) {
    next.unit_cost_source_label = result.label;
    if (next.unit_cost_mode === "auto") next.product_unit_cost_ex_gst = result.unitCost;
  }
  return next;
}

/**
 * A converted quote line, priced from this card when it is decorative board
 * answered made to order, with the card's margin as its markup: the markup on
 * a freshly converted line is only the business default, not anybody's
 * decision. One the card cannot price goes on the made to order list, saying
 * why. The thermolaminate twin is withThermoRateCard.
 *
 * `entry` is what convertedQuoteLine returns. Without a card, and for every
 * other line, it comes back untouched.
 */
export function withMadeToOrderBoardRateCard(entry, card) {
  if (!card || !entry || entry.skipped || !entry.match?.ok || !isMadeToOrderBoardLine(entry.line)) return entry;
  const result = pricePolytecBoardPiece(entry.line, card, entry.line.unit_cost_per_sqm_ex_gst);
  if (!result.ok) return { ...entry, match: { ok: false, reason: "made_to_order", message: result.reason } };
  const line = { ...withMadeToOrderBoardPrice(entry.line, card, { forceAuto: true }), markup_percent: card.margin_percent };
  return { ...entry, line, match: { ...entry.match, ok: true, reason: "board_rate_card" } };
}
