// ALFRED, PHASE 2: KEEPING ACTIVE ORDERS UPDATED.
//
// ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────
//
//   ONLY REAL UPDATES RESTART THE CLOCK. An email a person wrote or approved,
//   and the Customer Updates report. Quotes, invoices and automatic emails do
//   not.
//
//   THE DRAFT COMES TWO DAYS BEFORE THE LIMIT, counted in Perth days.
//
//   NO NEWS MEANS A QUESTION, never a filler email, and "I will update them
//   myself" makes nothing.
//
//   ACTIVE AND ON HOLD ONLY. Pending deposit orders are left to the deposit
//   reminders.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countsAsUpdate, noNewsQuestion, perthDaysBetween, updateClock, updateSourceKey, UPDATE_STATUSES } from "../lib/pcd-alfred-updates.js";
import { morningSummaryHtml } from "../lib/pcd-alfred-morning.js";
import { normaliseAlfredSettings } from "../lib/pcd-alfred-settings.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("only emails a person wrote or approved count as an update", () => {
  assert.equal(countsAsUpdate({ direction: "outbound", sent_as: "reply" }), true);
  assert.equal(countsAsUpdate({ direction: "outbound", sent_as: null }), true, "Outlook and older mail count");
  assert.equal(countsAsUpdate({ direction: "outbound" }), true, "a database without the column counts everything");
  assert.equal(countsAsUpdate({ direction: "outbound", sent_as: "document" }), false, "a quote or invoice is not an update");
  assert.equal(countsAsUpdate({ direction: "outbound", sent_as: "automatic" }), false, "a review request is not an update");
  assert.equal(countsAsUpdate({ direction: "inbound", sent_as: null }), false);
});

test("days are Perth days, so a 9pm email is that day, not the next", () => {
  assert.equal(perthDaysBetween("2026-10-05T13:00:00Z", new Date("2026-10-06T01:00:00Z")), 1);
  assert.equal(perthDaysBetween("2026-10-05T17:00:00Z", new Date("2026-10-06T01:00:00Z")), 0);
});

test("the update is due two days before the limit", () => {
  const order = { created_at: "2026-09-01T00:00:00Z" };
  const now = new Date("2026-10-06T01:00:00Z");
  assert.deepEqual(
    { ...updateClock(order, "2026-09-28T02:00:00Z", 10, now) },
    { daysSince: 8, dueIn: 2, due: true, lastContactAt: "2026-09-28T02:00:00Z" }
  );
  assert.equal(updateClock(order, "2026-09-30T02:00:00Z", 10, now).due, false);
  assert.equal(updateClock(order, null, 10, now).due, true, "nobody has written since the order was raised");
});

test("one update per gap, so the same lull is never drafted twice", () => {
  assert.equal(updateSourceKey("o1", "2026-09-28T02:00:00Z"), "update:o1:2026-09-28");
  assert.equal(updateSourceKey("o1", null), "update:o1:none");
});

test("with no news, Alfred asks, and one answer means you will do it yourself", () => {
  const q = noNewsQuestion({ order: { order_number: "PCD-1042" }, customerName: "Sarah Nguyen", lastContactAt: "2026-09-28T02:00:00Z", dueIn: 2 }, "2026-10-14");
  assert.match(q.question, /^Nothing has changed on PCD-1042 since we last wrote on .* Is it on track\?$/);
  assert.equal(q.options.length, 3);
  assert.match(q.options[0], /^Yes, on track for /);
  assert.match(q.options[2], /myself/);
  assert.match(read("lib/pcd-alfred-updates.js"), /if \(\/myself\/i\.test\(answer\)\) return \{ made: "nothing"/);
});

test("active and on hold orders only", () => {
  assert.deepEqual(UPDATE_STATUSES, ["active", "on_hold"]);
});

test("the gap and the summary are settings, with sane limits", () => {
  const s = normaliseAlfredSettings({ update_gap_days: 1, summary_email: "not an email" });
  assert.equal(s.update_gap_days, 3);
  assert.equal(s.summary_email, "sales@perthcabinetdoors.com.au");
  assert.equal(s.jobs.updates, true);
});

test("the morning summary is figures and names, with a way in", () => {
  const html = morningSummaryHtml({
    drafts: 2,
    questions: 1,
    due: [{ order: { order_number: "PCD-1042" }, customerName: "Sarah Nguyen", lastContactAt: "x", daysSince: 8 }],
    adminUrl: "https://site.example/admin/alfred/waiting",
  });
  assert.match(html, /2 drafts and 1 question waiting for you/);
  assert.match(html, /Sarah Nguyen/);
  assert.match(html, /8 days since we wrote/);
  assert.match(html, /href="https:\/\/site\.example\/admin\/alfred\/waiting"/);
});

test("every sent email is labelled, so the clock can tell them apart", () => {
  assert.match(read("lib/pcd-desk-reply.js"), /row\.sent_as = "reply"/);
  assert.match(read("lib/pcd-desk-outbound.js"), /sentAs = "document"/);
  assert.match(read("lib/pcd-review-request-run.js"), /sentAs: "automatic"/);
});

test("an approved update starts its own conversation", () => {
  assert.match(read("lib/pcd-alfred-drafts.js"), /newTicket: draft\.kind === "update"/);
});

test("the board, the order page and the orders list all show it", () => {
  assert.match(read("lib/pcd-board.js"), /key: "posted"/);
  assert.match(read("lib/pcd-board-load.ts"), /ordersAgainstTheGap/);
  // Not on the order page itself (Ashleigh, 2026-10-06): the Alfred page and
  // the board's Keep them posted column carry it, so it is not said three times.
  assert.doesNotMatch(read("app/admin/orders/[id]/OrderDetail.js"), /AlfredPostedPanel/);
  assert.match(read("app/admin/orders/OrdersManager.tsx"), /<AlfredDot/);
});

test("the summary subject counts properly", async () => {
  const { morningSummarySubject } = await import("../lib/pcd-alfred-morning.js");
  assert.equal(morningSummarySubject({ drafts: 1, questions: 1, due: 2, day: "6 Oct 2026" }), "Alfred: 1 draft, 1 question, 2 due an update · 6 Oct 2026");
  assert.equal(morningSummarySubject({ drafts: 3, questions: 0, due: 0, day: "x" }), "Alfred: 3 drafts, 0 questions, 0 due an update · x");
});
