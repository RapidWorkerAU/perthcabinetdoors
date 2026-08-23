// Scheduling a job: when it starts, and when it is therefore due.

import test from "node:test";
import assert from "node:assert/strict";

import {
  PRODUCTION_TIMEFRAMES,
  timeframeLabel,
  isTimeframe,
  targetCompletionFrom,
  applySchedule,
  isDerived,
  hasLegacyTarget,
  scheduleSummary,
  daysUntilStart,
} from "../lib/pcd-order-schedule.js";

// ── the timeframes on offer ────────────────────────────────────────────────

test("every timeframe has a positive day count and a label", () => {
  assert.ok(PRODUCTION_TIMEFRAMES.length >= 5);
  PRODUCTION_TIMEFRAMES.forEach((t) => {
    assert.ok(Number.isInteger(t.days) && t.days > 0, `bad days: ${t.days}`);
    assert.ok(t.label && typeof t.label === "string", `bad label for ${t.days}`);
  });
});

test("the day counts are unique, so two options cannot mean the same thing", () => {
  const days = PRODUCTION_TIMEFRAMES.map((t) => t.days);
  assert.equal(new Set(days).size, days.length);
});

test("a timeframe is only one of the ones offered", () => {
  assert.equal(isTimeframe(14), true);
  assert.equal(isTimeframe(15), false);
  assert.equal(isTimeframe(null), false);
  assert.equal(timeframeLabel(14), "2 weeks");
  assert.equal(timeframeLabel(999), "");
});

// ── working the due date out ───────────────────────────────────────────────

test("the due date is the start plus the timeframe", () => {
  // Mon 7 Sep 2026 plus 14 days is Mon 21 Sep, a weekday, so it stands.
  assert.equal(targetCompletionFrom("2026-09-07", 14), "2026-09-21");
});

// Nothing is finished on a weekend, so a weekend due date is a promise that
// cannot be kept. Pulled back rather than pushed out, so we are never late.
test("a due date landing on a Saturday is pulled back to the Friday", () => {
  // Sat 5 Sep 2026.
  assert.equal(targetCompletionFrom("2026-08-29", 7), "2026-09-04");
});

test("a due date landing on a Sunday is pulled back to the Friday too", () => {
  // Sun 6 Sep 2026.
  assert.equal(targetCompletionFrom("2026-08-30", 7), "2026-09-04");
});

test("every timeframe from every weekday produces a weekday due date", () => {
  const starts = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"];
  starts.forEach((start) => {
    PRODUCTION_TIMEFRAMES.forEach((t) => {
      const due = targetCompletionFrom(start, t.days);
      const day = new Date(`${due}T00:00:00Z`).getUTCDay();
      assert.ok(day >= 1 && day <= 5, `${start} + ${t.label} landed on day ${day}`);
    });
  });
});

// A date invented from half the information is worse than no date at all.
test("no date comes out of a missing start or a missing timeframe", () => {
  assert.equal(targetCompletionFrom("", 14), null);
  assert.equal(targetCompletionFrom("2026-09-07", null), null);
  assert.equal(targetCompletionFrom("2026-09-07", 0), null);
  assert.equal(targetCompletionFrom("not a date", 14), null);
});

test("a timestamp is accepted and read as its date part", () => {
  assert.equal(targetCompletionFrom("2026-09-07T09:30:00.000Z", 14), "2026-09-21");
});

// ── what a save should write ───────────────────────────────────────────────

test("setting both the start and the timeframe derives the target", () => {
  const out = applySchedule({}, { scheduled_start_date: "2026-09-07", production_lead_days: 14 });
  assert.equal(out.target_completion_date, "2026-09-21");
});

test("changing only the start re-derives against the timeframe already held", () => {
  const before = { scheduled_start_date: "2026-09-07", production_lead_days: 14 };
  const out = applySchedule(before, { scheduled_start_date: "2026-09-14" });
  assert.equal(out.target_completion_date, "2026-09-28");
});

test("changing only the timeframe re-derives against the start already held", () => {
  const before = { scheduled_start_date: "2026-09-07", production_lead_days: 14 };
  const out = applySchedule(before, { production_lead_days: 28 });
  assert.equal(out.target_completion_date, "2026-10-05");
});

// The hand-typed dates on orders raised before this existed must survive an
// unrelated edit. Deriving from half a schedule would wipe them.
test("a half-set schedule leaves an existing target alone", () => {
  const before = { target_completion_date: "2026-12-01" };
  const out = applySchedule(before, { scheduled_start_date: "2026-09-07" });
  assert.equal("target_completion_date" in out, false);
});

test("an edit that touches neither date is passed straight through", () => {
  const out = applySchedule({ scheduled_start_date: "2026-09-07", production_lead_days: 14 }, { internal_notes: "hi" });
  assert.deepEqual(out, { internal_notes: "hi" });
});

test("clearing the start date does not delete the target it produced", () => {
  const before = { scheduled_start_date: "2026-09-07", production_lead_days: 14, target_completion_date: "2026-09-21" };
  const out = applySchedule(before, { scheduled_start_date: null });
  assert.equal("target_completion_date" in out, false);
});

test("the other updates in the same save are kept", () => {
  const out = applySchedule({}, { scheduled_start_date: "2026-09-07", production_lead_days: 7, name: "Chen kitchen" });
  assert.equal(out.name, "Chen kitchen");
  assert.equal(out.target_completion_date, "2026-09-14");
});

// ── how it reads on screen ─────────────────────────────────────────────────

test("a fully scheduled order has a derived target", () => {
  assert.equal(isDerived({ scheduled_start_date: "2026-09-07", production_lead_days: 14 }), true);
  assert.equal(isDerived({ scheduled_start_date: "2026-09-07" }), false);
  assert.equal(isDerived({}), false);
});

test("a hand-typed target with no schedule behind it is flagged as such", () => {
  assert.equal(hasLegacyTarget({ target_completion_date: "2026-12-01" }), true);
  assert.equal(
    hasLegacyTarget({ target_completion_date: "2026-09-21", scheduled_start_date: "2026-09-07", production_lead_days: 14 }),
    false
  );
  assert.equal(hasLegacyTarget({}), false);
});

test("the summary says which part of the schedule is missing", () => {
  assert.equal(scheduleSummary({}), "Not scheduled");
  assert.equal(scheduleSummary({ scheduled_start_date: "2026-09-07" }), "Start set, no timeframe");
  assert.equal(scheduleSummary({ production_lead_days: 14 }), "2 weeks, no start date");
  assert.equal(scheduleSummary({ scheduled_start_date: "2026-09-07", production_lead_days: 14 }), "2 weeks from the start date");
});

test("a start date in the past reads as negative, so it can show as overdue", () => {
  assert.equal(daysUntilStart({ scheduled_start_date: "2026-09-07" }, "2026-09-01"), 6);
  assert.equal(daysUntilStart({ scheduled_start_date: "2026-09-07" }, "2026-09-07"), 0);
  assert.equal(daysUntilStart({ scheduled_start_date: "2026-09-01" }, "2026-09-07"), -6);
  assert.equal(daysUntilStart({}, "2026-09-07"), null);
});
