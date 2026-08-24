// THE JOB CALENDAR.
//
// ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────
//
// A calendar is trusted or it is useless, and the four ways this one could
// quietly lie are all covered below.
//
//   A DAY OF WORK LOST TO A HIDDEN WEEKEND. Weekends are hidden by default. A
//   run that starts on a Saturday or ends on a Sunday must still be drawn to
//   the visible edge, because a bar that stops short is a job the workshop
//   thinks it has a day more of than it does.
//
//   THE HOURS FIGURE. It is the one number on the page and nothing grades it,
//   so it has to be right. A sixty hour job over four weeks is not sixty hours
//   in week one.
//
//   THE PERTH DAY. Taken as UTC, a booking before eight in the morning lands on
//   the day before. The board already had this bug once.
//
//   THE ECHO AND THE DUPLICATE. Our own write coming back from Outlook must not
//   be treated as a change from Outlook, and an event pulled twice must not
//   become two bookings.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  addDays,
  addMonths,
  bookingFromRow,
  bookingRowFromInput,
  bookingTileDetail,
  bookingTileText,
  clipRun,
  defaultTitle,
  formatMinutes,
  isOutsideMonth,
  isUnclaimed,
  labelReach,
  monthGridWeeks,
  packIntoLanes,
  perthDayOf,
  perthInstant,
  perthMinutesOf,
  runFromOrder,
  runsFromOrders,
  runTileText,
  startOfWeek,
  timeAgo,
  timelineDays,
  weekLabourHours,
  workdaysBetween,
} from "../lib/pcd-calendar.js";

const MIGRATION = readFileSync(new URL("../supabase/202608241600_pcd_calendar_setup.sql", import.meta.url), "utf8");
const SYNC = readFileSync(new URL("../lib/pcd-calendar-sync.js", import.meta.url), "utf8");
const WEBHOOK = readFileSync(new URL("../app/api/graph/calendar-webhook/route.js", import.meta.url), "utf8");
const LIST_ROUTE = readFileSync(new URL("../app/api/admin/calendar/route.js", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("../app/admin/_components/AdminShell.tsx", import.meta.url), "utf8");

// A Monday, so every span below is easy to reason about.
const MONDAY = "2026-08-24";

// ── A run comes from the order, and only from the order ─────────────────────

test("a run is derived from the order's start and timeframe, never from a stored calendar date", () => {
  const run = runFromOrder({
    id: "o1",
    order_number: "PCD-O-2026-A3F91C",
    name: "Hollis kitchen",
    scheduled_start_date: "2026-08-10",
    production_lead_days: 21,
    // Deliberately disagreeing with the derived answer. The order screen and the
    // calendar must never show different ends for the same job, so the derived
    // date wins over a stale stored one.
    target_completion_date: "2026-09-30",
    labour_hours: 46,
    status: "active",
  });

  assert.equal(run.start, "2026-08-10");
  assert.equal(run.end, "2026-08-31", "start plus twenty one days is a Monday, so nothing is pulled back");
  assert.equal(run.labourHours, 46);
  assert.equal(run.scheduled, true);
});

test("a due date that lands on a weekend is pulled back to the Friday", () => {
  // 3 August plus 21 days is Monday 24 August. Take one day off the lead and it
  // lands on a Sunday, which is a day nothing is ever finished on.
  const run = runFromOrder({
    id: "o2",
    scheduled_start_date: "2026-08-03",
    production_lead_days: 20,
    labour_hours: 10,
  });
  assert.equal(new Date(`${run.end}T00:00:00Z`).getUTCDay(), 5, "the due date is a Friday");
  assert.equal(run.end, "2026-08-21");
});

test("an order with a hand typed due date and no schedule is still drawn, and says it is unscheduled", () => {
  // Orders raised before scheduling existed hold a target with nothing behind
  // it. Dropping them would make the calendar quietly wrong about what is owed.
  const run = runFromOrder({ id: "o3", target_completion_date: "2026-09-04", labour_hours: 12 });
  assert.equal(run.start, "2026-09-04");
  assert.equal(run.end, "2026-09-04");
  assert.equal(run.scheduled, false);
});

test("an order with no dates at all is not on the calendar", () => {
  assert.equal(runFromOrder({ id: "o4", labour_hours: 40 }), null);
  assert.equal(runsFromOrders([{ id: "o4" }, { id: "o5" }]).length, 0);
});

// ── A hidden weekend must never hide a day of work ──────────────────────────

test("weekends are dropped from the columns but never from a run", () => {
  const days = timelineDays(MONDAY, 2, { includeWeekends: false });
  assert.equal(days.length, 10, "two weeks is ten working days");
  assert.ok(!days.includes("2026-08-29"), "the Saturday is not a column");

  // A run that begins on the hidden Saturday still has to appear, snapped to
  // the Monday, rather than vanishing for two days.
  const clip = clipRun({ start: "2026-08-29", end: "2026-09-02" }, days);
  assert.equal(days[clip.from], "2026-08-31", "it snaps forward to the Monday");
  assert.equal(days[clip.to], "2026-09-02");
  assert.equal(clip.continuesBefore, false);
});

test("a run reaching past either edge of the window is drawn as continuing", () => {
  const days = timelineDays(MONDAY, 6, { includeWeekends: false });
  const clip = clipRun({ start: "2026-07-01", end: "2026-12-01" }, days);
  assert.equal(clip.from, 0);
  assert.equal(clip.to, days.length - 1);
  assert.equal(clip.continuesBefore, true);
  assert.equal(clip.continuesAfter, true);
});

test("a run entirely outside the window is not drawn at all", () => {
  const days = timelineDays(MONDAY, 6, { includeWeekends: false });
  assert.equal(clipRun({ start: "2026-01-05", end: "2026-01-09" }, days), null);
  assert.equal(clipRun({ start: "2027-01-05", end: "2027-01-09" }, days), null);
});

// ── The hours figure ────────────────────────────────────────────────────────

test("hours are spread over the working days of a run, not banked in week one", () => {
  // Forty hours over two working weeks is twenty hours in each of them.
  const runs = [{ start: MONDAY, end: "2026-09-04", labourHours: 40 }];
  assert.equal(workdaysBetween(MONDAY, "2026-09-04"), 10);
  assert.equal(Math.round(weekLabourHours(runs, MONDAY)), 20);
  assert.equal(Math.round(weekLabourHours(runs, addDays(MONDAY, 7))), 20);
  assert.equal(weekLabourHours(runs, addDays(MONDAY, 14)), 0, "the week after it finishes is empty");
});

test("counting whole jobs in their start week is a different answer, and an available one", () => {
  const runs = [{ start: MONDAY, end: "2026-09-04", labourHours: 40 }];
  assert.equal(weekLabourHours(runs, MONDAY, { mode: "whole" }), 40);
  assert.equal(weekLabourHours(runs, addDays(MONDAY, 7), { mode: "whole" }), 0);
});

test("a week is the sum of everything running through it", () => {
  const runs = [
    { start: MONDAY, end: addDays(MONDAY, 4), labourHours: 10 },
    { start: MONDAY, end: addDays(MONDAY, 4), labourHours: 15 },
  ];
  assert.equal(Math.round(weekLabourHours(runs, MONDAY)), 25);
});

test("the calendar states hours and never grades them", () => {
  // A guard, not a formality. The moment something in here starts returning a
  // verdict about whether a week is full, the number stops being trusted.
  const source = readFileSync(new URL("../lib/pcd-calendar.js", import.meta.url), "utf8");
  for (const word of ["overCapacity", "isFull", "atCapacity", "capacityStatus"]) {
    assert.ok(!source.includes(word), `${word} would be the calendar passing judgement`);
  }
});

// ── Perth, not UTC ──────────────────────────────────────────────────────────

test("a booking early in the Perth morning stays on the Perth day", () => {
  // Half past seven in Perth is 23:30 the PREVIOUS day in UTC. Read as UTC this
  // delivery would appear on Sunday.
  const instant = perthInstant(MONDAY, 7 * 60 + 30);
  assert.equal(instant.toISOString(), "2026-08-23T23:30:00.000Z");
  assert.equal(perthDayOf(instant), MONDAY, "it is still Monday in Perth");
  assert.equal(perthMinutesOf(instant), 7 * 60 + 30);
});

test("a stored row comes back as the day and time it was booked for", () => {
  const booking = bookingFromRow({
    id: "b1",
    kind: "measure",
    title: "Site measure, Ferreira",
    starts_at: perthInstant("2026-08-25", 9 * 60).toISOString(),
    ends_at: perthInstant("2026-08-25", 10 * 60).toISOString(),
    customer_id: "c1",
    customer_name: "Marta Ferreira",
    source: "pcd",
    sync_state: "synced",
    graph_event_id: "AAA",
  });

  assert.equal(booking.day, "2026-08-25");
  assert.equal(booking.startMinutes, 540);
  assert.equal(booking.minutes, 60);
  assert.equal(booking.inOutlook, true);
  assert.equal(formatMinutes(booking.startMinutes), "9am");
  assert.equal(formatMinutes(booking.startMinutes + 30), "9:30am");
});

test("a booking form's answers become an instant, and a bad date is refused", () => {
  const { row } = bookingRowFromInput({
    kind: "install",
    day: "2026-09-01",
    startMinutes: 8 * 60,
    minutes: 240,
    customerName: "Tran Nguyen",
  });
  assert.equal(row.starts_at, "2026-09-01T00:00:00.000Z", "eight in the morning in Perth");
  assert.equal(row.ends_at, "2026-09-01T04:00:00.000Z");
  assert.equal(row.title, "Install, Nguyen");
  assert.equal(row.sync_state, "pending");

  const bad = bookingRowFromInput({ kind: "measure", day: "not a date" });
  assert.ok(bad.error, "a booking with no date is refused rather than invented");
});

test("choosing to keep a booking off Outlook is a decision, not a failure", () => {
  const { row } = bookingRowFromInput({ kind: "reminder", day: MONDAY, addToOutlook: false });
  assert.equal(row.sync_state, "skipped");
  // A skipped booking must never be picked up by a retry, which is what would
  // make it read as a sync that keeps failing.
  assert.ok(SYNC.includes('row.sync_state === "skipped"'), "the push leaves skipped bookings alone");
  assert.ok(SYNC.includes('.in("sync_state", ["pending", "failed"])'), "a retry only takes pending and failed");
});

test("the title follows the kind and the customer until somebody writes their own", () => {
  assert.equal(defaultTitle("measure", "Marta Ferreira"), "Site measure, Ferreira");
  assert.equal(defaultTitle("delivery", ""), "Delivery");
});

// ── Two bookings on one day do not sit on top of each other ─────────────────

// The band packs exactly as the calendar does: a booking ends on the day it
// starts, so only a genuine clash costs a second row.
const packBand = (items) => packIntoLanes(items, (b) => b.day, (b) => b.day);

test("bookings on the same day are stacked rather than overlapped", () => {
  const packed = packBand([{ day: MONDAY }, { day: MONDAY }, { day: MONDAY }]);
  const lanes = packed.map((entry) => entry.lane).sort();
  assert.deepEqual(lanes, [0, 1, 2], "three measures on one Monday take three rows, one each");
});

test("bookings on different days share one row, however close together", () => {
  // They used to zigzag across two rows, because the packer was told a booking
  // ended the day AFTER it started, left over from when a tile was drawn two
  // days wide. Five measures on five days looked like something overlapped.
  const week = [0, 1, 2, 3, 4].map((offset) => ({ day: addDays(MONDAY, offset) }));
  const packed = packBand(week);
  assert.equal(Math.max(...packed.map((entry) => entry.lane)), 0, "Monday to Friday is one row");
});

test("only the clash costs a row, not the days around it", () => {
  // Two on Tuesday, one on Wednesday. The Wednesday one belongs on the first
  // row beside the first Tuesday one, not on a third.
  const packed = packBand([
    { day: addDays(MONDAY, 1), name: "a" },
    { day: addDays(MONDAY, 1), name: "b" },
    { day: addDays(MONDAY, 2), name: "c" },
  ]);
  const laneOf = (name) => packed.find((entry) => entry.item.name === name).lane;
  assert.equal(Math.max(...packed.map((entry) => entry.lane)), 1, "two rows, not three");
  assert.equal(laneOf("c"), laneOf("a"), "Wednesday joins the first row");
});

// ── The sync cannot duplicate, echo, or lose ────────────────────────────────

test("one Outlook event can only ever be one row", () => {
  assert.ok(
    /create unique index[\s\S]*pcd_calendar_events_graph_event_id_key[\s\S]*graph_event_id/.test(MIGRATION),
    "graph_event_id is unique, so the same event read twice is refused by the database"
  );
});

test("our own write coming back from Outlook is not treated as a change", () => {
  assert.ok(
    SYNC.includes("existing.graph_change_key === incoming.graph_change_key"),
    "the change key we stored on the way out is compared with the one that comes back"
  );
  assert.ok(SYNC.includes("seen.echoes"), "an echo is counted and ignored rather than acted on");
});

test("an Outlook event we no longer hold an id for is never recreated", () => {
  // The narrow rule that actually matters. It is NOT "came from Outlook": an
  // entry typed into the mailbox calendar can be claimed here, and claiming it
  // has to push back to that same event. What must never happen is recreating
  // an event somebody deleted in Outlook.
  assert.ok(
    SYNC.includes('row.source === "outlook" && !row.graph_event_id'),
    "no id means the event is gone, so leave it gone"
  );
  assert.ok(
    !SYNC.includes('.neq("source", "outlook")'),
    "the retry pass must not skip claimed Outlook entries, or a failed edit is never tried again"
  );
});

test("an entry typed into Outlook can be claimed here, and claiming it is not a second copy", () => {
  const page = readFileSync(new URL("../app/admin/calendar/CalendarManager.tsx", import.meta.url), "utf8");
  // It used to show a read only note instead of the buttons, which meant a
  // measure booked on a phone in a customer's kitchen could never be attached
  // to that customer.
  assert.ok(!/edited in Outlook rather than here/.test(page), "the read only dead end is gone");
  assert.ok(page.includes("Say what it is"), "an unclaimed entry invites being claimed");

  // The row keeps the Outlook event id, so the push is an update to that event.
  const patch = readFileSync(new URL("../app/api/admin/calendar/[id]/route.js", import.meta.url), "utf8");
  assert.ok(!/graph_event_id/.test(patch), "the edit never touches the Outlook id, so it cannot become a second event");
});

test("what an entry looks like follows what it IS, not where it was typed", () => {
  // source stays 'outlook' forever as the record of origin. Using it to decide
  // how a thing is drawn left a claimed measure looking like an intruder on its
  // own calendar.
  assert.equal(isUnclaimed({ source: "outlook", kind: "other" }), true);
  assert.equal(isUnclaimed({ source: "outlook", kind: "measure" }), false, "saying what it is claims it");
  assert.equal(isUnclaimed({ source: "outlook", kind: "other", customerId: "c1" }), false, "so does saying who it is for");
  assert.equal(isUnclaimed({ source: "outlook", kind: "other", orderId: "o1" }), false, "so does linking the job");
  assert.equal(isUnclaimed({ source: "pcd", kind: "other" }), false, "nothing booked here is ever unclaimed");
});

test("a pull that runs out of pages is a pause, not a hole", () => {
  // The mail sync lost 359 messages to exactly this: a cursor advanced past
  // work that was never done. The delta link may only move when Graph says the
  // read finished.
  assert.ok(
    SYNC.includes("...(changes.deltaLink ? { delta_link: changes.deltaLink } : {})"),
    "the delta link is only written when Graph handed one back"
  );
});

test("what a booking is FOR is never overwritten by Outlook", () => {
  // Times and titles come back from Outlook. The customer, the order and the
  // kind of visit were decided here and are not in an Outlook event to be read.
  const pullBlock = SYNC.slice(SYNC.indexOf("if (existing) {"), SYNC.indexOf("seen.updated += 1"));
  for (const field of ["customer_id", "order_id", "kind:"]) {
    assert.ok(!pullBlock.includes(field), `${field} must not be written by a pull`);
  }
});

test("the webhook proves it is ours before acting, and never trusts what arrived", () => {
  assert.ok(WEBHOOK.includes("validationToken"), "Microsoft's handshake is answered or no subscription is ever made");
  assert.ok(WEBHOOK.includes("notificationIsOurs"), "the clientState secret is checked on every request");
  assert.ok(WEBHOOK.includes("pullCalendar"), "the calendar is re-read with our own credentials");
  assert.ok(
    !/resourceData[\s\S]*insert|resourceData[\s\S]*update/.test(WEBHOOK),
    "nothing in the notification body is written to the database"
  );
});

// ── The page ────────────────────────────────────────────────────────────────

test("a booking is saved before it is sent, so Microsoft can never lose one", () => {
  const insertAt = LIST_ROUTE.indexOf('.from("pcd_calendar_events")');
  const pushAt = LIST_ROUTE.indexOf("pushBooking(");
  assert.ok(insertAt > 0 && pushAt > insertAt, "the row is inserted first and pushed afterwards");
});

test("cancelled and archived orders are never on the calendar", () => {
  const statuses = /CALENDAR_ORDER_STATUSES = \[([^\]]*)\]/.exec(LIST_ROUTE)?.[1] || "";
  assert.ok(statuses.includes("active"), "live jobs are read");
  assert.ok(!statuses.includes("cancelled"), "cancelled is not in the statuses the calendar reads");
  assert.ok(LIST_ROUTE.includes('.is("archived_at", null)'), "archived orders are off it");
});

// ── A booking is one day, and is drawn as one day ───────────────────────────

test("a booking's label may borrow the empty days beside it, but never a booked one", () => {
  // Tiles were two days wide so "3pm" would fit inside them, which drew a one
  // hour site measure as a two day event. The block is one day now and only the
  // words run on, and only into space that is genuinely free.
  const TOTAL = 30;

  // Nothing else in the lane, so the label runs the full four days allowed.
  assert.equal(labelReach(5, [5], { max: 4, total: TOTAL }), 4);

  // Something booked two days later. The label stops short of it rather than
  // covering it.
  assert.equal(labelReach(5, [5, 7], { max: 4, total: TOTAL }), 2);

  // Booked on the very next day. The label gets its own day and no more.
  assert.equal(labelReach(5, [5, 6], { max: 4, total: TOTAL }), 1);

  // The last column of the window. Nothing may run off the end.
  assert.equal(labelReach(TOTAL - 1, [TOTAL - 1], { max: 4, total: TOTAL }), 1);
  assert.equal(labelReach(TOTAL - 2, [TOTAL - 2], { max: 4, total: TOTAL }), 2);
});

test("the coloured block is always exactly one day, whatever the label does", () => {
  const page = readFileSync(new URL("../app/admin/calendar/CalendarManager.tsx", import.meta.url), "utf8");
  // The block is a share of the button, and the button is `reach` days wide, so
  // one day is 100/reach per cent of it. If that ever stops being 100/reach the
  // block has started spanning days it is not on.
  assert.ok(page.includes("`${(100 / reach).toFixed(4)}%`"), "one day, expressed as its share of the label");
  assert.ok(!page.includes("Math.min(2,"), "the old two day tile is gone");
});

test("the number of weeks is a setting, and a saved rubbish value cannot widen the window", () => {
  const page = readFileSync(new URL("../app/admin/calendar/CalendarManager.tsx", import.meta.url), "utf8");
  assert.ok(/WEEK_CHOICES = \[3, 4, 6\]/.test(page), "three, four or six");
  assert.ok(
    page.includes("if (!WEEK_CHOICES.includes(parsed.weeks)) parsed.weeks = DEFAULT_SETTINGS.weeks"),
    "a week count remembered from an older version or edited by hand is refused"
  );
});

test("the detail panel and the phone sheet are one component, not two", () => {
  const page = readFileSync(new URL("../app/admin/calendar/CalendarManager.tsx", import.meta.url), "utf8");
  assert.equal((page.match(/function DetailBody\(/g) || []).length, 1, "one definition of what the detail says");
  // Hiding a dialog behind a CSS breakpoint still traps focus and locks the
  // page, so the sheet is opened on the media query rather than styled away.
  assert.ok(page.includes("open={Boolean(selected) && narrow}"), "the sheet only opens where the panel does not fit");
});

test("the day columns fill the width they are given", () => {
  // They were a fixed 32px each, so six weeks stopped two thirds of the way
  // across a wide screen and the panel looked broken. Columns are now an equal
  // share of the row, which means bars have to be placed as a share of it too:
  // a pixel bar over a fractional grid drifts out of line as the window resizes.
  const page = readFileSync(new URL("../app/admin/calendar/CalendarManager.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("minmax(0, 1fr)"), "the columns stretch");
  assert.ok(!/left: \w+ \* CELL_W/.test(page), "no bar is positioned in fixed pixels");
  assert.ok(page.includes("minWidth: minGridW"), "and it scrolls rather than squeezing below a readable day");
});

test("the calendar page pads itself, like every other admin page", () => {
  // The admin shell gives <main> no padding on purpose. A page that forgets its
  // own sits flush against the chrome.
  const page = readFileSync(new URL("../app/admin/calendar/CalendarManager.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("p-4 md:p-6"), "the same padding Orders, Customers and Quotes use");
});

test("the calendar is on the main menu", () => {
  assert.ok(SHELL.includes("'/admin/calendar'"), "it is in the sidebar");
  assert.ok(SHELL.includes("'/admin/calendar':       'Calendar'"), "and the page title knows its name");
});

// ── The week starts on Monday, because the workshop week does ───────────────

test("the week starts on Monday, including when today is Sunday", () => {
  assert.equal(startOfWeek("2026-08-26"), MONDAY, "a Wednesday");
  assert.equal(startOfWeek(MONDAY), MONDAY, "a Monday is its own start");
  assert.equal(startOfWeek("2026-08-30"), MONDAY, "a Sunday belongs to the week it ends");
});

// ── The three layouts ───────────────────────────────────────────────────────
//
// Same data, same bookings, same detail panel. Only the drawing changes, and
// which layout you last chose is remembered with the other calendar settings.

test("a month grid draws whole weeks, reaching into the months either side", () => {
  // A job running over the turn of the month has to be visible on both, so the
  // grid cannot stop at the first and the last of the month.
  const weeks = monthGridWeeks("2026-08-15");
  assert.equal(weeks[0], "2026-07-27", "it starts on the Monday before the first");
  assert.equal(weeks.length, 6, "August 2026 needs six rows");
  for (const week of weeks) {
    assert.equal(startOfWeek(week), week, "every row starts on a Monday");
  }
  assert.equal(isOutsideMonth("2026-07-27", "2026-08-01"), true, "and the reached-into days know they are");
  assert.equal(isOutsideMonth("2026-08-01", "2026-08-01"), false);
});

test("a month grid covers February without a stray empty row", () => {
  assert.equal(monthGridWeeks("2026-02-10").length, 5);
});

test("stepping a month from the end of one lands in the next, not the one after", () => {
  // 31 January plus a month is the end of February. Letting the date roll over
  // would give the third of March and quietly skip a month.
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(addMonths("2026-08-24", 1), "2026-09-24");
});

test("the anchor is a plain day, so Today lands in the right month", () => {
  const page = readFileSync(new URL("../app/admin/calendar/CalendarManager.tsx", import.meta.url), "utf8");
  // startOfWeek(1 September) is 31 August. Rounding the anchor on the way in
  // would have opened the month grid on August for the whole of the first.
  assert.ok(
    !/useState\(\(\) => startOfWeek\(perthToday\(\)\)\)/.test(page),
    "the anchor must not be rounded before the view has decided what it means"
  );
  assert.match(page, /setAnchor\(today\)/, "Today is today, not the Monday of today");
});

test("the layout is remembered, and a name from an older version cannot break the page", () => {
  const page = readFileSync(new URL("../app/admin/calendar/CalendarManager.tsx", import.meta.url), "utf8");
  assert.ok(/VIEWS = \[/.test(page), "the three layouts are named in one place");
  assert.ok(
    page.includes("if (!VIEW_KEYS.includes(parsed.view)) parsed.view = DEFAULT_SETTINGS.view"),
    "a remembered layout that no longer exists falls back rather than leaving nothing to draw"
  );
  // It rides with the other settings, so it persists the same way they do.
  assert.ok(/view:\s+string/.test(page), "the choice is part of the saved settings");
});

test("a setting that governs only one layout is not offered beside the others", () => {
  // A month is a month and a week is a week. Offering "weeks on screen" next to
  // them would be a control that quietly does nothing.
  const page = readFileSync(new URL("../app/admin/calendar/CalendarManager.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("hidden={settings.view !== 'timeline'}"), "weeks on screen is a Timeline setting");
});

// ── The same facts, however the week is drawn ───────────────────────────────
//
// A layout carries a different amount for free. The timeline gives every job a
// row with the customer printed beside it; the month grid and the week give it
// nothing but the bar. A bar reading "Profiled Raw Doors" and nothing else left
// somebody looking at a week's work with no idea whose it was.

test("a bar carries who the job is for wherever there is no row to carry it", () => {
  const run = { name: "Profiled Raw Doors", customerName: "Kate Hollis", suburb: "Wembley" };
  assert.equal(runTileText(run), "Profiled Raw Doors", "the timeline's row already says whose it is");
  assert.equal(
    runTileText(run, { withIdentity: true }),
    "Kate Hollis, Wembley · Profiled Raw Doors",
    "the month and the week have to say it on the bar, and who comes first"
  );
});

test("a job with nothing recorded about the customer still reads as itself", () => {
  assert.equal(runTileText({ name: "Doors" }, { withIdentity: true }), "Doors");
  assert.equal(runTileText({}, { withIdentity: true }), "Order", "never an empty bar");
});

test("a booking says who and when in every layout, and where it has the room", () => {
  const booking = {
    customerName: "Marta Ferreira",
    title: "Site measure, Ferreira",
    startMinutes: 900,
    minutes: 90,
    siteAddress: "12 Rosedale St, Floreat",
  };
  assert.equal(bookingTileText(booking), "3pm Marta Ferreira");
  assert.deepEqual(bookingTileDetail(booking), {
    who: "Marta Ferreira",
    when: "3pm to 4:30pm",
    where: "12 Rosedale St, Floreat",
  });
  // No customer recorded, so the title carries it rather than leaving a blank.
  assert.equal(bookingTileText({ title: "Chase the board order", startMinutes: 480 }), "8am Chase the board order");
});

test("a status worth remarking on reads on every layout, not just the one with a pill", () => {
  const page = readFileSync(new URL("../app/admin/calendar/CalendarManager.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("function StatusDot"), "there is a marker for the layouts with no room for a pill");
  // Timeline, month, week and the phone. One per layout that draws a job, so a
  // job on hold cannot read as active on any of them.
  assert.ok(
    (page.match(/<StatusDot status=\{run\.status\} \/>/g) || []).length >= 4,
    "on every layout that draws a job"
  );
});

test("the production strip cannot be shorter with a job in it than empty", () => {
  // It was `lanes ? lanes * 22 + 8 : 34`, so one lane gave 30px: less than the
  // empty case, which is what pushed the "In production" label into the bar.
  const page = readFileSync(new URL("../app/admin/calendar/CalendarManager.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("Math.max(38, lanes * 22 + 12)"), "the strip has a floor that clears its own label");
});

// ── Saying whether what you are looking at is current ───────────────────────

test("how long ago is said the way a person would say it", () => {
  const now = new Date("2026-08-24T06:00:00Z");
  const ago = (seconds) => new Date(now.getTime() - seconds * 1000).toISOString();

  assert.equal(timeAgo(ago(5), now), "just now");
  assert.equal(timeAgo(ago(240), now), "4 minutes ago");
  assert.equal(timeAgo(ago(3600), now), "an hour ago");
  assert.equal(timeAgo(ago(18000), now), "5 hours ago");
  assert.equal(timeAgo(ago(86400), now), "yesterday");
  assert.equal(timeAgo(ago(259200), now), "3 days ago");
  // Past a week the date IS the answer, and "9 days ago" is not.
  assert.match(timeAgo(ago(777600), now), /^on /);
});

test("a clock a few seconds ahead reads as just now, never as the future", () => {
  const now = new Date("2026-08-24T06:00:00Z");
  assert.equal(timeAgo(new Date(now.getTime() + 4000).toISOString(), now), "just now");
});

test("nothing to say means nothing said", () => {
  assert.equal(timeAgo(null), "");
  assert.equal(timeAgo("not a date"), "");
});

test("the pill that said nothing useful is gone", () => {
  const page = readFileSync(new URL("../app/admin/calendar/CalendarManager.tsx", import.meta.url), "utf8");
  // Comments stripped: the note explaining WHY it went is not the pill coming
  // back, and a test that cannot tell the difference would forbid the
  // explanation along with the thing it explains.
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.ok(!code.includes("Not listening to Outlook"), "a subscription is our problem, not something to occupy a button slot");
  assert.ok(!code.includes("function Chip("), "and the pill it was drawn with went with it");
  assert.ok(code.includes("Last synced with Outlook"), "replaced by the answer to the question people actually have");
  assert.ok(code.includes("<SyncLine sync={sync} />"), "as a line under the buttons rather than among them");
});
