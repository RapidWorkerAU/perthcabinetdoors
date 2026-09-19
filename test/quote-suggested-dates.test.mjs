// WHEN THE JOB WOULD HAPPEN, PROMISED ON A QUOTE.
//
// A customer deciding whether to accept is told a start and a completion date,
// and those dates become their order the moment they say yes. Two things have
// to hold for that to be honest rather than a guess in writing:
//
//   every screen that shows the pair shows the same pair, worded the same way
//   the promise has a stated limit, and the limit is told to the customer
//
// A quote can sit unanswered for weeks. The price is still good; the week we
// had free for it is not. Saying so is the whole point of the hold.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  acceptedScheduleSentence,
  hasSuggestedSchedule,
  holdState,
  holdWindowLabel,
  quoteScheduleView,
  scheduleDatesLine,
  scheduleDateWords,
  staleScheduleNotice,
  suggestedDurationDays,
  suggestedScheduleProblems,
} from "../lib/pcd-quote-schedule.js";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const ORDER_FROM_QUOTE = read("lib/pcd-order-from-quote.js");
const PUBLIC_GET = read("app/api/quote-workflow/get/route.js");
const PUBLIC_PAGE = read("app/(site)/quotes/QuoteApprovalClient.js");
const PDF = read("lib/pcd-cabinet-pdf.js");
const QUOTE_ROUTE = read("app/api/admin/quotes/[id]/route.js");
const EDITOR = read("app/admin/quotes/[id]/QuoteEditor.js");
const DEFAULTS = read("lib/pcd-quote-utils.js");
const MIGRATION = read("supabase/202609191000_pcd_quote_suggested_dates.sql");

const quote = {
  suggested_start_date: "2026-10-05",
  suggested_completion_date: "2026-10-09",
  sent_at: "2026-09-19T09:00:00Z",
};

test("both dates or neither: half a schedule cannot be planned around", () => {
  assert.equal(hasSuggestedSchedule(quote), true);
  assert.equal(hasSuggestedSchedule({ suggested_start_date: "2026-10-05" }), false);
  assert.equal(quoteScheduleView({ suggested_start_date: "2026-10-05" }, {}), null);
});

test("a job that starts and finishes the same day takes one day, not none", () => {
  assert.equal(
    suggestedDurationDays({ suggested_start_date: "2026-10-05", suggested_completion_date: "2026-10-05" }),
    1
  );
  assert.equal(suggestedDurationDays(quote), 5);
});

test("a completion date before the start is refused, because it is a typo", () => {
  const problems = suggestedScheduleProblems({
    suggested_start_date: "2026-10-09",
    suggested_completion_date: "2026-10-05",
  });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].field, "suggested_completion_date");
});

test("the save routes refuse that pair rather than letting it reach the order", () => {
  // The order already refuses a backwards schedule. Catching it on the quote is
  // what stops the customer being shown one in the first place.
  assert.equal((QUOTE_ROUTE.match(/suggestedScheduleProblems\(normalized\.quote\)/g) || []).length, 2,
    "on the full save and on the patch the editor actually uses");
});

test("a date reads the same wherever the reader is", () => {
  // A YYYY-MM-DD parses as midnight UTC, and formatting that in the reader's
  // own timezone moves it a day back for anybody west of Greenwich. A start
  // date that reads as the 4th on their screen and the 5th on ours is the kind
  // of difference nobody notices until the van turns up.
  assert.equal(scheduleDateWords("2026-10-05"), "5 October 2026");
  assert.equal(scheduleDateWords(""), "");
  assert.equal(scheduleDatesLine(quote), "5 October 2026 to 9 October 2026");
});

test("the dates are joined with the word to, never a dash", () => {
  assert.ok(!/[–—-]/.test(scheduleDatesLine(quote).replace(/\d|[A-Za-z ]/g, "")));
});

// ── The hold ────────────────────────────────────────────────────────────────

test("how long the dates hold is a setting, not a number in the code", () => {
  assert.match(DEFAULTS, /schedule_hold_hours: 48/, "there is a built-in last resort");
  assert.match(MIGRATION, /add column if not exists schedule_hold_hours/, "and a column to change it in");
  assert.equal(holdWindowLabel({ schedule_hold_hours: 72 }), "72 hours", "the setting is what is said");
});

test("the window is said in hours, because it is a deadline", () => {
  // "48 hours" reads as a deadline. "2 days" reads as a rough idea of one.
  assert.equal(holdWindowLabel({}), "48 hours");
});

test("inside the window the dates hold, outside it they have lapsed", () => {
  assert.equal(holdState(quote, {}, new Date("2026-09-20T08:00:00Z")), "held");
  assert.equal(holdState(quote, {}, new Date("2026-09-22T08:00:00Z")), "lapsed");
});

test("a quote that was never sent has no clock running on it", () => {
  // Saying a draft's dates had lapsed would be wrong in the direction that
  // loses work.
  assert.equal(holdState({ ...quote, sent_at: null }, {}), "held");
});

test("the condition is stated to the customer, in one sentence", () => {
  const view = quoteScheduleView(quote, {});
  assert.match(view.notice, /held for 48 hours/);
  assert.match(view.notice, /confirm new dates/);
});

test("the condition never promises a phone call", () => {
  const view = quoteScheduleView(quote, {});
  assert.ok(!/call you|ring you|give you a call/i.test(view.notice));
  assert.ok(!/call you|ring you/i.test(acceptedScheduleSentence(view)));
});

test("approving inside the window is a booking; approving after it is not", () => {
  const held = quoteScheduleView(quote, {}, new Date("2026-09-20T08:00:00Z"));
  assert.equal(acceptedScheduleSentence(held), "Your job is booked in for 5 October 2026 to 9 October 2026.");

  const lapsed = quoteScheduleView(quote, {}, new Date("2026-09-30T08:00:00Z"));
  assert.match(acceptedScheduleSentence(lapsed), /no longer held/);
  assert.match(acceptedScheduleSentence(lapsed), /confirm new dates/);
});

test("a quote that suggested nothing adds no line to the email", () => {
  assert.equal(acceptedScheduleSentence(null), "");
});

// ── Becoming the order ──────────────────────────────────────────────────────

test("accepting copies the pair onto the order as its schedule", () => {
  assert.match(ORDER_FROM_QUOTE, /scheduled_start_date: scheduleDate\(quote\.suggested_start_date\)/);
  assert.match(ORDER_FROM_QUOTE, /target_completion_date: scheduleDate\(quote\.suggested_completion_date\)/);
});

test("a start date already passed is still copied, and said out loud on the order", () => {
  // An order with no dates is invisible to the calendar and to every list that
  // plans work. A date somebody can see is the one that gets corrected.
  assert.match(staleScheduleNotice({ scheduled_start_date: "2026-09-01" }, "2026-09-19"), /already passed/);
  assert.equal(staleScheduleNotice({ scheduled_start_date: "2026-10-01" }, "2026-09-19"), null);
  assert.equal(staleScheduleNotice({}, "2026-09-19"), null, "an unscheduled order says nothing");
});

test("changing the dates on the order is an order update, and one a weekly update can carry", () => {
  const WEEKLY = read("lib/pcd-weekly-updates.js");
  const WORDING = read("lib/pcd-update-wording.js");
  const ORDER_ROUTE = read("app/api/admin/orders/[id]/route.js");
  assert.match(ORDER_ROUTE, /scheduled_start_date: "Scheduled start"/, "the change is described");
  assert.match(ORDER_ROUTE, /action_type: "order_updated"/, "and logged as an order update");
  assert.match(WEEKLY, /Scheduled start changed from/, "the report reads it back");
  assert.match(WORDING, /booked into our workshop to start on/, "with words fit to send");
});

// ── Where the customer sees them ────────────────────────────────────────────

test("the public quote page is handed the finished answer, not the settings row", () => {
  assert.match(PUBLIC_GET, /quoteScheduleView\(quote, businessDefaults\)/);
  assert.match(PUBLIC_GET, /schedule,/);
  assert.ok(!/schedule_hold_hours/.test(PUBLIC_PAGE), "the browser never reads the setting");
});

test("the page shows the dates even once they have lapsed", () => {
  // Taking them off would leave the customer with less than they were sent and
  // no idea what they had been offered. The sentence underneath changes instead.
  assert.match(PUBLIC_PAGE, /Suggested Dates/);
  assert.match(PUBLIC_PAGE, /no longer held/);
  assert.match(PUBLIC_PAGE, /scheduleNoticeLapsed/);
});

test("the PDF carries both the dates and the condition", () => {
  assert.match(PDF, /function drawQuoteSchedule/);
  assert.match(PDF, /scheduleDatesLine\(quote\)/);
  assert.match(PDF, /scheduleHoldNotice\(quote, businessDefaults\)/);
});

test("the PDF only gives up the height when there are dates to put in it", () => {
  // A quote with no suggested dates is laid out exactly as it always was.
  assert.match(PDF, /QUOTE_FIRST_TOP \+ \(hasSuggestedSchedule\(quote\) \? QUOTE_SCHEDULE_HEIGHT : 0\)/);
  assert.match(PDF, /planQuotePages\(quoteGroupBlocks\(quoteGroups\(calculatedLines\)\), quoteFirstTop\(quote\)\)/);
});

test("the quote editor offers real fields, not a placeholder or a hint", () => {
  assert.match(EDITOR, /updateForm\("suggested_start_date", e\.target\.value\)/);
  assert.match(EDITOR, /updateForm\("suggested_completion_date", e\.target\.value\)/);
  assert.match(EDITOR, /min=\{form\.suggested_start_date \|\| undefined\}/, "the pair is guarded as it is typed");
});
