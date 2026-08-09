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
