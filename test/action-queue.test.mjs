// THE DASHBOARD ACTION QUEUE: the top of the board, ranked.
//
// ── THE FAULT THIS FILE EXISTS FOR ───────────────────────────────────────────
//
// The dashboard briefly built its own list of what needed doing, from its own
// queries. It knew nothing about set aside, so a card deliberately cleared off
// the board reappeared on the dashboard with no way to clear it again. A board
// you have cleared and a dashboard that disagrees is worse than having neither,
// because now neither can be trusted.
//
// So the queue decides nothing about WHAT needs doing. It takes board cards,
// already filtered by set aside, and puts them in order.
//
// ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
//
//   IT ONLY EVER SHOWS WHAT THE BOARD SHOWS. No extra source, no second
//   opinion, and nothing that has been set aside.
//
//   IT USES THE BOARD'S OWN AGE BANDS. If it drew its own urgency lines, the
//   dashboard would call something urgent that the board showed as fine.
//
//   THE BUTTON MATCHES THE LINK. A button that says "Open quote" and opens an
//   order stops somebody clicking the next one.
//
//   NOTHING WITHOUT MONEY IS GIVEN A $0. A reply has no value. Showing zero
//   dollars against it reads as work worth nothing.
//
//   THE ORDER IS STABLE. Two cards on the same score must not swap places
//   between renders, because somebody is about to click one of them.

import test from "node:test";
import assert from "node:assert/strict";

import {
  rankBoardCards,
  toQueueItem,
  scoreOf,
  tierOf,
  instructionFor,
  destinationLabel,
  flagFor,
  TIER,
} from "../lib/pcd-action-queue.js";
import { LATE_AT, buildBoard, replyCards, requestCards, chaseCards } from "../lib/pcd-board.js";
import { applyDismissals } from "../lib/pcd-board-dismissal.js";

const TODAY = "2026-08-27";
const daysAgo = (days) => new Date(new Date(`${TODAY}T00:00:00Z`).getTime() - days * 86400000).toISOString();

// A board card, with only the fields the queue reads spelled out.
const boardCard = (over = {}) => ({
  id: "quote:q1",
  cat: "chase",
  subjectType: "quote",
  who: "Justin Howard",
  what: "Kitchen doors",
  why: "Quote opened 29 days ago. Never approved or rejected.",
  days: 29,
  amt: 7854.22,
  theirs: true,
  blocks: false,
  href: "/admin/quotes/q1",
  ...over,
});

// ── the ranking rule ────────────────────────────────────────────────────────

test("urgency comes from the board's own age bands, not a second opinion", () => {
  assert.equal(LATE_AT, 8, "the board's late line moved and this file did not");
  assert.equal(tierOf({ days: 0 }), TIER.low);
  assert.equal(tierOf({ days: 2 }), TIER.normal);
  assert.equal(tierOf({ days: LATE_AT }), TIER.high);
  assert.equal(tierOf({ days: 15 }), TIER.critical);
});

test("a problem on a job, or anything blocking work, is pulled up a band", () => {
  assert.equal(tierOf({ cat: "issue", days: 0 }), TIER.normal);
  assert.equal(tierOf({ cat: "issue", days: 9 }), TIER.critical);
  assert.equal(tierOf({ blocks: true, days: 3 }), TIER.high);
  // And it cannot go past the top.
  assert.equal(tierOf({ cat: "issue", days: 40 }), TIER.critical);
});

test("age beats money, and neither can jump a band", () => {
  const old = scoreOf({ tier: TIER.critical, days: 16, amt: 0 });
  const rich = scoreOf({ tier: TIER.high, days: 8, amt: 100000 });
  assert.ok(old > rich, "the tier steps have to be bigger than everything below them");
});

test("inside a band, age and value both move it", () => {
  const base = scoreOf({ tier: TIER.high, days: 9, amt: 1000 });
  assert.ok(scoreOf({ tier: TIER.high, days: 12, amt: 1000 }) > base);
  assert.ok(scoreOf({ tier: TIER.high, days: 9, amt: 9000 }) > base);
});

test("one huge or ancient card cannot camp at the top of its band", () => {
  assert.equal(
    scoreOf({ tier: TIER.high, days: 60, amt: 20000 }),
    scoreOf({ tier: TIER.high, days: 4000, amt: 900000 })
  );
});

// ── the words ───────────────────────────────────────────────────────────────

test("every title is an instruction naming the person, never a category", () => {
  const cases = [
    [{ cat: "reply", who: "Shane Peterson" }, /^Reply to Shane Peterson$/],
    [{ cat: "price", who: "Hanna Oeyre" }, /^Send Hanna Oeyre a price$/],
    [{ cat: "depo", who: "Sarah Thompson" }, /^Chase Sarah Thompson for the deposit$/],
    [{ cat: "issue", who: "Laura Brown" }, /^Sort out the problem on Laura Brown's job$/],
    [{ cat: "plan", who: "Jacob Lanigan" }, /^Finish planning Jacob Lanigan's job$/],
    [{ cat: "materials", who: "Leanne Ward" }, /^Order the materials for Leanne Ward's job$/],
    [{ cat: "late", who: "Sascha Barbaro" }, /^Chase the workshop on Sascha Barbaro's job$/],
    [{ cat: "balance", who: "Rebecca Kirk" }, /^Invoice Rebecca Kirk for what is left$/],
  ];
  for (const [cardRow, shape] of cases) {
    assert.match(instructionFor(cardRow), shape);
  }
});

test("the three things sitting with a customer are told apart", () => {
  // "Chase Rebecca" on its own does not say what about, and the board already
  // records which of the three it is.
  assert.match(instructionFor({ cat: "chase", subjectType: "quote", who: "Rebecca" }), /about their quote/);
  assert.match(instructionFor({ cat: "chase", subjectType: "payment", who: "Rebecca" }), /for the payment/);
  assert.match(instructionFor({ cat: "chase", subjectType: "variation", who: "Rebecca" }), /about the change/);
});

test("a card with no name still reads as a sentence", () => {
  assert.match(instructionFor({ cat: "reply", who: "" }), /^Reply to this customer$/);
});

test("the reason on the dashboard is the reason on the board", () => {
  const item = toQueueItem(boardCard());
  assert.match(item.detail, /Kitchen doors/);
  assert.match(item.detail, /Never approved or rejected/);
});

test("a flag only appears once a card is genuinely late", () => {
  assert.equal(flagFor({ days: 3 }), null, "a flag on everything is a flag on nothing");
  assert.equal(flagFor({ days: LATE_AT }).tone, "warn");
  assert.equal(flagFor({ days: 20 }).tone, "crit");
  assert.equal(flagFor({ days: 20 }).text, "20 days");
  assert.equal(flagFor({ cat: "issue", days: 0 }).text, "Problem");
});

// ── the buttons ─────────────────────────────────────────────────────────────

test("the button is named after where it actually goes", () => {
  assert.equal(destinationLabel("/admin/quotes/abc"), "Open quote");
  assert.equal(destinationLabel("/admin/orders/abc"), "Open order");
  assert.equal(destinationLabel("/admin/orders/abc?section=payments"), "Open order");
  assert.equal(destinationLabel("/admin/customers/abc"), "Open conversation");
  assert.equal(destinationLabel("/admin/quote-requests?focus=abc"), "Open request");
  assert.equal(destinationLabel("/admin/enquiries?focus=abc"), "Open enquiry");
});

test("a card that changes where it points renames its own button", () => {
  // The label is read off the href rather than the card kind, so the two cannot
  // drift into disagreeing.
  const asQuote = toQueueItem(boardCard({ href: "/admin/quotes/q1" }));
  const asOrder = toQueueItem(boardCard({ href: "/admin/orders/o1" }));
  assert.equal(asQuote.actionLabel, "Open quote");
  assert.equal(asOrder.actionLabel, "Open order");
});

test("a named card lands on its own row, not on a list of two hundred", () => {
  const [enquiry] = replyCards(
    { enquiries: [{ id: "e1", customer_name: "Sam Standish", topic: "Something else", created_at: daysAgo(1) }], tickets: [] },
    TODAY
  );
  assert.equal(enquiry.href, "/admin/enquiries?focus=e1");

  const [known] = replyCards(
    { enquiries: [{ id: "e2", customerId: "c5", customer_name: "Known", created_at: daysAgo(1) }], tickets: [] },
    TODAY
  );
  assert.equal(known.href, "/admin/customers/c5", "somebody we know opens their desk");

  const [request] = requestCards([{ id: "r1", customer_name: "Hanna Oeyre", created_at: daysAgo(2) }], TODAY);
  assert.equal(request.href, "/admin/quote-requests?focus=r1");

  // And once a draft exists, the work carries on in the quote instead.
  const [drafted] = requestCards(
    [{ id: "r2", customer_name: "Hanna", created_at: daysAgo(2), draftQuoteId: "q9", draftQuoteNumber: "PCD-Q-9" }],
    TODAY
  );
  assert.equal(drafted.href, "/admin/quotes/q9");
});

test("every row goes somewhere inside the admin, with no holes in the link", () => {
  const cards = [
    ...replyCards({ enquiries: [{ id: "e1", customer_name: "Sam", created_at: daysAgo(1) }], tickets: [] }, TODAY),
    ...requestCards([{ id: "r1", customer_name: "Hanna", created_at: daysAgo(2) }], TODAY),
    ...chaseCards(
      {
        quotes: [{ id: "q1", quote_number: "PCD-Q-1", customer_name: "Justin", sent_at: daysAgo(29), total_inc_gst: 7854 }],
        payments: [{ id: "p1", order_id: "o1", amount: 900, requested_at: daysAgo(9), payment_type: "progress" }],
        variations: [{ id: "v1", order_id: "o1", title: "Extra door", sent_at: daysAgo(5), total_inc_gst: 400 }],
      },
      TODAY
    ),
  ];

  for (const item of rankBoardCards(cards, { limit: 50 }).items) {
    assert.match(item.href, /^\/admin\//, `${item.id} points outside the admin`);
    assert.equal(item.href.includes("undefined"), false, `${item.id} has a hole in its link`);
    assert.equal(item.href.includes("null"), false, `${item.id} has a hole in its link`);
    assert.ok(item.actionLabel && item.actionLabel !== "Open", `${item.id} has no useful button`);
  }
});

// ── money ───────────────────────────────────────────────────────────────────

test("a card with no money on it says what it is, not $0", () => {
  const reply = toQueueItem(boardCard({ cat: "reply", amt: 0, days: 3, href: "/admin/customers/c1" }));
  assert.equal(reply.value, null, "zero dollars against a reply reads as work worth nothing");
  assert.equal(reply.valueNote, "2 to 7 days", "so it shows the age band instead");
});

test("money is shown per card and never added up", () => {
  const queue = rankBoardCards([
    boardCard({ id: "a", amt: 1000 }),
    boardCard({ id: "b", amt: 2000 }),
  ]);
  assert.deepEqual(queue.items.map((entry) => entry.value), [2000, 1000]);
  assert.equal(Object.prototype.hasOwnProperty.call(queue, "value"), false, "the queue must not carry a total");
  assert.equal(Object.prototype.hasOwnProperty.call(queue, "total_inc_gst"), false);
});

// ── set aside ───────────────────────────────────────────────────────────────

test("a card set aside on the board never reaches the dashboard", () => {
  // THE BUG THIS WHOLE REWRITE IS FOR. Both screens now read the same cards,
  // after the same dismissals, so clearing one clears both.
  const cards = requestCards([{ id: "r1", customer_name: "Hanna Oeyre", created_at: daysAgo(4) }], TODAY);
  const dismissals = [{ cat: "price", subject_id: "r1", seen_stamp: daysAgo(4) }];

  const { cards: standing } = applyDismissals(cards, dismissals);
  assert.deepEqual(rankBoardCards(standing).items, []);
});

test("and it comes back to the dashboard when the board would bring it back", () => {
  // Set aside at the day it arrived. A draft quote appearing moves the stamp
  // past that mark, so it is a new situation and the card returns, on both
  // screens at once because there is only one rule.
  const dismissals = [{ cat: "price", subject_id: "r1", seen_stamp: daysAgo(4) }];
  const moved = requestCards(
    [{ id: "r1", customer_name: "Hanna Oeyre", created_at: daysAgo(4), draftQuoteId: "q9", draftQuoteNumber: "PCD-Q-9", draftQuoteAt: daysAgo(1) }],
    TODAY
  );

  const { cards: standing } = applyDismissals(moved, dismissals);
  assert.equal(rankBoardCards(standing).items.length, 1);
});

// ── the shape of the panel ──────────────────────────────────────────────────

test("the queue holds no card the board did not give it", () => {
  const built = buildBoard({}, TODAY);
  assert.deepEqual(rankBoardCards(built).items, [], "an empty board is an empty panel");
});

test("the order is stable when two cards score the same", () => {
  const cards = [boardCard({ id: "quote:b" }), boardCard({ id: "quote:a" })];
  const once = rankBoardCards(cards).items.map((entry) => entry.id);
  const twice = rankBoardCards([...cards].reverse()).items.map((entry) => entry.id);
  assert.deepEqual(once, twice, "ties break on the id, not on read order");
  assert.deepEqual(once, ["quote:a", "quote:b"]);
});

test("the panel shows a handful and says how many it is holding back", () => {
  const cards = Array.from({ length: 12 }, (_, index) =>
    boardCard({ id: `quote:q${index}`, days: index + 1, amt: 100 })
  );
  const queue = rankBoardCards(cards, { limit: 8 });
  assert.equal(queue.items.length, 8);
  assert.equal(queue.total, 12);
  assert.equal(queue.hidden, 4, "a silent truncation reads as covered everything");
});

// ── the whole thing, on a real morning ──────────────────────────────────────

test("the oldest and largest work comes out on top", () => {
  const cards = [
    ...chaseCards(
      {
        quotes: [
          { id: "howard", quote_number: "PCD-Q-1C433D", customer_name: "Justin Howard", title: "Kitchen", sent_at: daysAgo(29), viewed_at: daysAgo(28), total_inc_gst: 7854.22 },
          { id: "asher", quote_number: "PCD-Q-12ACD1", customer_name: "Andrew Asher", title: "Doors", sent_at: daysAgo(24), viewed_at: daysAgo(23), total_inc_gst: 2563.83 },
        ],
        payments: [],
        variations: [],
      },
      TODAY
    ),
    ...requestCards(
      [
        { id: "oeyre", customer_name: "Hanna Oeyre", created_at: daysAgo(0) },
        { id: "ferraro", customer_name: "Saverio Ferraro", created_at: daysAgo(1) },
      ],
      TODAY
    ),
    ...replyCards({ enquiries: [{ id: "standish", customer_name: "Sam Standish", topic: "Something else", created_at: daysAgo(0) }], tickets: [] }, TODAY),
  ];

  const queue = rankBoardCards(cards, { limit: 8 });
  assert.equal(queue.items[0].id, "quote:howard");
  assert.equal(queue.items[0].value, 7854.22);
  assert.match(queue.items[0].title, /^Follow up Justin Howard about their quote$/);
  assert.equal(queue.items[1].id, "quote:asher");

  // Everything a day or two old sits under both, whatever column it came from.
  assert.ok(queue.items.slice(2).every((entry) => entry.tier <= TIER.normal));
});
