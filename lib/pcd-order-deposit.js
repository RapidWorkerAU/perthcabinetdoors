// The deposit, and what it does to the order.
//
// WHY THIS EXISTS. This logic used to live twice: once in the Stripe webhook
// and once in the admin payments route. The copies drifted. The webhook stamped
// accepted_at when the deposit landed and the admin one did not, so a deposit
// paid by bank transfer and ticked by hand left the order permanently
// unconfirmed. Same money, same job, two different records depending on how it
// arrived.
//
// One function now, called by both. A rule written twice is a rule that will be
// obeyed once.

// An order raised from a quote that needs a deposit is NOT confirmed work yet.
// It is a real order, so it can be found and cancelled, but it is not active
// until the money lands.
export const PENDING_DEPOSIT = "pending_deposit";

// What the order's deposit columns should say, given its deposit payment rows.
//
// Pure, so the rules can be tested without a database. `currentStatus` decides
// whether the order is allowed to be promoted: only a pending_deposit order
// becomes active. Paying a deposit must never resurrect a cancelled order or
// quietly reopen a completed one.
export function depositUpdates(depositRows, currentStatus) {
  const rows = depositRows || [];
  const required = rows.length > 0;
  const amount = rows.reduce((total, row) => total + (Number(row.amount) || 0), 0);
  // Every deposit line has to be paid, not just one of them. An order split
  // into two deposit payments is not confirmed halfway through.
  const paid = rows.length > 0 && rows.every((row) => Boolean(row.is_paid));

  const updates = {
    deposit_required: required,
    deposit_amount: amount,
    deposit_paid: paid,
    deposit_paid_at: paid
      ? (rows.find((row) => row.paid_at) || {}).paid_at || new Date().toISOString().slice(0, 10)
      : null,
  };

  if (paid) {
    // The stamp that says this is confirmed work. Set here rather than in the
    // caller, because the caller is the thing that kept forgetting.
    updates.accepted_at = new Date().toISOString();
    if (currentStatus === PENDING_DEPOSIT) updates.status = "active";
  }

  return updates;
}

// Read the order's deposit rows, work out what should change, and write it.
// Both the Stripe webhook and the admin payments route call this, so a deposit
// paid either way lands the order in exactly the same state.
export async function syncDepositFields(supabase, orderId) {
  const { data: deposits, error } = await supabase
    .from("pcd_order_payments")
    .select("amount,is_paid,paid_at")
    .eq("order_id", orderId)
    .eq("payment_type", "deposit");
  if (error) throw error;

  // The current status decides whether promotion is allowed, so it has to be
  // read before the write rather than assumed.
  const { data: order } = await supabase
    .from("pcd_orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();

  const updates = depositUpdates(deposits, order?.status);

  const { error: updateError } = await supabase.from("pcd_orders").update(updates).eq("id", orderId);
  if (updateError) throw updateError;

  return updates;
}
