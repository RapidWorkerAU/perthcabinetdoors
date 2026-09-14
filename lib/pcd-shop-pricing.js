// WHAT A WEB SHOP ORDER COSTS, WORKED OUT ON THE SERVER.
//
// ── THE QUOTE'S OWN ARITHMETIC, NOT A COPY OF IT ─────────────────────────────
//
// Decided 11 September 2026: the shop is priced exactly as a quote is. Board
// cost per square metre plus the Business Default markup, banded edges at the
// ABS rate for the edges ticked, hinge holes at the drilling rate, and hinges
// from the catalogue at cost plus markup as their own line. A web order is
// paid for and then becomes a quote and an order, so any second formula would
// be a second answer to "what did they pay for".
//
// So nothing here does arithmetic of its own. A shop line becomes the quote
// builder's line objects (lib/pcd-shop.js), goes through quoteRequestLine and
// quoteRequestLineRow exactly as a website quote request does, is priced by
// convertedQuoteLine and calculateQuoteLine exactly as a converted request is,
// and is totalled by calculateQuoteTotals exactly as a saved quote is. The
// price on the product page, the total at checkout, the amount Stripe takes and
// the quote behind the order are one calculation run four times.
//
// ── WHAT NEVER LEAVES THIS FILE ──────────────────────────────────────────────
//
// Cost per square metre, the markup, the edging rate, anything a customer could
// divide back into our formula. The browser gets marked-up prices only, and
// only for a whole piece. See the memory note on the buy direct page.

import { getBusinessDefaults } from "./pcd-business-defaults";
import { createBoardCostResolver } from "./pcd-board-cost";
import { getDatabaseColourItems, normaliseSupplierName } from "./pcd-colour-library";
import { createHardwareResolver } from "./pcd-hardware-line";
import { quoteRequestLine } from "./pcd-quote-request-payload";
import { quoteRequestLineRow } from "./pcd-quote-request";
import { convertedQuoteLine } from "./pcd-quote-request-convert";
import { calculateQuoteLine, calculateQuoteTotals, roundMoney } from "./pcd-quote-utils";
import {
  SHOP_BRAND,
  SHOP_MARKUP_PERCENT,
  SHOP_MATERIAL,
  isMetroPostcode,
  shopHingeCount,
  shopLineItems,
  shopLineProblems,
  shopProduct,
  shopSizeLimit,
} from "./pcd-shop";

const text = (value) => String(value ?? "").trim();

// ── THE CATALOGUE ────────────────────────────────────────────────────────────

/**
 * Everything the shop can sell right now: Polytec decorative board colours and
 * the active hinges, with the Business Defaults they are priced from.
 *
 * `cost` stays on the server copy. publicShopCatalogue strips it.
 */
export async function loadShopCatalogue(supabase) {
  const [items, defaults, hardwareResult] = await Promise.all([
    getDatabaseColourItems(supabase),
    getBusinessDefaults(supabase),
    supabase.from("pcd_hardware").select("*").eq("type", "hinge").eq("is_active", true).order("sort_order"),
  ]);

  const colours = (items || [])
    .filter((item) => item.material === "decorative board" && normaliseSupplierName(item.supplier) === SHOP_BRAND)
    .map((item) => ({
      id: item.id,
      colour: item.colour,
      finish: item.finish,
      thickness: item.thickness,
      src: item.src || "",
      hasGrain: item.hasGrain,
      // Priced means we hold a rate for it and it is not bought in to order.
      // Everything else is set up here and sent across to a quote list.
      priced: Number(item.cost) > 0 && !item.madeToOrder,
      cost: Number(item.cost) || 0,
    }));

  const hardwareRows = hardwareResult?.data || [];
  const hinges = hardwareRows
    .filter((row) => Number(row.unit_cost_ex_gst) > 0)
    .map((row) => {
      // Priced one at a time through the same function a quote line is, so the
      // figure on the tile is the figure on the order.
      const each = calculateQuoteLine(
        { product_type: "Hardware", qty: 1, product_unit_cost_ex_gst: Number(row.unit_cost_ex_gst) || 0 },
        defaults
      );
      return {
        id: row.id,
        brand: text(row.brand),
        name: text(row.name),
        description: text(row.description),
        imageUrl: text(row.image_url),
        priceExGst: each.line_total_ex_gst,
      };
    });

  return { colours, hinges, hardwareRows, defaults, limit: shopSizeLimit(defaults) };
}

/** The catalogue as the browser may see it: marked-up prices, no costs. */
export function publicShopCatalogue(catalogue) {
  const gst = Number(catalogue.defaults?.gst_rate ?? 0.1);
  return {
    colours: catalogue.colours.map(({ cost, ...colour }) => colour),
    hinges: catalogue.hinges.map((hinge) => ({ ...hinge, priceIncGst: roundMoney(hinge.priceExGst * (1 + gst)) })),
    limit: catalogue.limit,
    gstRate: gst,
    deliveryExGst: Number(catalogue.defaults?.web_delivery_metro_ex_gst) || 0,
  };
}

// ── ONE LINE ─────────────────────────────────────────────────────────────────

/**
 * The line as the server will make it. The colour's name, finish and tile are
 * read off the catalogue row the id points at rather than trusted from the
 * browser, so the quote says what the library says.
 */
function settledLine(line, catalogue) {
  const colour = catalogue.colours.find((row) => row.id === line.colourLibraryId) || null;
  const hinge = catalogue.hinges.find((row) => row.id === line.hingeHardwareId) || null;
  const product = shopProduct(line.product);
  const settled = {
    ...line,
    type: product?.type || "",
    qty: Math.round(Number(line.qty) || 0),
    ...(colour ? { colour: colour.colour, finish: colour.finish, thickness: colour.thickness, colourSrc: colour.src } : {}),
  };
  return { settled, colour, hinge };
}

/**
 * Price one shop line. Returns the quote lines it becomes, and the customer's
 * breakdown of what they cost.
 */
export function priceShopLine(line, catalogue, { resolveBoard, resolveHardware }) {
  const { settled, colour, hinge } = settledLine(line, catalogue);
  const problems = shopLineProblems(settled, { limit: catalogue.limit, colour, hinge });
  if (colour && line.thickness && colour.thickness !== line.thickness) problems.push("a thickness that colour comes in");
  if (problems.length) return { id: line.id, ok: false, problems };

  const defaults = catalogue.defaults;
  const quoteLines = [];
  for (const [index, item] of shopLineItems(settled, { hinge }).entries()) {
    const row = quoteRequestLineRow(quoteRequestLine(item), index);
    const converted = convertedQuoteLine(row, {
      resolveBoard,
      resolveHardware,
      quoteRequest: {},
      businessDefaults: defaults,
    });
    // A board or a hinge the library cannot price is a line we cannot sell.
    // It goes to a quote list instead, where it is priced by hand.
    if (!converted.skipped && !converted.match?.ok) {
      return { id: line.id, ok: false, problems: ["a colour we hold a price on"] };
    }
    // THE SHOP'S OWN MARKUP, ON THE BOARD AND ONLY THE BOARD.
    //
    // convertedQuoteLine fills this in from Business Defaults, the same as a
    // quote would, and the piece we make is not priced like a quote. Overriding
    // it here rather than changing the default is what keeps it to these lines:
    // every other quote in the business keeps the rate it has always had.
    //
    // The hinges on the same order are bought in and sold on, so they are left
    // exactly where they were. Tested on the item BEING our board rather than
    // on it not being a hinge, so a new bought-in item added to the shop later
    // does not quietly inherit the board's rate.
    //
    // On the line rather than applied to the price afterwards, because
    // calculateQuoteLine runs again on the way into the database and would
    // recompute anything written onto a price field. A markup the line carries
    // survives that, which is what makes the figure the customer agreed to and
    // the figure stored against their order the same number.
    const isOurBoard = item.material === SHOP_MATERIAL;
    quoteLines.push(isOurBoard ? { ...converted.line, markup_percent: SHOP_MARKUP_PERCENT } : converted.line);
  }

  const [piece, hinges] = quoteLines.map((quoteLine) => calculateQuoteLine(quoteLine, defaults));
  const edging = roundMoney(piece.edging_lineal_metres * Number(defaults.abs_edging_cost_per_lineal_metre_ex_gst || 0));
  const processing = roundMoney(piece.processing_labour_hours * Number(defaults.worker_hourly_rate || 0));
  // The board, the cutting and the banding are one thing to a customer: the
  // price of the piece. Drilling and hinges are their own lines.
  const pieceEx = roundMoney(piece.material_cost_ex_gst - piece.hinge_drilling_cost_ex_gst + edging + processing);
  const drillingEx = piece.hinge_drilling_cost_ex_gst;
  const hingesEx = hinges ? hinges.material_cost_ex_gst : 0;
  const totalEx = roundMoney(pieceEx + drillingEx + hingesEx);
  const qty = settled.qty;
  const holes = shopHingeCount(settled) * qty;
  const product = shopProduct(settled.product);

  const parts = [[`${product.name}, cut and edged`, pieceEx]];
  if (drillingEx) parts.push([`Hinge holes, ${holes}`, drillingEx]);
  if (hingesEx) parts.push([`Hinges, ${holes}`, hingesEx]);

  return {
    id: line.id,
    ok: true,
    line: settled,
    quoteLines,
    qty,
    parts,
    totalExGst: totalEx,
    unitExGst: roundMoney(totalEx / qty),
  };
}

// ── THE WHOLE ORDER ──────────────────────────────────────────────────────────

/**
 * The job level costs on a web order's quote. Delivery is the metro rate; the
 * rest are zero, because a door bought online is not a job we travel to,
 * install, paint or glaze. Written here once and used for both the price shown
 * and the quote written, so the two are totalled from the same figures.
 */
export function webQuoteCosts(defaults, { deliveryExGst = 0 } = {}) {
  return {
    worker_hourly_rate: defaults.worker_hourly_rate,
    delivery_cost_ex_gst: deliveryExGst,
    travel_cost_ex_gst: 0,
    installation_cost_ex_gst: 0,
    painting_cost_ex_gst: 0,
    glass_cost_ex_gst: 0,
    removal_cost_ex_gst: 0,
  };
}

/**
 * Price a cart. `postcode` is optional: without one the delivery is shown as
 * the metro rate and not yet confirmed.
 */
export async function priceShopCart(supabase, { lines = [], postcode = "" } = {}, catalogue = null) {
  const shop = catalogue || (await loadShopCatalogue(supabase));
  const resolveBoard = await createBoardCostResolver(supabase);
  const resolveHardware = createHardwareResolver(shop.hardwareRows);

  const priced = (Array.isArray(lines) ? lines : []).slice(0, 100).map((line) =>
    priceShopLine(line, shop, { resolveBoard, resolveHardware })
  );
  const ready = priced.filter((entry) => entry.ok);
  const quoteLines = ready.flatMap((entry) => entry.quoteLines);

  const metro = text(postcode) ? isMetroPostcode(postcode) : null;
  const deliveryExGst = Number(shop.defaults.web_delivery_metro_ex_gst) || 0;
  const gstRate = Number(shop.defaults.gst_rate ?? 0.1);
  const totals = calculateQuoteTotals(quoteLines, gstRate, {
    ...webQuoteCosts(shop.defaults, { deliveryExGst: quoteLines.length ? deliveryExGst : 0 }),
    business_defaults: shop.defaults,
  });

  return {
    catalogue: shop,
    lines: priced,
    quoteLines,
    ready: priced.length > 0 && ready.length === priced.length,
    delivery: { metro, exGst: quoteLines.length ? deliveryExGst : 0 },
    totals: {
      goodsExGst: roundMoney(totals.subtotal_ex_gst - (quoteLines.length ? deliveryExGst : 0)),
      deliveryExGst: quoteLines.length ? deliveryExGst : 0,
      subtotalExGst: totals.subtotal_ex_gst,
      gstAmount: totals.gst_amount,
      totalIncGst: totals.total_inc_gst,
    },
  };
}

/** What the browser is told about a priced cart. No quote lines, no costs. */
export function publicCartPrice(result) {
  const gst = Number(result.catalogue.defaults?.gst_rate ?? 0.1);
  return {
    ok: true,
    ready: result.ready,
    lines: result.lines.map((entry) =>
      entry.ok
        ? {
            id: entry.id,
            ok: true,
            qty: entry.qty,
            parts: entry.parts.map(([label, exGst]) => ({ label, exGst })),
            unitExGst: entry.unitExGst,
            unitIncGst: roundMoney(entry.unitExGst * (1 + gst)),
            totalExGst: entry.totalExGst,
            totalIncGst: roundMoney(entry.totalExGst * (1 + gst)),
          }
        : { id: entry.id, ok: false, problems: entry.problems }
    ),
    delivery: result.delivery,
    totals: result.totals,
  };
}
