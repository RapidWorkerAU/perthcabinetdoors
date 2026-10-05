const REQUESTED_STATUSES = new Set(["requested", "checkout_created", "paid"]);

export function hasPaymentRequest(payment) {
  const status = String(payment?.request_status || "").trim();
  return Boolean(
    REQUESTED_STATUSES.has(status) ||
    payment?.requested_at ||
    payment?.request_url ||
    payment?.stripe_checkout_session_id ||
    payment?.stripe_payment_intent_id
  );
}

export function canRequestPayment(payment) {
  return Boolean(payment) && !payment.is_paid && !hasPaymentRequest(payment) && Number(payment.amount || 0) > 0;
}

export function canRefreshPaymentRequest(payment) {
  return Boolean(payment) && !payment.is_paid && hasPaymentRequest(payment) && Number(payment.amount || 0) > 0;
}

// CANCELLING A LINK THAT WAS NEVER PAID.
//
// A link goes out, the customer does not pay it, and the plan changes: the
// progress payment is rolled into the final one. Before this the line could not
// be deleted or have its amount changed while a link was out, and its amount
// still counted against the order total, so the bigger final link was refused.
//
// Cancelling kills the Stripe link and puts the line back to unsent, so it can
// be edited or deleted like any line that was never requested.
export function canCancelPaymentRequest(payment) {
  return Boolean(payment) && !payment.is_paid && hasPaymentRequest(payment);
}

// What the line goes back to. The same fields the settlement undo clears, so a
// line with no live link looks the same whichever way it got there.
export function cancelPaymentRequestPatch() {
  return {
    request_status: "not_requested",
    request_url: null,
    requested_at: null,
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: null,
  };
}

// Whether the Stripe session says the customer got there first. "complete"
// covers a payment that has landed and one that settles later (a bank debit),
// and either way the money is on its way, so the link must not be cancelled.
export function sessionAlreadyPaid(session) {
  return Boolean(session) && (session.status === "complete" || session.payment_status === "paid");
}

function moneyText(value, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(Number(value || 0));
}

// The cancellation email, filled into the editable email window. One definition
// so the wording only lives in one place.
export function defaultCancelLinkSubject(order) {
  return `Payment link cancelled for ${order?.order_number || "your order"}`;
}

export function defaultCancelLinkMessage(order, payment) {
  const amount = moneyText(payment?.amount, order?.currency || "AUD");
  return [
    `Hi ${order?.customer_name || "there"},`,
    "",
    `We have cancelled the payment link we sent you for ${amount} on ${order?.order_number || "your order"}. It will no longer work, so please do not use it.`,
    "",
    "Any payment still due will come to you as a new link.",
    "",
    "Regards,",
    "Perth Cabinet Doors",
  ].join("\n");
}
