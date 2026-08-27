// THE DASHBOARD ACTION QUEUE.
//
// ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
//
//   A DEADLINE BEATS EVERYTHING. No amount of age or money may climb past
//   something that is actually running out, or the panel stops being a list of
//   what to do and becomes a list of what is biggest.
//
//   NOTHING IS GIVEN AN INVENTED VALUE. An enquiry has not been priced. It
//   scores zero for value and says so on the row, rather than being handed an
//   average that would quietly rank it against real money.
//
//   EVERY ROW GOES SOMEWHERE. A row that names a person and then lands on a
//   list of two hundred others is the failure this replaced.
//
//   ONE TASK PER PIECE OF WORK. A website enquiry from somebody we already know
//   is both an enquiry row and a desk conversation. It must appear once.
//
//   THE ORDER IS STABLE. Two items on the same score must not swap places
//   between renders, because somebody is about to click one of them.
//
//   IT EMPTIES. A lapsed quote is worth chasing the week it lapsed and not for
//   ever, or the queue silts up with dead work and buries the live jobs.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildActionQueue,
  scoreOf,
  waitedLabel,
  dueLabel,
  agoLabel,
  TIER,
  LAPSED_STAYS_FOR_DAYS,
} from "../lib/pcd-action-queue.js";

const NOW = new Date("2026-08-27T02:00:00Z");
const DAY = 86400000;
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();
const hoursAgo = (hours) => new Date(NOW.getTime() - hours * 3600000).toISOString();
const VALID = 30;

const build = (sources, options = {}) => buildActionQueue(sources, { now: NOW, validDays: VALID, ...options });
const kinds = (queue) => queue.items.map((entry) => entry.kind);
const byId = (queue, id) => queue.items.find((entry) => entry.id === id);

// ── the ranking rule ────────────────────────────────────────────────────────

test("a deadline outranks any amount of money or waiting", () => {
  // A small quote expiring tomorrow against a huge one that is merely old.
  const urgent = scoreOf({ tier: TIER.critical, daysWaiting: 0, value: 200 });
  const rich = scoreOf({ tier: TIER.soon, daysWaiting: 60, value: 100000 });
  assert.ok(urgent > rich, "the tier steps have to be bigger than everything below them");
});

test("inside a tier, age and value both move it", () => {
  const base = scoreOf({ tier: TIER.soon, daysWaiting: 5, value: 1000 });
  assert.ok(scoreOf({ tier: TIER.soon, daysWaiting: 20, value: 1000 }) > base);
  assert.ok(scoreOf({ tier: TIER.soon, daysWaiting: 5, value: 9000 }) > base);
});

test("one huge or ancient item cannot camp at the top of its tier", () => {
  // Capped at 60 days and $20,000, so a five year old quote and a five month
  // old one score the same and the rest of the tier is still reachable.
  assert.equal(
    scoreOf({ tier: TIER.soon, daysWaiting: 60, value: 20000 }),
    scoreOf({ tier: TIER.soon, daysWaiting: 4000, value: 900000 })
  );
});

test("an item with no value scores nothing for value rather than guessing", () => {
  assert.equal(scoreOf({ tier: TIER.normal, daysWaiting: 0, value: null }), TIER.normal * 10000);
});

// ── the wording ─────────────────────────────────────────────────────────────

test("times are written the way a person would say them", () => {
  assert.equal(waitedLabel(hoursAgo(0), NOW), "just now");
  assert.equal(waitedLabel(hoursAgo(1), NOW), "1 hour");
  assert.equal(waitedLabel(hoursAgo(6), NOW), "6 hours");
  assert.equal(waitedLabel(ago(1), NOW), "1 day");
  assert.equal(waitedLabel(ago(9), NOW), "9 days");

  assert.equal(dueLabel(0), "today");
  assert.equal(dueLabel(1), "tomorrow");
  assert.equal(dueLabel(6), "in 6 days");

  assert.equal(agoLabel(0), "today");
  assert.equal(agoLabel(1), "yesterday");
  assert.equal(agoLabel(4), "4 days ago");
});

test("every title is an instruction with a name in it, never a category", () => {
  const queue = build({
    quotes: [
      { id: "q1", quote_number: "PCD-Q-1", customer_name: "Justin Howard", status: "viewed", sent_at: ago(29), viewed_at: ago(28), total_inc_gst: 7854.22 },
      { id: "q2", quote_number: "PCD-Q-2", customer_name: "Sarah Thompson", status: "awaiting_deposit", awaiting_deposit_at: ago(2), total_inc_gst: 4000, deposit_percent: 30 },
    ],
    quoteRequests: [{ id: "r1", customer_name: "Hanna Oeyre", created_at: ago(1) }],
    enquiries: [{ id: "e1", customer_name: "Sam Standish", topic: "Something else", created_at: ago(0) }],
    openTickets: [{ id: "t1", customer_id: "c9", customer_name: "Shane Peterson", subject: "Handle colour", last_message_at: ago(2) }],
    orders: [],
    payments: [],
  });

  for (const entry of queue.items) {
    assert.ok(entry.title.length > 0, "a row with no title is a row nobody can act on");
    // The name of the person or the job, every time. A title like "Quote
    // awaiting response" tells you a category and leaves the work to you.
    assert.match(
      entry.title,
      /Justin Howard|Sarah Thompson|Hanna Oeyre|Sam Standish|Shane Peterson/,
      `"${entry.title}" does not name anybody`
    );
    assert.ok(entry.actionLabel, "every row needs a button label");
    assert.ok(entry.detail, "every row needs the fact that justifies it");
  }
});

// ── where the buttons go ────────────────────────────────────────────────────

test("every button lands on the page where that work is actually done", () => {
  const queue = build({
    quotes: [
      { id: "q1", quote_number: "PCD-Q-1", customer_name: "Justin Howard", status: "viewed", sent_at: ago(25), total_inc_gst: 7854 },
      { id: "q2", quote_number: "PCD-Q-2", customer_name: "Sarah T", status: "awaiting_deposit", awaiting_deposit_at: ago(2), total_inc_gst: 4000, deposit_percent: 30 },
    ],
    quoteRequests: [{ id: "r1", customer_name: "Hanna Oeyre", created_at: ago(1) }],
    enquiries: [
      { id: "e1", customer_name: "Sam Standish", created_at: ago(0) },
      { id: "e2", customer_name: "Known Person", customer_id: "c5", created_at: ago(0) },
    ],
    openTickets: [{ id: "t1", customer_id: "c9", customer_name: "Shane Peterson", subject: "Handles", last_message_at: ago(2) }],
    payments: [{ id: "p1", order_id: "o1", payment_type: "progress", amount: 900, requested_at: ago(9), pcd_orders: { order_number: "PCD-O-1", customer_name: "Laura Brown", status: "active" } }],
    orders: [
      { id: "o2", order_number: "PCD-O-2", customer_name: "Sascha Barbaro", status: "active", target_completion_date: ago(2), total_inc_gst: 4138 },
      { id: "o3", order_number: "PCD-O-3", customer_name: "Held Job", status: "on_hold", updated_at: ago(5), total_inc_gst: 1000 },
    ],
  }, { limit: 50 });

  const href = (id) => byId(queue, id).href;

  // A quote and an order have real pages of their own.
  assert.equal(href("quote-expiring:q1"), "/admin/quotes/q1");
  assert.equal(href("deposit:q2"), "/admin/quotes/q2");
  assert.equal(href("payment:p1"), "/admin/orders/o1", "a payment opens its ORDER, not a payments list");
  assert.equal(href("order-late:o2"), "/admin/orders/o2");
  assert.equal(href("order-hold:o3"), "/admin/orders/o3");

  // A conversation opens the customer's desk, which is where a reply is typed.
  assert.equal(href("ticket:t1"), "/admin/customers/c9");
  assert.equal(href("enquiry:e2"), "/admin/customers/c5", "somebody we know opens their desk");

  // These two have no page of their own, so the link opens their row.
  assert.equal(href("request:r1"), "/admin/quote-requests?focus=r1");
  assert.equal(href("enquiry:e1"), "/admin/enquiries?focus=e1", "a stranger has no desk yet");

  for (const entry of queue.items) {
    assert.match(entry.href, /^\/admin\//, `${entry.id} points outside the admin`);
    assert.equal(entry.href.includes("undefined"), false, `${entry.id} has a hole in its link`);
    assert.equal(entry.href.includes("null"), false, `${entry.id} has a hole in its link`);
  }
});

// ── what gets in, and what does not ─────────────────────────────────────────

test("a quote with weeks left is not a task yet", () => {
  const queue = build({
    quotes: [{ id: "q1", quote_number: "PCD-Q-1", customer_name: "Andrew", status: "sent", sent_at: ago(4), total_inc_gst: 2500 }],
  });
  assert.deepEqual(kinds(queue), [], "the panel is what to do now, not everything that exists");
});

test("a quote inside its last seven days is", () => {
  const queue = build({
    quotes: [{ id: "q1", quote_number: "PCD-Q-1", customer_name: "Andrew Asher", status: "viewed", sent_at: ago(24), viewed_at: ago(23), total_inc_gst: 2563.83 }],
  });
  assert.deepEqual(kinds(queue), ["quote_expiring"]);
  const row = queue.items[0];
  assert.equal(row.tier, TIER.soon);
  assert.match(row.flag.text, /in 6 days/);
  assert.match(row.detail, /opened it and never answered/);
});

test("the last day before a quote expires is a phone call, not an email", () => {
  const queue = build({
    quotes: [{ id: "q1", quote_number: "PCD-Q-1", customer_name: "Justin Howard", status: "viewed", sent_at: ago(29), total_inc_gst: 7854.22 }],
  });
  const row = queue.items[0];
  assert.equal(row.tier, TIER.critical);
  assert.match(row.title, /^Ring Justin Howard/);
  assert.match(row.flag.text, /tomorrow/);
});

test("a quote that became an order is not in the queue", () => {
  const queue = build({
    quotes: [{ id: "q1", quote_number: "PCD-Q-1", customer_name: "Anyone", status: "sent", sent_at: ago(26), order_id: "o1", total_inc_gst: 5000 }],
  });
  assert.deepEqual(kinds(queue), []);
});

test("a lapsed quote is worth chasing for a fortnight, then it stops", () => {
  const fresh = build({
    quotes: [{ id: "q1", quote_number: "PCD-Q-1", customer_name: "Rebecca Kirk", status: "archived", archived_reason: "expired", archived_at: ago(2), viewed_at: ago(30), sent_at: ago(38), total_inc_gst: 5280.28 }],
  });
  assert.deepEqual(kinds(fresh), ["quote_lapsed"]);
  assert.match(fresh.items[0].title, /Re-send Rebecca Kirk's quote/);
  assert.match(fresh.items[0].detail, /they opened it and went quiet/);

  const stale = build({
    quotes: [{ id: "q1", quote_number: "PCD-Q-1", customer_name: "James Thelwel", status: "archived", archived_reason: "expired", archived_at: ago(LAPSED_STAYS_FOR_DAYS + 1), sent_at: ago(79), total_inc_gst: 4193.99 }],
  });
  assert.deepEqual(kinds(stale), [], "old dead quotes must not silt the queue up");
});

test("a quote somebody filed away by hand is not a lapsed one", () => {
  const queue = build({
    quotes: [{ id: "q1", quote_number: "PCD-Q-1", customer_name: "Anyone", status: "archived", archived_reason: "manual", archived_at: ago(1), sent_at: ago(20), total_inc_gst: 3000 }],
  });
  assert.deepEqual(kinds(queue), [], "archiving something on purpose must not put it back on the dashboard");
});

test("only money we actually asked for is chased", () => {
  const queue = build({
    payments: [
      { id: "p1", order_id: "o1", payment_type: "progress", amount: 900, requested_at: ago(9), pcd_orders: { order_number: "PCD-O-1", customer_name: "Laura Brown", status: "active" } },
    ],
  });
  assert.deepEqual(kinds(queue), ["payment_owing"]);
  assert.equal(queue.items[0].tier, TIER.critical, "nine days unpaid after asking is a phone call");
  assert.equal(queue.items[0].value, 900);
});

test("nothing is owed on an order that was cancelled or put away", () => {
  // The page filters those out before the queue sees them, and this pins the
  // shape the queue expects so a change on either side is noticed.
  const queue = build({
    payments: [{ id: "p1", order_id: "o1", amount: 900, requested_at: ago(9), pcd_orders: { order_number: "PCD-O-1", customer_name: "X", status: "active" } }],
    orders: [{ id: "o1", order_number: "PCD-O-1", customer_name: "X", status: "complete", target_completion_date: ago(5) }],
  });
  assert.deepEqual(kinds(queue), ["payment_owing"], "a completed order is not late");
});

// ── one task per piece of work ──────────────────────────────────────────────

test("an enquiry from somebody already talking to us appears once", () => {
  const queue = build({
    enquiries: [{ id: "e1", customer_id: "c9", customer_name: "Shane Peterson", topic: "Handles", created_at: ago(2) }],
    openTickets: [{ id: "t1", customer_id: "c9", customer_name: "Shane Peterson", subject: "Handle colour", last_message_at: ago(2) }],
  });
  assert.deepEqual(kinds(queue), ["unanswered_message"], "the conversation wins, it links to where you reply");
});

test("an enquiry from a stranger still shows", () => {
  const queue = build({
    enquiries: [{ id: "e1", customer_name: "Sam Standish", topic: "Something else", created_at: ago(0) }],
    openTickets: [{ id: "t1", customer_id: "c9", customer_name: "Someone Else", subject: "Other", last_message_at: ago(1) }],
  });
  assert.ok(kinds(queue).includes("enquiry"));
});

// ── the shape of the panel ──────────────────────────────────────────────────

test("the order is stable when two things score the same", () => {
  const sources = {
    quoteRequests: [
      { id: "b", customer_name: "Second", created_at: ago(1) },
      { id: "a", customer_name: "First", created_at: ago(1) },
    ],
  };
  const once = build(sources).items.map((entry) => entry.id);
  const twice = build(sources).items.map((entry) => entry.id);
  assert.deepEqual(once, twice);
  assert.deepEqual(once, ["request:a", "request:b"], "ties break on the id, not on read order");
});

test("the panel shows a handful and says how many it is holding back", () => {
  const requests = Array.from({ length: 12 }, (_, index) => ({
    id: `r${index}`,
    customer_name: `Person ${index}`,
    created_at: ago(index),
  }));
  const queue = build({ quoteRequests: requests }, { limit: 8 });
  assert.equal(queue.items.length, 8);
  assert.equal(queue.total, 12);
  assert.equal(queue.hidden, 4, "a silent truncation reads as covered everything");
});

test("an empty queue is an empty queue, not an error", () => {
  const queue = build({});
  assert.deepEqual(queue.items, []);
  assert.equal(queue.total, 0);
  assert.equal(queue.hidden, 0);
});

// ── the whole thing, on a real morning ──────────────────────────────────────

test("the biggest thing in the business comes out on top", () => {
  // 27 August 2026, from the real book. The old panel put none of these first:
  // Justin Howard was not new, not a request and not overdue for payment, so he
  // belonged to none of its four boxes and did not appear at all.
  const queue = build({
    quotes: [
      { id: "howard", quote_number: "PCD-Q-2026-1C433D", customer_name: "Justin Howard", status: "viewed", sent_at: ago(29), viewed_at: ago(28), total_inc_gst: 7854.22 },
      { id: "asher", quote_number: "PCD-Q-2026-12ACD1", customer_name: "Andrew Asher", status: "viewed", sent_at: ago(24), viewed_at: ago(23), total_inc_gst: 2563.83 },
    ],
    quoteRequests: [
      { id: "oeyre", customer_name: "Hanna Oeyre", created_at: ago(0) },
      { id: "ferraro", customer_name: "Saverio Ferraro", created_at: ago(1) },
    ],
    enquiries: [{ id: "standish", customer_name: "Sam Standish", topic: "Something else", created_at: ago(0) }],
  });

  assert.equal(queue.items[0].id, "quote-expiring:howard");
  assert.equal(queue.items[0].value, 7854.22);
  assert.match(queue.items[0].title, /^Ring Justin Howard/);

  // Both quotes with money on them sit above everything that has not been
  // priced. That is the whole reordering: the old panel led with the newest
  // enquiry because it was the first coloured box, and $7,854 about to expire
  // was nowhere on the screen.
  assert.deepEqual(kinds(queue).slice(0, 2), ["quote_expiring", "quote_expiring"]);
  assert.ok(
    queue.items.slice(2).every((entry) => entry.value === null),
    "nothing unpriced may outrank real money in the same tier"
  );
});
