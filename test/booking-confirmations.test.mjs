// ASKING THE CUSTOMER TO CONFIRM.
//
// ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────
//
//   SILENCE MUST NOT BE AMBIGUOUS. "They have not answered" and "we never
//   managed to ask" need opposite responses from us, so they are different
//   states and the calendar says which. A test here because the whole point of
//   the feature collapses if those two ever collapse into one.
//
//   THE OUTLOOK FLAG IS NEVER A SUBJECT PREFIX. An edit made in Outlook writes
//   the subject back onto our row, so a "Confirmed: " prefix would be baked into
//   the stored title and prefixed again on every later push, growing each time.
//   The flag is a category. If somebody ever moves it to the subject to make it
//   more visible, this fails.
//
//   WE NEVER ASK ABOUT THE WHOLE MAILBOX. The sales calendar holds meetings
//   that are not customer visits. Asking about those would bury the ones that
//   matter.
//
//   NOTHING ON FILE IS OVERWRITTEN. An address already agreed for a visit is
//   not replaced by something typed on a public page.
//
//   A BOOKING THAT MOVES CANNOT STAY CONFIRMED. Enforced by a trigger, so the
//   test is that the trigger is in the migration and covers both columns.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ASK_WINDOW_HOURS,
  TOO_LATE_HOURS,
  andList,
  bookingWhen,
  confirmSummary,
  confirmUrl,
  isAskable,
  isDueToAsk,
  joinAddress,
  missingFor,
  missingWords,
  withinSendingHours,
} from "../lib/pcd-booking-confirmations.js";
import { eventFromRow, PCD_CATEGORY } from "../lib/pcd-graph-calendar.js";
import { bookingFromRow } from "../lib/pcd-calendar.js";

const HOUR = 3600000;

/** A booked site measure, tomorrow at half past nine Perth. */
function booking(overrides = {}) {
  return {
    id: "b1",
    kind: "measure",
    title: "Site measure, Kristy Smith",
    customer_id: "c1",
    customer_name: "Kristy Smith",
    site_address: "14 Rokeby Road, Subiaco 6008",
    contact_name: "Kristy Smith",
    contact_mobile: "0412 345 678",
    starts_at: "2026-09-04T01:30:00.000Z",
    ends_at: "2026-09-04T02:30:00.000Z",
    all_day: false,
    notes: "Park in the rear lane.",
    status: "booked",
    source: "pcd",
    confirm_state: "not_asked",
    confirm_token: "abc123",
    ...overrides,
  };
}

// ── what we ask about ───────────────────────────────────────────────────────

test("a measure, a delivery and an install are asked about", () => {
  for (const kind of ["measure", "delivery", "install"]) {
    assert.equal(isAskable(booking({ kind })), true, `${kind} should be asked about`);
  }
});

test("a reminder is never asked about, because there is nobody to ask", () => {
  assert.equal(isAskable(booking({ kind: "reminder" })), false);
  assert.equal(isAskable(booking({ kind: "other" })), false);
});

test("an entry typed straight into Outlook is never asked about", () => {
  // The sales mailbox calendar holds everything anybody puts in it. Asking
  // sales@ to confirm each of those would bury the real visits.
  assert.equal(isAskable(booking({ source: "outlook" })), false);
});

test("a cancelled booking is never asked about", () => {
  assert.equal(isAskable(booking({ status: "cancelled" })), false);
});

// ── when ────────────────────────────────────────────────────────────────────

test("the ask is due inside the window and not before it", () => {
  const start = new Date(booking().starts_at).getTime();
  const justInside = new Date(start - (ASK_WINDOW_HOURS - 1) * HOUR);
  const wellOutside = new Date(start - (ASK_WINDOW_HOURS + 6) * HOUR);

  assert.equal(isDueToAsk(booking(), justInside), true);
  assert.equal(isDueToAsk(booking(), wellOutside), false);
});

test("nothing is asked about inside the last couple of hours", () => {
  // At that range an email is not the right instrument and a phone call is.
  const start = new Date(booking().starts_at).getTime();
  const tooClose = new Date(start - (TOO_LATE_HOURS - 0.5) * HOUR);
  assert.equal(isDueToAsk(booking(), tooClose), false);
});

test("a booking already asked about is not asked again", () => {
  const start = new Date(booking().starts_at).getTime();
  const inside = new Date(start - 12 * HOUR);
  assert.equal(isDueToAsk(booking({ confirm_state: "asked" }), inside), false);
  assert.equal(isDueToAsk(booking({ confirm_state: "confirmed" }), inside), false);
  assert.equal(isDueToAsk(booking({ confirm_state: "failed" }), inside), false);
});

test("nothing is sent in the middle of the night, Perth time", () => {
  // 2026-09-03T20:00:00Z is four in the morning in Perth.
  assert.equal(withinSendingHours(new Date("2026-09-03T20:00:00.000Z")), false);
  // 2026-09-03T02:00:00Z is ten in the morning in Perth.
  assert.equal(withinSendingHours(new Date("2026-09-03T02:00:00.000Z")), true);
});

// ── what a booking is short of ──────────────────────────────────────────────

test("only what is actually missing is named", () => {
  const noMobile = booking({ contact_mobile: "" });
  assert.deepEqual(missingWords(noMobile), ["a mobile number"]);

  const noAddress = booking({ site_address: "" });
  assert.deepEqual(missingWords(noAddress), ["an address"]);

  const neither = booking({ contact_mobile: "", site_address: "" });
  assert.deepEqual(missingWords(neither), ["a mobile number", "an address"]);
});

test("a customer whose number we hold is never told we do not have one", () => {
  assert.deepEqual(missingWords(booking()), []);
  assert.equal(missingFor(booking()).mobile, false);
});

test("a contact name is never missing for a linked customer", () => {
  // Their name is on the record. The field is still offered, pre-filled, so
  // they can nominate somebody else to be met on the day.
  const noContact = booking({ contact_name: "" });
  assert.equal(missingFor(noContact).contact, false);
});

test("an unlinked booking is also short a customer record", () => {
  const unlinked = booking({ customer_id: null, customer_name: "", contact_name: "", contact_mobile: "", site_address: "" });
  assert.ok(missingWords(unlinked, { linked: false }).includes("a customer record"));
});

// ── how it reads back ───────────────────────────────────────────────────────

test("not answered and never asked are different sentences", () => {
  // The whole feature collapses if these two ever read the same.
  const waiting = confirmSummary(booking({ confirm_state: "asked", confirm_sent_to: "k@example.com" }));
  const broken = confirmSummary(booking({ confirm_state: "failed", confirm_error: "Domain is not verified" }));

  assert.match(waiting, /waiting/i);
  assert.match(broken, /could not ask/i);
  assert.notEqual(waiting, broken);
  assert.match(broken, /Domain is not verified/);
});

test("the calendar exposes the state, not just the answer", () => {
  const drawn = bookingFromRow(booking({ confirm_state: "failed", confirm_error: "No email address" }));
  assert.equal(drawn.confirmState, "failed");
  assert.equal(drawn.confirmError, "No email address");
});

// ── an all day booking ──────────────────────────────────────────────────────

test("an all day booking is never described as happening at midnight", () => {
  const when = bookingWhen(booking({ all_day: true }));
  assert.equal(when.startTime, "");
  assert.doesNotMatch(when.timeRange, /12(:00)?am/i);
  assert.match(when.timeRange, /any time/i);
});

// ── the Outlook flag ────────────────────────────────────────────────────────

test("a confirmed booking is flagged with a category, never a subject prefix", () => {
  // An edit made in Outlook writes the subject back onto our row, so a prefix
  // would be baked into the stored title and prefixed AGAIN on the next push,
  // growing every time somebody nudged the event.
  const event = eventFromRow(booking({ confirm_state: "confirmed", confirm_answered_by: "Kristy Smith" }));

  assert.equal(event.subject, "Site measure, Kristy Smith");
  assert.doesNotMatch(event.subject, /confirmed/i);
  assert.ok(event.categories.includes(PCD_CATEGORY));
  assert.ok(event.categories.includes("Confirmed"));
});

test("a declined booking is flagged too, and keeps its place", () => {
  const event = eventFromRow(booking({ confirm_state: "declined" }));
  assert.doesNotMatch(event.subject, /declined/i);
  assert.ok(event.categories.includes("Declined"));
});

test("an unanswered booking carries only our own category", () => {
  const event = eventFromRow(booking());
  assert.deepEqual(event.categories, [PCD_CATEGORY]);
});

test("what the customer said is written onto the Outlook event", () => {
  const event = eventFromRow(
    booking({
      confirm_state: "confirmed",
      confirm_answered_by: "Kristy Smith",
      confirm_answered_at: "2026-09-03T08:12:00.000Z",
      confirm_notes: "Gate code is 4821.",
    })
  );
  assert.match(event.body.content, /CONFIRMED BY THE CUSTOMER/);
  assert.match(event.body.content, /Kristy Smith/);
  assert.match(event.body.content, /Gate code is 4821/);
});

test("the contact number reaches the Outlook event, so the van has it", () => {
  const event = eventFromRow(booking());
  assert.match(event.body.content, /0412 345 678/);
});

// ── small pieces ────────────────────────────────────────────────────────────

test("the address is joined the way it is stored", () => {
  assert.equal(
    joinAddress({ street: "14 Rokeby Road", suburb: "Subiaco", postcode: "6008" }),
    "14 Rokeby Road, Subiaco 6008"
  );
  // A half filled address is not padded out with stray commas.
  assert.equal(joinAddress({ street: "", suburb: "Subiaco", postcode: "6008" }), "Subiaco 6008");
  assert.equal(joinAddress({ street: "", suburb: "", postcode: "" }), "");
});

test("the link is scoped by the token and nothing else", () => {
  assert.equal(
    confirmUrl("https://www.perthcabinetdoors.com/", "abc123"),
    "https://www.perthcabinetdoors.com/bookings/confirm?code=abc123"
  );
});

test("a list of two reads as an and, not a comma", () => {
  assert.equal(andList(["a mobile number", "an address"]), "a mobile number and an address");
  assert.equal(andList(["an address"]), "an address");
});

// ── the migration ───────────────────────────────────────────────────────────

const MIGRATION = readFileSync(
  new URL("../supabase/202609031200_pcd_booking_confirmations.sql", import.meta.url),
  "utf8"
);

test("a booking that moves has its confirmation cleared by a trigger", () => {
  // A trigger rather than application code, because a time change arrives from
  // an edit here, from Outlook through the sync, and from SQL run by hand. Three
  // code paths would mean three copies and the third would be missed.
  assert.match(MIGRATION, /create trigger trg_pcd_calendar_events_clear_confirmation/);
  assert.match(MIGRATION, /before update on public\.pcd_calendar_events/);
  // Both columns, because a booking shortened is as changed as one moved.
  assert.match(MIGRATION, /new\.starts_at is distinct from old\.starts_at/);
  assert.match(MIGRATION, /new\.ends_at is distinct from old\.ends_at/);
  assert.match(MIGRATION, /new\.confirm_state\s*:=\s*'not_asked'/);
});

test("the token survives a move, so the link in their email keeps working", () => {
  // Everything else is cleared. If confirm_token were cleared too, the customer
  // would be holding a dead link.
  const trigger = MIGRATION.slice(MIGRATION.indexOf("pcd_calendar_clear_confirmation()"));
  assert.doesNotMatch(trigger, /new\.confirm_token\s*:=\s*null/);
});

test("every state the calendar can show is allowed by the constraint", () => {
  for (const state of ["not_asked", "asked", "failed", "confirmed", "declined"]) {
    assert.ok(MIGRATION.includes(`'${state}'`), `${state} must be in the check constraint`);
  }
});

test("the link column is unique, so two bookings cannot share one", () => {
  assert.match(MIGRATION, /create unique index if not exists pcd_calendar_events_confirm_token_key/);
});
