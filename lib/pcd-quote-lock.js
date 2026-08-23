// A quote stops being editable the moment it becomes an order.
//
// ── WHY ──────────────────────────────────────────────────────────────────────
// The order is not a copy of the quote, it references it. Cabinet panel lists
// were read live from pcd_cabinet_configs, which belong to the quote, so an
// edit to a quote could silently change, or delete, the panel breakdown on an
// order that was already in the workshop. A cabinet that printed six panels
// last week printed one row this week and nobody was told.
//
// The order lines now snapshot what they need at acceptance, which fixes the
// data. This closes the door as well: once an order exists the quote is a
// historical record of what was agreed, and the only way to change the work is
// a variation, which is priced, sent to the customer and approved.
//
// This is deliberately a hard block rather than a warning. A warning on a
// screen is not a control, and the whole point of the variation pathway is that
// changes to committed work leave a trail.

import { assertOpenForEditing } from "./pcd-document-lock";

export const QUOTE_LOCKED_MESSAGE =
  "This quote has been accepted and is now order %ORDER%. Accepted quotes cannot be edited: raise a variation on the order instead.";

/**
 * Returns the order this quote became, or null if it is still editable.
 */
export async function orderForQuote(supabase, quoteId) {
  if (!quoteId) return null;

  // The quote's own pointer is the cheap check, but an order can exist without
  // it if that write ever failed, so the order table is the authority.
  const { data: order, error } = await supabase
    .from("pcd_orders")
    .select("id, order_number")
    .eq("quote_id", quoteId)
    .maybeSingle();

  if (error) throw error;
  return order || null;
}

/**
 * Throws when this quote may not be edited. Every quote mutation goes through
 * this, so there is no route left that can edit a quote behind a customer's or
 * an order's back.
 *
 * TWO RULES, IN THIS ORDER, because the messages have to differ:
 *
 *   1. Has it become an order? Then it is finished, permanently, and the person
 *      needs to be told to raise a variation. This is checked first because it
 *      is the harder stop and the more useful sentence.
 *
 *   2. Is it sitting with a customer? A sent quote used to be as editable as a
 *      draft, so a customer could approve a version that had changed since they
 *      read it. Now it is sealed, and the way through is the admin override,
 *      which pulls it back to draft and kills the link they were sent.
 */
export async function assertQuoteEditable(supabase, quoteId, { status = null } = {}) {
  const order = await orderForQuote(supabase, quoteId);
  if (order) {
    const error = new Error(QUOTE_LOCKED_MESSAGE.replace("%ORDER%", order.order_number || "an order"));
    error.status = 409;
    error.orderId = order.id;
    error.lockState = "permanent";
    error.canOverride = false;
    throw error;
  }

  // The caller usually has not loaded the quote, so read the status here rather
  // than making every route remember to pass it.
  let state = status;
  if (state === null || state === undefined) {
    const { data, error: readError } = await supabase
      .from("pcd_quotes")
      .select("status")
      .eq("id", quoteId)
      .maybeSingle();
    if (readError) throw readError;
    // A quote that cannot be read is not a quote that may be edited.
    if (!data) return;
    state = data.status;
  }

  assertOpenForEditing("quote", state);
}

/**
 * A cabinet line with no calculated cut list has no panel breakdown, so the
 * production sheet can only print it as a single row and the workshop never
 * sees the panels it has to cut.
 *
 * Checked before an order is raised, because after that the quote is locked and
 * the only fix would be a variation.
 */
export function unconfiguredCabinets(lines = [], configsByLineId = new Map()) {
  return lines
    .filter((line) => line?.product_type === "base_cabinet")
    .filter((line) => !(configsByLineId.get(line.id)?.calculated_cut_list || []).length)
    .map((line) => line.product_name || line.description || "Base cabinet");
}
