// The Board.

import test from "node:test";
import assert from "node:assert/strict";

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
  depositCards,
  planningCards,
  materialCards,
  lateCards,
  chaseCards,
  buildBoard,
} from "../lib/pcd-board.js";

const TODAY = "2026-08-19";

// ── the columns ────────────────────────────────────────────────────────────

test("eight columns, each with a label, a clock and a source", () => {
  assert.equal(COLUMNS.length, 8);
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
  assert.deepEqual(empty, ["issue", "reply", "price", "depo", "materials", "late"]);
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
