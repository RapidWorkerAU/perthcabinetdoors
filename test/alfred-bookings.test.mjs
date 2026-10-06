// ASK ALFRED: CALENDAR BOOKINGS (2026-10-06).
//
// ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────
//
//   CRYSTAL CLEAR FIRST. Nothing is reviewed until there is a kind, a customer
//   for a measure, delivery or install, a day, and a time or all day. A time is
//   never assumed.
//
//   AS IF WE ADDED IT. The booking is saved through the calendar's own save:
//   the same checks, the Outlook push, the order's history and the customer's
//   confirmation ask. The customer and the job are linked, from real records.
//
//   NEVER CANCELLED BY ALFRED. Adding and changing only.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addressOfCustomer, bookingGaps, bookingVersion, minutesFromTime } from "../lib/pcd-alfred-bookings.js";
import { checkAsk } from "../lib/pcd-alfred-ask.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("nothing is reviewed until the booking is clear", () => {
  const clear = { kind: "install", customerId: "c1", day: "2026-10-20", startMinutes: 480, allDay: false };
  assert.deepEqual(bookingGaps(clear), []);
  assert.match(bookingGaps({ ...clear, kind: "" })[0], /what kind/);
  assert.match(bookingGaps({ ...clear, customerId: null })[0], /An install needs a customer/);
  assert.deepEqual(bookingGaps({ ...clear, kind: "reminder", customerId: null }), [], "a reminder needs nobody");
  assert.match(bookingGaps({ ...clear, day: "next Tuesday" })[0], /Pick the day/);
  assert.match(bookingGaps({ ...clear, startMinutes: null })[0], /Pick the time, or make it all day/, "a time is never assumed");
  assert.deepEqual(bookingGaps({ ...clear, startMinutes: null, allDay: true }), []);
});

test("times are read the way people say them", () => {
  assert.equal(minutesFromTime("14:30"), 870);
  assert.equal(minutesFromTime("2:30pm"), 870);
  assert.equal(minutesFromTime("8am"), 480);
  assert.equal(minutesFromTime("12am"), 0);
  assert.equal(minutesFromTime("morning"), null);
  assert.equal(minutesFromTime(""), null);
});

test("the address comes from the customer, the way the booking form fills it", () => {
  assert.equal(addressOfCustomer({ site_address: "1 Hay St, Perth" }), "1 Hay St, Perth");
  assert.equal(addressOfCustomer({ site_street: "1 Hay St", site_suburb: "Perth" }), "1 Hay St, Perth");
  assert.equal(addressOfCustomer(null), "");
});

test("a change made to the booking since it was reviewed is caught", () => {
  const row = { kind: "install", starts_at: "2026-10-20T00:00:00Z", status: "booked" };
  assert.equal(bookingVersion(row), bookingVersion({ ...row }));
  assert.notEqual(bookingVersion(row), bookingVersion({ ...row, starts_at: "2026-10-21T00:00:00Z" }));
});

test("a proposed booking names only customers, jobs and bookings Alfred looked up", () => {
  const seen = new Set(["c1", "o1", "b1"]);
  const raw = (booking) => ({
    kind: "booking",
    text: "I will book an install.",
    facts_used: [],
    booking: { action: "add", booking_id: "", kind: "install", customer_id: "c1", job_kind: "order", job_id: "o1", day: "2026-10-20", start_time: "08:00", all_day: false, minutes: 240, notes: "", status: "", ...booking },
  });
  const ok = checkAsk(raw(), { seen });
  assert.equal(ok.ok, true);
  assert.equal(ok.result.proposal.customerId, "c1");
  assert.equal(ok.result.proposal.startTime, "08:00");
  assert.equal(ok.result.proposal.title, "", "the calendar names it, as it would a booking made by hand");
  assert.match(checkAsk(raw({ customer_id: "c9" }), { seen }).problem, /customer he never looked up/);
  assert.match(checkAsk(raw({ job_id: "o9" }), { seen }).problem, /job he never looked up/);
  assert.match(checkAsk(raw({ action: "edit", booking_id: "b9" }), { seen }).problem, /without looking it up/);
  assert.equal(checkAsk(raw({ action: "edit", booking_id: "b1" }), { seen }).ok, true);
});

test("it is saved through the calendar's own save, as Alfred, by name", () => {
  const bookings = read("lib/pcd-alfred-bookings.js");
  assert.ok(bookings.includes('createBooking(supabase, asInput(draft), { baseUrl, actorType: "alfred", approvedBy })'));
  assert.ok(bookings.includes('updateBooking(supabase, card.bookingId, asInput(draft), { baseUrl, actorType: "alfred", approvedBy })'));
  assert.doesNotMatch(bookings, /cancelBooking|from\("pcd_calendar_events"\)[\s\S]{0,60}\.(insert|update)\(/, "never writes bookings itself, never cancels");
  const save = read("lib/pcd-calendar-save.js");
  for (const step of ["pushBooking(", "logBookingActivity(", "askOnSave("]) assert.ok(save.includes(step), step);
  assert.ok(read("app/api/admin/calendar/route.js").includes("createBooking(context.supabase, payload"));
  assert.ok(read("app/api/admin/calendar/[id]/route.js").includes("updateBooking(context.supabase, id, payload"));
  assert.ok(read("app/api/admin/calendar/jobs/route.js").includes("customerJobs(context.supabase, customerId)"));
});

test("the booking form is built from the database, never from the model", () => {
  const route = read("app/api/admin/alfred/ask/route.js");
  assert.ok(route.includes("reply.card = await bookingCard(supabase, reply.proposal);"));
  assert.match(read("lib/pcd-alfred-ask.js"), /BE CRYSTAL CLEAR FIRST/);
  assert.match(read("lib/pcd-alfred-ask.js"), /Never cancel one; that stays on the calendar page\./);
});
