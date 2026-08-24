// Giving money back.
//
// A REFUND IS A PAYMENT LINE. Same table, same list, same two steps: the line
// is added, then it is processed and the customer is told. The only differences
// are that its amount is negative and that processing it can send money rather
// than only record that money moved.
//
// WHY THE AMOUNT IS NEGATIVE. Every sum in the system already adds payment
// amounts up: received, owed, GST, the deposit gate, the board, the financials.
// A refund held as a positive number with a flag beside it would need all of
// them to learn about the flag, and the one that was missed would be quietly
// wrong about money. Negative, they net off on their own.
//
// Framework free and pure, so the order screen and the route decide the same
// things from the same rules.

export const REFUND_TYPE = "refund";

// How the money went back. 'stripe' is the only one that MOVES money from here;
// the rest are a record of something a person did.
export const REFUND_METHODS = [
  { value: "stripe", label: "Back to the card through Stripe", needsReference: false, sendsMoney: true },
  { value: "bank_transfer", label: "Bank transfer", needsReference: true, sendsMoney: false },
  { value: "cash", label: "Cash", needsReference: false, sendsMoney: false },
  { value: "card_in_person", label: "Card in person", needsReference: true, sendsMoney: false },
  { value: "cheque", label: "Cheque", needsReference: true, sendsMoney: false },
  { value: "other", label: "Something else", needsReference: true, sendsMoney: false },
];

export const REFUND_METHOD_VALUES = REFUND_METHODS.map((method) => method.value);

export function refundMethod(value) {
  return REFUND_METHODS.find((method) => method.value === value) || null;
}

export function refundMethodLabel(value) {
  return refundMethod(value)?.label || "Not recorded";
}

export function refundSendsMoney(value) {
  return Boolean(refundMethod(value)?.sendsMoney);
}

export function refundWantsReference(value) {
  return Boolean(refundMethod(value)?.needsReference);
}

export function isRefund(payment) {
  return payment?.payment_type === REFUND_TYPE;
}

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** A refund's size as a positive number, which is how a person says it. */
export function refundAmount(payment) {
  return Math.abs(num(payment?.amount));
}

/**
 * A payment that can have money given back out of it.
 *
 * It has to have actually been received: refunding money that never arrived is
 * not a refund, it is deleting the line, and the two must not be confused.
 */
export function canRefundPayment(payment) {
  return Boolean(payment) && !isRefund(payment) && Boolean(payment.is_paid) && num(payment.amount) > 0;
}

/**
 * Was this payment taken through Stripe, so a refund can be sent to the card.
 *
 * The payment intent is what Stripe refunds against. A payment settled by hand
 * has none, however it was actually paid, so it can only ever be recorded.
 */
export function canRefundToCard(payment) {
  return canRefundPayment(payment) && Boolean(payment.stripe_payment_intent_id);
}

/**
 * How much of a payment has not been given back yet.
 *
 * Counts every refund already raised against it, PROCESSED OR NOT. A refund
 * waiting to be processed is money already promised, and letting a second one
 * be raised for the same amount is how a customer gets paid twice.
 */
export function refundableAmount(payment, allPayments = []) {
  if (!canRefundPayment(payment)) return 0;
  const already = (allPayments || [])
    .filter((row) => isRefund(row) && row.refund_of_payment_id === payment.id)
    .reduce((total, row) => total + refundAmount(row), 0);
  return Math.max(0, round2(num(payment.amount) - already));
}

/** Everything that could still have money taken back out of it. */
export function refundablePayments(payments = []) {
  return (payments || []).filter((payment) => refundableAmount(payment, payments) > 0);
}

/**
 * Has this refund been sent.
 *
 * is_paid on a refund means the money has moved, exactly as it does on a
 * payment. The column keeps one meaning across both.
 */
export function isRefundProcessed(refund) {
  return isRefund(refund) && Boolean(refund.is_paid);
}

export function canProcessRefund(refund) {
  return isRefund(refund) && !refund.is_paid && refundAmount(refund) > 0;
}

/**
 * What is wrong with this refund, in the words a person reads.
 *
 * Returns "" when nothing is. The route and the form both call this, so a
 * refund the form allowed can never be one the route refuses.
 */
export function refundProblem(input = {}, { payment = null, allPayments = [] } = {}) {
  const amount = Math.abs(num(input.amount));
  if (!amount) return "Enter how much is going back.";
  if (!REFUND_METHOD_VALUES.includes(input.refund_method)) return "Choose how the money is going back.";

  if (input.refund_method === "stripe") {
    if (!payment) return "A card refund has to be against the payment it is giving back.";
    if (!canRefundToCard(payment)) {
      return "That payment did not come through the payment link, so Stripe has nothing to refund. Record it as a bank transfer or whichever way you are sending it.";
    }
  }

  if (refundWantsReference(input.refund_method) && !String(input.settlement_reference || "").trim()) {
    return `Enter the reference for the ${refundMethodLabel(input.refund_method).toLowerCase()}, so the money can be found again later.`;
  }

  if (payment) {
    const available = refundableAmount(payment, allPayments);
    if (amount > available + 0.001) {
      return available > 0
        ? `That is more than is left on this payment. ${money(available)} can still be refunded.`
        : "This payment has already been refunded in full.";
    }
  }

  if (!String(input.refund_reason || "").trim()) {
    return "Say why the money is going back. The customer is told, so it is worth a sentence.";
  }

  return "";
}

/** What a refund form's answers become in the database. */
export function refundRowFromInput(input = {}, orderId) {
  return {
    order_id: orderId,
    payment_type: REFUND_TYPE,
    // NEGATIVE. See the note at the top of this file and the check constraint
    // in 202608242000_pcd_order_refunds.sql.
    amount: -Math.abs(round2(num(input.amount))),
    is_paid: false,
    paid_at: null,
    refund_of_payment_id: input.refund_of_payment_id || null,
    refund_method: input.refund_method || null,
    refund_reason: String(input.refund_reason || "").trim() || null,
    settlement_reference: String(input.settlement_reference || "").trim() || null,
    notes: String(input.notes || "").trim() || null,
  };
}

function round2(value) {
  return Math.round(num(value) * 100) / 100;
}

function money(value) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(num(value));
}

/**
 * The email the customer gets when a refund is processed.
 *
 * Written here rather than in the route so the modal can show exactly what will
 * be sent, and so what is previewed and what is sent cannot drift apart.
 */
export function defaultRefundMessage({ order, amount, reason }) {
  return [
    `Hi ${order?.customer_name || "there"},`,
    "",
    `A refund of ${money(Math.abs(num(amount)))} is being processed for ${order?.order_number || "your order"}.`,
    ...(reason ? ["", String(reason).trim()] : []),
    "",
    "Depending on your bank, refunds to a card usually take three to five business days to appear.",
    "",
    "If anything about this does not look right, reply to this email and we will sort it out.",
    "",
    "Regards,",
    "Perth Cabinet Doors",
  ].join("\n");
}

export function defaultRefundSubject(order) {
  return `Refund processed - ${order?.order_number || "Perth Cabinet Doors"}`;
}
