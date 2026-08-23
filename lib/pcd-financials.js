// The numbers behind the Financials page.
//
// Framework-free and pure, so every figure on that page can be checked here
// rather than by reading a total on screen and hoping. That matters more than
// usual for this page: nobody doubts a total. A wrong one is believed.
//
// The rule this module exists to hold: a figure is either right or it is
// UNKNOWN. Nothing here turns a missing input into a zero, because zero is a
// real answer and "we could not load it" is not.

export const PAYMENT_TYPES = ["deposit", "progress", "final", "other"];

export const PAYMENT_TYPE_LABELS = {
  deposit: "Deposit",
  progress: "Progress",
  final: "Final",
  other: "Other",
};

// ---- Periods ----
//
// The Australian financial year runs July to June, which is the one people here
// actually plan against, so it is offered alongside the calendar options rather
// than left for someone to work out from two custom dates.
export const PERIODS = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "this_fy", label: "This financial year" },
  { id: "last_fy", label: "Last financial year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom range" },
];

const iso = (d) => d.toISOString().slice(0, 10);

// Start and end dates (inclusive) for a period, worked out from a reference
// date rather than from "now", so a test can pin one and the page can pass the
// server's today.
export function periodRange(id, today, custom = {}) {
  const now = today instanceof Date ? new Date(today) : new Date(today || Date.now());
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startOf = (yy, mm) => new Date(Date.UTC(yy, mm, 1));
  const endOf = (yy, mm) => new Date(Date.UTC(yy, mm + 1, 0));

  if (id === "this_month") return { from: iso(startOf(y, m)), to: iso(endOf(y, m)) };
  if (id === "last_month") return { from: iso(startOf(y, m - 1)), to: iso(endOf(y, m - 1)) };
  if (id === "this_quarter") {
    const q = Math.floor(m / 3) * 3;
    return { from: iso(startOf(y, q)), to: iso(endOf(y, q + 2)) };
  }
  // July to June. Before July we are still in the year that started last July.
  if (id === "this_fy") {
    const start = m >= 6 ? y : y - 1;
    return { from: iso(startOf(start, 6)), to: iso(endOf(start + 1, 5)) };
  }
  if (id === "last_fy") {
    const start = (m >= 6 ? y : y - 1) - 1;
    return { from: iso(startOf(start, 6)), to: iso(endOf(start + 1, 5)) };
  }
  if (id === "custom") return { from: custom.from || "", to: custom.to || "" };
  return { from: "", to: "" }; // all time
}

// Whether a date falls inside a range. A blank end of the range means open, so
// "all time" and a half-filled custom range both behave.
export function inRange(dateish, { from, to }) {
  if (!from && !to) return true;
  const d = String(dateish || "").slice(0, 10);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function sumAmounts(rows) {
  return (rows || []).reduce((total, r) => total + num(r.amount), 0);
}

// ---- Outstanding payments ----
//
// The operational heart of the page: money we have agreed but not collected.
// Aged from the day it was REQUESTED, not the day the payment row was made,
// because a payment nobody has asked for yet is not overdue. It is not yet
// due. Those are counted separately so they can be chased as a different job.
export const AGE_BUCKETS = [
  { id: "not_requested", label: "Not requested yet", min: null, max: null },
  { id: "current", label: "Requested, under 7 days", min: 0, max: 6 },
  { id: "d7", label: "7 to 29 days", min: 7, max: 29 },
  { id: "d30", label: "30 to 59 days", min: 30, max: 59 },
  { id: "d60", label: "60 days and over", min: 60, max: null },
];

export function daysSince(dateish, today) {
  if (!dateish) return null;
  const then = new Date(String(dateish).slice(0, 10));
  const now = today instanceof Date ? new Date(today) : new Date(today || Date.now());
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    - Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate())) / 86400000));
}

export function bucketFor(payment, today) {
  if (!payment?.requested_at) return "not_requested";
  const age = daysSince(payment.requested_at, today);
  if (age === null) return "not_requested";
  if (age < 7) return "current";
  if (age < 30) return "d7";
  if (age < 60) return "d30";
  return "d60";
}

// Every unpaid payment, aged and labelled, newest chase first. Cancelled orders
// are dropped: a cancelled order is archived, and its payments are not money we
// are still owed.
export function outstandingPayments(payments, today) {
  return (payments || [])
    .filter((p) => !p.is_paid)
    .filter((p) => p.order_status !== "cancelled")
    .map((p) => ({
      ...p,
      amount: num(p.amount),
      ageDays: p.requested_at ? daysSince(p.requested_at, today) : null,
      bucket: bucketFor(p, today),
    }))
    .sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1) || b.amount - a.amount);
}

export function outstandingByBucket(rows) {
  const out = AGE_BUCKETS.map((b) => ({ ...b, count: 0, amount: 0 }));
  const byId = new Map(out.map((b) => [b.id, b]));
  for (const r of rows || []) {
    const b = byId.get(r.bucket);
    if (!b) continue;
    b.count += 1;
    b.amount += num(r.amount);
  }
  return out;
}

export function outstandingByType(rows) {
  const out = PAYMENT_TYPES.map((t) => ({ type: t, label: PAYMENT_TYPE_LABELS[t], count: 0, amount: 0 }));
  const byType = new Map(out.map((t) => [t.type, t]));
  for (const r of rows || []) {
    const t = byType.get(r.payment_type) || byType.get("other");
    if (!t) continue;
    t.count += 1;
    t.amount += num(r.amount);
  }
  return out;
}

// ---- Received payments ----
//
// Dated by when they were PAID, falling back to when the row was made for the
// handful marked paid without a date. Sorting by the fallback would quietly
// move old money into this month, so the fallback is only for the date, never
// for whether it counts.
export function receivedPayments(payments, range) {
  return (payments || [])
    .filter((p) => p.is_paid)
    .filter((p) => p.order_status !== "cancelled")
    .map((p) => ({ ...p, amount: num(p.amount), on: String(p.paid_at || p.created_at || "").slice(0, 10) }))
    .filter((p) => inRange(p.on, range || {}))
    .sort((a, b) => String(b.on).localeCompare(String(a.on)));
}

export function receivedByType(rows) {
  return outstandingByType(rows);
}

// ---- Orders and pipeline ----

// Confirmed order value in the period, dated from acceptance, falling back to
// creation for orders confirmed before that column existed.
//
// A pending_deposit order is deliberately excluded. It was raised the moment a
// customer clicked accept, before any money arrived, so counting it as revenue
// would report work nobody has paid for and may never confirm.
export function confirmedOrders(orders, range) {
  return (orders || [])
    .filter((o) => o.status !== "cancelled" && o.status !== "pending_deposit")
    .map((o) => ({ ...o, amount: num(o.total_inc_gst), on: String(o.accepted_at || o.created_at || "").slice(0, 10) }))
    .filter((o) => inRange(o.on, range || {}));
}

// Quotes sent but not yet turned into an order. `orderQuoteIds` is the set of
// quote ids an order already points at, because a quote can be linked from the
// order side without its own order_id being set.
export function openPipeline(quotes, orderQuoteIds, range) {
  const linked = orderQuoteIds instanceof Set ? orderQuoteIds : new Set(orderQuoteIds || []);
  return (quotes || [])
    .filter((q) => !q.order_id && !linked.has(q.id))
    .map((q) => ({ ...q, amount: num(q.total_inc_gst), on: String(q.sent_at || q.updated_at || q.created_at || "").slice(0, 10) }))
    .filter((q) => inRange(q.on, range || {}));
}

// Gross profit on a set of rows, from the quote's own markup and labour split.
// A row with no split behind it is counted separately rather than as zero: an
// order whose quote was deleted has revenue but nothing to say about its cost,
// and calling that $0 profit would be a lie in the confident direction.
export function grossProfit(rows, splitByQuoteId) {
  const map = splitByQuoteId instanceof Map ? splitByQuoteId : new Map(Object.entries(splitByQuoteId || {}));
  let known = 0;
  let unknownCount = 0;
  for (const row of rows || []) {
    const split = row.quote_id ? map.get(row.quote_id) : map.get(row.id);
    if (!split) { unknownCount += 1; continue; }
    known += num(split.markup_amount_ex_gst) + num(split.labour_cost_ex_gst);
  }
  return { amount: known, unknownCount };
}

// ---- GST ----
//
// Two different numbers, and which one is wanted depends on how the business
// reports. Both are offered rather than one being picked here, because getting
// this wrong is a BAS problem rather than a display problem.
//
// ACCRUAL is the GST on what has been invoiced: read straight off the rows,
// never recalculated from a rate, because the rate on a quote is stored per
// quote and could change.
export function gstOf(rows) {
  return (rows || []).reduce((total, r) => total + num(r.gst_amount), 0);
}

// The ex GST value of the same rows, worked out by subtraction for the same
// reason: the two totals are both stored, so a rate never has to be guessed at.
export function exGstOf(rows) {
  return (rows || []).reduce((total, r) => total + (num(r.total_inc_gst) - num(r.gst_amount)), 0);
}

// CASH is the GST inside money actually banked. A payment is a slice of its
// order's GST inclusive total, so it carries the same proportion of GST that
// the order does. Apportioning it that way rather than dividing by eleven keeps
// it right if an order was ever raised at a different rate, or at no GST.
//
// A payment whose order cannot be found contributes nothing and is counted, so
// a missing order shows up as an unknown rather than quietly lowering the GST.
export function gstOnReceived(received, orders) {
  const byId = orders instanceof Map ? orders : new Map((orders || []).map((o) => [o.id, o]));
  let amount = 0;
  let unknownCount = 0;
  for (const payment of received || []) {
    const order = byId.get(payment.orderId || payment.order_id);
    const total = order ? num(order.total_inc_gst) : 0;
    if (!order || total <= 0) { unknownCount += 1; continue; }
    amount += num(payment.amount) * (num(order.gst_amount) / total);
  }
  return { amount, unknownCount };
}

// Gross profit as a percentage of ex GST revenue. Null rather than zero when
// there is no revenue to measure against, because a margin on nothing is not a
// number, and 0% would read as a bad month rather than an empty one.
export function marginPercent(profit, exGst) {
  const base = num(exGst);
  if (base <= 0) return null;
  return (num(profit) / base) * 100;
}

// ---- The page's headline figures ----
export function financialTotals({ orders, received, outstanding, pipeline, profitOrders, profitPipeline }) {
  return {
    confirmed: sumAmounts(orders),
    received: sumAmounts(received),
    outstanding: sumAmounts(outstanding),
    pipeline: sumAmounts(pipeline),
    profitOrders: profitOrders || { amount: 0, unknownCount: 0 },
    profitPipeline: profitPipeline || { amount: 0, unknownCount: 0 },
  };
}

export function money(value) {
  const n = num(value);
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}
