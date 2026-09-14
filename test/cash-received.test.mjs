/*
 * MONEY THAT ACTUALLY HIT THE ACCOUNT.
 *
 * Financials answers two different questions with two different sets of
 * numbers. "What did we win" is dated from the day a job was confirmed. "What
 * did we bank" is dated from the day money moved. They will not match in the
 * same period and neither is wrong.
 *
 * The dangerous one is the second, because it has to agree with a bank
 * statement, and there are three ways it quietly stops agreeing:
 *
 *   1. Dropping a payment because the job was later cancelled or archived. The
 *      money still cleared. The existing owed and received figures drop those
 *      on purpose and are right to, which is exactly why the cash figures had
 *      to be their own functions rather than a flag on the old ones.
 *   2. Showing only the net, so $8,000 in with $500 back looks like $7,500 in.
 *   3. Dating a refund from the payment it reverses instead of the day it went.
 *
 * All three are pinned here, along with the promise that nothing the existing
 * reports read has changed.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABELS,
  bankedPayments,
  cashSummary,
  cashByMonth,
  cashByMethod,
  cashProfit,
  cashMargin,
  cashMethodKey,
  cashVersusConfirmed,
  isRefundRow,
  receivedPayments,
  CASH_METHOD_STRIPE,
  CASH_METHOD_UNRECORDED,
} from "../lib/pcd-financials.js";

const ALL = {};

// One order at 10%, one at no GST, so apportioning is actually exercised.
const ORDERS = [
  { id: "o1", total_inc_gst: 1100, gst_amount: 100 },
  { id: "o2", total_inc_gst: 2200, gst_amount: 200 },
  { id: "o3", total_inc_gst: 500, gst_amount: 0 },
];

const pay = (over) => ({
  id: "p" + Math.random().toString(16).slice(2),
  orderId: "o1",
  order_status: "active",
  payment_type: "deposit",
  amount: 550,
  is_paid: true,
  paid_at: "2026-03-10",
  created_at: "2026-03-01",
  settlement_method: null,
  stripe_payment_intent_id: "pi_1",
  ...over,
});

// ── What counts ──────────────────────────────────────────────────────────────

test("a payment counts once it is marked paid, and not before", () => {
  const rows = bankedPayments([pay(), pay({ is_paid: false, paid_at: null })], ALL);
  assert.equal(rows.length, 1);
});

test("money banked on a job that was later cancelled or archived still counts", () => {
  // THE ONE THAT MATTERS. A deposit that cleared in March does not come off the
  // bank statement because the job was called off in April.
  const payments = [
    pay({ orderId: "o1", order_status: "active", amount: 100 }),
    pay({ orderId: "o2", order_status: "cancelled", amount: 200 }),
    pay({ orderId: "o2", order_status: "archived", amount: 300 }),
  ];
  const banked = bankedPayments(payments, ALL);
  assert.equal(banked.length, 3);
  assert.equal(cashSummary(banked, ORDERS).inAmount, 600);

  // And the existing figure still drops them, because "what are we owed" and
  // "what did we bank" are not the same question.
  assert.equal(receivedPayments(payments, ALL).length, 1);
});

test("a refund is money out, counted separately and not just netted away", () => {
  const banked = bankedPayments([
    pay({ amount: 8000, payment_type: "final" }),
    pay({ amount: -500, payment_type: "refund", paid_at: "2026-03-20" }),
  ], ALL);
  const cash = cashSummary(banked, ORDERS);

  assert.equal(cash.inAmount, 8000);
  assert.equal(cash.outAmount, 500, "the refund has to be visible, not folded into the total");
  assert.equal(cash.net, 7500);
  assert.equal(cash.inCount, 1);
  assert.equal(cash.outCount, 1);
});

test("a refund is dated the day it went back out", () => {
  // Dating it from the payment it reverses would move money out of the month it
  // actually left, which is the sort of thing a BAS is checked against.
  const banked = bankedPayments([pay({ amount: -500, payment_type: "refund", paid_at: "2026-04-02", created_at: "2026-03-01" })], ALL);
  assert.equal(banked[0].on, "2026-04-02");
});

test("a refund is spotted by its type or by its sign", () => {
  assert.equal(isRefundRow({ payment_type: "refund", amount: -50 }), true);
  assert.equal(isRefundRow({ payment_type: "other", amount: -50 }), true, "a negative amount is money out whatever it is called");
  assert.equal(isRefundRow({ payment_type: "deposit", amount: 50 }), false);
});

test("the period is worked from the day the money moved", () => {
  const march = { from: "2026-03-01", to: "2026-03-31" };
  const rows = bankedPayments([
    pay({ paid_at: "2026-03-15" }),
    pay({ paid_at: "2026-04-01" }),
    pay({ paid_at: "2026-02-27" }),
  ], march);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].on, "2026-03-15");
});

// ── GST ──────────────────────────────────────────────────────────────────────

test("GST is apportioned against each payment's own order", () => {
  // Half of an 1100 order carries half of its 100 GST.
  const banked = bankedPayments([pay({ orderId: "o1", amount: 550 })], ALL);
  assert.equal(Math.round(cashSummary(banked, ORDERS).gst * 100) / 100, 50);
});

test("an order with no GST on it contributes none", () => {
  // Dividing by eleven would invent GST that was never charged.
  const banked = bankedPayments([pay({ orderId: "o3", amount: 500 })], ALL);
  const cash = cashSummary(banked, ORDERS);
  assert.equal(cash.gst, 0);
  assert.equal(cash.inAmount, 500);
});

test("a refund carries its GST back out with it", () => {
  const banked = bankedPayments([
    pay({ orderId: "o1", amount: 1100 }),
    pay({ orderId: "o1", amount: -550, payment_type: "refund" }),
  ], ALL);
  const cash = cashSummary(banked, ORDERS);
  assert.equal(Math.round(cash.gst * 100) / 100, 50, "100 collected less 50 given back");
  assert.equal(cash.net, 550);
});

test("a payment with no order behind it is still cash, but is left out of the GST", () => {
  const banked = bankedPayments([pay({ orderId: "missing", amount: 400 })], ALL);
  const cash = cashSummary(banked, ORDERS);
  assert.equal(cash.inAmount, 400, "the money is in the bank whether or not we can find the order");
  assert.equal(cash.gst, 0);
  assert.equal(cash.noOrderCount, 1, "and it says so rather than quietly lowering the GST");
});

test("net of GST is the net, less the GST inside it", () => {
  const banked = bankedPayments([pay({ orderId: "o1", amount: 1100 })], ALL);
  const cash = cashSummary(banked, ORDERS);
  assert.equal(Math.round(cash.exGst), 1000);
});

// ── How it arrived ───────────────────────────────────────────────────────────

test("how the money arrived is read off the row, and an unknown says so", () => {
  assert.equal(cashMethodKey({ settlement_method: "bank_transfer" }), "bank_transfer");
  assert.equal(cashMethodKey({ stripe_payment_intent_id: "pi_9" }), CASH_METHOD_STRIPE);
  assert.equal(cashMethodKey({ stripe_checkout_session_id: "cs_9" }), CASH_METHOD_STRIPE);
  // Marked paid with nothing saying how. Its own line, because that is the one
  // that cannot be ticked off a statement until somebody fills it in.
  assert.equal(cashMethodKey({}), CASH_METHOD_UNRECORDED);
  // A method beats a Stripe id: somebody recorded how it really arrived.
  assert.equal(cashMethodKey({ settlement_method: "cash", stripe_payment_intent_id: "pi_9" }), "cash");
});

test("the split by method adds back up to the net", () => {
  const banked = bankedPayments([
    pay({ amount: 1000, settlement_method: "bank_transfer", stripe_payment_intent_id: null }),
    pay({ amount: 500, stripe_payment_intent_id: "pi_2" }),
    pay({ amount: -200, payment_type: "refund", stripe_payment_intent_id: "pi_2" }),
    pay({ amount: 250, settlement_method: null, stripe_payment_intent_id: null }),
  ], ALL);
  const methods = cashByMethod(banked, (k) => k);
  const total = methods.reduce((t, m) => t + m.net, 0);
  assert.equal(total, cashSummary(banked, ORDERS).net);
  const stripe = methods.find((m) => m.key === CASH_METHOD_STRIPE);
  assert.equal(stripe.inAmount, 500);
  assert.equal(stripe.outAmount, 200);
  assert.equal(stripe.net, 300);
});

// ── Month by month ───────────────────────────────────────────────────────────

test("months only appear when money actually moved in them", () => {
  // Built from the rows, not from the range. A range with no start date is
  // everything on record, and building from that gives a column per month since
  // the day we opened.
  const banked = bankedPayments([
    pay({ paid_at: "2026-03-04", amount: 100 }),
    pay({ paid_at: "2026-03-28", amount: 200 }),
    pay({ paid_at: "2026-05-02", amount: 400 }),
    pay({ paid_at: "2026-05-09", amount: -50, payment_type: "refund" }),
  ], ALL);
  const months = cashByMonth(banked);

  assert.deepEqual(months.map((m) => m.month), ["2026-05", "2026-03"], "newest first, and no empty April");
  assert.equal(months[0].inAmount, 400);
  assert.equal(months[0].outAmount, 50);
  assert.equal(months[0].net, 350);
  assert.equal(months[1].net, 300);
});

test("the months add back up to the period", () => {
  const banked = bankedPayments([
    pay({ paid_at: "2026-01-05", amount: 900 }),
    pay({ paid_at: "2026-02-05", amount: -100, payment_type: "refund" }),
    pay({ paid_at: "2026-03-05", amount: 300 }),
  ], ALL);
  const total = cashByMonth(banked).reduce((t, m) => t + m.net, 0);
  assert.equal(total, cashSummary(banked, ORDERS).net);
});

// ── Cash against accrual ─────────────────────────────────────────────────────

test("the gap between banked and confirmed is reported, not hidden", () => {
  const gap = cashVersusConfirmed({ net: 7500 }, 12000);
  assert.equal(gap.banked, 7500);
  assert.equal(gap.confirmed, 12000);
  assert.equal(gap.difference, -4500);
});

// ── Nothing that already worked has changed ──────────────────────────────────

test("the existing reports read exactly what they read before", () => {
  // PAYMENT_TYPES builds the buckets on the owed and received breakdowns, so
  // adding to it would put a new row on a report that works. The refund LABEL
  // was added, because a refund row had no label at all and rendered blank.
  assert.deepEqual(PAYMENT_TYPES, ["deposit", "progress", "final", "other"]);
  assert.equal(PAYMENT_TYPE_LABELS.refund, "Refund");

  // And receivedPayments still keeps its own rule.
  const onArchived = [pay({ order_status: "archived" })];
  assert.equal(receivedPayments(onArchived, ALL).length, 0);
  assert.equal(bankedPayments(onArchived, ALL).length, 1);
});

test("an empty period is zero across the board, not a crash", () => {
  const cash = cashSummary(bankedPayments([], ALL), ORDERS);
  assert.equal(cash.inAmount, 0);
  assert.equal(cash.outAmount, 0);
  assert.equal(cash.net, 0);
  assert.equal(cash.gst, 0);
  assert.deepEqual(cashByMonth([]), []);
  assert.deepEqual(cashByMethod([]), []);
});

// ── The profit inside the money ──────────────────────────────────────────────

// Profit lives on the quote behind an order, not on the order, so it arrives as
// its own lookup. o1 is an 1100 job with 400 of markup and labour in it.
const PROFIT = new Map([["o1", 400], ["o3", 150]]);

test("a payment carries its share of the job's profit", () => {
  // Take half the money for a job and you have taken half its profit.
  const banked = bankedPayments([pay({ orderId: "o1", amount: 550 })], ALL);
  const p = cashProfit(banked, ORDERS, PROFIT);
  assert.equal(Math.round(p.amount), 200);
  assert.equal(p.unknownCount, 0);
});

test("a refund takes its share of the profit back out", () => {
  const banked = bankedPayments([
    pay({ orderId: "o1", amount: 1100 }),
    pay({ orderId: "o1", amount: -550, payment_type: "refund" }),
  ], ALL);
  assert.equal(Math.round(cashProfit(banked, ORDERS, PROFIT).amount), 200);
});

test("a job with no cost split behind it is unknown, never zero", () => {
  // Zero would read as a bad month rather than a missing record.
  const banked = bankedPayments([
    pay({ orderId: "o1", amount: 1100 }),
    pay({ orderId: "o2", amount: 2200 }),
  ], ALL);
  const p = cashProfit(banked, ORDERS, PROFIT);
  assert.equal(Math.round(p.amount), 400, "only the job we can cost is counted");
  assert.equal(p.unknownCount, 1);
  assert.equal(p.knownCash, 1100, "and the margin is measured against that money only");
});

test("the margin is profit over the money it actually came in on", () => {
  const banked = bankedPayments([
    pay({ orderId: "o1", amount: 1100 }),
    pay({ orderId: "o2", amount: 5000 }),
  ], ALL);
  const p = cashProfit(banked, ORDERS, PROFIT);
  // 400 of profit on the 1100 we can cost, not on the 6100 that came in.
  assert.equal(Math.round(cashMargin(p.amount, p.knownCash)), 36);
});

test("a margin on nothing is not a number", () => {
  assert.equal(cashMargin(0, 0), null);
  assert.equal(cashMargin(100, 0), null);
});

test("profit follows the same rule as the rest of the cash view", () => {
  // Banked on a cancelled job still counts, because the money still arrived.
  const banked = bankedPayments([pay({ orderId: "o1", order_status: "cancelled", amount: 1100 })], ALL);
  assert.equal(Math.round(cashProfit(banked, ORDERS, PROFIT).amount), 400);
});
