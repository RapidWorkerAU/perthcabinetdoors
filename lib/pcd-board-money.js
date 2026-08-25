// What a finished job is still owed, once refunds are taken into account.
//
// ── THE FAULT THIS FIXES ─────────────────────────────────────────────────────
//
// The board worked out what was owed as `order total less everything marked
// paid`. Refunds are stored as payment rows with a NEGATIVE amount, which is
// exactly what makes them net off correctly everywhere else in the system.
//
// Here it worked backwards. The refund reduced the paid total, so the amount
// owed ROSE by exactly what had been given back:
//
//   Job invoiced at $1,000, paid in full, then $150 refunded.
//   paid becomes $850, so owed becomes $150,
//   and the board asks you to collect money from a job that is square.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// A refund means the invoice was wrong. So it comes off BOTH sides: the money
// received AND the amount that was owed in the first place.
//
//   owed = (total - refunded) - (received - refunded)
//
// Which is why taking it off one side only was out by exactly twice nothing and
// exactly once the refund.
//
// Pure and framework free, so the arithmetic is tested rather than trusted.

import { isRefund, refundAmount } from "./pcd-refunds";

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) => Math.round(num(value) * 100) / 100;

/**
 * What has actually been refunded on this order.
 *
 * Only refunds that were PROCESSED. A refund line raised and not yet sent is a
 * promise, and the money is still where it was: counting it early would make a
 * job look square before anybody had given anything back.
 */
export function refundedOnOrder(payments = []) {
  return round2(
    (payments || [])
      .filter((payment) => isRefund(payment) && payment.is_paid)
      .reduce((total, payment) => total + refundAmount(payment), 0)
  );
}

/** Money in, with refunds already netted off, which is what the rows hold. */
export function receivedOnOrder(payments = []) {
  return round2(
    (payments || [])
      .filter((payment) => payment.is_paid)
      .reduce((total, payment) => total + num(payment.amount), 0)
  );
}

/**
 * What is still owed on an order.
 *
 * Never negative: money given back beyond what was invoiced is a mess that
 * needs a person, not a card telling somebody to collect a negative amount.
 */
export function outstandingOnOrder(total, payments = []) {
  const refunded = refundedOnOrder(payments);
  const effectiveTotal = num(total) - refunded;
  const received = receivedOnOrder(payments);
  return Math.max(0, round2(effectiveTotal - received));
}
