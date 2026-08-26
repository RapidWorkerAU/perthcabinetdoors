// COLOURS AND MATERIALS, AND LEAD CONVERSION.
//
// ── THE ONE THAT MATTERS ─────────────────────────────────────────────────────
//
// Nobody marks a quote rejected. A customer who goes quiet just goes quiet, so
// the quote sits at 'sent' forever and every DECIDED quote looks won. Computed
// honestly off the raw statuses, the conversion rate on the real book was 100%,
// which is not a number anybody can act on.
//
// So a quote out longer than our own terms are good for counts as lost. Thirty
// days, because the quote itself says "valid for 30 days". That turns 100% into
// 64%. If this rule ever quietly reverts, the rate goes back to flattering us
// and nothing else breaks, which is exactly why it is pinned here.
//
// ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
//
//   A LIVE QUOTE IS NEITHER WON NOR LOST. Counting it either way moves the rate
//   for something that has not happened yet.
//   A DRAFT IS NOT A LEAD. Never sent, so nobody could have said yes.
//   PIECES, NOT LINES. A line for three doors is three doors.
//   CANCELLED WORK IS NOT WORK.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { materialsReport, colourOf, shareOf, COUNTED_ORDER_STATUSES } from "../lib/pcd-report-materials.js";
import { leadConversion, outcomeOf, QUOTE_VALID_DAYS } from "../lib/pcd-lead-conversion.js";

const NOW = new Date("2026-08-26T00:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

// ── lead conversion ─────────────────────────────────────────────────────────

test("a quote nobody answered inside our own terms counts as lost", () => {
  assert.equal(QUOTE_VALID_DAYS, 30, "the quote itself says 30 days");
  assert.equal(outcomeOf({ status: "sent", sent_at: daysAgo(45) }, { now: NOW }), "lapsed");
  assert.equal(outcomeOf({ status: "viewed", sent_at: daysAgo(31) }, { now: NOW }), "lapsed");
});

test("a quote still inside its terms is live, not lost", () => {
  assert.equal(outcomeOf({ status: "sent", sent_at: daysAgo(5) }, { now: NOW }), "pending");
  // Exactly on the boundary is still live: the terms say valid FOR 30 days.
  assert.equal(outcomeOf({ status: "viewed", sent_at: daysAgo(30) }, { now: NOW }), "pending");
});

test("only an approval is a conversion", () => {
  assert.equal(outcomeOf({ status: "approved", sent_at: daysAgo(60) }, { now: NOW }), "converted");
  assert.equal(outcomeOf({ status: "rejected", sent_at: daysAgo(2) }, { now: NOW }), "lost");
  // Said yes, money not in. Still live, NOT a conversion.
  assert.equal(outcomeOf({ status: "awaiting_deposit", sent_at: daysAgo(3) }, { now: NOW }), "pending");
});

test("a draft is not a lead", () => {
  assert.equal(outcomeOf({ status: "draft" }, { now: NOW }), "draft");
  // Never sent, whatever its status says.
  assert.equal(outcomeOf({ status: "sent", sent_at: null }, { now: NOW }), "draft");
});

test("live quotes are kept out of the rate, and drafts with them", () => {
  const report = leadConversion(
    {
      quotes: [
        { id: "1", status: "approved", total_inc_gst: 1000, sent_at: daysAgo(40), approved_at: daysAgo(38) },
        { id: "2", status: "sent", total_inc_gst: 500, sent_at: daysAgo(60) },
        { id: "3", status: "sent", total_inc_gst: 9999, sent_at: daysAgo(3) },
        { id: "4", status: "draft", total_inc_gst: 7777 },
      ],
    },
    { now: NOW }
  );

  // Two decided: one won, one lapsed. The live one and the draft are outside.
  assert.equal(report.decided.count, 2);
  assert.equal(report.decided.rateByCount, 50);
  assert.equal(report.buckets.pending.count, 1);
  assert.equal(report.buckets.draft.count, 1);
  assert.equal(report.decided.value, 1500, "the live 9999 must not be in the denominator");
});

test("the rate is reported by value as well as by count", () => {
  // Ten small wins and one large loss is not the same business as the reverse.
  const report = leadConversion(
    {
      quotes: [
        { id: "1", status: "approved", total_inc_gst: 100, sent_at: daysAgo(40) },
        { id: "2", status: "rejected", total_inc_gst: 900, sent_at: daysAgo(40) },
      ],
    },
    { now: NOW }
  );
  assert.equal(report.decided.rateByCount, 50);
  assert.equal(report.decided.rateByValue, 10);
});

test("lapsed is kept apart from a real decline", () => {
  // A silence is not a customer saying no, and reading it as one would be
  // unfair to whoever wrote the quote.
  const report = leadConversion(
    { quotes: [{ id: "1", status: "sent", total_inc_gst: 100, sent_at: daysAgo(90) }] },
    { now: NOW }
  );
  assert.equal(report.buckets.lapsed.count, 1);
  assert.equal(report.buckets.lost.count, 0);
});

test("the oldest quote is at the top of every list", () => {
  const report = leadConversion(
    {
      quotes: [
        { id: "new", quote_number: "B", status: "sent", sent_at: daysAgo(40) },
        { id: "old", quote_number: "A", status: "sent", sent_at: daysAgo(90) },
      ],
    },
    { now: NOW }
  );
  assert.equal(report.buckets.lapsed.quotes[0].number, "A", "the one to chase or write off comes first");
});

test("how long a yes takes is a median, not an average", () => {
  // One quote approved eight weeks later drags a mean somewhere that describes
  // nothing.
  const report = leadConversion(
    {
      quotes: [
        { id: "1", status: "approved", sent_at: daysAgo(40), approved_at: daysAgo(39) },
        { id: "2", status: "approved", sent_at: daysAgo(40), approved_at: daysAgo(39) },
        { id: "3", status: "approved", sent_at: daysAgo(90), approved_at: daysAgo(20) },
      ],
    },
    { now: NOW }
  );
  assert.equal(report.turnaround.median, 1);
  assert.equal(report.turnaround.slowest, 70);
});

// ── colours and materials ───────────────────────────────────────────────────

test("pieces are counted, not lines", () => {
  // A line for three doors is three doors. Counting lines would rank a colour
  // ordered once in a batch of forty below one ordered singly four times.
  const report = materialsReport([
    { qty: 3, colour: "Greige", material: "Decorative Board", line_total_ex_gst: 300 },
    { qty: 1, colour: "Classic White", material: "Decorative Board", line_total_ex_gst: 100 },
  ]);
  assert.equal(report.totals.pieces, 4);
  assert.equal(report.colours[0].key, "Greige");
  assert.equal(report.colours[0].pieces, 3);
});

test("a removed variation line is not made, so it is not counted", () => {
  const report = materialsReport([
    { qty: 5, colour: "Greige", variation_status: "removed", line_total_ex_gst: 500 },
    { qty: 2, colour: "Greige", line_total_ex_gst: 200 },
  ]);
  assert.equal(report.totals.pieces, 2);
});

test("only orders that were actually made are counted", () => {
  assert.deepEqual(COUNTED_ORDER_STATUSES, ["active", "complete", "on_hold"]);
  assert.ok(!COUNTED_ORDER_STATUSES.includes("cancelled"), "a cancelled order's doors were never made");
});

test("a finish on the front of a colour is stripped", () => {
  // The picker writes "Matt - Polar White" into one field, which would otherwise
  // make the same colour in two finishes into two colours nobody can compare.
  assert.equal(colourOf({ colour: "Matt - Polar White", finish: "Matt" }), "Polar White");
  assert.equal(colourOf({ colour: "Polar White", finish: "Matt" }), "Polar White");
  assert.equal(colourOf({ colour: "", finish: "Matt" }), "");
});

test("undecided fulfilment is shown, not hidden", () => {
  // A planning report that hides the undecided is the one that lets them sit.
  const report = materialsReport([
    { qty: 2, fulfilment_method: "in_house" },
    { qty: 3, fulfilment_method: null },
  ]);
  assert.equal(report.fulfilment.in_house, 2);
  assert.equal(report.fulfilment.undecided, 3);
});

test("an empty report divides by nothing without falling over", () => {
  const report = materialsReport([]);
  assert.equal(report.totals.pieces, 0);
  assert.deepEqual(report.colours, []);
  assert.equal(shareOf(5, 0), 0);
});

// ── the sidebar only lists reports that exist ───────────────────────────────

test("no report is listed that cannot be opened", () => {
  const shell = readFileSync(new URL("../app/admin/reporting/ReportingShell.tsx", import.meta.url), "utf8");

  // The LIST, not the file. The comment above it names the three that were
  // taken off and says why, and a test that forbids naming them forbids
  // explaining them.
  const list = shell.slice(shell.indexOf("export const REPORTS"), shell.indexOf("export default"));

  assert.ok(!/soon: true/.test(list), "a list of things that are not coming is worse than a short list");
  ["Sales by month", "Production throughput", "Aged receivables"].forEach((gone) => {
    assert.ok(!list.includes(gone), `${gone} was removed and must stay removed until it can be built`);
  });
  ["Colours and materials", "Lead conversion", "Weekly customer updates", "Financials"].forEach((live) => {
    assert.ok(list.includes(live), `${live} must be listed`);
  });
});
