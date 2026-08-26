// THE TAX INVOICE FOR A FINISHED ORDER.
//
// Issued only once the money is all in, so it is a record of a completed
// transaction rather than a request for payment. That is what decides most of
// what is on it: there is no due date, no bank block and nothing to pay online,
// because there is nothing left to pay.
//
// THE NUMBER IS THE ORDER NUMBER. No counter to keep in step with anything, no
// way to collide with a number Xero has already issued, and the invoice is
// obviously the one belonging to that job. It also means re-issuing cannot
// produce a second invoice for one piece of work, which is a problem for both
// sets of books.
//
// IT HAS TO ADD UP. An invoice whose lines do not sum to its total is worse
// than no invoice: it is a tax document that is wrong. So the lines here are
// built from exactly the terms calculateQuoteTotals adds together, and the
// result is reconciled against what the order says before anything is drawn.
// A discrepancy is reported, never quietly absorbed into a line.
//
//   subtotal = every line's line_total_ex_gst
//            + labour, travel, delivery, consumables, painting, glass,
//              removal and edging, each as its own line where it is not zero
//
// See lib/pcd-quote-utils.js, costBeforeMarkup.

import { GST_RATE, toNumber, roundMoney } from "./pcd-quote-utils";
import { outstandingOnOrder, receivedOnOrder, refundedOnOrder } from "./pcd-board-money";
import { hingeCount } from "./pcd-hinges";

const text = (value) => String(value ?? "").trim();

/** The invoice number for an order, which IS the order number. */
export function taxInvoiceNumber(order) {
  return text(order?.order_number) || "";
}

/**
 * Whether this order can be invoiced yet, and why not when it cannot.
 *
 * The reason is written for the person hovering the button, so it says what
 * would have to change rather than naming a rule.
 */
export function taxInvoiceReadiness(order, payments = []) {
  const total = toNumber(order?.total_inc_gst);
  if (!taxInvoiceNumber(order)) {
    return { ok: false, reason: "This order has no order number to invoice against." };
  }
  if (total <= 0) {
    return { ok: false, reason: "This order has nothing on it to invoice." };
  }

  const received = receivedOnOrder(payments);
  if (received <= 0) {
    return { ok: false, reason: "No payment has been received on this order yet." };
  }

  // Nets refunds off both sides, the same way the board does, so a job that was
  // paid and then partly refunded is not treated as settled when it is not.
  const outstanding = outstandingOnOrder(total, payments);
  if (outstanding > 0) {
    return {
      ok: false,
      reason: `${money(outstanding, order?.currency)} is still outstanding. A tax invoice goes out once the job is paid in full.`,
    };
  }
  return { ok: true, reason: "" };
}

function money(value, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD" }).format(
    toNumber(value)
  );
}

/**
 * One order line described the way the customer's invoice describes it.
 *
 * Height before width, the same way round as every other size in the business.
 * The drilling is mentioned here AND charged on its own line below, which is
 * how the Xero invoices we are replacing read: the description says what the
 * door is, the separate line says what the drilling cost.
 */
export const DETAIL_SEPARATOR = " - ";

/**
 * WHAT the line is, kept apart from WHAT IT IS LIKE.
 *
 * It all used to run together into one sentence: "Door Height: 600mm Width:
 * 508mm Colour: Polar White Matt with Square edges with 2 hinge holes". Nothing
 * was wrong in it, but a customer scanning an invoice for what they bought had
 * to read a whole line to find the word "Door", and two lines like that in a
 * row are indistinguishable at a glance.
 *
 * Split, the name carries the row and the rest is available underneath for
 * anyone who wants it.
 *
 * HEIGHT BEFORE WIDTH, the same way round as every other size in the business.
 *
 * The "with" prefixes went with the split: dash separated groups do not need
 * them, and "Door - with Square edges - with 2 hinge holes" reads worse than
 * "Door - Square edges - 2 hinge holes".
 *
 * @returns {{title: string, details: string[]}}
 */
export function lineDescriptionParts(item) {
  const what = text(item.title) || text(item.product_type) || "Cabinetry item";
  const title = what.toLowerCase() === "base_cabinet" ? "Base Cabinet" : what;
  const details = [];

  if (toNumber(item.height_mm) > 0) details.push(`Height: ${toNumber(item.height_mm)}mm`);
  if (toNumber(item.width_mm) > 0) details.push(`Width: ${toNumber(item.width_mm)}mm`);

  const colour = [text(item.colour), text(item.finish)].filter(Boolean).join(" ");
  if (colour) details.push(`Colour: ${colour}`);

  const edge = text(item.edge_mould);
  if (edge) details.push(`${edge} edges`);

  const profile = [text(item.profile_type), text(item.profile)].filter(Boolean).join(" ");
  if (profile) details.push(`${profile} profile`);

  const cups = item.hinge_holes ? hingeCount(item) : 0;
  if (cups) {
    const side = text(item.hinge_side);
    details.push(`${cups} hinge holes${side ? `, hinged ${side.toLowerCase()}` : ""}`);
  }

  return { title, details };
}

/**
 * The same thing as one string, for anywhere that has only one line to give.
 *
 * The PDF does NOT use this: it draws the two parts separately so the name can
 * be bold and the rest small and italic underneath. This exists so a plain text
 * rendering of an invoice line still says everything.
 */
export function lineDescription(item) {
  const { title, details } = lineDescriptionParts(item);
  return details.length ? [title, ...details].join(DETAIL_SEPARATOR) : title;
}

/**
 * The job costs that sit on the order rather than on a line.
 *
 * Named the way the business names them: the column is installation_cost_ex_gst
 * and the box on the quote says Consumables, so the invoice says Consumables.
 * Naming it Installation on the one document the customer keeps would be the
 * only place in the business it was called that.
 */
export const ORDER_COST_LINES = [
  { field: "travel_cost_ex_gst", label: "Travel" },
  { field: "delivery_cost_ex_gst", label: "Delivery" },
  { field: "installation_cost_ex_gst", label: "Consumables" },
  { field: "painting_cost_ex_gst", label: "Painting" },
  { field: "glass_cost_ex_gst", label: "Glass" },
  { field: "removal_cost_ex_gst", label: "Removal and disposal" },
];

/**
 * Everything in the order's subtotal that is not a line item.
 *
 * TWO OF THESE ARE NOT COLUMNS ON THE ORDER, which is what made an invoice
 * quietly come up short:
 *
 *   labour   the order carries labour_hours and worker_hourly_rate, not a cost.
 *            Reading a labour_cost_ex_gst column that does not exist gave zero,
 *            so an order with an hour on it invoiced 85 dollars light and the
 *            reconciliation refused it with no idea why.
 *
 *   edging   worked out from the lines when the QUOTE was priced and baked into
 *            the subtotal the order inherited. The order never stored it, so it
 *            is read back off the quote, where it is what was actually charged
 *            rather than what today's rate would make it.
 *
 * Labour is shown as hours at a rate rather than as a lump, because that is
 * what the customer agreed to and the table already has a column for each.
 */
export function orderCostLines(order, { edgingCostExGst = 0 } = {}) {
  const lines = [];

  const hours = toNumber(order?.labour_hours);
  const rate = toNumber(order?.worker_hourly_rate);
  if (hours > 0 && rate > 0) {
    lines.push({
      description: "Labour",
      qty: hours,
      unitPriceExGst: roundMoney(rate),
      totalExGst: roundMoney(hours * rate),
    });
  }

  ORDER_COST_LINES.forEach(({ field, label }) => {
    const amount = roundMoney(toNumber(order?.[field]));
    if (amount <= 0) return;
    lines.push({ description: label, qty: 1, unitPriceExGst: amount, totalExGst: amount });
  });

  const edging = roundMoney(toNumber(edgingCostExGst));
  if (edging > 0) {
    lines.push({ description: "Edging", qty: 1, unitPriceExGst: edging, totalExGst: edging });
  }

  return lines;
}

/**
 * The lines on the invoice.
 *
 * @param {object} input
 * @param {object} input.order
 * @param {Array}  input.items          order line items
 * @param {Map}    [input.drillingByLineId]  quote line id -> { cost, qty }, so
 *        the drilling can be shown at what was actually charged for it rather
 *        than at today's rate. A line a variation added has no quote line and
 *        is simply not split, which still totals correctly.
 */
export function taxInvoiceLines({ order, items = [], drillingByLineId = new Map(), edgingCostExGst = 0 } = {}) {
  const lines = [];

  items
    .filter((item) => item && item.variation_status !== "removed")
    .forEach((item) => {
      const qty = Math.max(1, toNumber(item.qty, 1));
      const lineTotal = roundMoney(toNumber(item.line_total_ex_gst));
      const drilling = drillingByLineId.get(item.quote_line_item_id) || null;
      const drillCost = drilling ? roundMoney(toNumber(drilling.cost)) : 0;

      // The door at what it cost WITHOUT its drilling, so the two lines add up
      // to exactly what the line was charged at. Splitting any other way would
      // make the invoice disagree with the order it came from.
      const productTotal = roundMoney(lineTotal - drillCost);

      // title and details ride alongside description rather than replacing it:
      // the PDF draws them separately, and anything with only one line to give
      // still has the whole sentence.
      const parts = lineDescriptionParts(item);
      lines.push({
        description: lineDescription(item),
        title: parts.title,
        details: parts.details,
        qty,
        unitPriceExGst: qty ? roundMoney(productTotal / qty) : productTotal,
        totalExGst: productTotal,
      });

      if (drillCost > 0) {
        const drillQty = Math.max(1, toNumber(drilling.qty, 1));
        lines.push({
          description: "Hinge holes drilling",
          title: "Hinge holes drilling",
          details: [],
          qty: drillQty,
          unitPriceExGst: roundMoney(drillCost / drillQty),
          totalExGst: drillCost,
        });
      }
    });

  orderCostLines(order, { edgingCostExGst }).forEach((line) => lines.push(line));

  return lines;
}

/**
 * Everything the invoice needs, reconciled.
 *
 * `reconciled` is false when the lines do not sum to what the order says it
 * charged. That is a bug rather than a rounding artefact, and the caller
 * refuses to issue rather than printing a tax document that does not add up.
 */
export function taxInvoiceModel({
  order, items = [], payments = [], drillingByLineId, edgingCostExGst = 0, issuedOn = new Date(),
} = {}) {
  const lines = taxInvoiceLines({ order, items, drillingByLineId, edgingCostExGst });
  const gstRate = toNumber(order?.gst_rate, GST_RATE) || GST_RATE;

  const lineSubtotal = roundMoney(lines.reduce((sum, line) => sum + toNumber(line.totalExGst), 0));
  const orderSubtotal = roundMoney(toNumber(order?.subtotal_ex_gst));
  // A cent either way is the rounding of nine separate figures, not a fault.
  const difference = roundMoney(lineSubtotal - orderSubtotal);
  const reconciled = Math.abs(difference) <= 0.02;

  const subtotal = orderSubtotal;
  const gst = roundMoney(toNumber(order?.gst_amount) || subtotal * gstRate);
  const total = roundMoney(toNumber(order?.total_inc_gst) || subtotal + gst);

  return {
    number: taxInvoiceNumber(order),
    reference: text(order?.name) || "PCD Order",
    issuedOn,
    currency: order?.currency || "AUD",
    customer: {
      name: text(order?.customer_name),
      email: text(order?.customer_email),
      phone: text(order?.customer_phone),
      address: text(order?.site_address),
    },
    lines,
    gstRate,
    subtotal,
    gst,
    total,
    // Shown because it is what makes this useful as a receipt: it says the job
    // is settled. There is deliberately no due date and no bank block, because
    // there is nothing left to pay.
    paid: roundMoney(receivedOnOrder(payments)),
    refunded: roundMoney(refundedOnOrder(payments)),
    due: roundMoney(outstandingOnOrder(total, payments)),
    reconciled,
    difference,
  };
}

/** The file a person ends up with. */
export function taxInvoiceFileName(order) {
  const number = taxInvoiceNumber(order) || "order";
  return `Tax-Invoice-${number.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
}
