// WHAT HAPPENS TO A QUOTE.
//
// ── WHY THE 30 DAY RULE EXISTS ───────────────────────────────────────────────
//
// Nobody marks a quote rejected. A customer who goes quiet just goes quiet, so
// the quote sits at 'sent' or 'viewed' forever and the books show every decided
// quote as won. Computed honestly against the raw statuses, the conversion rate
// was 100%, which is not a number anybody can use.
//
// So a quote that has been out longer than the period our own terms give it is
// treated as lost. Thirty days, because that is what the quote itself says:
// "All prices quoted are valid for 30 days from the date of quotation." We are
// not inventing a rule, we are applying the one already printed on the document.
//
// On the real book that turns 100% into 64%, which is a number that can be
// argued with, and that is the whole point of measuring it.
//
// ── PENDING IS SHOWN, AND KEPT OUT OF THE RATE ───────────────────────────────
//
// A quote sent last Tuesday is not a loss and it is not a win. Folding it into
// either makes this week's rate move for a reason that has not happened yet, so
// it sits beside the rate rather than inside it: real money, still live, and
// visibly not counted.
//
// ── A DRAFT IS NOT A LEAD ────────────────────────────────────────────────────
//
// Never sent, so nobody ever had the chance to say yes. Counting drafts as
// losses would punish us for the quotes we thought better of.

import { toNumber } from "./pcd-quote-utils";

/** What our own terms give a quote. Not a number invented for this report. */
export const QUOTE_VALID_DAYS = 30;

export const OUTCOMES = {
  converted: "Converted",
  lost: "Declined",
  lapsed: "Lapsed",
  pending: "Still live",
  draft: "Never sent",
};

const dayMs = 86400000;

/** Whole days between then and now, or null when there is no date to age. */
export function ageInDays(value, now = new Date()) {
  if (!value) return null;
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((now.getTime() - then.getTime()) / dayMs);
}

/**
 * Which bucket a quote falls in.
 *
 * `lapsed` is the one doing the work: out longer than our terms are good for,
 * never answered. It counts as lost, but it is kept apart from a real decline
 * so nobody reads a silence as a customer having said no.
 */
export function outcomeOf(quote, { now = new Date(), validDays = QUOTE_VALID_DAYS } = {}) {
  const status = String(quote?.status || "").toLowerCase();
  if (status === "approved") return "converted";
  if (status === "rejected") return "lost";
  if (status === "draft" || !quote?.sent_at) return "draft";
  // awaiting_deposit is deliberately NOT converted: they said yes and the money
  // has not arrived, so it is still live. See lib/pcd-deposit-gate.js.
  const age = ageInDays(quote.sent_at, now);
  return age !== null && age > validDays ? "lapsed" : "pending";
}

const emptyBucket = () => ({ count: 0, value: 0, quotes: [] });

/**
 * The report.
 *
 * @param {object} input
 * @param {Array} input.quotes
 * @param {Array} [input.requests]  quote requests, for where the work came from
 * @returns {object}
 */
export function leadConversion({ quotes = [], requests = [] } = {}, { now = new Date(), validDays = QUOTE_VALID_DAYS } = {}) {
  const buckets = {
    converted: emptyBucket(),
    lost: emptyBucket(),
    lapsed: emptyBucket(),
    pending: emptyBucket(),
    draft: emptyBucket(),
  };

  quotes.forEach((quote) => {
    const outcome = outcomeOf(quote, { now, validDays });
    const bucket = buckets[outcome];
    bucket.count += 1;
    bucket.value += toNumber(quote.total_inc_gst);
    bucket.quotes.push({
      id: quote.id,
      number: quote.quote_number,
      customer: quote.customer_name || "",
      status: quote.status,
      total: toNumber(quote.total_inc_gst),
      sentAt: quote.sent_at || null,
      age: ageInDays(quote.sent_at, now),
      outcome,
    });
  });

  Object.values(buckets).forEach((bucket) => {
    bucket.value = Math.round(bucket.value * 100) / 100;
    // Oldest first: on a lapsed list that is the one to chase or write off, and
    // on a live list it is the one about to lapse.
    bucket.quotes.sort((a, b) => (b.age ?? -1) - (a.age ?? -1));
  });

  // DECIDED, which is what a rate can honestly be taken over. Drafts were never
  // sent and pending has not been answered.
  const decidedCount = buckets.converted.count + buckets.lost.count + buckets.lapsed.count;
  const decidedValue = buckets.converted.value + buckets.lost.value + buckets.lapsed.value;

  // How long the ones we won took to say yes. The median rather than the mean,
  // because one quote approved eight weeks later drags an average somewhere
  // that describes nothing.
  const turnarounds = quotes
    .filter((quote) => String(quote.status).toLowerCase() === "approved" && quote.sent_at && quote.approved_at)
    .map((quote) => Math.floor((new Date(quote.approved_at) - new Date(quote.sent_at)) / dayMs))
    .filter((days) => days >= 0)
    .sort((a, b) => a - b);

  const sources = new Map();
  requests.forEach((request) => {
    const key = request.source || "unknown";
    sources.set(key, (sources.get(key) || 0) + 1);
  });

  return {
    buckets,
    decided: {
      count: decidedCount,
      value: Math.round(decidedValue * 100) / 100,
      rateByCount: decidedCount ? Math.round((buckets.converted.count / decidedCount) * 1000) / 10 : null,
      rateByValue: decidedValue ? Math.round((buckets.converted.value / decidedValue) * 1000) / 10 : null,
    },
    turnaround: turnarounds.length
      ? {
          median: turnarounds[Math.floor(turnarounds.length / 2)],
          fastest: turnarounds[0],
          slowest: turnarounds[turnarounds.length - 1],
          counted: turnarounds.length,
        }
      : null,
    sources: [...sources.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    validDays,
  };
}
