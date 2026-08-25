// The Board.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  COLUMNS,
  COLUMN_KEYS,
  AGE_COLS,
  ACTORS,
  LATE_AT,
  clockFor,
  daysSince,
  daysUntil,
  ageColFor,
  byActor,
  byCross,
  visibleCards,
  sortCards,
  splitByActor,
  groupByAge,
  groupByCategory,
  crossOptions,
  missingWords,
  counts,
  issueCards,
  replyCards,
  requestCards,
  balanceCards,
  depositCards,
  planningCards,
  materialCards,
  lateCards,
  chaseCards,
  buildBoard,
  requestAnswered,
  collapseReplies,
} from "../lib/pcd-board.js";
import { outstandingOnOrder, refundedOnOrder } from "../lib/pcd-board-money.js";

const TODAY = "2026-08-19";

// ── the columns ────────────────────────────────────────────────────────────

test("nine columns, each with a label, a clock and a source", () => {
  assert.equal(COLUMNS.length, 9);
  COLUMNS.forEach((c) => {
    assert.ok(c.key && c.label && c.clock && c.source, `incomplete column: ${c.key}`);
    assert.ok(c.note && c.note.length > 15, `column ${c.key} does not explain itself`);
  });
  assert.equal(new Set(COLUMN_KEYS).size, COLUMNS.length, "duplicate column keys");
});

// updated_at measures our activity, not how long a thing has waited.
test("no clock counts from updated_at", () => {
  COLUMNS.forEach((c) => assert.ok(!/updated/i.test(c.clock), c.key));
  assert.equal(clockFor("plan"), "since accepted");
  assert.equal(clockFor("late"), "overdue");
  assert.equal(clockFor("nonsense"), "");
});

test("the age bands have no gaps and no overlaps", () => {
  assert.equal(AGE_COLS[0].min, 0);
  for (let i = 1; i < AGE_COLS.length; i += 1) {
    assert.equal(AGE_COLS[i].min, AGE_COLS[i - 1].max + 1, `gap before ${AGE_COLS[i].label}`);
  }
  assert.equal(AGE_COLS[AGE_COLS.length - 1].max, Infinity, "the last band must be open ended");
});

test("every possible age lands in exactly one band", () => {
  [0, 1, 2, 7, 8, 14, 15, 400].forEach((d) => {
    const hits = AGE_COLS.filter((c) => d >= c.min && d <= c.max);
    assert.equal(hits.length, 1, `${d} days landed in ${hits.length} bands`);
  });
  assert.equal(ageColFor(0).key, "today");
  assert.equal(ageColFor(9).key, "d8");
  assert.equal(ageColFor(9999).key, "d15");
});

test("there is no grace period, so a card exists the day it does", () => {
  assert.equal(ageColFor(0).key, "today", "a thing that arrived today must still land somewhere");
});

// ── dates ──────────────────────────────────────────────────────────────────

test("age is whole days, never negative, and a missing date is zero", () => {
  assert.equal(daysSince("2026-08-12", TODAY), 7);
  assert.equal(daysSince("2026-08-19", TODAY), 0);
  assert.equal(daysSince("2026-09-01", TODAY), 0);
  assert.equal(daysSince(null, TODAY), 0);
});

test("days until can be negative, because a start date can have passed", () => {
  assert.equal(daysUntil("2026-08-26", TODAY), 7);
  assert.equal(daysUntil("2026-08-12", TODAY), -7);
  assert.equal(daysUntil(null, TODAY), null);
});

// ── filters ────────────────────────────────────────────────────────────────

const c = (over = {}) => ({ id: "x", cat: "reply", days: 3, theirs: false, blocks: false, ...over });

test("the actor filter partitions cleanly", () => {
  const rows = [c({ id: "a" }), c({ id: "b", theirs: true })];
  assert.equal(rows.filter((r) => byActor(r, "all")).length, 2);
  assert.equal(rows.filter((r) => byActor(r, "us")).length, 1);
  assert.equal(rows.filter((r) => byActor(r, "customer")).length, 1);
});

test("the cross filter follows the grouping", () => {
  const row = c({ cat: "plan", days: 9 });
  assert.equal(byCross(row, "age", "plan"), true, "grouped by age, it filters by action");
  assert.equal(byCross(row, "age", "reply"), false);
  assert.equal(byCross(row, "cat", "d8"), true, "grouped by action, it filters by age");
  assert.equal(byCross(row, "cat", "today"), false);
  assert.equal(byCross(row, "age", ""), true, "empty means everything");
});

test("the two filters stack rather than replacing each other", () => {
  const rows = [
    c({ id: "a", cat: "chase", theirs: true }),
    c({ id: "b", cat: "chase", theirs: false }),
    c({ id: "d", cat: "reply", theirs: true }),
  ];
  const out = visibleCards(rows, { actor: "customer", view: "age", cross: "chase" });
  assert.deepEqual(out.map((r) => r.id), ["a"]);
});

test("every actor choice is offered and none of them lose a card", () => {
  assert.deepEqual(ACTORS.map((a) => a.key), ["all", "us", "customer"]);
  const rows = [c({ id: "a" }), c({ id: "b", theirs: true })];
  const total = counts(rows);
  assert.equal(total.us + total.customer, total.all);
});

// ── sorting ────────────────────────────────────────────────────────────────

test("anything blocking a whole order sorts above everything", () => {
  const rows = [
    c({ id: "old", days: 40 }),
    c({ id: "blocker", days: 2, blocks: true }),
    c({ id: "mid", days: 10 }),
  ];
  assert.deepEqual(sortCards(rows).map((r) => r.id), ["blocker", "old", "mid"]);
});

test("sorting does not mutate what it was given", () => {
  const rows = [c({ id: "a" }), c({ id: "b", blocks: true })];
  sortCards(rows);
  assert.deepEqual(rows.map((r) => r.id), ["a", "b"]);
});

test("ours and the customer's are split, each blocking first", () => {
  const rows = [
    c({ id: "t1", theirs: true, days: 2 }),
    c({ id: "o1", days: 5 }),
    c({ id: "t2", theirs: true, days: 1, blocks: true }),
  ];
  const split = splitByActor(rows);
  assert.deepEqual(split.ours.map((r) => r.id), ["o1"]);
  assert.deepEqual(split.theirs.map((r) => r.id), ["t2", "t1"]);
});

// ── a failed source is never a zero ────────────────────────────────────────
//
// The whole reason this module reports failure at all: an empty column and a
// broken one must never look the same.

test("a broken source marks its own column, not the others", () => {
  const cols = groupByCategory([], new Set(["issues"]));
  assert.equal(cols.filter((col) => col.key === "issue")[0].failed, true);
  assert.equal(cols.filter((col) => col.key === "reply")[0].failed, false);
});

test("every column sharing a broken source is marked", () => {
  const cols = groupByCategory([], new Set(["orders"]));
  const fromOrders = COLUMNS.filter((col) => col.source === "orders").map((col) => col.key);
  assert.ok(fromOrders.length > 1, "several columns read the orders source");
  fromOrders.forEach((key) => {
    assert.equal(cols.filter((col) => col.key === key)[0].failed, true, key);
  });
});

// An age column draws from every source, so a broken one leaves it incomplete
// rather than unknown. Crucially it still shows what DID load: hiding a hundred
// real cards over one failed query is worse than the gap it warns about.
test("a broken source leaves the age columns incomplete, not blank", () => {
  const rows = [c({ id: "a", days: 0 }), c({ id: "b", days: 20 })];
  const cols = groupByAge(rows, new Set(["messages"]));
  assert.ok(cols.every((col) => col.incomplete), "every age band is incomplete while a source is down");
  assert.ok(cols.every((col) => !col.failed), "but none of them refuses to show what loaded");
  assert.equal(cols.reduce((n, col) => n + col.cards.length, 0), rows.length, "no card is hidden");
});

test("nothing is marked when everything loaded", () => {
  assert.ok(groupByAge([], new Set()).every((col) => !col.failed && !col.incomplete));
  assert.ok(groupByCategory([], []).every((col) => !col.failed && !col.incomplete));
});

// The banner names the work that is missing, not the table that broke.
test("the missing sources read as column names", () => {
  assert.equal(missingWords(new Set()), "");
  assert.equal(missingWords(new Set(["issues"])), "Fix the problem");
  assert.match(missingWords(new Set(["issues", "requests"])), /Fix the problem and Send a formal quote/);
  assert.match(missingWords(new Set(["orders"])), /, .* and /, "several columns read the orders source");
});

// ── grouping ───────────────────────────────────────────────────────────────

test("both groupings cover every card exactly once", () => {
  const rows = COLUMN_KEYS.map((key, i) => c({ id: key, cat: key, days: i * 3 }));
  const byCat = groupByCategory(rows, new Set());
  const byAge = groupByAge(rows, new Set());
  assert.equal(byCat.reduce((n, col) => n + col.cards.length, 0), rows.length);
  assert.equal(byAge.reduce((n, col) => n + col.cards.length, 0), rows.length);
});

test("the dropdown offers actions when grouped by age, and ages when grouped by action", () => {
  const rows = [c({ cat: "plan", days: 3 }), c({ cat: "plan", days: 20 }), c({ cat: "reply", days: 3 })];
  const byAge = crossOptions(rows, "age", "all");
  assert.equal(byAge.length, COLUMNS.length);
  assert.equal(byAge.filter((o) => o.value === "plan")[0].count, 2);

  const byCat = crossOptions(rows, "cat", "all");
  assert.equal(byCat.length, AGE_COLS.length);
  assert.equal(byCat.filter((o) => o.value === "d2")[0].count, 2);
});

test("the dropdown counts respect the actor filter, so they never promise hidden cards", () => {
  const rows = [c({ cat: "chase", theirs: true }), c({ cat: "chase" })];
  assert.equal(crossOptions(rows, "age", "all").filter((o) => o.value === "chase")[0].count, 2);
  assert.equal(crossOptions(rows, "age", "us").filter((o) => o.value === "chase")[0].count, 1);
});

// ── the card builders ──────────────────────────────────────────────────────

test("an issue owned by us is work, one owned by anybody else is a chase", () => {
  const rows = issueCards(
    [
      { id: "1", order_id: "o1", owner: "us", blocks: "panel", raised_at: "2026-08-16", kindLabel: "Wrong size" },
      { id: "2", order_id: "o1", owner: "customer", blocks: "order", raised_at: "2026-08-13", kindLabel: "Material unavailable" },
    ],
    TODAY
  );
  assert.equal(rows[0].theirs, false);
  assert.equal(rows[1].theirs, true);
  assert.equal(rows[1].blocks, true, "blocks the whole order");
  assert.equal(rows[0].days, 3);
  assert.match(rows[1].href, /section=issues/);
});

test("an issue card names where the panel had got to", () => {
  const [row] = issueCards(
    [{ id: "1", order_id: "o1", owner: "us", blocks: "panel", raised_at: TODAY, stage_at_report: "Drilling", progress_kind: "Stage" }],
    TODAY
  );
  assert.ok(row.tags.some((t) => t[0] === "Stage: Drilling"));
  assert.match(row.why, /still at Drilling/);
});

test("an email with no customer behind it reads as a new sender and goes to the list", () => {
  const rows = replyCards(
    { tickets: [{ id: "t1", from_email: "a@b.com", subject: "Hi", last_message_at: "2026-08-17" }] },
    TODAY
  );
  assert.ok(rows[0].tags.some((t) => t[0] === "New sender"));
  assert.equal(rows[0].href, "/admin/customers");
  assert.equal(rows[0].days, 2);
});

test("an enquiry goes to the enquiries list, where its modal lives", () => {
  const [row] = replyCards({ enquiries: [{ id: "e1", customer_name: "Dave", created_at: "2026-08-15" }] }, TODAY);
  assert.equal(row.href, "/admin/enquiries");
  assert.match(row.why, /to that address/);
});

// A quote request has no price anywhere, so a card must never invent one.
test("a quote request card carries a count and never money", () => {
  const [row] = requestCards(
    [{ id: "r1", customer_name: "Reid", company_name: "Reid Builders", itemCount: 47, created_at: "2026-08-13" }],
    TODAY
  );
  assert.equal(row.amt, 0, "a request has no value to show");
  assert.ok(row.tags.some((t) => t[0] === "47 items"));
  assert.ok(row.tags.some((t) => t[0] === "Business"), "company name reads as Business, not Trade");
  assert.equal(row.href, "/admin/quote-requests");
});

test("a request from the design tool says so", () => {
  const [row] = requestCards([{ id: "r1", source: "design_tool", created_at: TODAY }], TODAY);
  assert.ok(row.tags.some((t) => t[0] === "From the design tool"));
});

test("a pending deposit is the customer's move and goes to the payments tab", () => {
  const [row] = depositCards(
    [{ id: "o1", order_number: "PCD-O-1", deposit_amount: 2655, requested_at: "2026-08-15" }],
    TODAY
  );
  assert.equal(row.theirs, true);
  assert.equal(row.amt, 2655);
  assert.match(row.href, /section=payments/);
  assert.match(row.why, /Pending Deposit/);
});

// It was theirs either way, so the one case where the next move is OURS was
// hidden from anybody filtering the board to their own work.
test("a deposit nobody has asked for is our move, not theirs", () => {
  const [row] = depositCards(
    [{ id: "o1", order_number: "PCD-O-1", deposit_amount: 2655, created_at: "2026-08-15" }],
    TODAY
  );
  assert.equal(row.theirs, false);
  assert.match(row.why, /has not been requested yet/);
});

// ── a request is answered by a quote, not by starting one ──────────────────

test("a request with a drafted but unsent quote still reads as owed", () => {
  const [row] = requestCards(
    [{
      id: "r1", customer_name: "Reid", created_at: "2026-08-10",
      draftQuoteId: "q1", draftQuoteNumber: "PCD-Q-88", draftQuoteAt: "2026-08-12",
    }],
    TODAY
  );
  assert.equal(row.cat, "price");
  // Clocked from when THEY asked, not from when somebody started the quote.
  assert.equal(row.days, daysSince("2026-08-10", TODAY));
  assert.match(row.why, /PCD-Q-88 is drafted and has never been sent/);
  assert.ok(row.tags.some((t) => t[0] === "Drafted, not sent"));
  assert.equal(row.href, "/admin/quotes/q1", "it links to the quote to finish, not the request list");
  // The stamp moves when the draft appears, so a request set aside before
  // anybody started on it comes back once there is a draft sitting unsent.
  assert.equal(row.stamp, "2026-08-12");
});

test("a request nobody has started still says so plainly", () => {
  const [row] = requestCards([{ id: "r1", created_at: "2026-08-10" }], TODAY);
  assert.match(row.why, /no quote sent to them yet/);
  assert.equal(row.href, "/admin/quote-requests");
  assert.ok(!row.tags.some((t) => t[0] === "Drafted, not sent"));
});

// ── a finished job with money still on it ──────────────────────────────────

test("a finished job that was never asked for the money is our move", () => {
  const [row] = balanceCards(
    [{
      id: "o1", order_number: "PCD-O-9", name: "Kitchen refit", customer_name: "Sam",
      completed_at: "2026-08-04", outstanding: 4820, requestedAt: null,
    }],
    TODAY
  );
  assert.equal(row.cat, "balance");
  assert.equal(row.theirs, false, "nobody has asked, so it is ours");
  assert.equal(row.amt, 4820);
  assert.equal(row.days, daysSince("2026-08-04", TODAY), "clocked from when the job finished");
  assert.match(row.why, /\$4,820 has never been asked for/);
  assert.ok(row.tags.some((t) => t[0] === "Never asked for"));
  assert.match(row.href, /section=payments/);
});

test("a balance that has been asked for is a chase", () => {
  const [row] = balanceCards(
    [{ id: "o1", order_number: "PCD-O-9", completed_at: "2026-08-04", outstanding: 990, requestedAt: "2026-08-10" }],
    TODAY
  );
  assert.equal(row.theirs, true);
  assert.match(row.why, /still outstanding, asked for/);
  assert.ok(row.tags.some((t) => t[0] === "Requested"));
});

// ── the name on a card opens the person ────────────────────────────────────
//
// The body of a card goes where the work is. The name goes to the customer,
// which is the other question somebody has in front of a card.

test("every kind of card can carry who it is about", () => {
  const each = [
    issueCards([{ id: "i1", customerId: "c1", order_id: "o1", raised_at: TODAY }], TODAY),
    requestCards([{ id: "r1", customerId: "c1", created_at: TODAY }], TODAY),
    depositCards([{ id: "o1", customerId: "c1", created_at: TODAY }], TODAY),
    planningCards([{ id: "o1", customerId: "c1", accepted_at: TODAY, missing: ["Scheduled start"] }], TODAY),
    materialCards([{ id: "o1", customerId: "c1", accepted_at: TODAY, notOrdered: 2 }], TODAY),
    lateCards([{ id: "o1", customerId: "c1", overdueDays: 3 }], TODAY),
    balanceCards([{ id: "o1", customerId: "c1", completed_at: TODAY, outstanding: 100 }], TODAY),
    chaseCards({ quotes: [{ id: "q1", customerId: "c1", sent_at: TODAY }], payments: [], variations: [] }, TODAY),
    chaseCards({ quotes: [], payments: [{ id: "p1", customerId: "c1", requested_at: TODAY }], variations: [] }, TODAY),
    chaseCards({ quotes: [], payments: [], variations: [{ id: "v1", customerId: "c1", sent_at: TODAY }] }, TODAY),
    replyCards({ enquiries: [{ id: "e1", customerId: "c1", created_at: TODAY }], tickets: [] }, TODAY),
    replyCards({ enquiries: [], tickets: [{ id: "t1", customerId: "c1", last_message_at: TODAY }] }, TODAY),
  ];
  each.forEach((cards) => {
    assert.equal(cards.length, 1);
    assert.equal(cards[0].customerId, "c1", `${cards[0].cat} card lost who it is about`);
  });
});

test("a card about somebody with no record links to nobody", () => {
  // A website enquiry from an address we have never seen. The name has to stay
  // plain text rather than becoming a link that goes nowhere.
  const [row] = replyCards({ enquiries: [{ id: "e1", created_at: TODAY }], tickets: [] }, TODAY);
  assert.equal(row.customerId, null);
});

test("the balance column exists and belongs to the orders source", () => {
  const col = COLUMNS.filter((c) => c.key === "balance")[0];
  assert.ok(col, "a finished job with money on it has a column of its own");
  assert.equal(col.source, "orders", "so a failed orders query reports it as unloaded");
  assert.equal(clockFor("balance"), "since it finished");
});

test("a deposit never requested says so rather than showing a stale age", () => {
  const [row] = depositCards([{ id: "o1", order_number: "PCD-O-1", created_at: "2026-08-17" }], TODAY);
  assert.match(row.why, /not been requested yet/);
});

test("a planning card points at the tab holding the thing that is blank", () => {
  const [panels] = planningCards([{ id: "o1", accepted_at: "2026-08-01", missing: ["Item planning"], panelsMissing: true }], TODAY);
  assert.match(panels.href, /section=items/);
  const [dates] = planningCards([{ id: "o2", accepted_at: "2026-08-01", missing: ["Scheduled start"] }], TODAY);
  assert.match(dates.href, /section=overview/);
  assert.equal(dates.days, 18, "aged from acceptance");
});

test("a materials card says how soon the job starts", () => {
  const [soon] = materialCards(
    [{ id: "o1", notOrdered: 3, scheduled_start_date: "2026-08-24", accepted_at: "2026-08-05" }],
    TODAY
  );
  assert.match(soon.why, /3 panels still Not Ordered/);
  assert.match(soon.why, /in 5 days/);
  const [passed] = materialCards(
    [{ id: "o2", notOrdered: 1, scheduled_start_date: "2026-08-12", accepted_at: "2026-08-05" }],
    TODAY
  );
  assert.match(passed.why, /1 panel still Not Ordered/);
  assert.match(passed.why, /already/);
});

// The only column whose clock counts a date in the future having passed.
test("a late card is aged by how overdue it is, not how old it is", () => {
  const [row] = lateCards([{ id: "o1", overdueDays: 6, accepted_at: "2026-01-01" }], TODAY);
  assert.equal(row.days, 6);
  assert.match(row.href, /section=cutList/);
});

test("a chase card distinguishes an unopened quote from an unanswered one", () => {
  const [unopened] = chaseCards({ quotes: [{ id: "q1", sent_at: "2026-08-10" }] }, TODAY);
  assert.match(unopened.why, /never opened/);
  const [opened] = chaseCards({ quotes: [{ id: "q2", sent_at: "2026-08-05", viewed_at: "2026-08-07" }] }, TODAY);
  assert.match(opened.why, /Never approved or rejected/);
  assert.equal(opened.days, 14, "aged from when we sent it, not when they opened it");
});

test("every chase card is the customer's move", () => {
  const rows = chaseCards(
    {
      quotes: [{ id: "q1", sent_at: TODAY }],
      payments: [{ id: "p1", order_id: "o1", requested_at: TODAY }],
      variations: [{ id: "v1", order_id: "o1", sent_at: TODAY }],
    },
    TODAY
  );
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.theirs), "nothing in this column is ours to do");
  assert.match(rows[2].href, /variations\/v1/);
});

// ── the whole board ────────────────────────────────────────────────────────

test("an empty board is empty, not broken", () => {
  assert.deepEqual(buildBoard({}, TODAY), []);
  assert.deepEqual(buildBoard(null, TODAY), []);
});

test("every card has an id, a column that exists, and somewhere to go", () => {
  const cards = buildBoard(
    {
      issues: [{ id: "1", order_id: "o1", owner: "us", blocks: "panel", raised_at: TODAY }],
      enquiries: [{ id: "e1", created_at: TODAY }],
      tickets: [{ id: "t1", last_message_at: TODAY }],
      requests: [{ id: "r1", created_at: TODAY }],
      deposits: [{ id: "o1", order_number: "PCD-O-1" }],
      planning: [{ id: "o2", accepted_at: TODAY, missing: ["Scheduled start"] }],
      materials: [{ id: "o3", notOrdered: 2, accepted_at: TODAY }],
      late: [{ id: "o4", overdueDays: 2 }],
      quotes: [{ id: "q1", sent_at: TODAY }],
      payments: [{ id: "p1", order_id: "o1", requested_at: TODAY }],
      variations: [{ id: "v1", order_id: "o1", sent_at: TODAY }],
    },
    TODAY
  );
  assert.equal(cards.length, 11);
  assert.equal(new Set(cards.map((c2) => c2.id)).size, cards.length, "duplicate card ids");
  cards.forEach((c2) => {
    assert.ok(COLUMN_KEYS.includes(c2.cat), `unknown column: ${c2.cat}`);
    assert.ok(c2.href, `no destination on ${c2.id}`);
    assert.ok(c2.why && c2.why.length > 10, `no evidence on ${c2.id}`);
  });
});

test("a card is late by age, and the threshold is a fortnight of nobody caring", () => {
  assert.equal(LATE_AT, 8);
  const [fresh] = replyCards({ enquiries: [{ id: "e1", created_at: "2026-08-18" }] }, TODAY);
  const [stale] = replyCards({ enquiries: [{ id: "e2", created_at: "2026-08-01" }] }, TODAY);
  assert.equal(fresh.late, false);
  assert.equal(stale.late, true);
});

// ── the category columns order themselves ──────────────────────────────────

// The order is pinned to the one COLUMNS declares. A board you look at ten
// times a day has to keep its columns where you left them, so only emptiness
// moves anything: the empty ones go to the end.
test("category columns keep their declared order", () => {
  const rows = [
    c({ id: "a", cat: "chase" }),
    c({ id: "b", cat: "chase" }),
    c({ id: "d", cat: "chase" }),
    c({ id: "e", cat: "issue" }),
  ];
  const keys = groupByCategory(rows, new Set()).map((col) => col.key);
  assert.ok(keys.indexOf("issue") < keys.indexOf("chase"), "issue is declared first and stays first");
});

test("empty columns go to the end, in their declared order among themselves", () => {
  const rows = [c({ id: "a", cat: "chase" }), c({ id: "b", cat: "plan" })];
  const cols = groupByCategory(rows, new Set());
  const filled = cols.filter((col) => col.cards.length).map((col) => col.key);
  const empty = cols.filter((col) => !col.cards.length).map((col) => col.key);
  assert.deepEqual(cols.map((col) => col.key), filled.concat(empty), "every filled column comes first");
  assert.deepEqual(filled, ["plan", "chase"], "and the filled ones stay in declared order");
  assert.deepEqual(empty, ["issue", "reply", "price", "depo", "materials", "late", "balance"]);
});

// A column does not move just because its count changed.
test("adding a card to a column never moves it", () => {
  const one = groupByCategory([c({ id: "a", cat: "late" }), c({ id: "b", cat: "issue" })], new Set());
  const many = groupByCategory(
    [c({ id: "a", cat: "late" }), c({ id: "b", cat: "issue" }), c({ id: "d", cat: "late" }), c({ id: "e", cat: "late" })],
    new Set()
  );
  assert.deepEqual(one.map((col) => col.key), many.map((col) => col.key));
});

test("sorting never loses a column or a card", () => {
  const rows = COLUMN_KEYS.flatMap((key, i) => Array.from({ length: i }, (_, n) => c({ id: `${key}${n}`, cat: key })));
  const cols = groupByCategory(rows, new Set());
  assert.equal(cols.length, COLUMNS.length);
  assert.equal(new Set(cols.map((col) => col.key)).size, COLUMNS.length);
  assert.equal(cols.reduce((n, col) => n + col.cards.length, 0), rows.length);
});

// The age columns are a timeline, so they stay in order however full they are.
test("age columns never reorder", () => {
  const rows = [c({ id: "a", days: 30 }), c({ id: "b", days: 30 }), c({ id: "d", days: 0 })];
  assert.deepEqual(groupByAge(rows, new Set()).map((col) => col.key), AGE_COLS.map((col) => col.key));
});

// ── READING THE MAIL IS NOT THE SAME AS REFRESHING ──────────────────────────
//
// The board re-reads the DATABASE every sixty seconds. It cannot know about a
// reply typed in Outlook two minutes ago, because nothing has fetched it yet.
// So a card saying a customer is waiting on us stayed up all afternoon after
// somebody had already answered them, and no amount of refreshing shifted it.

test("the board can go and read the mailbox, not just re-read itself", () => {
  const board = readFileSync(new URL("../app/admin/board/BoardClient.tsx", import.meta.url), "utf8");

  assert.match(board, /async function checkMailbox/, "there is a way to force the read");
  assert.match(board, /"\/api\/admin\/customer-desk\/sync"|'\/api\/admin\/customer-desk\/sync'/, "through the one sync everything else uses");
  assert.match(board, /Check mailbox/, "and it is a control, not a hidden shortcut");
});

test("the mail read and the plain refresh stay separate", () => {
  // The sixty second timer must never fetch the mailbox: that would be a
  // mailbox read a minute, all day, for every open board.
  const board = readFileSync(new URL("../app/admin/board/BoardClient.tsx", import.meta.url), "utf8");
  const refresh = board.slice(board.indexOf("function refresh()"), board.indexOf("async function checkMailbox"));
  assert.ok(!/customer-desk\/sync/.test(refresh), "refresh only re-reads what is already here");

  const timer = board.slice(board.indexOf("setInterval(() => router.refresh()"));
  assert.ok(!/checkMailbox/.test(timer.slice(0, 200)), "and the timer calls refresh, not the mail read");
});

test("the board re-reads itself only after the mail has landed", () => {
  // Refreshing before the sync returns shows the same board again and looks
  // like the button did nothing.
  const board = readFileSync(new URL("../app/admin/board/BoardClient.tsx", import.meta.url), "utf8");
  const fn = board.slice(board.indexOf("async function checkMailbox"), board.indexOf("finally {", board.indexOf("async function checkMailbox")));
  const awaited = fn.indexOf("await response.json()");
  const refreshed = fn.indexOf("router.refresh()");
  assert.ok(awaited > 0 && refreshed > awaited, "the refresh comes after the sync answers");
});

test("a run that ran out of road says so rather than saying done", () => {
  // The exact failure the mail sync was rewritten to stop making.
  const board = readFileSync(new URL("../app/admin/board/BoardClient.tsx", import.meta.url), "utf8");
  assert.match(board, /payload\.capped/, "a capped run is reported as unfinished");
  assert.match(board, /more still to read/);
});

// ── A REQUEST IS ANSWERED BY ANY QUOTE THAT WENT TO THEM ────────────────────
//
// The board followed converted_quote_id, the link the "convert this request"
// button writes. Nothing else writes it. So a quote raised off the back of a
// design, or straight from the quotes page, left the request looking
// unanswered for ever.
//
// Dylan Yarwood had a request, two quotes, one of them approved and already an
// order, and a card telling somebody to send him a formal quote.

test("a quote sent after they asked answers the request, however it was raised", () => {
  const request = { id: "r1", created_at: "2026-08-18T02:00:00Z" };
  assert.equal(requestAnswered(request, ["2026-08-19T12:17:00Z"]), true, "sent the next day");
  assert.equal(requestAnswered(request, ["2026-08-18T02:00:00Z"]), true, "sent the same moment counts");
});

test("a quote from before they asked is not an answer to it", () => {
  // Last month's quote for a different job does not answer a question asked
  // this week.
  const request = { id: "r1", created_at: "2026-08-18T02:00:00Z" };
  assert.equal(requestAnswered(request, ["2026-07-02T00:00:00Z"]), false);
  // But one of several does.
  assert.equal(requestAnswered(request, ["2026-07-02T00:00:00Z", "2026-08-20T00:00:00Z"]), true);
});

test("nothing sent means the card stays up", () => {
  const request = { id: "r1", created_at: "2026-08-18T02:00:00Z" };
  assert.equal(requestAnswered(request, []), false);
  assert.equal(requestAnswered(request, [null, undefined, ""]), false, "a draft has no sent date");
  assert.equal(requestAnswered(request, ["not a date"]), false);
});

test("a request with no date on it is never silently cleared", () => {
  assert.equal(requestAnswered({ id: "r1" }, ["2026-08-19T00:00:00Z"]), false);
  assert.equal(requestAnswered(null, ["2026-08-19T00:00:00Z"]), false);
});

test("the board looks past the convert link, and past its own quote list", () => {
  const page = readFileSync(new URL("../app/admin/board/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requestAnswered/, "the widened rule is actually used");
  // The board's own quotes are sent and viewed only. An APPROVED quote that has
  // become an order is the clearest evidence a price went out, and it is
  // exactly the one that list leaves out.
  assert.match(page, /\.not\('sent_at', 'is', null\)/, "sent quotes are read on their own terms");
  assert.ok(!/if \(!r\.converted_quote_id\) return true/.test(page), "the old link-only rule is gone");
});

test("a failed read leaves the card up rather than clearing it", () => {
  // Not knowing about a quote has to fail towards the card staying, which is
  // what it did before. Silently clearing on an error would hide real work.
  const page = readFileSync(new URL("../app/admin/board/page.tsx", import.meta.url), "utf8");
  assert.match(page, /sentQuoteQueries\.some\(q => q\.error\)/);
  assert.match(page, /failed\.add\('requests'\)/);
});

// ══ AUDIT FIXES ═════════════════════════════════════════════════════════════

// ── F1: a refunded job must not come back asking to be paid ─────────────────

test("a refund comes off the total as well as off the payments", () => {
  // It only came off the payments, so the amount owed ROSE by exactly what had
  // been given back and the board asked you to collect from a settled job.
  const paidInFull = [{ payment_type: "deposit", amount: 1000, is_paid: true }];
  assert.equal(outstandingOnOrder(1000, paidInFull), 0);

  const refunded = [...paidInFull, { payment_type: "refund", amount: -150, is_paid: true }];
  assert.equal(outstandingOnOrder(1000, refunded), 0, "square is square, refund or not");
  assert.equal(refundedOnOrder(refunded), 150);
});

test("a refund on a part paid job leaves the right balance", () => {
  const rows = [
    { payment_type: "deposit", amount: 500, is_paid: true },
    { payment_type: "refund", amount: -100, is_paid: true },
  ];
  // The job was worth 900 once 100 came off it, and they have net paid 400.
  assert.equal(outstandingOnOrder(1000, rows), 500);
});

test("a refund raised and not yet sent changes nothing", () => {
  // The money is still where it was. Counting it early would make a job look
  // square before anybody had given anything back.
  const rows = [
    { payment_type: "deposit", amount: 1000, is_paid: true },
    { payment_type: "refund", amount: -150, is_paid: false },
  ];
  assert.equal(refundedOnOrder(rows), 0);
  assert.equal(outstandingOnOrder(1000, rows), 0);
});

test("an overpaid job never asks for a negative amount", () => {
  assert.equal(outstandingOnOrder(1000, [{ amount: 1200, is_paid: true }]), 0);
});

// ── F2: a quote you have answered leaves the reply column ──────────────────

test("a quote stops being a reply once you have answered them", () => {
  const base = { id: "q1", quote_number: "Q-1", sent_at: "2026-08-01T00:00:00Z", customerId: "c1" };

  const unanswered = chaseCards(
    { quotes: [{ ...base, repliedAt: "2026-08-02T00:00:00Z", answeredAt: null }] },
    "2026-08-10"
  )[0];
  assert.equal(unanswered.cat, "reply", "they wrote and nobody has answered");

  const answered = chaseCards(
    { quotes: [{ ...base, repliedAt: "2026-08-02T00:00:00Z", answeredAt: "2026-08-03T00:00:00Z" }] },
    "2026-08-10"
  )[0];
  assert.equal(answered.cat, "chase", "we answered on the 3rd, so it is a chase again");
  assert.equal(answered.theirs, true, "and the ball is back with them");
});

test("answering before they wrote does not count as answering them", () => {
  const card = chaseCards(
    {
      quotes: [{
        id: "q1", sent_at: "2026-08-01T00:00:00Z",
        repliedAt: "2026-08-05T00:00:00Z",
        answeredAt: "2026-08-02T00:00:00Z",
      }],
    },
    "2026-08-10"
  )[0];
  assert.equal(card.cat, "reply", "their message is the newer of the two");
});

// ── F3: one person, one reply ───────────────────────────────────────────────

const personReply = (customerId, extra = {}) => ({
  id: `reply:${customerId}`, cat: "reply", subjectType: "customer", customerId,
  why: "The last thing that passed between us was theirs, and nothing has gone back.",
  tags: [], ...extra,
});
const quoteReply = (customerId, ref) => ({
  id: `quote:${ref}`, cat: "reply", subjectType: "quote", customerId,
  what: "Cabinetry Quote", why: "They wrote back.", tags: [[ref, "ref"]],
});

test("a quote reply folds into the person's reply card and is named on it", () => {
  const out = collapseReplies([personReply("c1"), quoteReply("c1", "PCD-Q-1")]);
  assert.equal(out.length, 1, "one person, one reply");
  assert.equal(out[0].subjectType, "customer");
  assert.match(out[0].why, /PCD-Q-1/, "nothing is hidden by the collapse");
  assert.ok(out[0].tags.some((t) => t[0] === "PCD-Q-1"), "and it is tagged with the quote");
});

test("two quotes waiting on one person are both named", () => {
  const out = collapseReplies([personReply("c1"), quoteReply("c1", "Q-1"), quoteReply("c1", "Q-2")]);
  assert.equal(out.length, 1);
  assert.match(out[0].why, /Q-1, Q-2/);
});

test("a quote reply with no person card behind it is never collapsed", () => {
  // The safety net. A closed ticket, or an email that never filed, means no
  // person card exists, and dropping the quote would be work disappearing
  // because something that does not exist was assumed to cover it.
  const out = collapseReplies([quoteReply("c1", "Q-1")]);
  assert.equal(out.length, 1);
  assert.equal(out[0].subjectType, "quote");
});

test("a quote reply for a different person is left alone", () => {
  const out = collapseReplies([personReply("c1"), quoteReply("c2", "Q-9")]);
  assert.equal(out.length, 2, "c2 has no reply card of their own");
});

test("collapsing never touches a chase, an enquiry or anything else", () => {
  const chase = { id: "quote:x", cat: "chase", subjectType: "quote", customerId: "c1", tags: [] };
  const enquiry = { id: "enquiry:x", cat: "reply", subjectType: "enquiry", customerId: "c1", tags: [] };
  const out = collapseReplies([personReply("c1"), chase, enquiry]);
  assert.equal(out.length, 3, "only a quote's own REPLY card folds");
});

test("collapsing an empty board, or one with nobody owed a reply, changes nothing", () => {
  assert.deepEqual(collapseReplies([]), []);
  const chaseOnly = [{ id: "a", cat: "chase", subjectType: "quote", customerId: "c1", tags: [] }];
  assert.deepEqual(collapseReplies(chaseOnly), chaseOnly);
});

test("the collapse runs after set aside, so setting a reply aside frees the quote", () => {
  // Collapsing first would let somebody set the reply aside and take the quote
  // chase with it, leaving the quote waiting with nothing anywhere saying so.
  const page = readFileSync(new URL("../app/admin/board/page.tsx", import.meta.url), "utf8");
  const dismiss = page.indexOf("applyDismissals(built");
  const collapse = page.indexOf("collapseReplies(standing)");
  assert.ok(dismiss > 0 && collapse > dismiss, "set aside first, collapse second");
});

// ── F5 and F6: an enquiry is another thing they sent ───────────────────────

test("an enquiry from somebody already owed a reply folds into their card", () => {
  const page = readFileSync(new URL("../app/admin/board/page.tsx", import.meta.url), "utf8");
  assert.match(page, /foldedEnquiryIds/, "enquiries join the per person grouping");
  // Folded BEFORE the cards are built from the groups, or the card would carry
  // the counts and dates from before the fold.
  const fold = page.indexOf("foldedEnquiryIds.add");
  const build = page.indexOf("const openTickets = Array.from(byCustomer.values())");
  assert.ok(fold > 0 && build > fold, "folded before the cards are built");
});

test("an enquiry with nobody to fold into still gets its own card", () => {
  const page = readFileSync(new URL("../app/admin/board/page.tsx", import.meta.url), "utf8");
  assert.match(page, /!foldedEnquiryIds\.has\(e\.id as string\)/, "the ungrouped ones survive");
});

// ── F7: on hold keeps the money, drops the work ────────────────────────────

test("a held job's requested payment still chases", () => {
  const page = readFileSync(new URL("../app/admin/board/page.tsx", import.meta.url), "utf8");
  assert.match(page, /'pending_deposit', 'active', 'complete', 'on_hold'/, "held orders are read");
  assert.match(page, /\['active', 'on_hold'\]\.includes/, "and their payments chase");
});

test("a held job raises no work cards at all", () => {
  const page = readFileSync(new URL("../app/admin/board/page.tsx", import.meta.url), "utf8");
  // Planning, materials and workshop all come from this one list.
  assert.match(page, /const active = orders\.filter\(o => o\.status === 'active'\)/);
  // And issues are scoped away from held jobs explicitly.
  assert.match(page, /order\?\.status !== 'on_hold'/);
});

test("an issue on an archived job stops asking to be fixed", () => {
  // Issues were never scoped to the board's orders, so an unresolved issue on
  // an archived job kept its card, with no order number on it because the order
  // was not there to name it.
  const page = readFileSync(new URL("../app/admin/board/page.tsx", import.meta.url), "utf8");
  assert.match(page, /return Boolean\(order\) && order\?\.status !== 'on_hold'/);
});

// ── F9: a job booked to start with nothing on it ───────────────────────────

test("an order booked to start with no panels at all is not silent", () => {
  const page = readFileSync(new URL("../app/admin/board/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const nothingOnIt = panels\.length === 0/);
  assert.match(page, /startPassed && \(nothingMoved \|\| nothingOnIt\)/);
  assert.match(page, /'Nothing on it'/, "and it says which of the two it is");
});
