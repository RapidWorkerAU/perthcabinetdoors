// EVERYTHING A TAX INVOICE NEEDS, READ ONCE.
//
// Shared by the download and the send, so the PDF a person previews is byte for
// byte the one the customer receives. Two readers would eventually disagree.

import { taxInvoiceModel, taxInvoiceReadiness } from "./pcd-tax-invoice";
import { toNumber } from "./pcd-quote-utils";

const money = (value, currency = "AUD") =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD" }).format(
    toNumber(value)
  );

/**
 * The drilling as it was actually charged, keyed by quote line.
 *
 * Read from the QUOTE rather than recomputed, because the drilling rate in
 * business defaults may have moved since the job was quoted, and an invoice has
 * to say what was charged rather than what it would cost today.
 *
 * A line a variation added has no quote line and simply is not split, which
 * still totals correctly: the drilling stays inside that line's total.
 */
async function drillingByQuoteLine(supabase, items) {
  const ids = [...new Set(items.map((item) => item.quote_line_item_id).filter(Boolean))];
  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from("pcd_quote_line_items")
    .select("id, hinge_drilling_cost_ex_gst, hinge_drilling_qty")
    .in("id", ids);
  // NOT fatal. Without it the doors are invoiced at their full line total with
  // the drilling inside, which is still correct and still adds up; it just
  // shows one line where it could have shown two.
  if (error) return new Map();

  const map = new Map();
  (data || []).forEach((row) => {
    const cost = toNumber(row.hinge_drilling_cost_ex_gst);
    if (cost > 0) map.set(row.id, { cost, qty: toNumber(row.hinge_drilling_qty, 1) });
  });
  return map;
}

/**
 * @returns {Promise<{ok: boolean, error?: string, status?: number, order?: object, invoice?: object}>}
 */
export async function loadTaxInvoice(supabase, orderId, { now = new Date() } = {}) {
  const { data: order, error } = await supabase
    .from("pcd_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) return { ok: false, error: "That order could not be found.", status: 404 };

  const [{ data: items }, { data: payments }, quote] = await Promise.all([
    supabase.from("pcd_order_line_items").select("*").eq("order_id", orderId).order("sort_order"),
    supabase.from("pcd_order_payments").select("*").eq("order_id", orderId),
    // EDGING IS NOT A COLUMN ON AN ORDER. It was worked out from the lines when
    // the quote was priced and baked into the subtotal the order inherited, so
    // it is read back off the quote: that is what was actually charged, rather
    // than what today's rate would make it.
    order.quote_id
      ? supabase.from("pcd_quotes").select("edging_cost_ex_gst").eq("id", order.quote_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // THE GATE. Checked here rather than only on the button, because a button is
  // a suggestion and a route is the boundary. An invoice issued before the
  // money is in is a document saying a job is settled when it is not.
  const ready = taxInvoiceReadiness(order, payments || []);
  if (!ready.ok) return { ok: false, error: ready.reason, status: 409 };

  const invoice = taxInvoiceModel({
    order,
    items: items || [],
    payments: payments || [],
    drillingByLineId: await drillingByQuoteLine(supabase, items || []),
    edgingCostExGst: quote?.data?.edging_cost_ex_gst || 0,
    issuedOn: order.invoice_issued_at ? new Date(order.invoice_issued_at) : now,
  });

  if (!invoice.reconciled) {
    return {
      ok: false,
      status: 409,
      // In money, because these are amounts. Bare numbers read as counts of
      // something and made a costing problem look like a system fault.
      error:
        `The invoice lines add up to ${money(invoice.subtotal + invoice.difference, order.currency)} ` +
        `but the order says ${money(invoice.subtotal, order.currency)}. Nothing has been issued. ` +
        "Check the order's line totals and job costs.",
    };
  }

  return { ok: true, order, invoice, payments: payments || [] };
}
