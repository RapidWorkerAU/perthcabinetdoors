// When a job starts, and when it is due.
//
// WHY THIS EXISTS. Both dates are set by hand, and this is the one place that
// says what a pair of them means: whether an order counts as scheduled, how
// long it covers, how it reads on screen, and what is wrong with it.
//
// WHY THE DUE DATE IS TYPED RATHER THAN WORKED OUT. It used to be derived: you
// picked a start date and a timeframe from a list, and the due date fell out of
// start plus days, pulled back off a weekend. That is only honest while every
// job takes one of eight fixed lengths. Real jobs do not. A job that needs the
// bench for nine days had to be called a week or two weeks, and a job waiting
// on a supplier delivery could not be described at all. Both dates are now
// typed, because the person scheduling the work knows when it will be done and
// the list of timeframes was making them round it off.
//
// Framework-free and pure, so the browser and the server read the same pair of
// dates the same way.

const DAY_MS = 86400000;

function parseDate(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A date as the plain YYYY-MM-DD both columns hold, or null. */
export function scheduleDate(value) {
  const date = parseDate(value);
  return date ? String(value).slice(0, 10) : null;
}

/** Both dates set. Anything less cannot be planned around. */
export function isScheduled(order = {}) {
  return Boolean(scheduleDate(order.scheduled_start_date) && scheduleDate(order.target_completion_date));
}

/**
 * How many days the job covers, counting the start day itself.
 *
 * A job that starts and finishes on the same day takes one day, not none. Null
 * unless both dates are set, because a length worked out from half a schedule
 * is a guess wearing a number.
 */
export function durationDays(order = {}) {
  const start = parseDate(order.scheduled_start_date);
  const end = parseDate(order.target_completion_date);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

/**
 * Saturday or Sunday.
 *
 * Nothing is finished on a weekend, so a due date landing on one used to be
 * pulled back to the Friday automatically. A typed date is never moved, because
 * moving what somebody typed is how a date stops meaning what they meant. The
 * order page says so instead and lets them decide.
 */
export function fallsOnWeekend(value) {
  const date = parseDate(value);
  if (!date) return false;
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * What is wrong with this pair of dates, in the words the screen shows.
 *
 * Returned as a list rather than a boolean so a form can say which date is the
 * problem. A due date before the start is the one that has to be refused: it is
 * not a tight schedule, it is a typo, and everything downstream draws a bar
 * pointing backwards from it.
 */
export function scheduleProblems(order = {}) {
  const start = scheduleDate(order.scheduled_start_date);
  const end = scheduleDate(order.target_completion_date);
  const problems = [];
  if (start && end && end < start) {
    problems.push({
      field: "target_completion_date",
      message: "The completion date is before the start date.",
    });
  }
  return problems;
}

// How the schedule reads on screen, in one place so the order page and any list
// of orders describe it the same way.
export function scheduleSummary(order = {}) {
  const start = scheduleDate(order.scheduled_start_date);
  const end = scheduleDate(order.target_completion_date);
  if (!start && !end) return "Not scheduled";
  if (start && !end) return "Start set, no completion date";
  if (!start && end) return "Completion date set, no start";

  const days = durationDays(order);
  return `${days} ${days === 1 ? "day" : "days"} on the bench`;
}

// Days until a scheduled start, from a reference date. Negative once it has
// been passed, so a job that should have started reads as overdue rather than
// simply as a date in the past.
export function daysUntilStart(order = {}, today) {
  const start = parseDate(order.scheduled_start_date);
  const now = parseDate(today) || parseDate(new Date().toISOString());
  if (!start || !now) return null;
  return Math.round((start.getTime() - now.getTime()) / DAY_MS);
}
