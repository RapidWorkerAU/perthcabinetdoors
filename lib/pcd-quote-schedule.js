// WHEN WE SAY THE JOB WOULD HAPPEN, AND HOW LONG WE STAND BEHIND IT.
//
// ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────────
//
// Five places say something about a quote's suggested dates: the quote editor,
// the public quote page, the quote PDF, the approval confirmation email, and
// the order once the quote has been accepted. If any two of them counted the
// hold differently, a customer could be told on the page that their dates still
// stand and told in the PDF that they do not.
//
// So the counting and the wording both live here, with no database and no PDF
// library anywhere near them, and all five read it.
//
// ── THE HOLD ─────────────────────────────────────────────────────────────────
//
// A suggested start date is only honest while the bench is still free. A quote
// can sit unanswered for weeks, and the dates on it do not get better with age.
// So the quote says out loud how long they hold for, counted from when it was
// SENT rather than from when it was written: a quote drafted on Monday and sent
// on Thursday holds from Thursday, because Thursday is when the customer first
// had the chance to answer.
//
// How many hours is a Business Default, because it is a policy. See
// schedule_hold_hours.
//
// ── WHAT HAPPENS WHEN IT LAPSES ──────────────────────────────────────────────
//
// Nothing, to the dates. They are still copied onto the order at acceptance,
// because an order with no dates on it is invisible to the calendar and to
// every list that plans work, and a stale date somebody can see and fix beats
// no date at all. What changes is what the customer is told, and what the order
// page says to whoever opens it. See scheduleHoldNotice and staleScheduleNotice.

import { durationDays, scheduleDate } from "./pcd-order-schedule";

const HOUR_MS = 3600000;

/**
 * What our own quote says, when the setting cannot be read.
 *
 * A last resort, not the source of the policy. The real figure is
 * schedule_hold_hours in Business Defaults.
 */
export const FALLBACK_HOLD_HOURS = 48;

function holdHoursFrom(businessDefaults) {
  const hours = Number(businessDefaults?.schedule_hold_hours);
  return Number.isFinite(hours) && hours > 0 ? Math.round(hours) : FALLBACK_HOLD_HOURS;
}

/**
 * "48 hours".
 *
 * Always in hours, never converted to days. The window is short by design and
 * the customer is being asked to act inside it: "48 hours" reads as a deadline
 * and "2 days" reads as a rough idea of one.
 */
export function holdWindowLabel(businessDefaults) {
  const hours = holdHoursFrom(businessDefaults);
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/**
 * The pair of dates a quote suggests, or nulls.
 *
 * Both or neither is the only pair worth showing: a start with no completion
 * cannot be planned around and reads on the page as if we could not decide.
 */
export function suggestedSchedule(quote = {}) {
  const start = scheduleDate(quote.suggested_start_date);
  const completion = scheduleDate(quote.suggested_completion_date);
  return { start, completion, complete: Boolean(start && completion) };
}

/** Both dates set. Anything less is not a suggestion anybody can act on. */
export function hasSuggestedSchedule(quote = {}) {
  return suggestedSchedule(quote).complete;
}

/**
 * How long the suggested job runs, counting the start day itself.
 *
 * Null unless both dates are set, for the same reason durationDays is: a length
 * worked out from half a schedule is a guess wearing a number.
 */
export function suggestedDurationDays(quote = {}) {
  return durationDays({
    scheduled_start_date: quote.suggested_start_date,
    target_completion_date: quote.suggested_completion_date,
  });
}

/**
 * What is wrong with the pair, in the words the screen shows.
 *
 * A completion date before the start is the one that has to be refused. It is
 * not a tight schedule, it is a typo, and it becomes the order's schedule the
 * moment the customer accepts, where the same pair is already refused.
 */
export function suggestedScheduleProblems(quote = {}) {
  const { start, completion } = suggestedSchedule(quote);
  const problems = [];
  if (start && completion && completion < start) {
    problems.push({
      field: "suggested_completion_date",
      message: "The suggested completion date is before the suggested start date.",
    });
  }
  return problems;
}

/** The moment the hold runs out, or null when the quote has not been sent. */
export function holdExpiresAt(quote = {}, businessDefaults) {
  const sent = quote?.sent_at ? new Date(quote.sent_at) : null;
  if (!sent || Number.isNaN(sent.getTime())) return null;
  return new Date(sent.getTime() + holdHoursFrom(businessDefaults) * HOUR_MS);
}

/**
 * Do the dates still stand?
 *
 * Three answers, not two, and the third is not a failure. A quote that has
 * never been sent has no clock running on it at all, and saying its dates have
 * lapsed would be wrong in the direction that loses work.
 *
 *   "held"    inside the window, or never sent
 *   "lapsed"  sent longer ago than the window allows
 */
export function holdState(quote = {}, businessDefaults, now = new Date()) {
  const expires = holdExpiresAt(quote, businessDefaults);
  if (!expires) return "held";
  return now.getTime() <= expires.getTime() ? "held" : "lapsed";
}

/**
 * The condition, in the words the customer reads.
 *
 * ONE SENTENCE, SAID ONCE. It appears under the dates on the quote page, on the
 * PDF and in the confirmation email, and it has to read the same in all three
 * or it stops being a condition and becomes three different promises.
 *
 * It does not promise a phone call. It says what happens, which is that we come
 * back with dates, and leaves how to us.
 */
export function scheduleHoldNotice(quote = {}, businessDefaults) {
  const window = holdWindowLabel(businessDefaults);
  return (
    `These dates are held for ${window} from when this quote was sent. ` +
    `If it is accepted after that, we will confirm new dates for your job.`
  );
}

/**
 * What the ORDER page says when the dates it inherited have already been passed.
 *
 * Null when there is nothing to say, so a caller can render it or not without
 * deciding anything itself.
 */
export function staleScheduleNotice(order = {}, today) {
  const start = scheduleDate(order?.scheduled_start_date);
  if (!start) return null;
  const now = scheduleDate(today) || new Date().toISOString().slice(0, 10);
  if (start >= now) return null;
  return (
    "The start date this order inherited from its quote has already passed. " +
    "It is still what the calendar is planning around, so set the real dates."
  );
}

/**
 * Everything any screen needs to say about a quote's suggested dates, in one
 * object, or null when the quote suggests nothing.
 *
 * ONE SHAPE FOR ALL FIVE READERS. The public quote page, the PDF, the
 * confirmation email, the quote editor and the order page all describe the same
 * pair of dates, and the fastest way for them to disagree is for each to work
 * out the length, the hold and the wording for itself. They read this instead.
 *
 * Null rather than an object full of nulls, so a caller renders it or does not
 * and never has to decide what half a schedule means.
 */
export function quoteScheduleView(quote = {}, businessDefaults, now = new Date()) {
  const { start, completion, complete } = suggestedSchedule(quote);
  if (!complete) return null;
  return {
    start,
    completion,
    // The same dates already turned into words, so every screen that renders
    // this prints the identical string and none of them formats a date itself.
    startWords: scheduleDateWords(start),
    completionWords: scheduleDateWords(completion),
    line: scheduleDatesLine(quote),
    days: suggestedDurationDays(quote),
    holdHours: holdHoursFrom(businessDefaults),
    holdWindow: holdWindowLabel(businessDefaults),
    holdExpiresAt: holdExpiresAt(quote, businessDefaults)?.toISOString() || null,
    // "held" or "lapsed". Never hidden from the customer: a quote whose dates
    // have lapsed still shows them, with the condition saying what happens next,
    // because taking the dates off the page would leave them with less than they
    // were sent.
    state: holdState(quote, businessDefaults, now),
    notice: scheduleHoldNotice(quote, businessDefaults),
  };
}

/**
 * A plain date as words: "5 October 2026".
 *
 * WHY IT DOES NOT USE new Date(value).toLocaleDateString. A YYYY-MM-DD string
 * parses as midnight UTC, and formatting that in the reader's own timezone
 * moves it a day backwards for anybody west of Greenwich. The customer is not
 * necessarily in Perth, and a start date that reads as the 4th on their screen
 * and the 5th on ours is the kind of difference nobody notices until the van
 * turns up. So the parts are read straight off the string and formatted in UTC,
 * which is the only way the same date reads the same everywhere.
 *
 * Returns "" for a blank, so a caller can print it without a guard.
 */
export function scheduleDateWords(value) {
  const date = scheduleDate(value);
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-AU", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * The pair as one line: "5 October 2026 to 9 October 2026".
 *
 * The join word is "to" and not a dash, because a dash between two dates is
 * read as a range by people who already know it is one and as a typo by
 * everybody else.
 */
export function scheduleDatesLine(quote = {}) {
  const { start, completion, complete } = suggestedSchedule(quote);
  if (!complete) return "";
  return `${scheduleDateWords(start)} to ${scheduleDateWords(completion)}`;
}

/**
 * The one sentence the approval confirmation says about the dates.
 *
 * Takes the view above rather than a quote, because by the time this is written
 * the quote has been answered and the question is no longer "what do we suggest"
 * but "what did they just agree to".
 *
 * Two answers, and the second one is the reason this is not simply the dates.
 * A quote approved inside its window is a job with dates on it; a quote
 * approved after it is a job whose dates we no longer hold, and the customer
 * has to be told that in the same email that thanks them, not discover it when
 * nobody turns up. It says what happens and stops. No promise of a phone call.
 *
 * Empty string when the quote suggested nothing, so the caller drops the line.
 */
export function acceptedScheduleSentence(view) {
  if (!view) return "";
  if (view.state === "lapsed") {
    return (
      `This quote was sent more than ${view.holdWindow} ago, so the dates on it are no longer held. ` +
      `We will confirm new dates for your job.`
    );
  }
  return `Your job is booked in for ${view.line}.`;
}
