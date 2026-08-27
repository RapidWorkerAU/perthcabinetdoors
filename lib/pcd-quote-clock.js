// HOW LONG A QUOTE LASTS, and nothing else.
//
// ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────────
//
// Three things have to agree about when a quote runs out, and they used to be
// two things that did not:
//
//   the reminder    tells the customer a date in writing
//   the sweep       archives it and kills their link
//   lead conversion counts it as a lost lead
//
// If any one of them counted a day differently, a quote could be reported lost
// while it was still approvable, or archived a day before the date we had put
// in an email. So the counting lives here, on its own, with no database and no
// mail provider anywhere near it, and all three read it.
//
// The one thing NOT decided here is how many days. That is a Business Default,
// because it is a policy, and it is passed in.

/** The statuses that mean "sent to a customer, no answer yet". */
export const UNANSWERED_STATUSES = ["sent", "viewed"];

/** How much notice the customer gets. Seven days, hence day 23 of 30. */
export const WARN_DAYS_BEFORE_EXPIRY = 7;

/**
 * What our own terms give a quote, when the setting cannot be read.
 *
 * A last resort, not the source of the policy. The real figure is
 * quote_valid_days in Business Defaults, and it is 30 there because that is
 * what the quote itself says: "Prices are valid for 30 days".
 */
export const FALLBACK_VALID_DAYS = 30;

const DAY_MS = 86400000;

/** Whole days since a quote was sent, or null when there is nothing to age. */
export function ageInDays(value, now = new Date()) {
  if (!value) return null;
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((now.getTime() - then.getTime()) / DAY_MS);
}

/**
 * The last moment a quote can be approved: sent date plus its validity.
 *
 * A quote sent on 5 August with 30 days expires on 4 September, which is the
 * date the customer is told and the last day their link works.
 *
 * The sweep runs at fixed times rather than continuously, so a quote can outlive
 * this moment by a few hours before the pass that archives it comes round. That
 * is deliberately the direction the slack runs in: a customer given a few extra
 * hours has lost nothing, and a link killed before the date we put in writing
 * would be us breaking our own word.
 */
export function expiresAt(sentAt, validDays = FALLBACK_VALID_DAYS) {
  if (!sentAt) return null;
  const then = new Date(sentAt);
  if (Number.isNaN(then.getTime())) return null;
  return new Date(then.getTime() + Number(validDays) * DAY_MS);
}

/** Days the customer has left. Negative once it is past its validity. */
export function daysUntilExpiry(sentAt, validDays = FALLBACK_VALID_DAYS, now = new Date()) {
  const age = ageInDays(sentAt, now);
  return age === null ? null : Number(validDays) - age;
}

/**
 * Where a quote sits on its clock right now.
 *
 * Returns one of:
 *   "out_of_scope"  not an unanswered sent quote, or nothing to age from
 *   "waiting"       inside its validity and not yet due a reminder
 *   "warn"          inside its last seven days and not yet told
 *   "warned"        inside its last seven days and already told
 *   "expire"        past its validity
 */
export function expiryState(quote, { validDays = FALLBACK_VALID_DAYS, now = new Date() } = {}) {
  const status = String(quote?.status || "").toLowerCase();
  if (!UNANSWERED_STATUSES.includes(status)) return "out_of_scope";
  // A quote that became an order is not ours to put away: the order and the
  // financials behind it still read from it. The manual archive route refuses
  // the same case, and for the same reason.
  if (quote?.order_id) return "out_of_scope";

  const age = ageInDays(quote?.sent_at, now);
  if (age === null) return "out_of_scope";

  // Strictly greater, so a quote on its final day is still live. The terms say
  // valid FOR thirty days, and day thirty is one of them.
  if (age > Number(validDays)) return "expire";
  if (age < Number(validDays) - WARN_DAYS_BEFORE_EXPIRY) return "waiting";
  return quote?.expiry_warned_at ? "warned" : "warn";
}
