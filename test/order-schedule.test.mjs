// TWO TYPED DATES, AND WHAT A PAIR OF THEM MEANS.
//
// The start date and the completion date are both entered by hand. Nothing is
// worked out from a timeframe any more, so what this has to guard is the pair:
// that a job is only scheduled when it has both, that its length counts the
// start day, and that a completion date before the start is caught rather than
// drawn as a bar pointing backwards.

import test from "node:test";
import assert from "node:assert/strict";
import {
  scheduleDate,
  isScheduled,
  durationDays,
  fallsOnWeekend,
  scheduleProblems,
  scheduleSummary,
  daysUntilStart,
} from "../lib/pcd-order-schedule.js";

test("a date is read off whatever shape it arrives in", () => {
  assert.equal(scheduleDate("2026-09-07"), "2026-09-07");
  // Supabase hands a date column back plain, but a timestamp arrives with a
  // time on it and has to read the same.
  assert.equal(scheduleDate("2026-09-07T09:30:00.000Z"), "2026-09-07");
  assert.equal(scheduleDate(""), null);
  assert.equal(scheduleDate(null), null);
  assert.equal(scheduleDate("not a date"), null);
});

test("an order is scheduled only when it has both dates", () => {
  assert.equal(isScheduled({ scheduled_start_date: "2026-09-07", target_completion_date: "2026-09-21" }), true);
  assert.equal(isScheduled({ scheduled_start_date: "2026-09-07" }), false);
  assert.equal(isScheduled({ target_completion_date: "2026-09-21" }), false);
  assert.equal(isScheduled({}), false);
});

test("a job that starts and finishes the same day takes one day", () => {
  // Counting the gap rather than the days would call this a nought day job.
  assert.equal(durationDays({ scheduled_start_date: "2026-09-07", target_completion_date: "2026-09-07" }), 1);
  assert.equal(durationDays({ scheduled_start_date: "2026-09-07", target_completion_date: "2026-09-21" }), 15);
  assert.equal(durationDays({ scheduled_start_date: "2026-09-07" }), null);
  assert.equal(durationDays({}), null);
});

test("a completion date before the start is refused", () => {
  const problems = scheduleProblems({
    scheduled_start_date: "2026-09-21",
    target_completion_date: "2026-09-07",
  });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].field, "target_completion_date");

  // The same day is a one day job, not a problem.
  assert.deepEqual(
    scheduleProblems({ scheduled_start_date: "2026-09-07", target_completion_date: "2026-09-07" }),
    []
  );
  // Half a schedule has nothing to disagree with itself about.
  assert.deepEqual(scheduleProblems({ target_completion_date: "2026-09-07" }), []);
  assert.deepEqual(scheduleProblems({}), []);
});

test("a weekend completion date is reported, never moved", () => {
  // The old code pulled a weekend due date back to the Friday on its own. A
  // typed date is left exactly as typed and the screen says so instead.
  assert.equal(fallsOnWeekend("2026-09-05"), true, "Saturday");
  assert.equal(fallsOnWeekend("2026-09-06"), true, "Sunday");
  assert.equal(fallsOnWeekend("2026-09-07"), false, "Monday");
  assert.equal(fallsOnWeekend(""), false);

  const order = { scheduled_start_date: "2026-09-01", target_completion_date: "2026-09-05" };
  assert.equal(order.target_completion_date, "2026-09-05", "the date is not rewritten");
  assert.deepEqual(scheduleProblems(order), [], "a weekend is not an error");
});

test("the schedule says which half is missing", () => {
  assert.equal(scheduleSummary({}), "Not scheduled");
  assert.equal(scheduleSummary({ scheduled_start_date: "2026-09-07" }), "Start set, no completion date");
  assert.equal(scheduleSummary({ target_completion_date: "2026-09-21" }), "Completion date set, no start");
  assert.equal(
    scheduleSummary({ scheduled_start_date: "2026-09-07", target_completion_date: "2026-09-21" }),
    "15 days on the bench"
  );
  assert.equal(
    scheduleSummary({ scheduled_start_date: "2026-09-07", target_completion_date: "2026-09-07" }),
    "1 day on the bench"
  );
});

test("days until a start go negative once it has passed", () => {
  assert.equal(daysUntilStart({ scheduled_start_date: "2026-09-07" }, "2026-09-01"), 6);
  assert.equal(daysUntilStart({ scheduled_start_date: "2026-09-07" }, "2026-09-07"), 0);
  assert.equal(daysUntilStart({ scheduled_start_date: "2026-09-01" }, "2026-09-07"), -6);
  assert.equal(daysUntilStart({}, "2026-09-07"), null);
});

test("nothing anywhere still asks an order how long it takes", async () => {
  // The column is dropped by supabase/202609071500_pcd_orders_manual_completion_date.sql.
  // A query still selecting it fails outright, and a page still reading it goes
  // quietly blank, so this checks the whole app rather than one file.
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");

  const skip = new Set(["node_modules", ".next", ".git", "supabase", "public"]);
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(js|jsx|ts|tsx|mjs)$/.test(entry)) continue;
      if (full.includes("order-schedule.test")) continue;
      if (readFileSync(full, "utf8").includes("production_lead_days")) offenders.push(full);
    }
  };
  walk(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

  assert.deepEqual(offenders, [], `still reading the dropped column: ${offenders.join(", ")}`);
});
