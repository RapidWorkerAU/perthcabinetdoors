// THE MAILBOX READER MUST NEVER SKIP A MESSAGE.
//
// WHAT WENT WRONG. It asked Graph for newest first, took at most 50 per folder,
// and then resumed from the newest message already on file. Every one of those
// three is reasonable alone. Together they lose mail permanently: a run that
// hits the cap files the newest page, the cursor jumps to the newest message it
// just filed, and everything between the old cursor and that page is now BEHIND
// the window. Nothing ever goes back for it.
//
// It reported success every time. 359 of the 677 messages in the mailbox over
// one sixty day stretch had never been filed, including replies to customers
// the board was still saying we had not answered.
//
// Oldest first turns a capped run into a pause instead of a hole: it takes the
// oldest unread messages, the cursor advances to exactly what it took, and the
// next run carries on from there.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const GRAPH = readFileSync(new URL("../lib/pcd-graph-mail.js", import.meta.url), "utf8");
const SYNC = readFileSync(new URL("../lib/pcd-desk-sync.js", import.meta.url), "utf8");
const ROUTE = readFileSync(new URL("../app/api/admin/customer-desk/sync/route.js", import.meta.url), "utf8");
const LOOP = readFileSync(new URL("../lib/pcd-mail-catchup.js", import.meta.url), "utf8");
const CRON = readFileSync(new URL("../app/api/cron/mail-sync/route.js", import.meta.url), "utf8");
const VERCEL = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");

test("the mailbox is read oldest first", () => {
  // The single most important line in the mail sync. Newest first plus a cap
  // plus an advancing cursor equals silent permanent loss.
  assert.match(GRAPH, /\$orderby", "receivedDateTime asc"/);
  assert.ok(
    !GRAPH.includes('"receivedDateTime desc"'),
    "something is still reading the mailbox newest first"
  );
});

test("a run that stops at its ceiling says so", () => {
  // Reporting "done" while the mailbox is still ahead is what let the two drift
  // apart with nobody being told.
  assert.match(GRAPH, /if \(takenFromFolder >= limit && more\) capped = true/);
  assert.match(GRAPH, /collected\.capped = capped/);
  assert.match(SYNC, /capped: Boolean\(messages\.capped\)/);
});

test("the sync keeps going until it has caught up", () => {
  // One click has to mean caught up, not "read a page and hope".
  assert.match(LOOP, /for \(let pass = 0; pass < PASSES; pass \+= 1\)/);
  assert.match(LOOP, /if \(!run\.capped\) break;/);
});

test("the button and the nightly job run the same loop", () => {
  // Two copies would drift, and the one that runs while nobody is watching
  // would be the one that got it wrong.
  assert.match(ROUTE, /runMailSync\(context\.supabase/);
  assert.match(CRON, /runMailSync\(supabase\)/);
  assert.ok(!ROUTE.includes("const PASSES"), "the route has its own copy of the loop again");
});

test("a catch up carries its own cursor, because the table's is already past it", () => {
  // Everything a catch up recovers is OLDER than the newest row on file, so
  // resuming from that row would snap the window back to today and leave the
  // gap exactly where it was.
  assert.match(SYNC, /newestSeen/);
  assert.match(LOOP, /let resumeFrom = catchUpDays/);
  assert.match(LOOP, /if \(resumeFrom && next <= resumeFrom\) break/);
});

test("a folder that cannot be read is reported, not swallowed", () => {
  // A failing sent items filter looked exactly like a customer we had never
  // replied to: their whole side of the conversation, quietly absent.
  assert.match(GRAPH, /problems\.push\(/);
  assert.ok(
    !/\} catch \{\s*\/\/ Graph refuses some filters/.test(GRAPH),
    "a folder failure is still swallowed in silence"
  );
});

test("the reader still refuses to run away with a huge mailbox", () => {
  // The cap is what keeps one request finite. Removing it would be the other
  // way to get this wrong.
  assert.match(GRAPH, /while \(next && takenFromFolder < limit\)/);
  assert.match(LOOP, /const PASSES = 12/);
});

// ── the nightly read ────────────────────────────────────────────────────────

test("the mailbox is read every morning at six, Perth time", () => {
  // Schedules are UTC. Perth is UTC+8 and has no daylight saving at all, so
  // 22:00 UTC is 06:00 the next morning there every day of the year: nothing to
  // change twice a year and nothing to drift.
  const config = JSON.parse(VERCEL);
  const [job] = config.crons;
  assert.equal(job.path, "/api/cron/mail-sync");
  assert.equal(job.schedule, "0 22 * * *");
});

test("the nightly job will not run without its secret", () => {
  // Anything that can reach the URL could otherwise make the mailbox be read on
  // demand. Refusing when the secret is unset is deliberate: a job that quietly
  // runs unauthenticated because a variable is missing is worse than one that
  // does not run.
  assert.match(CRON, /if \(!secret\) return \{ ok: false/);
  assert.ok(CRON.includes("process.env.CRON_SECRET"), "the secret is not read");
  assert.ok(CRON.includes("Bearer "), "the bearer header is not compared");
});

test("a run that is cut short is a pause, not a hole", () => {
  // The whole reason a timeout is survivable: passes move forward only.
  assert.match(CRON, /export const maxDuration/);
  assert.match(LOOP, /OLDEST FIRST/);
});
