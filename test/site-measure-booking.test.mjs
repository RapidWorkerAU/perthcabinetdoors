// BOOKING A SITE MEASURE FROM THE WEBSITE.
//
// The page and the route have to agree about what is bookable, or a customer
// reaches a payment page for a day that is full. And a day can only be sold
// once, however many people are looking at it.
//
// Every case below is a way somebody could have been charged for a day they
// could not have, or told a day was unavailable when it was not.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_BOOKING_SETTINGS,
  availabilityCalendar,
  bookableRange,
  dayState,
  normalizeBookingSettings,
  placesLeft,
  postcodeAllowed,
  publicBookingView,
  windowForDay,
  windowHours,
  windowWords,
} from "../lib/pcd-booking-settings.js";
import {
  cancellationOutcome,
  cancellationRules,
  cancellationSummary,
  cutoffWords,
} from "../lib/pcd-cancellation-policy.js";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

/**
 * The file with its imports cut off.
 *
 * Three of the tests below check the ORDER things happen in, and an import line
 * mentioning createCheckoutSession at the top of the file is not the call that
 * opens a payment page. Reading the imports as code had all three of them
 * passing or failing for the wrong reason.
 */
const body = (source) => {
  const start = source.search(/^(export )?(async )?function /m);
  return start >= 0 ? source.slice(start) : source;
};
const BOOK_ROUTE = read("app/api/public/site-measure/book/route.js");
const AVAIL_ROUTE = read("app/api/public/site-measure/availability/route.js");
const STORE = read("lib/pcd-booking-store.js");
const COMPLETE = read("lib/pcd-site-measure-booking.js");
const WEBHOOK = read("app/api/stripe/webhook/route.js");
const EMAILS = read("lib/pcd-site-measure-emails.js");
const CLIENT = read("app/(site)/book-a-site-measure/BookSiteMeasureClient.js");
const MIGRATION = read("supabase/202609191400_pcd_site_measure_bookings.sql");

const TODAY = "2026-09-19";
const live = (patch) => normalizeBookingSettings({ is_live: true, ...patch });

// ── the settings ────────────────────────────────────────────────────────────

test("a settings row that mentions no days keeps the default days", () => {
  // THE BUG THIS PINS. Reading a missing key as false closed every day the
  // moment anything called this with only a fee to change, which is every
  // caller that is not the settings screen.
  const settings = normalizeBookingSettings({ fee_inc_gst: 120 });
  assert.equal(settings.days.tue.open, true);
  assert.equal(settings.days.mon.open, false);
});

test("a day the row explicitly closes stays closed", () => {
  const settings = normalizeBookingSettings({ days: { tue: { open: false, from: "15:00", to: "18:00" } } });
  assert.equal(settings.days.tue.open, false, "what was written is what is meant");
  assert.equal(settings.days.wed.open, true, "and the ones it did not mention are untouched");
});

test("a window that closes before it opens shuts the day rather than being corrected", () => {
  // Correcting it would invent a window nobody chose and then sell it. Shutting
  // it costs one booking and is visible on the settings screen.
  const settings = normalizeBookingSettings({ days: { tue: { open: true, from: "18:00", to: "15:00" } } });
  assert.equal(settings.days.tue.open, false);
  assert.equal(windowForDay(settings, "2026-09-22"), null);
});

test("an unreadable settings row closes the booking page rather than inventing one", () => {
  // The safe direction for something that takes money, and the opposite of what
  // pricing does, where a silent fallback to built-in rates was the bug.
  assert.equal(DEFAULT_BOOKING_SETTINGS.is_live, false);
  assert.match(STORE, /return normalizeBookingSettings\(DEFAULT_BOOKING_SETTINGS\)/);
});

// ── what is offered ─────────────────────────────────────────────────────────

test("a day is free, full, or closed, and those are three different things", () => {
  const settings = live();
  // 22 September 2026 is a Tuesday.
  assert.equal(dayState(settings, "2026-09-22", { today: TODAY, used: 0 }), "free");
  assert.equal(dayState(settings, "2026-09-22", { today: TODAY, used: 2 }), "full");
  assert.equal(dayState(settings, "2026-09-21", { today: TODAY, used: 0 }), "closed", "a Monday");
});

test("a day sooner than the notice is not offered, and neither is one past the horizon", () => {
  const settings = live({ notice_days: 3, horizon_weeks: 1 });
  const { earliest, latest } = bookableRange(settings, TODAY);
  assert.equal(earliest, "2026-09-22");
  assert.equal(latest, "2026-09-26");
  assert.equal(dayState(settings, "2026-09-20", { today: TODAY }), "closed", "inside the notice");
  assert.equal(dayState(settings, "2026-10-06", { today: TODAY }), "closed", "past the horizon");
});

test("a closed date disappears even when its weekday is open", () => {
  const settings = live({ closed_dates: ["2026-09-23"] });
  assert.equal(dayState(settings, "2026-09-23", { today: TODAY }), "closed");
  assert.equal(dayState(settings, "2026-09-30", { today: TODAY }), "free", "the next Wednesday still is");
});

test("places left is never negative, because a day sold twice is still sold", () => {
  assert.equal(placesLeft({ max_per_day: 2 }, 3), 0);
  assert.equal(placesLeft({ max_per_day: 2 }, 1), 1);
});

test("the calendar the page draws carries the window and the length of it", () => {
  const rows = availabilityCalendar(live(), { today: TODAY });
  const tuesday = rows.find((row) => row.day === "2026-09-22");
  assert.equal(tuesday.state, "free");
  assert.equal(tuesday.windowWords, "3pm and 6pm");
  assert.equal(tuesday.hours, 3);
  assert.equal(tuesday.label, "Tuesday 22 September 2026");
});

test("the customer is never offered a time, only a block", () => {
  assert.equal(windowWords(windowForDay(live(), "2026-09-22")), "3pm and 6pm");
  assert.equal(windowHours(windowForDay(live(), "2026-09-22")), 3);
  assert.ok(!/minutes|:15|:30 to/.test(windowWords(windowForDay(live(), "2026-09-22"))));
});

// ── what crosses to the browser ─────────────────────────────────────────────

test("a page that is not live is told that and nothing else", () => {
  assert.match(AVAIL_ROUTE, /if \(!settings\.is_live\) \{\s*\n\s*return Response\.json\(\{ ok: true, live: false \}\);/);
});

test("the postcode list never reaches the browser", () => {
  const view = publicBookingView(live({ postcodes: "6000-6199" }), { today: TODAY });
  assert.equal(view.postcodes, undefined);
  assert.equal(view.closed_dates, undefined);
  assert.ok(!/postcodes/.test(CLIENT), "and the page never asks for it");
});

test("a postcode outside the list is refused before the payment, not after", () => {
  assert.equal(postcodeAllowed({ postcodes: "6000-6199, 6207" }, 6053), true);
  assert.equal(postcodeAllowed({ postcodes: "6000-6199, 6207" }, 6207), true);
  assert.equal(postcodeAllowed({ postcodes: "6000-6199, 6207" }, 6210), false);
  // An empty list is yes to everything: refusing every customer because nobody
  // filled the box in would be a silent outage.
  assert.equal(postcodeAllowed({ postcodes: "" }, 9999), true);

  const route = body(BOOK_ROUTE);
  const checkAt = route.indexOf("postcodeAllowed");
  const stripeAt = route.indexOf("createCheckoutSession");
  assert.ok(checkAt > 0 && checkAt < stripeAt, "checked before Stripe is opened");
});

// ── the day can only be sold once ───────────────────────────────────────────

test("the day is claimed before the payment page is opened", () => {
  const route = body(BOOK_ROUTE);
  const holdAt = route.indexOf("holdDay(");
  const stripeAt = route.indexOf("createCheckoutSession");
  assert.ok(holdAt > 0 && holdAt < stripeAt, "the hold comes first, or we take money for a full day");
});

test("the hold looks again after writing, and withdraws if it lost", () => {
  assert.match(STORE, /THE SECOND LOOK/);
  assert.match(STORE, /order\("created_at", \{ ascending: true \}\)/, "the earlier row wins");
  assert.match(STORE, /status: "expired"/);
});

test("a hold that is never paid stops counting by itself", () => {
  // Nothing has to sweep for the website to be correct; the count reads the
  // clock. The sweep only tidies the rows.
  assert.match(STORE, /if \(row\.status === "holding" && \(!row\.hold_expires_at \|\| row\.hold_expires_at < now\)\) continue;/);
});

test("measures booked in the office count towards the day", () => {
  assert.match(STORE, /MEASURES BOOKED IN THE OFFICE COUNT TOO/);
  assert.match(STORE, /oursById\.has\(event\.id\)/, "and our own are not counted twice");
});

test("a payment page that could not be opened gives the day straight back", () => {
  assert.match(BOOK_ROUTE, /THE HOLD GOES BACK IMMEDIATELY/);
});

// ── the fee clearing ────────────────────────────────────────────────────────

test("the booking is claimed, so a webhook delivered twice does the work once", () => {
  assert.match(COMPLETE, /\.in\("status", \["holding", "expired"\]\)/);
  assert.match(COMPLETE, /alreadyDone: true/);
});

test("an expired hold that was paid anyway still becomes a booking", () => {
  // They paid. The day is theirs even if the twenty minutes ran out while
  // Stripe was thinking about it.
  assert.match(COMPLETE, /"expired"\]\)/);
});

test("no customer record is created for a hold nobody paid", () => {
  const complete = body(COMPLETE);
  const upsertAt = complete.indexOf("upsertCustomerByEmail");
  const claimAt = complete.indexOf("THE CLAIM");
  assert.ok(claimAt > 0 && claimAt < upsertAt, "the customer exists only after the money arrived");
  assert.ok(!/upsertCustomerByEmail/.test(BOOK_ROUTE), "and never when the hold is written");
});

test("a calendar event or an email failing does not lose a paid booking", () => {
  assert.match(COMPLETE, /could not write the calendar event/);
  assert.match(COMPLETE, /could not upsert the customer/);
  assert.match(EMAILS, /return sent;/, "the senders return rather than throw");
});

test("the webhook knows this flow from the other two", () => {
  assert.match(WEBHOOK, /session\?\.metadata\?\.flow === "site_measure_booking"/);
  assert.match(WEBHOOK, /if \(isSiteMeasure\) await completeSiteMeasureBooking/);
});

test("a payment that died gives the day back", () => {
  assert.match(WEBHOOK, /THE DAY GOES BACK THE MOMENT THE PAYMENT DIES/);
  assert.match(WEBHOOK, /\.eq\("status", "holding"\)/);
});

// ── the money leaves a trace ────────────────────────────────────────────────

test("the credit is written when the fee clears, not only when a booking is cancelled", () => {
  // THE BUG THIS PINS, and it was a bad one. The credit was created only on the
  // cancellation path, which is the one nobody takes. Every customer who
  // booked, paid and went ahead had no credit, so the promise made on the
  // booking page, in the tick box, in their confirmation email and in the
  // cancellation policy did nothing at all, silently, on every booking.
  const complete = body(COMPLETE);
  const payAt = complete.indexOf("THE CREDIT IS WRITTEN NOW");
  const cancelAt = complete.indexOf("export async function cancelSiteMeasureBooking");
  assert.ok(payAt > 0, "a credit is written on the paid path");
  assert.ok(payAt < cancelAt, "and it happens before the cancel function, not inside it");
});

test("a booking shows in the customer's own log", () => {
  // A calendar event is where the work is. The log is where somebody looks to
  // ask what has happened with a customer, and a hundred dollars arriving
  // belongs in both.
  assert.match(COMPLETE, /action_type: "site_measure_booked"/);
  assert.match(COMPLETE, /event_key: `site-measure:\${finished.id}:booked`/);
});

test("the log entry and the credit cannot be written twice by a repeated webhook", () => {
  assert.match(COMPLETE, /event_key:/, "the log row is keyed");
  const MIGRATION_CREDITS = read("supabase/202609191500_pcd_customer_credits.sql");
  assert.match(MIGRATION_CREDITS, /idx_pcd_customer_credits_booking/, "the credit is uniquely keyed to its booking");
});

test("money with no order behind it still reaches the customer page", () => {
  // pcd_order_payments.order_id is NOT NULL, so a fee taken months before there
  // is an order has nowhere to live and was invisible on the one screen built
  // to answer "has this customer paid us".
  const PAYMENTS = read("lib/pcd-customer-payments.js");
  assert.ok(PAYMENTS.includes('from("pcd_site_measure_bookings")'));
  assert.ok(PAYMENTS.includes('.not("fee_paid_at", "is", null)'), "only money that actually arrived");
  const DESK = read("lib/pcd-desk-data.js");
  assert.ok(DESK.includes("loadCustomerPayments(supabase, ids)"));
  assert.match(DESK, /^\s+payments,$/m, "and it reaches the page");
});

test("a cancelled booking still shows the payment, and says what became of it", () => {
  const PAYMENTS = read("lib/pcd-customer-payments.js");
  assert.match(PAYMENTS, /Cancelled, refunded/);
  assert.match(PAYMENTS, /Cancelled, held as credit/);
});

// ── cancelling ──────────────────────────────────────────────────────────────

test("the cutoff is the clock, not whoever answers the phone", () => {
  const starts = new Date("2026-10-06T07:00:00.000Z");
  assert.equal(
    cancellationOutcome({ bookingStartsAt: starts, confirmHours: 48, now: new Date("2026-10-03T07:00:00.000Z") }),
    "refund"
  );
  assert.equal(
    cancellationOutcome({ bookingStartsAt: starts, confirmHours: 48, now: new Date("2026-10-05T07:00:00.000Z") }),
    "credit"
  );
});

test("the boundary belongs to the customer", () => {
  // Cancelling at exactly the cutoff is a refund. The arguable minute should
  // not go to the business.
  const starts = new Date("2026-10-06T07:00:00.000Z");
  const exactly = new Date("2026-10-04T07:00:00.000Z");
  assert.equal(cancellationOutcome({ bookingStartsAt: starts, confirmHours: 48, now: exactly }), "refund");
});

test("the outcome is worked out, not passed in, unless it is a recorded exception", () => {
  assert.match(COMPLETE, /cancellationOutcome\(\{ bookingStartsAt: startsAt, confirmHours: settings\.confirm_hours \}\)/);
  assert.match(COMPLETE, /force === "refunded" \|\| force === "credited"/);
});

test("cancelling inside the window with no customer record refuses rather than losing the money", () => {
  assert.match(COMPLETE, /nowhere to hold the credit/);
});

test("refunding a credit that has already come off an order is refused", () => {
  // Refunding the fee AND leaving the credit spent pays the same hundred
  // dollars back twice.
  assert.match(COMPLETE, /already come off an order, so refunding the fee would pay it back twice/);
});

test("one booking can only ever mint one credit", () => {
  assert.match(COMPLETE, /bookingId: booking\.id/);
  const CREDITS = read("supabase/202609191500_pcd_customer_credits.sql");
  assert.match(CREDITS, /idx_pcd_customer_credits_booking/);
});

// ── the words ───────────────────────────────────────────────────────────────

test("the cutoff is said in hours, because it is a deadline", () => {
  assert.equal(cutoffWords(48), "48 hours");
  assert.equal(cutoffWords(1), "1 hour");
});

test("the rule is two halves and both leave the customer holding the value", () => {
  const rules = cancellationRules({ fee: 100, confirmHours: 48 });
  assert.equal(rules.length, 2);
  assert.match(rules[0].body, /refund/i);
  assert.match(rules[1].body, /credit/i);
  assert.match(rules[1].body, /does not expire/);
});

test("the policy never promises a phone call and never apologises", () => {
  const words = [
    cancellationSummary({ fee: 100, confirmHours: 48 }),
    ...cancellationRules({ fee: 100, confirmHours: 48 }).map((r) => r.body),
  ].join(" ");
  assert.ok(!/call you|ring you|sorry|apolog/i.test(words));
});

test("the confirmation email carries facts and actions and nothing else", () => {
  // The lines Ashleigh cut, and the flavour of them, must not come back.
  assert.ok(!/the day is yours/i.test(EMAILS));
  assert.ok(!/we will sort it out/i.test(EMAILS));
  assert.ok(!/you do not need to be home/i.test(EMAILS));
  assert.match(EMAILS, /Your site measure is booked\./);
  assert.match(EMAILS, /Kind Regards/);
});

test("the fee promise is in the confirmation, because it is a fact about their money", () => {
  assert.match(EMAILS, /comes off any order you place from the quote we send you/);
  // "the quote we write off it" read as writing the quote OFF, which is the
  // opposite of what it means. The phrasing is the same in all five places it
  // appears, so it is worth pinning that it stays one sentence.
  assert.ok(!/write off it/.test(EMAILS));
});

// ── the schema ──────────────────────────────────────────────────────────────

test("the settings are one row and the window is snapshotted onto the booking", () => {
  assert.match(MIGRATION, /pcd_booking_settings_single_row check \(id = 'site-measure'\)/);
  assert.match(MIGRATION, /window_from time not null/);
  assert.match(MIGRATION, /window_to\s+time not null/);
});

test("a Stripe session settles exactly one booking", () => {
  assert.match(MIGRATION, /create unique index if not exists idx_pcd_site_measure_bookings_session/);
});
