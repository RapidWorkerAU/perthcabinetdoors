// A SITE MEASURE BOOKED ON THE PHONE, PAID THROUGH A LINK. THE RULES.
//
// ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
//
// Somebody rings, says yes to the fee, and the measure goes on the calendar by
// hand. The calendar then emails them a link: fill in your details if we asked
// for them, and pay. Paying runs the same completion as a website booking.
//
// ── NOTHING IS CONFIRMED UNTIL IT IS PAID ────────────────────────────────────
//
// Two clocks close the door, and both are worked out here so the calendar
// window, the payment page and the confirmation page cannot disagree:
//
//   the link        closes at the time chosen when it was sent. That time can
//                   never be later than the moment the day before
//                   confirmation goes out, because from then the confirmation
//                   page takes over.
//   the last call   the confirmation page takes the fee until pay_cutoff_hours
//                   before the visit, and never after. Nobody pays an hour
//                   before and then wonders why nobody came.
//
// Pure: no database, no crypto. The calendar screen imports this.

import { formatDay, formatMinutes, perthDayOf, perthInstant, perthMinutesOf } from "./pcd-calendar";

/** Where a booking came from, on pcd_site_measure_bookings.source. */
export const PAYMENT_LINK_SOURCE = "payment_link";

/** The status a link booking sits in until the fee clears. */
export const AWAITING_PAYMENT = "awaiting_payment";

/**
 * How long before a visit the day before confirmation goes out. The same
 * number as ASK_WINDOW_HOURS in lib/pcd-booking-confirmations.js, which cannot
 * be imported here because that file needs crypto and this one runs in the
 * browser. A test holds the two together.
 */
export const ASK_LEAD_HOURS = 24;

/** The least time a link may be left open for, so a link is never dead on arrival. */
export const MIN_LINK_MINUTES = 30;

const HOUR_MS = 3600000;
const MIN_MS = 60000;

function instant(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** When the confirmation page stops taking the fee. */
export function payCutoffAt(startsAt, cutoffHours) {
  const starts = instant(startsAt);
  if (!starts) return null;
  const hours = Math.max(1, Math.round(Number(cutoffHours) || 12));
  return new Date(starts.getTime() - hours * HOUR_MS);
}

/** When the day before confirmation goes out. */
export function askAt(startsAt, askLeadHours = ASK_LEAD_HOURS) {
  const starts = instant(startsAt);
  if (!starts) return null;
  return new Date(starts.getTime() - askLeadHours * HOUR_MS);
}

/**
 * The latest a link may be left open until.
 *
 * Normally the moment the confirmation goes out. A measure booked with less
 * than a day to go has already passed that moment, so its link can run to the
 * payment cutoff instead, which is the confirmation page's own last call.
 */
export function latestLinkExpiry({ startsAt, cutoffHours, now = new Date(), askLeadHours = ASK_LEAD_HOURS } = {}) {
  const ask = askAt(startsAt, askLeadHours);
  if (ask && ask.getTime() > now.getTime()) return ask;
  return payCutoffAt(startsAt, cutoffHours);
}

/**
 * When a link actually stops taking payment: the time chosen for it, or the
 * payment cutoff if that comes first. The visit may have moved since the link
 * was sent, which is why the cutoff is worked out from the event every time.
 */
export function linkClosesAt({ expiresAt, startsAt, cutoffHours } = {}) {
  const chosen = instant(expiresAt);
  const cutoff = payCutoffAt(startsAt, cutoffHours);
  if (!chosen) return cutoff;
  if (!cutoff) return chosen;
  return chosen.getTime() < cutoff.getTime() ? chosen : cutoff;
}

/** Is the moment still ahead of us? */
export function stillOpen(closesAt, now = new Date()) {
  const close = instant(closesAt);
  return Boolean(close) && close.getTime() > now.getTime();
}

/**
 * A Perth wall clock time for a datetime-local box: "2026-11-17T15:00".
 *
 * Perth, not the browser's zone, so somebody sending a link from a laptop set
 * to Sydney time still picks the hour the customer reads.
 */
export function perthLocalInput(value) {
  const date = instant(value);
  if (!date) return "";
  const day = perthDayOf(date);
  const minutes = perthMinutesOf(date);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${day}T${hh}:${mm}`;
}

/** The other way: "2026-11-17T15:00" read as Perth time. Null when it is not one. */
export function fromPerthLocalInput(text) {
  const match = String(text || "").trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return null;
  return perthInstant(match[1], hours * 60 + minutes);
}

/** "Tuesday 17 November 2026 at 3pm". */
export function momentWords(value) {
  const date = instant(value);
  if (!date) return "";
  return `${formatDay(perthDayOf(date), { long: true })} at ${formatMinutes(perthMinutesOf(date))}`;
}

/**
 * The expiry somebody picked, checked against the rules.
 *
 * Returns { at } or { error }. The error is a sentence for the person sending.
 */
export function checkLinkExpiry(text, { startsAt, cutoffHours, now = new Date() } = {}) {
  const at = fromPerthLocalInput(text);
  if (!at) return { error: "Pick a date and time for the link to stop working." };
  const latest = latestLinkExpiry({ startsAt, cutoffHours, now });
  if (!latest || latest.getTime() <= now.getTime() + MIN_LINK_MINUTES * MIN_MS) {
    return { error: "This measure is too close to take payment online. Take the payment over the phone instead." };
  }
  if (at.getTime() < now.getTime() + MIN_LINK_MINUTES * MIN_MS) {
    return { error: `The link has to stay open for at least ${MIN_LINK_MINUTES} minutes.` };
  }
  // A minute's grace, because the box only holds whole minutes.
  if (at.getTime() > latest.getTime() + MIN_MS) {
    return { error: `The latest the link can stay open is ${momentWords(latest)}, when the confirmation email goes out.` };
  }
  return { at: at.getTime() > latest.getTime() ? latest : at };
}

/** The visit as the booking row stores it, read off the calendar event. */
export function windowFromEvent(event) {
  const day = perthDayOf(event?.starts_at);
  if (!day) return null;
  if (event?.all_day) return { booking_date: day, window_from: "08:00", window_to: "17:00" };
  const from = perthMinutesOf(event.starts_at);
  const endDay = perthDayOf(event.ends_at);
  const to = endDay === day ? perthMinutesOf(event.ends_at) : 23 * 60 + 59;
  const time = (minutes) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { booking_date: day, window_from: time(from), window_to: time(Math.max(from + 15, to)) };
}

export const PAYMENT_LINK_SUBJECT = "Your site measure: please pay to confirm your booking";

/**
 * The message the calendar fills in. Plain text, editable before it goes; the
 * button with the link is added underneath when it is sent, so an edit can
 * never lose it.
 */
export function defaultPaymentLinkMessage({
  name = "",
  needDetails = false,
  fee = 0,
  dayWords = "",
  timeWords = "",
  closesWords = "",
} = {}) {
  const first = String(name || "").trim().split(/\s+/)[0];
  const amount = Number(fee || 0).toLocaleString("en-AU", {
    style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const when = [dayWords, timeWords].filter(Boolean).join(", ");

  return [
    first ? `Hi ${first},` : "Hi,",
    "",
    `Thanks for your call. We have held ${when || "a time"} for your site measure.`,
    "",
    needDetails
      ? `Your booking is not confirmed yet. To confirm it, use the button below to fill in your details and pay the ${amount} site measure fee.`
      : `Your booking is not confirmed yet. To confirm it, use the button below to pay the ${amount} site measure fee.`,
    "",
    `The ${amount} comes off any order you place from the quote we send you afterwards.`,
    "",
    closesWords
      ? `The link works until ${closesWords}. If it has not been paid by then, the time is not confirmed and we will not come out.`
      : "If it has not been paid, the time is not confirmed and we will not come out.",
    "",
    "Thanks,",
  ].join("\n");
}
