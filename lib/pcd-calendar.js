// What is on, and when.
//
// WHY THIS EXISTS. The calendar has to answer two questions that used to need
// three screens and some arithmetic: what is running this week, and how much
// work is already committed to the weeks after it.
//
// TWO KINDS OF THING, AND ONLY ONE OF THEM IS STORED.
//
//   A PRODUCTION RUN is derived. Its dates already live on the order as
//   scheduled_start_date and production_lead_days, and its due date already
//   follows from those, see pcd-order-schedule.js. Nothing about a run is
//   written to the calendar, because a second copy of a date is a second
//   opinion about it, and the two disagree within a week.
//
//   A BOOKING is stored. A site measure, a delivery, an install, a reminder.
//   These are the only things a person adds on the calendar, and they are the
//   only rows in pcd_calendar_events.
//
// Framework free and pure, so the browser can lay out a timeline and the server
// can answer a range request from the same functions, with no chance of the two
// disagreeing about which week a job falls in.

import { targetCompletionFrom } from "./pcd-order-schedule";

// PERTH, NOT UTC, AND NOT THE BROWSER'S GUESS.
//
// Perth is UTC+8 all year with no daylight saving at all, which is the one
// thing that makes this safe to do with arithmetic rather than a timezone
// library. Taken as UTC the calendar was a day behind for the first eight
// hours of every working day, which is the same bug the board already had to
// fix, see app/admin/board/page.tsx.
export const PERTH_OFFSET_MINUTES = 480;
export const PERTH_TZ = "Australia/Perth";

const DAY_MS = 86400000;
const MIN_MS = 60000;

// ── Kinds ───────────────────────────────────────────────────────────────────
//
// The order here is the order they appear in the legend and in the booking
// form, so it runs most common first.
export const BOOKING_KINDS = [
  { value: "measure",  label: "Site measure", short: "Measure",  defaultMinutes: 60  },
  { value: "delivery", label: "Delivery",     short: "Delivery", defaultMinutes: 120 },
  { value: "install",  label: "Install",      short: "Install",  defaultMinutes: 240 },
  { value: "reminder", label: "Reminder",     short: "Reminder", defaultMinutes: 30  },
  { value: "other",    label: "Something else", short: "Other",  defaultMinutes: 60  },
];

export const BOOKING_KIND_VALUES = BOOKING_KINDS.map((k) => k.value);

/**
 * The kinds we ask a customer to confirm: somebody has to be somewhere.
 *
 * IT LIVES HERE, not in lib/pcd-booking-confirmations.js where the rest of that
 * feature is, because the calendar screen needs it and that file imports node's
 * crypto for the link token. Pulling it into a client component would drag
 * crypto into the browser bundle to read one Set.
 *
 * Deliberately the same three lib/pcd-booking-activity.js reports to a
 * customer. A reminder is a note to ourselves and has nobody to ask, and
 * "something else" is by definition not a thing we can describe to anybody.
 */
export const ASKABLE_KINDS = new Set(["measure", "delivery", "install"]);

export function isBookingKind(value) {
  return BOOKING_KIND_VALUES.includes(String(value || ""));
}

export function bookingKindLabel(value) {
  const found = BOOKING_KINDS.find((k) => k.value === value);
  return found ? found.label : "Booking";
}

export function defaultMinutesFor(kind) {
  const found = BOOKING_KINDS.find((k) => k.value === kind);
  return found ? found.defaultMinutes : 60;
}

// How long a booking can be, in minutes. A fixed list rather than free text,
// because every one of these is a real shape of visit and "37 minutes" is not.
export const DURATIONS = [
  { minutes: 30,  label: "30 minutes" },
  { minutes: 45,  label: "45 minutes" },
  { minutes: 60,  label: "1 hour" },
  { minutes: 90,  label: "1 hour 30" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
  { minutes: 240, label: "Half a day" },
  { minutes: 480, label: "All day" },
];

// ── Dates ───────────────────────────────────────────────────────────────────
//
// Everything on the calendar is a plain YYYY-MM-DD day in Perth. Instants are
// only used at the two edges: reading a booking's stored starts_at, and telling
// Microsoft when something is.

export function parseDay(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isDay(value) {
  return parseDay(value) !== null;
}

export function toDay(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(day, count) {
  const start = parseDay(day);
  if (!start) return null;
  return toDay(new Date(start.getTime() + count * DAY_MS));
}

export function dayOfWeek(day) {
  const date = parseDay(day);
  return date ? date.getUTCDay() : 0; // 0 Sunday .. 6 Saturday
}

export function isWeekend(day) {
  const weekday = dayOfWeek(day);
  return weekday === 0 || weekday === 6;
}

// The Monday of the week a day falls in. Weeks start Monday because the
// workshop week does.
export function startOfWeek(day) {
  const weekday = dayOfWeek(day);
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}

/** The first of the month a day falls in. */
export function startOfMonth(day) {
  const date = parseDay(day);
  if (!date) return null;
  return `${toDay(date).slice(0, 8)}01`;
}

/** The same day-of-month a number of months away, clamped to a real date. */
export function addMonths(day, count) {
  const date = parseDay(day);
  if (!date) return null;
  const moved = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
  // The 31st of January plus one month is the last day of February, not the
  // third of March, which is what letting the date roll over would give.
  const lastOfTarget = new Date(Date.UTC(moved.getUTCFullYear(), moved.getUTCMonth() + 1, 0)).getUTCDate();
  moved.setUTCDate(Math.min(date.getUTCDate(), lastOfTarget));
  return toDay(moved);
}

/**
 * The weeks a month grid draws, each starting on a Monday.
 *
 * A month grid always shows whole weeks, so it reaches back into the previous
 * month and on into the next. Those days are real days and are drawn faded
 * rather than left blank: a job running over the turn of the month has to be
 * visible on both.
 */
export function monthGridWeeks(day) {
  const first = startOfMonth(day);
  if (!first) return [];
  const last = `${first.slice(0, 8)}${new Date(
    Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0)
  ).getUTCDate()}`;

  const weeks = [];
  for (let week = startOfWeek(first); week <= last; week = addDays(week, 7)) {
    weeks.push(week);
  }
  return weeks;
}

/** Is this day outside the month the grid is showing. */
export function isOutsideMonth(day, monthDay) {
  return String(day).slice(0, 7) !== String(startOfMonth(monthDay) || "").slice(0, 7);
}

export function formatMonth(day) {
  const date = parseDay(day);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", month: "long", year: "numeric" }).format(date);
}

export function daysBetween(from, to) {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** Today in Perth, as a plain day. Never the server's idea of today. */
export function perthToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PERTH_TZ }).format(now);
}

/**
 * A Perth wall clock time as the instant it actually is.
 *
 * ("2026-08-25", 570) is half past nine on the morning of the 25th in Perth,
 * which is 01:30 UTC the same day. Safe as arithmetic only because Perth has no
 * daylight saving, see the note on PERTH_OFFSET_MINUTES.
 */
export function perthInstant(day, minutesFromMidnight = 0) {
  const base = parseDay(day);
  if (!base) return null;
  return new Date(base.getTime() + (minutesFromMidnight - PERTH_OFFSET_MINUTES) * MIN_MS);
}

/** The Perth day an instant falls on. */
export function perthDayOf(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: PERTH_TZ }).format(date);
}

/** Minutes past midnight in Perth for an instant. */
export function perthMinutesOf(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return 0;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PERTH_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const [hours, minutes] = parts.split(":").map(Number);
  return hours * 60 + minutes;
}

/** "9:30am". Used on bars where there is room for four characters and no more. */
export function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hour24 = Math.floor(total / 60) % 24;
  const mins = total % 60;
  const suffix = hour24 < 12 ? "am" : "pm";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}${mins ? `:${String(mins).padStart(2, "0")}` : ""}${suffix}`;
}

export function formatDay(day, { long = false } = {}) {
  const date = parseDay(day);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC",
    weekday: long ? "long" : "short",
    day: "numeric",
    month: long ? "long" : "short",
    year: long ? "numeric" : undefined,
  }).format(date);
}

// ── Production runs ─────────────────────────────────────────────────────────

/**
 * The run an order is booked for, or null if it is not scheduled yet.
 *
 * The due date is DERIVED here rather than read from target_completion_date,
 * so the calendar and the order screen can never show different ends for the
 * same job. Orders raised before scheduling existed hold a hand typed target
 * with no start behind it; those fall back to it rather than being dropped,
 * because a job with a promised date and no plan still has to be visible.
 */
export function runFromOrder(order) {
  if (!order) return null;

  const start = isDay(order.scheduled_start_date) ? String(order.scheduled_start_date).slice(0, 10) : null;
  const leadDays = Number(order.production_lead_days) || 0;
  const derived = start && leadDays > 0 ? targetCompletionFrom(start, leadDays) : null;
  const typed = isDay(order.target_completion_date) ? String(order.target_completion_date).slice(0, 10) : null;

  // No start at all. A hand typed target is drawn as a single day marker on the
  // day it is due, because "due then, unplanned" is the true state and hiding
  // it would make the calendar quietly wrong about what is owed.
  if (!start) {
    if (!typed) return null;
    return {
      id: order.id,
      orderId: order.id,
      orderNumber: order.order_number || "",
      name: order.name || order.customer_name || "Order",
      customerId: order.customer_id || null,
      customerName: order.customer_name || "",
      suburb: order.site_suburb || "",
      status: order.status || "active",
      start: typed,
      end: typed,
      leadDays: 0,
      labourHours: Number(order.labour_hours) || 0,
      scheduled: false,
    };
  }

  const end = derived || typed || start;

  return {
    id: order.id,
    orderId: order.id,
    orderNumber: order.order_number || "",
    name: order.name || order.customer_name || "Order",
    customerId: order.customer_id || null,
    customerName: order.customer_name || "",
    suburb: order.site_suburb || "",
    status: order.status || "active",
    start,
    // A run that somehow ends before it starts is drawn as its start day rather
    // than as a bar pointing backwards.
    end: end < start ? start : end,
    leadDays,
    labourHours: Number(order.labour_hours) || 0,
    scheduled: true,
  };
}

/**
 * What a production run's bar says.
 *
 * WHO IT IS FOR COMES FIRST when the bar has to carry it. The timeline gives
 * every job a row with the customer and the suburb printed beside it, so its
 * bar only needs the job. The month grid and the week have no such row: a bar
 * reading "Profiled Raw Doors" and nothing else left somebody looking at a
 * week's work with no idea whose it was. Same information, carried differently,
 * because the layout carries a different amount of it for free.
 */
export function runTileText(run, { withIdentity = false } = {}) {
  const name = String(run?.name || "").trim() || "Order";
  if (!withIdentity) return name;
  const who = [run?.customerName, run?.suburb].map((part) => String(part || "").trim()).filter(Boolean).join(", ");
  return who ? `${who} · ${name}` : name;
}

/**
 * What a booking's tile says, shortest first.
 *
 * The kind is already in the colour and the band it sits in, so the words are
 * spent on who and where instead of repeating it.
 */
export function bookingTileText(booking) {
  const { who } = bookingTileDetail(booking);
  return `${formatMinutes(booking?.startMinutes || 0)} ${who}`.trim();
}

/**
 * The same booking broken into its parts, for the one layout with room for
 * more than a line.
 *
 * A separate function rather than a flag on the one above: a function whose
 * return type changes with an argument is one every caller has to guess at.
 */
export function bookingTileDetail(booking) {
  const start = Number(booking?.startMinutes) || 0;
  return {
    who: String(booking?.customerName || "").trim() || String(booking?.title || "").trim(),
    when: `${formatMinutes(start)} to ${formatMinutes(start + (Number(booking?.minutes) || 0))}`,
    where: String(booking?.siteAddress || "").trim(),
  };
}

export function runsFromOrders(orders = []) {
  return orders
    .map(runFromOrder)
    .filter(Boolean)
    .sort((a, b) => (a.start === b.start ? a.name.localeCompare(b.name) : a.start < b.start ? -1 : 1));
}

/** Does a run touch the window at all. Both ends inclusive. */
export function runOverlaps(run, from, to) {
  return Boolean(run) && run.start <= to && run.end >= from;
}

// ── Hours in a week ─────────────────────────────────────────────────────────
//
// REPORTED, NEVER GRADED. This returns a number of hours and nothing else. It
// does not decide whether a week is full, and nothing downstream should either:
// too much of what makes a week workable is not in the database at all.

/** Working days in a span, both ends inclusive. Never zero, so it can divide. */
export function workdaysBetween(from, to) {
  if (!isDay(from) || !isDay(to) || to < from) return 1;
  let count = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (!isWeekend(day)) count += 1;
  }
  return count || 1;
}

/**
 * Labour hours locked into the week beginning `weekStart`.
 *
 * TWO HONEST ANSWERS, AND THE CALLER PICKS.
 *
 *   "spread" divides a job's hours evenly over the working days of its run and
 *   counts the days that fall in this week. A sixty hour job over four weeks is
 *   not sixty hours in week one, and reading it that way makes every week after
 *   the first look emptier than it is.
 *
 *   "whole" counts the entire job in the week it starts. That answers a
 *   different question, which is what has been committed to rather than what
 *   will be worked, and it is the right one when jobs are taken on rather than
 *   worked through.
 */
export function weekLabourHours(runs = [], weekStart, { mode = "spread" } = {}) {
  if (!isDay(weekStart)) return 0;
  const weekEnd = addDays(weekStart, 6);

  return runs.reduce((total, run) => {
    if (!run || !run.labourHours) return total;

    if (mode === "whole") {
      return run.start >= weekStart && run.start <= weekEnd ? total + run.labourHours : total;
    }

    if (!runOverlaps(run, weekStart, weekEnd)) return total;

    const perDay = run.labourHours / workdaysBetween(run.start, run.end);
    const from = run.start > weekStart ? run.start : weekStart;
    const to = run.end < weekEnd ? run.end : weekEnd;
    return total + perDay * workdaysBetween(from, to);
  }, 0);
}

/** One decimal, because a tenth of an hour is as fine as any of this gets. */
export function formatHours(hours) {
  return `${(Math.round((Number(hours) || 0) * 10) / 10).toFixed(1)} h`;
}

// ── Bookings ────────────────────────────────────────────────────────────────

/**
 * A stored row in the shape the calendar draws.
 *
 * The row holds instants; the calendar thinks in Perth days and minutes past
 * midnight. This is the one place that conversion happens.
 */
export function bookingFromRow(row) {
  if (!row) return null;
  const day = perthDayOf(row.starts_at);
  const startMinutes = perthMinutesOf(row.starts_at);
  const endMinutes = perthMinutesOf(row.ends_at);
  const endDay = perthDayOf(row.ends_at);

  // A booking that runs past midnight is drawn to the end of the day it starts
  // on rather than wrapping, which is a shape none of these ever really are.
  const minutes = endDay === day ? Math.max(15, endMinutes - startMinutes) : Math.max(15, 1440 - startMinutes);

  return {
    id: row.id,
    kind: row.kind || "other",
    title: row.title || bookingKindLabel(row.kind),
    day,
    startMinutes,
    minutes,
    allDay: Boolean(row.all_day),
    customerId: row.customer_id || null,
    customerName: row.customer_name || "",
    orderId: row.order_id || null,
    quoteId: row.quote_id || null,
    quoteRequestId: row.quote_request_id || null,
    siteAddress: row.site_address || "",
    notes: row.notes || "",
    status: row.status || "booked",
    source: row.source || "pcd",
    inOutlook: Boolean(row.graph_event_id),
    syncState: row.sync_state || "pending",
    syncError: row.sync_error || "",
    // Who to ring on the day. Held on the booking rather than read through the
    // customer, for the same reason siteAddress is.
    contactName: row.contact_name || "",
    contactMobile: row.contact_mobile || "",
    // THE ASK, AND WHETHER IT WENT. 'asked' and 'failed' are deliberately
    // different states: "they have not answered" and "we never managed to ask"
    // look identical on a calendar that only stores the answer, and they need
    // opposite responses from us. See lib/pcd-booking-confirmations.js.
    confirmState: row.confirm_state || "not_asked",
    confirmAskedAt: row.confirm_asked_at || null,
    confirmSentTo: row.confirm_sent_to || "",
    confirmError: row.confirm_error || "",
    confirmAnsweredAt: row.confirm_answered_at || null,
    confirmAnsweredBy: row.confirm_answered_by || "",
    confirmNotes: row.confirm_notes || "",
  };
}

/**
 * An entry that arrived from the mailbox calendar and nobody has said what it
 * is yet.
 *
 * These are drawn hatched and grey, because "site visit 3pm" typed into Outlook
 * is not yet a booking: it has no customer, no job and no kind of trip. The
 * moment somebody says what it is, it stops being unclaimed and is drawn like
 * anything else, because by then that is what it is.
 *
 * WHERE IT CAME FROM IS NOT THE TEST. source stays 'outlook' forever, as the
 * record of where it was typed, and a claimed entry is still edited here and
 * still pushed back there. Using source to decide how it looks would leave a
 * measure booked on a phone looking like an intruder on its own calendar.
 */
export function isUnclaimed(booking) {
  if (!booking || booking.source !== "outlook") return false;
  const kind = booking.kind || "other";
  return kind === "other" && !booking.customerId && !booking.orderId;
}

/**
 * What a booking form's answers become in the database.
 *
 * Returns { row } or { error }. The error is the message a person reads, so it
 * says what to do rather than which field failed validation.
 */
export function bookingRowFromInput(input = {}) {
  const kind = isBookingKind(input.kind) ? input.kind : "measure";
  const day = isDay(input.day) ? String(input.day).slice(0, 10) : null;
  if (!day) return { error: "Pick a date for this booking." };

  const allDay = Boolean(input.allDay);
  const startMinutes = allDay ? 0 : clampMinutes(input.startMinutes, 8 * 60);
  const minutes = allDay ? 1440 : clampDuration(input.minutes, defaultMinutesFor(kind));

  const startsAt = perthInstant(day, startMinutes);
  const endsAt = perthInstant(day, startMinutes + minutes);
  if (!startsAt || !endsAt) return { error: "That date could not be read. Pick it again." };

  const title = String(input.title || "").trim() || defaultTitle(kind, input.customerName);

  return {
    row: {
      kind,
      title,
      customer_id: input.customerId || null,
      customer_name: String(input.customerName || "").trim() || null,
      order_id: input.orderId || null,
      quote_id: input.quoteId || null,
      quote_request_id: input.quoteRequestId || null,
      site_address: String(input.siteAddress || "").trim() || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      all_day: allDay,
      notes: String(input.notes || "").trim() || null,
      status: ["booked", "done", "cancelled"].includes(input.status) ? input.status : "booked",
      // A booking the person chose to keep off the mailbox calendar is 'skipped'
      // rather than 'pending', so it is never picked up by a retry and never
      // reads as a sync that failed.
      sync_state: input.addToOutlook === false ? "skipped" : "pending",
    },
  };
}

function clampMinutes(value, fallback) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1439) return fallback;
  return Math.round(minutes / 5) * 5;
}

function clampDuration(value, fallback) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 15) return fallback;
  return Math.min(minutes, 1440);
}

/** "Site measure, Ferreira". The surname carries it on a bar this narrow. */
export function defaultTitle(kind, customerName) {
  const label = bookingKindLabel(kind);
  const name = String(customerName || "").replace(/\s+/g, " ").trim();
  if (!name) return label;
  // THE WHOLE NAME. This took the surname alone, which reads fine on a calendar
  // with one Brennan on it and not at all on one with three. It also lands in
  // Outlook, where "Site measure, Casey" is all somebody standing in a driveway
  // has to go on.
  return `${label}, ${name}`;
}

/**
 * How long ago something happened, in the words a person would use.
 *
 * "Last synced 09/08/2026, 14:32:07" makes somebody do arithmetic to answer
 * "is this current?", which is the only question they are asking. Anything
 * older than a week gets the date instead, because by then the date IS the
 * answer and "9 days ago" is not.
 */
export function timeAgo(value, now = new Date()) {
  if (!value) return "";
  const then = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  // A clock a few seconds ahead should read as "just now", never as "in 4
  // seconds", which would look broken rather than precise.
  if (seconds < 90) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  return `on ${formatDay(perthDayOf(then), { long: false })}`;
}

// ── Laying out the timeline ─────────────────────────────────────────────────

/**
 * The days a timeline shows, weekends dropped if they are not wanted.
 *
 * Dropping them is a display choice only. A job still runs over the weekend and
 * its bar is still drawn across the gap, see clipRun.
 */
export function timelineDays(from, weeks, { includeWeekends = false } = {}) {
  const days = [];
  for (let index = 0; index < weeks * 7; index += 1) {
    const day = addDays(from, index);
    if (!includeWeekends && isWeekend(day)) continue;
    days.push(day);
  }
  return days;
}

/**
 * Where a run's bar starts and stops in a list of visible days.
 *
 * A run that begins on a hidden Saturday snaps to the Monday, and one that
 * begins before the window is marked so the bar can be drawn as continuing
 * rather than as starting there. Getting this wrong is how a calendar quietly
 * loses a day of work.
 */
export function clipRun(run, days) {
  if (!run || !days.length) return null;
  const first = days[0];
  const last = days[days.length - 1];
  if (run.end < first || run.start > last) return null;

  const index = new Map(days.map((day, position) => [day, position]));

  let from = index.get(run.start);
  if (from === undefined) {
    from = days.findIndex((day) => day >= run.start);
    if (from < 0) from = 0;
  }

  let to = -1;
  for (let position = days.length - 1; position >= 0; position -= 1) {
    if (days[position] <= run.end) {
      to = position;
      break;
    }
  }
  if (to < 0) to = days.length - 1;
  if (to < from) to = from;

  return {
    from,
    to,
    span: to - from + 1,
    continuesBefore: run.start < first,
    continuesAfter: run.end > last,
  };
}

/**
 * How many day columns a booking's LABEL may run across.
 *
 * A booking happens on one day, so its coloured block is one column and never
 * more: drawing a one hour site measure two days wide, which is what it took to
 * fit "3pm" inside it, was the calendar stating something untrue. The words are
 * allowed to borrow the empty days beside it instead.
 *
 * `occupied` is the day columns already taken in the same lane, in order. The
 * label stops at the next one, so it can never cover a real booking, and it
 * stops at `max` regardless so a single measure in a quiet fortnight does not
 * turn into a banner.
 */
export function labelReach(from, occupied = [], { max = 4, total = 0 } = {}) {
  const next = occupied.find((position) => position > from);
  const until = next === undefined ? total : next;
  return Math.max(1, Math.min(max, until - from));
}

/**
 * Stack overlapping runs so no two bars sit on top of each other.
 *
 * Only used where runs share a row. The timeline gives every job its own row,
 * so this is here for the bookings band, where several measures on one day
 * would otherwise collide.
 */
export function packIntoLanes(items, startOf, endOf) {
  const lanes = [];
  return [...items]
    .sort((a, b) => {
      const startA = startOf(a);
      const startB = startOf(b);
      if (startA !== startB) return startA < startB ? -1 : 1;
      return daysBetween(startB, endOf(b)) - daysBetween(startA, endOf(a));
    })
    .map((item) => {
      let lane = 0;
      while (lanes[lane] !== undefined && lanes[lane] >= startOf(item)) lane += 1;
      lanes[lane] = endOf(item);
      return { item, lane };
    });
}
