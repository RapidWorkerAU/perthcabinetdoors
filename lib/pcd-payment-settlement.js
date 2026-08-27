// A method added in Settings, Lists is read back as words wherever the list
// itself is out of reach. See lib/pcd-list-keys.js.
import { keyAsWords } from "./pcd-list-keys";

// A PAYMENT THAT ARRIVED SOME OTHER WAY.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// Once a payment link had been sent, the payment's financial fields were locked,
// and `is_paid` was one of them. The reasoning was sound: Stripe owns a
// requested payment, and hand-marking one paid invites double counting.
//
// What it did not allow for is the ordinary case. A link goes out, it does not
// work for the customer, they transfer the money instead, and there is now no
// way to close the payment off. The money is in the bank and the system insists
// it is still owing, on the order, in the financials, and on every chase list.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// A payment can always be settled. What cannot happen is settling it without
// saying HOW, because "paid" with nothing behind it is exactly what the locking
// was protecting against.
//
// So this asks for the method. The reference is offered and never demanded:
// useful for finding the payment in the bank later, and not always to hand at
// the moment somebody is closing off a job.
//
// The Stripe session is EXPIRED at the same time, not merely flagged here. A
// flag in our own database is not a closed link: the customer still holds the
// email, and an open session still takes money.
//
// The AMOUNT stays locked. Editing what was asked for after a link went out for
// a different figure is a real fault and this does not open that door.

export const SETTLEMENT_METHODS = [
  { key: "bank_transfer", label: "Bank transfer", wantsReference: true },
  { key: "cash", label: "Cash", wantsReference: false },
  { key: "card_in_person", label: "Card in person", wantsReference: true },
  { key: "cheque", label: "Cheque", wantsReference: true },
  { key: "other", label: "Some other way", wantsReference: false },
];

export const SETTLEMENT_METHOD_KEYS = SETTLEMENT_METHODS.map((entry) => entry.key);

// `methods` is the live list from Settings, Lists where the caller has it.
// Falling back to "Some other way" for a method it simply has not been given
// would put the wrong words on a payment record, so an unknown key is read as
// words instead.
export function settlementMethodLabel(key, methods = []) {
  const custom = (methods || []).filter((entry) => entry?.key === key)[0];
  if (custom) return custom.label;
  return SETTLEMENT_METHODS.find((entry) => entry.key === key)?.label || keyAsWords(key) || "Some other way";
}

export function settlementWantsReference(key, methods = []) {
  const custom = (methods || []).filter((entry) => entry?.key === key)[0];
  if (custom) return Boolean(custom.extras?.wantsReference);
  return Boolean(SETTLEMENT_METHODS.find((entry) => entry.key === key)?.wantsReference);
}

/** Is this a method somebody may still choose? */
export function isSettlementMethod(key, methods = []) {
  return (
    SETTLEMENT_METHOD_KEYS.includes(key) ||
    (methods || []).some((entry) => entry?.key === key && entry?.is_active !== false)
  );
}

/**
 * Marks the request closed rather than paid-through-Stripe.
 *
 * A separate value on purpose. "paid" would say the checkout completed, and a
 * later look at this payment has to be able to tell "they used the link" from
 * "the link never worked and they transferred it".
 */
export const SETTLED_OUTSIDE = "settled_outside";

/**
 * Can this payment be settled by hand?
 *
 * Anything unpaid can. A paid one cannot, because settling it again would be
 * either a duplicate or a correction, and a correction is a different action
 * with different consequences.
 */
export function canSettleOutsideLink(payment) {
  return Boolean(payment) && !payment.is_paid && Number(payment.amount || 0) > 0;
}

/**
 * Can this settlement be undone?
 *
 * ONLY one we recorded by hand. A payment Stripe completed is money that really
 * arrived, and un-marking it would make the books disagree with the bank.
 * A settlement, by contrast, is somebody's typing, and typing can be wrong: the
 * wrong payment on a two-payment order, the wrong date, the wrong method.
 *
 * Without this there was no way back at all. Once anything was marked paid the
 * route refused every financial field, so a mis-settled payment could only be
 * corrected in the database.
 */
export function canUndoSettlement(payment) {
  return Boolean(payment) && Boolean(payment.is_paid) && payment.request_status === SETTLED_OUTSIDE;
}

/**
 * Put a hand-settled payment back to owing.
 *
 * The old checkout session was expired when it was settled and cannot be
 * revived, so the request is cleared entirely rather than left pointing at a
 * dead link. The payment goes back to owing with no link, which is honest: a new
 * one has to be sent.
 */
export function undoSettlementPatch(payment, { reason = "" } = {}) {
  if (!canUndoSettlement(payment)) {
    return {
      error: payment?.is_paid
        ? "This payment was taken through Stripe, so it cannot be un-marked here. The money really arrived."
        : "This payment is not marked as paid.",
    };
  }
  const trimmed = String(reason || "").trim();
  if (!trimmed) return { error: "Say why you are undoing this. It is recorded against the order." };

  return {
    updates: {
      is_paid: false,
      paid_at: null,
      settlement_method: null,
      settlement_reference: null,
      // The expired session is no use to anybody. Cleared so the payment can be
      // requested again rather than showing a link that will never open.
      request_status: "not_requested",
      request_url: null,
      requested_at: null,
      stripe_checkout_session_id: null,
      stripe_payment_intent_id: null,
      notes: [String(payment.notes || "").trim(), `Settlement undone: ${trimmed}`].filter(Boolean).join(" | "),
    },
    trail: `Settlement undone: ${trimmed}`,
  };
}

/** A YYYY-MM-DD date, defaulting to today, never a future one. */
export function settlementDate(value, today = new Date()) {
  const stamp = String(value || "").trim();
  const fallback = today.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return fallback;
  // Money cannot have arrived tomorrow. A typo in the year would otherwise put
  // the payment outside every period the financials report on.
  return stamp > fallback ? fallback : stamp;
}

/**
 * What to write on the payment.
 *
 * Returns { updates, error }. The error is a sentence for the person, not a code.
 */
export function settlementPatch(
  payment,
  { method, reference = "", paidAt = "", note = "" } = {},
  today = new Date(),
  methods = []
) {
  if (!canSettleOutsideLink(payment)) {
    return { error: payment?.is_paid ? "This payment is already marked as paid." : "This payment has nothing owing on it." };
  }
  // METHODS CAN BE ADDED IN SETTINGS, LISTS, so this reads the live list as well
  // as the built-ins. Without it a method somebody set up themselves is offered
  // in the dropdown and then refused here, and the money stays showing as owing,
  // which is the exact state this whole file was built to end.
  if (!isSettlementMethod(method, methods)) {
    return { error: "Say how the payment arrived. It is recorded against the order." };
  }
  // A reference is asked for, never demanded. It is genuinely useful for finding
  // the payment in the bank later, and it is also the thing somebody does not
  // have to hand at the moment they are closing off a job. Refusing the
  // settlement over it would leave money in the bank showing as owing, which is
  // the exact state this was built to end.
  const trimmedReference = String(reference || "").trim();

  const trail = [
    `Paid by ${settlementMethodLabel(method).toLowerCase()}`,
    trimmedReference ? `ref ${trimmedReference}` : "",
    String(note || "").trim(),
  ]
    .filter(Boolean)
    .join(" - ");

  return {
    updates: {
      is_paid: true,
      paid_at: settlementDate(paidAt, today),
      // Our own record that the link is done with. Expiring the session at
      // Stripe is what actually stops it taking money, and the route does that.
      request_status: SETTLED_OUTSIDE,
      settlement_method: method,
      settlement_reference: trimmedReference || null,
      notes: [String(payment.notes || "").trim(), trail].filter(Boolean).join(" | "),
    },
    trail,
  };
}
