// WHEN A BOARD CARD IS AND IS NOT VALID.
//
// The board was showing 114 cards and a good share of them were wrong. Not
// wrong in their arithmetic: wrong in that something elsewhere in the system
// already said the job was done, and the card had no way to know.
//
// The worst of them: "they wrote N days ago and you have not replied" on
// customers we had emailed since, because whose-turn-is-it was judged per email
// THREAD and a reply usually starts a new thread. 16 of 66 said that, and 39 of
// them were the same handful of people counted once per thread.
//
// These lock the rules that decide whether a card is real.

import test from "node:test";
import assert from "node:assert/strict";

import { chaseCards, replyCards, planningCards } from "../lib/pcd-board.js";
import {
  applyDismissals,
  dismissNote,
  dismissalIndex,
  isSetAside,
  validateDismissal,
} from "../lib/pcd-board-dismissal.js";

const TODAY = "2026-08-20";

// ── reply: one card per customer ────────────────────────────────────────────

test("a customer with three waiting threads gets one card, not three", () => {
  const cards = replyCards({
    enquiries: [],
    tickets: [{
      id: "t1",
      customer_id: "c1",
      customerName: "Kristy Smith",
      subject: "Re: quote",
      subjectId: "c1",
      waitingThreads: 3,
      oldestUnanswered: "2026-07-16T00:00:00Z",
      newestInbound: "2026-08-14T00:00:00Z",
    }],
  }, TODAY);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].who, "Kristy Smith");
  assert.match(cards[0].why, /3 conversations/);
  assert.ok(cards[0].tags.some((t) => t[0] === "3 conversations"));
});

test("the clock runs from their oldest unanswered message, not their newest", () => {
  // Somebody who has written three times is owed an answer from the first one.
  // Timing it from the newest would make a month of silence look like a day.
  const [card] = replyCards({
    enquiries: [],
    tickets: [{
      id: "t1", customer_id: "c1", customerName: "Kristy", subjectId: "c1", waitingThreads: 2,
      oldestUnanswered: "2026-07-16T00:00:00Z",
      newestInbound: "2026-08-19T00:00:00Z",
    }],
  }, TODAY);
  assert.equal(card.days, 35);
});

test("a reply card is stamped with their NEWEST message, so writing again brings it back", () => {
  const [card] = replyCards({
    enquiries: [],
    tickets: [{
      id: "t1", customer_id: "c1", customerName: "Kristy", subjectId: "c1", waitingThreads: 2,
      oldestUnanswered: "2026-07-16T00:00:00Z",
      newestInbound: "2026-08-19T00:00:00Z",
    }],
  }, TODAY);
  assert.equal(card.stamp, "2026-08-19T00:00:00Z");
  assert.equal(card.subjectId, "c1");
  assert.equal(card.subjectType, "customer");
});

// ── quotes move between chasing them and answering them ─────────────────────

test("a quote nobody has answered is a chase", () => {
  const [card] = chaseCards({
    quotes: [{ id: "q1", quote_number: "PCD-Q-1", customer_name: "Susan", sent_at: "2026-08-10T00:00:00Z", repliedAt: null }],
  }, TODAY);
  assert.equal(card.cat, "chase");
  assert.equal(card.theirs, true);
});

test("a quote they wrote back about is ours to answer, not theirs to sit on", () => {
  // The card used to say "no answer either way" while a conversation was going
  // on. 8 of 30 chase cards were like that.
  const [card] = chaseCards({
    quotes: [{
      id: "q1", quote_number: "PCD-Q-1", customer_name: "Susan",
      sent_at: "2026-08-01T00:00:00Z",
      repliedAt: "2026-08-15T00:00:00Z",
    }],
  }, TODAY);
  assert.equal(card.cat, "reply");
  assert.equal(card.theirs, false);
  assert.match(card.why, /wrote back/);
  assert.ok(card.tags.some((t) => t[0] === "They replied"));
  // Timed from their message, so a card that has just changed sides does not
  // arrive already looking overdue.
  assert.equal(card.days, 5);
});

test("reissuing the quote puts it back on their side", () => {
  // Whichever happened last wins, worked out every time the board is built, so
  // it can never get stuck on the wrong side.
  const [card] = chaseCards({
    quotes: [{
      id: "q1", quote_number: "PCD-Q-1", customer_name: "Susan",
      sent_at: "2026-08-18T00:00:00Z",
      repliedAt: "2026-08-15T00:00:00Z",
    }],
  }, TODAY);
  assert.equal(card.cat, "chase");
  assert.equal(card.theirs, true);
});

// ── setting a card aside ────────────────────────────────────────────────────

test("a card stays off the board while nothing about it has changed", () => {
  const card = { cat: "reply", subjectId: "c1", stamp: "2026-08-19T00:00:00Z" };
  const index = dismissalIndex([{ cat: "reply", subject_id: "c1", seen_stamp: "2026-08-19T00:00:00Z" }]);
  assert.equal(isSetAside(card, index), true);
});

test("it comes back the moment the thing it is about moves on", () => {
  // The whole point: nobody has to remember to look at it again.
  const index = dismissalIndex([{ cat: "reply", subject_id: "c1", seen_stamp: "2026-08-19T00:00:00Z" }]);
  const theyWroteAgain = { cat: "reply", subjectId: "c1", stamp: "2026-08-20T09:00:00Z" };
  assert.equal(isSetAside(theyWroteAgain, index), false);
});

test("setting one card aside does not clear the same person from another column", () => {
  // A customer can be set aside on replies and still owe us an answer on a
  // quote. Those are two different jobs about the same person.
  const index = dismissalIndex([{ cat: "reply", subject_id: "c1", seen_stamp: "2026-08-19T00:00:00Z" }]);
  assert.equal(isSetAside({ cat: "chase", subjectId: "c1", stamp: "2026-08-19T00:00:00Z" }, index), false);
});

test("set aside twice, the later mark is the one that counts", () => {
  const index = dismissalIndex([
    { cat: "reply", subject_id: "c1", seen_stamp: "2026-07-01T00:00:00Z" },
    { cat: "reply", subject_id: "c1", seen_stamp: "2026-08-19T00:00:00Z" },
  ]);
  assert.equal(isSetAside({ cat: "reply", subjectId: "c1", stamp: "2026-08-10T00:00:00Z" }, index), true);
});

test("a card with nothing to hang a dismissal on can never be hidden", () => {
  assert.equal(isSetAside({ cat: "reply", subjectId: null, stamp: "2026-08-19T00:00:00Z" }, dismissalIndex([])), false);
});

test("the board says how many are set aside, so nothing is secretly hidden", () => {
  const cards = [
    { cat: "reply", subjectId: "c1", stamp: "2026-08-01T00:00:00Z" },
    { cat: "reply", subjectId: "c2", stamp: "2026-08-01T00:00:00Z" },
  ];
  const result = applyDismissals(cards, [{ cat: "reply", subject_id: "c1", seen_stamp: "2026-08-01T00:00:00Z" }]);
  assert.equal(result.cards.length, 1);
  assert.equal(result.setAsideCount, 1);
  assert.equal(result.setAside[0].subjectId, "c1");
});

test("the reason has to say something, and Other has to say more", () => {
  assert.deepEqual(validateDismissal({ cat: "reply", subjectId: "c1", reason: "no_reply_needed" }), {});
  assert.ok(validateDismissal({ cat: "reply", subjectId: "c1", reason: "made up" }).reason);
  assert.ok(validateDismissal({ cat: "reply", subjectId: "c1", reason: "other", detail: "x" }).detail);
  assert.ok(validateDismissal({ reason: "spam" }).cat);
});

test("the note names what was set aside, not just why", () => {
  // "No reply needed" on its own does not tell you what it was about when you
  // read the timeline in three months.
  const note = dismissNote("Kristy Smith: Re: quote", "no_reply_needed", "");
  assert.match(note, /Kristy Smith/);
  assert.match(note, /Nothing to answer/);
});

// ── planning waits until the job is real ────────────────────────────────────

test("a planning card carries the order it is about, so it can be set aside", () => {
  const [card] = planningCards([{
    id: "o1", order_number: "PCD-O-1", customer_name: "Tori", missing: ["Scheduled start"],
    accepted_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-10T00:00:00Z",
  }], TODAY);
  assert.equal(card.subjectId, "o1");
  assert.equal(card.subjectType, "order");
  assert.equal(card.stamp, "2026-08-10T00:00:00Z");
});
