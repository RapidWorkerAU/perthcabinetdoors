// The Financials page's arithmetic.
//
// Every figure here is one somebody makes a decision on, so each rule that
// keeps a number honest gets a test rather than a comment.

import test from "node:test";
import assert from "node:assert/strict";

import {
  periodRange,
  inRange,
  sumAmounts,
  daysSince,
  bucketFor,
  outstandingPayments,
  outstandingByBucket,
  outstandingByType,
  receivedPayments,
  confirmedOrders,
  openPipeline,
  grossProfit,
  gstOf,
  exGstOf,
  gstOnReceived,
  marginPercent,
  financialTotals,
  money,
  PERIODS,
  AGE_BUCKETS,
} from "../lib/pcd-financials.js";

const TODAY = "2026-08-18"; // a Tuesday in August, so FY 2026/27 is current

// ── Periods ────────────────────────────────────────────────────────────────

test("this month is the whole calendar month, both ends inclusive", () => {
  assert.deepEqual(periodRange("this_month", TODAY), { from: "2026-08-01", to: "2026-08-31" });
});

test("last month rolls back over a year boundary", () => {
  assert.deepEqual(periodRange("last_month", "2026-01-09"), { from: "2025-12-01", to: "2025-12-31" });
});

test("the quarter is the calendar quarter containing today", () => {
  assert.deepEqual(periodRange("this_quarter", TODAY), { from: "2026-07-01", to: "2026-09-30" });
});

// The financial year is the one the business actually reports on. Getting the
// July boundary backwards would put half the year's income in the wrong one.
test("the financial year runs July to June", () => {
  assert.deepEqual(periodRange("this_fy", "2026-08-18"), { from: "2026-07-01", to: "2027-06-30" });
});

test("before July we are still in the year that started last July", () => {
  assert.deepEqual(periodRange("this_fy", "2026-06-30"), { from: "2025-07-01", to: "2026-06-30" });
  assert.deepEqual(periodRange("this_fy", "2026-07-01"), { from: "2026-07-01", to: "2027-06-30" });
});

test("last financial year is the one before that, on the same boundary", () => {
  assert.deepEqual(periodRange("last_fy", "2026-08-18"), { from: "2025-07-01", to: "2026-06-30" });
  assert.deepEqual(periodRange("last_fy", "2026-06-30"), { from: "2024-07-01", to: "2025-06-30" });
});

test("all time is an open range, and lets everything through", () => {
  assert.deepEqual(periodRange("all", TODAY), { from: "", to: "" });
  assert.equal(inRange("2019-01-01", periodRange("all", TODAY)), true);
});

test("a custom range carries the dates it was given", () => {
  assert.deepEqual(periodRange("custom", TODAY, { from: "2026-03-01", to: "2026-03-31" }),
    { from: "2026-03-01", to: "2026-03-31" });
});

test("a half-filled custom range stays open at the empty end", () => {
  const range = periodRange("custom", TODAY, { from: "2026-03-01", to: "" });
  assert.equal(inRange("2030-01-01", range), true);
  assert.equal(inRange("2026-02-28", range), false);
});

test("every period offered on screen produces a usable range", () => {
  PERIODS.forEach((p) => {
    const r = periodRange(p.id, TODAY, { from: "2026-01-01", to: "2026-01-31" });
    assert.ok(r && typeof r.from === "string" && typeof r.to === "string", p.id);
  });
});

// A row with no date at all must not silently count inside a bounded period.
test("a row with no date is out of a bounded range, in an open one", () => {
  assert.equal(inRange("", { from: "2026-08-01", to: "2026-08-31" }), false);
  assert.equal(inRange("", { from: "", to: "" }), true);
});

test("range ends are inclusive", () => {
  const r = { from: "2026-08-01", to: "2026-08-31" };
  assert.equal(inRange("2026-08-01", r), true);
  assert.equal(inRange("2026-08-31", r), true);
  assert.equal(inRange("2026-09-01", r), false);
});

test("a timestamp is compared on its date part, not as a whole string", () => {
  // "2026-08-31T09:00:00Z" > "2026-08-31" as a plain string compare, so a
  // payment taken on the last day of the month would drop out of the month.
  assert.equal(inRange("2026-08-31T09:00:00.000Z", { from: "2026-08-01", to: "2026-08-31" }), true);
});

// ── Sums ───────────────────────────────────────────────────────────────────

test("amounts sum, and a non-numeric amount counts as nothing rather than NaN", () => {
  assert.equal(sumAmounts([{ amount: 100 }, { amount: "250.50" }, { amount: null }]), 350.5);
  assert.equal(sumAmounts([]), 0);
  assert.equal(sumAmounts(null), 0);
});

// ── Ageing ─────────────────────────────────────────────────────────────────

test("age is whole days, and never negative", () => {
  assert.equal(daysSince("2026-08-11", TODAY), 7);
  assert.equal(daysSince("2026-08-18", TODAY), 0);
  assert.equal(daysSince("2026-09-01", TODAY), 0);
  assert.equal(daysSince(null, TODAY), null);
});

// Ageing from the request, not the row's creation: a payment nobody has asked
// for yet is not overdue, it is not yet due.
test("an unrequested payment is not aged, it is its own bucket", () => {
  assert.equal(bucketFor({ created_at: "2020-01-01" }, TODAY), "not_requested");
});

test("the bucket boundaries are 7, 30 and 60 days", () => {
  const at = (days) => {
    const d = new Date(Date.UTC(2026, 7, 18) - days * 86400000);
    return bucketFor({ requested_at: d.toISOString().slice(0, 10) }, TODAY);
  };
  assert.equal(at(0), "current");
  assert.equal(at(6), "current");
  assert.equal(at(7), "d7");
  assert.equal(at(29), "d7");
  assert.equal(at(30), "d30");
  assert.equal(at(59), "d30");
  assert.equal(at(60), "d60");
  assert.equal(at(400), "d60");
});

// ── Outstanding ────────────────────────────────────────────────────────────

const PAYMENTS = [
  { id: "a", amount: 1000, is_paid: false, payment_type: "deposit", requested_at: "2026-06-01", order_status: "active" },
  { id: "b", amount: 500, is_paid: false, payment_type: "final", requested_at: "2026-08-15", order_status: "active" },
  { id: "c", amount: 250, is_paid: false, payment_type: "progress", requested_at: null, order_status: "active" },
  { id: "d", amount: 9999, is_paid: false, payment_type: "final", requested_at: "2026-01-01", order_status: "cancelled" },
  { id: "e", amount: 700, is_paid: true, payment_type: "deposit", paid_at: "2026-08-10", order_status: "active" },
];

test("a paid payment is not outstanding", () => {
  assert.equal(outstandingPayments(PAYMENTS, TODAY).some((p) => p.id === "e"), false);
});

// A cancelled order is archived. Counting its payments as money owed would
// inflate the debtors figure with work nobody is going to do.
test("a cancelled order's payments are not money we are owed", () => {
  assert.equal(outstandingPayments(PAYMENTS, TODAY).some((p) => p.id === "d"), false);
  assert.equal(sumAmounts(outstandingPayments(PAYMENTS, TODAY)), 1750);
});

test("the oldest chase sorts first, unrequested last", () => {
  assert.deepEqual(outstandingPayments(PAYMENTS, TODAY).map((p) => p.id), ["a", "b", "c"]);
});

test("every outstanding row lands in exactly one bucket, and they add up", () => {
  const rows = outstandingPayments(PAYMENTS, TODAY);
  const buckets = outstandingByBucket(rows);
  assert.equal(buckets.length, AGE_BUCKETS.length);
  assert.equal(buckets.reduce((n, b) => n + b.count, 0), rows.length);
  assert.equal(buckets.reduce((n, b) => n + b.amount, 0), sumAmounts(rows));
  assert.equal(buckets.find((b) => b.id === "not_requested").amount, 250);
  assert.equal(buckets.find((b) => b.id === "d60").amount, 1000);
});

test("the type split covers every row too", () => {
  const rows = outstandingPayments(PAYMENTS, TODAY);
  const types = outstandingByType(rows);
  assert.equal(types.reduce((n, t) => n + t.amount, 0), sumAmounts(rows));
  assert.equal(types.find((t) => t.type === "deposit").amount, 1000);
});

test("an unrecognised payment type falls into Other rather than vanishing", () => {
  const rows = [{ amount: 400, payment_type: "weird" }];
  assert.equal(outstandingByType(rows).reduce((n, t) => n + t.amount, 0), 400);
  assert.equal(outstandingByType(rows).find((t) => t.type === "other").amount, 400);
});

// ── Received ───────────────────────────────────────────────────────────────

test("received payments are dated by when they were paid, not created", () => {
  const rows = receivedPayments(
    [{ amount: 700, is_paid: true, paid_at: "2026-08-10", created_at: "2026-02-01" }],
    periodRange("this_month", TODAY)
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].on, "2026-08-10");
});

test("a paid row with no paid date falls back to created, and still counts", () => {
  const rows = receivedPayments([{ amount: 300, is_paid: true, created_at: "2026-08-05" }], periodRange("this_month", TODAY));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].on, "2026-08-05");
});

test("an unpaid payment is never counted as received", () => {
  assert.equal(receivedPayments(PAYMENTS, { from: "", to: "" }).length, 1);
});

// ── Orders and pipeline ────────────────────────────────────────────────────

const ORDERS = [
  { id: "o1", quote_id: "q1", status: "active", total_inc_gst: 12000, accepted_at: "2026-08-02" },
  { id: "o2", quote_id: "q2", status: "cancelled", total_inc_gst: 8000, accepted_at: "2026-08-03" },
  { id: "o3", quote_id: null, status: "complete", total_inc_gst: 5000, accepted_at: null, created_at: "2026-08-04" },
  { id: "o4", quote_id: "q4", status: "active", total_inc_gst: 4000, accepted_at: "2026-05-01" },
];

test("a cancelled order is not confirmed revenue", () => {
  const rows = confirmedOrders(ORDERS, periodRange("this_month", TODAY));
  assert.deepEqual(rows.map((o) => o.id), ["o1", "o3"]);
  assert.equal(sumAmounts(rows), 17000);
});

test("an order with no acceptance date falls back to when it was created", () => {
  assert.equal(confirmedOrders(ORDERS, periodRange("this_month", TODAY)).find((o) => o.id === "o3").on, "2026-08-04");
});

const QUOTES = [
  { id: "q5", status: "sent", total_inc_gst: 20000, sent_at: "2026-08-06", order_id: null },
  { id: "q1", status: "sent", total_inc_gst: 12000, sent_at: "2026-08-01", order_id: null },
  { id: "q6", status: "viewed", total_inc_gst: 3000, sent_at: "2026-08-07", order_id: "o9" },
];

// A quote can be linked from the order's side without its own order_id being
// set. Trusting only order_id counted already-won work as still open.
test("a quote an order already points at is not open pipeline", () => {
  const open = openPipeline(QUOTES, new Set(["q1"]), periodRange("this_month", TODAY));
  assert.deepEqual(open.map((q) => q.id), ["q5"]);
});

test("a quote with its own order_id is not open pipeline either", () => {
  assert.equal(openPipeline(QUOTES, new Set(), { from: "", to: "" }).some((q) => q.id === "q6"), false);
});

// ── Profit ─────────────────────────────────────────────────────────────────

const SPLIT = new Map([
  ["q1", { markup_amount_ex_gst: 3000, labour_cost_ex_gst: 1500 }],
  ["q4", { markup_amount_ex_gst: 1000, labour_cost_ex_gst: 500 }],
]);

test("profit is markup plus labour on the quote behind the order", () => {
  const rows = confirmedOrders(ORDERS, { from: "", to: "" });
  const p = grossProfit(rows, SPLIT);
  assert.equal(p.amount, 6000);
});

// An order whose quote was deleted has revenue but nothing to say about cost.
// Counting that as $0 profit understates the margin and reads as certain.
test("an order with no split behind it is unknown, not zero", () => {
  const p = grossProfit(confirmedOrders(ORDERS, { from: "", to: "" }), SPLIT);
  assert.equal(p.unknownCount, 1);
});

test("a quote row is matched on its own id, since it has no quote_id", () => {
  assert.equal(grossProfit([{ id: "q1" }], SPLIT).amount, 4500);
});

// ── Totals ─────────────────────────────────────────────────────────────────

test("the headline figures come from the same rows the tables show", () => {
  const range = periodRange("this_month", TODAY);
  const orders = confirmedOrders(ORDERS, range);
  const received = receivedPayments(PAYMENTS, range);
  const outstanding = outstandingPayments(PAYMENTS, TODAY);
  const pipeline = openPipeline(QUOTES, new Set(["q1"]), range);
  const totals = financialTotals({
    orders, received, outstanding, pipeline,
    profitOrders: grossProfit(orders, SPLIT),
    profitPipeline: grossProfit(pipeline, SPLIT),
  });
  assert.equal(totals.confirmed, sumAmounts(orders));
  assert.equal(totals.received, sumAmounts(received));
  assert.equal(totals.outstanding, 1750);
  assert.equal(totals.pipeline, 20000);
  assert.equal(totals.profitOrders.amount, 4500);
});

test("money reads as Australian dollars with no cents", () => {
  assert.equal(money(1234.56).replace(/ /g, " "), "$1,235");
  assert.equal(money(null).replace(/ /g, " "), "$0");
});

// ── GST ─────────────────────────────────────────────────────────────────────
//
// Two figures, because the BAS is reported on one basis or the other and they
// are not the same number. Getting either wrong is a tax problem.

test("GST invoiced is read off the rows, never worked back from a rate", () => {
  // A row raised at a different rate, or at no GST at all, has to come out at
  // what it actually says rather than at one eleventh of its total.
  const rows = [
    { total_inc_gst: 1100, gst_amount: 100 },
    { total_inc_gst: 550, gst_amount: 50 },
    { total_inc_gst: 300, gst_amount: 0 },
  ];
  assert.equal(gstOf(rows), 150);
  assert.equal(exGstOf(rows), 1800);
});

test("GST of nothing is nothing, not a crash", () => {
  assert.equal(gstOf([]), 0);
  assert.equal(gstOf(null), 0);
  assert.equal(exGstOf(undefined), 0);
});

test("GST collected is apportioned by each payment's own order", () => {
  // A deposit is a slice of the order's GST inclusive total, so it carries the
  // same proportion of GST the order does.
  const orders = [
    { id: "o1", total_inc_gst: 1100, gst_amount: 100 },
    { id: "o2", total_inc_gst: 2200, gst_amount: 200 },
  ];
  const received = [
    { orderId: "o1", amount: 550 },   // half of o1, so half its GST
    { orderId: "o2", amount: 2200 },  // all of o2
  ];
  const result = gstOnReceived(received, orders);
  assert.equal(Math.round(result.amount * 100) / 100, 250);
  assert.equal(result.unknownCount, 0);
});

test("an order with no GST on it contributes no GST when it is paid", () => {
  const result = gstOnReceived(
    [{ orderId: "o1", amount: 500 }],
    [{ id: "o1", total_inc_gst: 500, gst_amount: 0 }]
  );
  assert.equal(result.amount, 0);
  assert.equal(result.unknownCount, 0);
});

// The rule this whole module exists for: a missing input is unknown, never a
// quiet zero that drags a total down.
test("a payment whose order is missing is counted, not silently ignored", () => {
  const result = gstOnReceived(
    [{ orderId: "o1", amount: 1100 }, { orderId: "gone", amount: 990 }],
    [{ id: "o1", total_inc_gst: 1100, gst_amount: 100 }]
  );
  assert.equal(result.amount, 100);
  assert.equal(result.unknownCount, 1);
});

test("an order with a zero total cannot be apportioned, so it is unknown", () => {
  const result = gstOnReceived(
    [{ orderId: "o1", amount: 100 }],
    [{ id: "o1", total_inc_gst: 0, gst_amount: 0 }]
  );
  assert.equal(result.amount, 0);
  assert.equal(result.unknownCount, 1);
});

// ── Margin ──────────────────────────────────────────────────────────────────

test("margin is profit over the ex GST value, not over the inc GST one", () => {
  // $1,100 inc GST is $1,000 of work. $250 profit on that is 25%, not 22.7%.
  assert.equal(marginPercent(250, 1000), 25);
});

test("a margin on no revenue is unknown, not zero", () => {
  // 0% would read as a bad month. There was no month.
  assert.equal(marginPercent(0, 0), null);
  assert.equal(marginPercent(500, 0), null);
  assert.equal(marginPercent(0, 1000), 0);
});
