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
//
// ── AND NOW THEY ACTUALLY CLOSE ──────────────────────────────────────────────
//
// A lapsed quote used to be one still sitting at 'sent' months later, which is
// the only reason this report could see it at all. Quotes now archive themselves
// the day after their validity runs out, and archived rows are deliberately
// excluded from every count in the business. Left alone, that would have emptied
// the lapsed column and walked the rate straight back to 100%, which is the
// exact thing this file exists to stop.
//
// So a quote archived BECAUSE IT EXPIRED still counts, and is still counted as
// lapsed. A quote somebody filed away by hand still does not. archived_reason is
// what tells them apart. See lib/pcd-archive.js.

import { toNumber } from "./pcd-quote-utils";
import { ARCHIVED_EXPIRED } from "./pcd-archive";
// The one place a day is counted, shared with the job that does the archiving,
// so the report and the sweep can never disagree about when a quote ran out.
import {
  ageInDays,
  daysUntilExpiry,
  expiresAt,
  FALLBACK_VALID_DAYS,
  WARN_DAYS_BEFORE_EXPIRY,
} from "./pcd-quote-clock";

export { ageInDays };

/**
 * What our own terms give a quote, when the setting cannot be read.
 *
 * The live figure is quote_valid_days in Business Defaults, and callers pass it
 * in. This is only the floor under a settings row that will not load.
 */
export const QUOTE_VALID_DAYS = FALLBACK_VALID_DAYS;

export const OUTCOMES = {
  converted: "Converted",
  lost: "Declined",
  lapsed: "Lapsed",
  pending: "Still live",
  draft: "Never sent",
};

const dayMs = 86400000;

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
  // Archived on expiry: the same silence as below, just tidied away afterwards.
  // Read before the draft check, because an archived quote keeps its sent_at and
  // would otherwise be fine, but a quote archived with no sent_at never went out.
  if (status === "archived") {
    if (String(quote?.archived_reason || "") !== ARCHIVED_EXPIRED) return "filed";
    return quote?.sent_at ? "lapsed" : "draft";
  }
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
    // Filed away by hand. Kept out of every rate below, exactly as it always
    // was, and held here only so a quote can never fall through this loop.
    filed: emptyBucket(),
  };

  // THE ONES WORTH A PHONE CALL, and until now nothing surfaced them.
  //
  // Inside their last seven days, still unanswered, still approvable. Once a
  // quote passes this window it is gone, so this is the last point at which
  // anything can be done about it.
  const expiringSoon = [];

  // Did the reminder do anything. Of the quotes that got the day 23 email, how
  // many were approved afterwards. A figure, not a verdict: whether it is worth
  // having is a judgement with a dozen things behind it that no report can see.
  let warnedCount = 0;
  let warnedConverted = 0;

  quotes.forEach((quote) => {
    const outcome = outcomeOf(quote, { now, validDays });
    const bucket = buckets[outcome];
    const total = toNumber(quote.total_inc_gst);
    bucket.count += 1;
    bucket.value += total;

    const entry = {
      id: quote.id,
      number: quote.quote_number,
      customer: quote.customer_name || "",
      status: quote.status,
      total,
      sentAt: quote.sent_at || null,
      age: ageInDays(quote.sent_at, now),
      outcome,
      // Null on anything that is not still running: an approved or archived
      // quote has no days left, and showing "-3 days" beside one would read as
      // a fault rather than as history.
      expiresAt: outcome === "pending" ? expiresAt(quote.sent_at, validDays)?.toISOString() || null : null,
      daysLeft: outcome === "pending" ? daysUntilExpiry(quote.sent_at, validDays, now) : null,
      warnedAt: quote.expiry_warned_at || null,
      archivedReason: quote.archived_reason || null,
    };
    bucket.quotes.push(entry);

    if (quote.expiry_warned_at) {
      warnedCount += 1;
      if (outcome === "converted") warnedConverted += 1;
    }

    if (outcome === "pending" && entry.daysLeft !== null && entry.daysLeft <= WARN_DAYS_BEFORE_EXPIRY) {
      expiringSoon.push(entry);
    }
  });

  // Closest to expiring first. This list is read top down when there is time to
  // ring one or two of them, so the most urgent has to be the first line.
  expiringSoon.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

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

  // Of the lapsed ones, how many actually closed themselves rather than still
  // sitting there. On a book from before the sweep existed this is zero and
  // climbs; a lapsed column that stays entirely un-archived means the job has
  // stopped running.
  const lapsedArchived = buckets.lapsed.quotes.filter((quote) => quote.archivedReason === ARCHIVED_EXPIRED);

  return {
    buckets,
    expiringSoon,
    expiry: {
      warnDays: WARN_DAYS_BEFORE_EXPIRY,
      // Reminded, and what came of it.
      warned: warnedCount,
      warnedConverted,
      // Archived automatically because they ran out, and what that was worth.
      archivedOnExpiry: lapsedArchived.length,
      archivedOnExpiryValue: Math.round(lapsedArchived.reduce((sum, quote) => sum + quote.total, 0) * 100) / 100,
    },
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
