// When a job starts, and when it is therefore due.
//
// WHY THIS EXISTS. Target completion used to be typed in by hand, which meant
// it was a guess written down rather than a date anything could be planned
// against. As the workshop gets busier, jobs cannot all start at once, so the
// thing worth recording is when a job is SCHEDULED TO START. The due date then
// follows from the start plus how long the job takes, and stops being a
// separate opinion that can silently disagree with the schedule.
//
// Framework-free and pure, so the browser can preview the due date as you pick
// a timeframe and the server can settle the same date on save, with no chance
// of the two disagreeing.

// How long a job takes, in calendar days from the day it starts.
//
// Calendar rather than working days on purpose: a customer told "three weeks"
// counts three weeks on their own calendar, and a due date that quietly means
// something else is how a promise gets broken.
export const PRODUCTION_TIMEFRAMES = [
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 21, label: "3 weeks" },
  { days: 28, label: "4 weeks" },
  { days: 42, label: "6 weeks" },
  { days: 56, label: "8 weeks" },
  { days: 84, label: "12 weeks" },
];

export const TIMEFRAME_DAYS = PRODUCTION_TIMEFRAMES.map((t) => t.days);

export function timeframeLabel(days) {
  const found = PRODUCTION_TIMEFRAMES.find((t) => t.days === Number(days));
  return found ? found.label : "";
}

export function isTimeframe(days) {
  return TIMEFRAME_DAYS.includes(Number(days));
}

const DAY_MS = 86400000;

function parseDate(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const iso = (date) => date.toISOString().slice(0, 10);

// Nothing is due on a weekend, because nothing is finished on a weekend. A due
// date that lands on Saturday or Sunday is pulled back to the Friday rather
// than pushed forward, so the promise is always one we can actually keep.
function backToFriday(date) {
  const day = date.getUTCDay();
  if (day === 6) return new Date(date.getTime() - DAY_MS);
  if (day === 0) return new Date(date.getTime() - 2 * DAY_MS);
  return date;
}

// The due date for a job starting on `startDate` and taking `leadDays`.
// Returns null when either is missing, because a date invented from half the
// information is worse than no date at all.
export function targetCompletionFrom(startDate, leadDays) {
  const start = parseDate(startDate);
  const days = Number(leadDays);
  if (!start || !Number.isFinite(days) || days <= 0) return null;
  return iso(backToFriday(new Date(start.getTime() + days * DAY_MS)));
}

// What an order's dates should become, given what it holds now and what is
// being changed.
//
// The rule that matters: the target is derived ONLY when a start date and a
// timeframe are both present. If either is missing the existing target is left
// exactly as it is, so the hand-typed dates on orders raised before this
// existed are never silently wiped by an unrelated edit.
export function applySchedule(before = {}, updates = {}) {
  const has = (field) => Object.prototype.hasOwnProperty.call(updates, field);
  if (!has("scheduled_start_date") && !has("production_lead_days")) return updates;

  const start = has("scheduled_start_date") ? updates.scheduled_start_date : before.scheduled_start_date;
  const days = has("production_lead_days") ? updates.production_lead_days : before.production_lead_days;

  const target = targetCompletionFrom(start, days);
  if (target === null) return updates;
  return { ...updates, target_completion_date: target };
}

// Whether this order's due date is being worked out from the schedule, or is
// an older hand-typed one. The page says which, so nobody wonders why the date
// is not moving when they change the start.
export function isDerived(order = {}) {
  return targetCompletionFrom(order.scheduled_start_date, order.production_lead_days) !== null;
}

// A hand-typed date left over from before the schedule existed. Worth pointing
// at, because it is the one case where the due date means less than it looks.
export function hasLegacyTarget(order = {}) {
  return Boolean(order.target_completion_date) && !isDerived(order);
}

// How the schedule reads on screen, in one place so the order page and any
// list of orders describe it the same way.
export function scheduleSummary(order = {}) {
  const start = order.scheduled_start_date || null;
  const days = order.production_lead_days || null;
  if (!start && !days) return "Not scheduled";
  if (start && !days) return "Start set, no timeframe";
  if (!start && days) return `${timeframeLabel(days)}, no start date`;
  return `${timeframeLabel(days)} from the start date`;
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
