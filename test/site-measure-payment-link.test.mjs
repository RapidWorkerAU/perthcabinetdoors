// A SITE MEASURE BOOKED ON THE PHONE, PAID THROUGH A LINK.
//
// Nothing is confirmed until it is paid, and nobody pays an hour before the
// visit and then wonders why nobody came. Every case below is one of those two
// promises being broken.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ASK_LEAD_HOURS,
  checkLinkExpiry,
  defaultPaymentLinkMessage,
  fromPerthLocalInput,
  latestLinkExpiry,
  linkClosesAt,
  payCutoffAt,
  perthLocalInput,
  windowFromEvent,
} from "../lib/pcd-site-measure-payment-link.js";
import { ASK_WINDOW_HOURS } from "../lib/pcd-booking-confirmations.js";
import { measurePaymentFromRow } from "../lib/pcd-calendar.js";
import { normalizeBookingSettings } from "../lib/pcd-booking-settings.js";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const HOUR = 3600000;

// Thursday 19 November 2026, 3pm Perth, which is 7am UTC.
const STARTS = new Date("2026-11-19T07:00:00Z");

test("the link closes no later than the day before confirmation", () => {
  assert.equal(ASK_LEAD_HOURS, ASK_WINDOW_HOURS, "the same 24 hours the confirmation sweep uses");
  const now = new Date("2026-11-16T01:00:00Z");
  const latest = latestLinkExpiry({ startsAt: STARTS, cutoffHours: 12, now });
  assert.equal(latest.getTime(), STARTS.getTime() - 24 * HOUR);
});

test("inside a day, the link runs to the payment cutoff instead", () => {
  const now = new Date(STARTS.getTime() - 20 * HOUR);
  const latest = latestLinkExpiry({ startsAt: STARTS, cutoffHours: 12, now });
  assert.equal(latest.getTime(), STARTS.getTime() - 12 * HOUR);
});

test("a link never takes payment after the cutoff, whatever was chosen", () => {
  const late = new Date(STARTS.getTime() - 2 * HOUR);
  const closes = linkClosesAt({ expiresAt: late, startsAt: STARTS, cutoffHours: 12 });
  assert.equal(closes.getTime(), payCutoffAt(STARTS, 12).getTime());
});

test("an expiry after the latest allowed is refused, and one before it is kept", () => {
  const now = new Date("2026-11-16T01:00:00Z");
  const tooLate = checkLinkExpiry("2026-11-18T16:00", { startsAt: STARTS, cutoffHours: 12, now });
  assert.ok(tooLate.error, "4pm the day before is after the 3pm confirmation email");
  const fine = checkLinkExpiry("2026-11-17T17:00", { startsAt: STARTS, cutoffHours: 12, now });
  assert.ok(fine.at);
  assert.equal(perthLocalInput(fine.at), "2026-11-17T17:00");
});

test("a measure too close to pay online is refused outright", () => {
  const now = new Date(STARTS.getTime() - 11 * HOUR);
  const result = checkLinkExpiry("2026-11-19T10:00", { startsAt: STARTS, cutoffHours: 12, now });
  assert.match(result.error, /over the phone/);
});

test("the expiry box is Perth time, both ways", () => {
  assert.equal(fromPerthLocalInput("2026-11-19T15:00").toISOString(), STARTS.toISOString());
  assert.equal(perthLocalInput(STARTS), "2026-11-19T15:00");
  assert.equal(fromPerthLocalInput("not a time"), null);
});

test("the booking row takes the visit's own day and time", () => {
  const window = windowFromEvent({ starts_at: STARTS.toISOString(), ends_at: new Date(STARTS.getTime() + HOUR).toISOString() });
  assert.deepEqual(window, { booking_date: "2026-11-19", window_from: "15:00", window_to: "16:00" });
});

test("the message says it is not confirmed until paid, either way", () => {
  for (const needDetails of [true, false]) {
    const words = defaultPaymentLinkMessage({ name: "Kristy Smith", needDetails, fee: 100, closesWords: "Tuesday" });
    assert.match(words, /^Hi Kristy,/);
    assert.match(words, /not confirmed/);
    assert.match(words, /\$100\.00/);
    assert.ok(!/[–—]/.test(words), "no en or em dashes");
  }
  assert.match(defaultPaymentLinkMessage({ needDetails: true }), /fill in your details/);
});

test("the calendar reads paid and held apart", () => {
  assert.equal(measurePaymentFromRow(null), null);
  assert.equal(measurePaymentFromRow({ status: "awaiting_payment" }).awaiting, true);
  assert.equal(measurePaymentFromRow({ status: "booked", fee_paid_at: "2026-11-16" }).paid, true);
});

test("the payment cutoff is a setting with a default", () => {
  assert.equal(normalizeBookingSettings({}).pay_cutoff_hours, 12);
  assert.equal(normalizeBookingSettings({ pay_cutoff_hours: 500 }).pay_cutoff_hours, 168);
});

test("a link booking counts towards its day, so the event is not lost from the count", () => {
  assert.match(read("lib/pcd-booking-store.js"), /const OCCUPYING = \["holding", "awaiting_payment", "booked"\]/);
});

test("paying updates the calendar event rather than making a second one", () => {
  const complete = read("lib/pcd-site-measure-booking.js");
  assert.match(complete, /if \(!calendarEventId && startsAt && endsAt\)/);
  assert.match(complete, /\} else if \(calendarEventId\) \{\s+\/\/ BOOKED BY HAND/);
});

test("confirming an unpaid measure goes through payment, never straight to confirmed", () => {
  const action = read("app/api/booking-confirmation/action/route.js");
  const holdAt = action.indexOf("pending_confirmation");
  const recordAt = action.indexOf("await recordAnswer(");
  assert.ok(holdAt > 0 && holdAt < recordAt, "the answer is held before anything is recorded");
  assert.match(action, /if \(!pay\?\.open\)/);
});
