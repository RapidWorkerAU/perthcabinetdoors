// ACCEPTING A QUOTE ON THE CUSTOMER'S BEHALF.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// The quote editor had a plain Status dropdown with "Approved" on it. Choosing
// it wrote the word and did nothing else: no order was raised. So a quote could
// read as accepted on every screen while the workshop had nothing to make and
// nobody noticed until somebody went looking for the job.
//
// The seal made it worse rather than better. An "approved" quote is permanently
// read only, and the refusal says to raise a variation on the order. There is no
// order. So the quote could not be edited, could not be un-accepted, and had
// nothing to raise a variation against: a dead record, created by one click on a
// dropdown that looked like a setting.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// Accepting is an EVENT, not a field. It raises an order, records who accepted
// and on what evidence, and it happens exactly the same way whether the customer
// pressed the button or somebody here did it for them after a phone call.
//
// The one honest difference is WHO said yes, and that is recorded rather than
// hidden: a staff acceptance says which of us took it, and how the customer gave
// their answer.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────
//
// It creates no Stripe checkout. The customer path does, because a customer is
// sitting in front of a screen ready to pay. Somebody accepting on their behalf
// is on the phone, so the deposit is recorded as owing and chased the normal
// way. Inventing a payment link nobody asked for would be worse than not.

import { createOrderFromQuote } from "./pcd-order-from-quote";
import { logOrderActivity } from "./pcd-activity-log";
import { approvalEvidence } from "./pcd-approval-evidence";
// Defined in their own module so the client modal can import the list without
// pulling this file, and node:crypto with it, into the browser bundle.
import { ACCEPTANCE_CHANNELS, ACCEPTANCE_CHANNEL_KEYS, acceptanceChannelLabel } from "./pcd-acceptance-channels";

export { ACCEPTANCE_CHANNELS, ACCEPTANCE_CHANNEL_KEYS, acceptanceChannelLabel };

/** The deposit owing on this quote, or 0 when none is required. */
export function depositAmountForQuote(quote) {
  if (!quote?.deposit_required) return 0;
  const percent = Number(quote.deposit_percent || 0);
  const total = Number(quote.total_inc_gst || 0);
  if (!Number.isFinite(percent) || percent <= 0 || !Number.isFinite(total) || total <= 0) return 0;
  return Number(((total * percent) / 100).toFixed(2));
}

/**
 * What a quote is missing before it can become an order.
 *
 * The customer path collects these on the approval screen and refuses without
 * them, because an order with no address cannot reach a delivery run. Accepting
 * on their behalf has to hold the same line: the shortcut must not be a way to
 * create the order nobody can deliver.
 */
export function acceptanceGaps(quote = {}) {
  const gaps = [];
  const has = (value) => String(value ?? "").trim() !== "";
  if (!has(quote.customer_name)) gaps.push("the customer's name");
  if (!has(quote.customer_email)) gaps.push("an email address");
  if (!has(quote.site_suburb) && !has(quote.site_address)) gaps.push("a delivery address");
  return gaps;
}


/**
 * Accept a quote on the customer's behalf and raise its order.
 *
 * Returns { orderId, depositAmount }.
 *
 * The status is claimed conditionally on what was read, exactly as the customer
 * path does, so a customer approving at the same moment cannot be overwritten
 * and neither can this.
 */
export async function acceptQuoteForCustomer(
  supabase,
  quote,
  { actorEmail = null, channel = "phone", note = "", acceptedBy = "", request = null } = {}
) {
  const now = new Date().toISOString();

  const { data: claimed, error: claimError } = await supabase
    .from("pcd_quotes")
    .update({ status: "approved", approved_at: now })
    .eq("id", quote.id)
    .eq("status", quote.status)
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    const error = new Error(
      "This quote changed while you had it open, so it was not accepted. Reload and check where it is up to."
    );
    error.status = 409;
    throw error;
  }

  // markAcceptedAt mirrors the customer path: a quote that still owes a deposit
  // becomes an order that is not yet confirmed work, so it can be found and
  // chased without sitting in the list looking paid for.
  const orderId = await createOrderFromQuote(supabase, quote, {
    actorType: "admin",
    markAcceptedAt: !quote.deposit_required,
  });

  const { error: linkError } = await supabase.from("pcd_quotes").update({ order_id: orderId }).eq("id", quote.id);
  if (linkError) throw linkError;

  const depositAmount = depositAmountForQuote(quote);
  if (depositAmount > 0) {
    // Recorded as owing so it appears on the order and in the financials. No
    // checkout session: see the note at the top of this file.
    const { data: existing } = await supabase
      .from("pcd_order_payments")
      .select("id")
      .eq("order_id", orderId)
      .eq("payment_type", "deposit")
      .maybeSingle();
    const depositNote = `${Number(quote.deposit_percent || 0).toFixed(2)}% deposit required to accept ${quote.quote_number}`;
    const payload = {
      order_id: orderId,
      payment_type: "deposit",
      amount: depositAmount,
      is_paid: false,
      notes: depositNote,
      sort_order: 0,
    };
    const { error: paymentError } = existing?.id
      ? await supabase.from("pcd_order_payments").update(payload).eq("id", existing.id)
      : await supabase.from("pcd_order_payments").insert(payload);
    if (paymentError) throw paymentError;
  }

  // The customer did not press anything, so the evidence says so. Recording this
  // as though they had clicked would be the one thing worse than not recording
  // it at all.
  const evidence = {
    ...approvalEvidence({
      request,
      lines: quote.pcd_quote_line_items || [],
      totals: quote,
      accessCode: null,
    }),
    recorded_by_staff: true,
    staff_email: actorEmail,
    acceptance_channel: channel,
    accepted_by: String(acceptedBy || "").trim() || null,
    staff_note: String(note || "").trim() || null,
  };

  const actionRow = {
    quote_id: quote.id,
    action: "approved",
    client_name: String(acceptedBy || "").trim() || quote.customer_name || "Customer",
    note: [acceptanceChannelLabel(channel), String(note || "").trim()].filter(Boolean).join(" - "),
  };
  const { error: actionError } = await supabase.from("pcd_quote_actions").insert({ ...actionRow, evidence });
  if (actionError) {
    const { error: retryError } = await supabase.from("pcd_quote_actions").insert(actionRow);
    if (retryError) throw retryError;
  }

  await logOrderActivity(supabase, {
    order_id: orderId,
    quote_id: quote.id,
    actor_type: "admin",
    action_type: "quote_accepted_by_staff",
    title: "Quote accepted on the customer's behalf",
    description: [
      acceptanceChannelLabel(channel),
      String(acceptedBy || "").trim() ? `confirmed by ${String(acceptedBy).trim()}` : "",
      String(note || "").trim(),
    ]
      .filter(Boolean)
      .join(" - "),
    metadata: {
      quote_number: quote.quote_number,
      staff_email: actorEmail,
      acceptance_channel: channel,
      accepted_by: String(acceptedBy || "").trim() || null,
      deposit_required: depositAmount > 0,
      deposit_amount: depositAmount,
    },
    event_key: `order:${orderId}:created`,
  });

  return { orderId, depositAmount };
}
