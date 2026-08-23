// Closing an email conversation.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CLOSURE_REASONS,
  CLOSURE_REASON_KEYS,
  closureReasonLabel,
  isClosureReason,
  countsAsReply,
  lastRealDirection,
  needsReply,
  closureNote,
  validateClosure,
} from "../lib/pcd-ticket-closure.js";

const msg = (direction, created_at) => ({ direction, created_at });

test("four reasons, each with a key, a label and words for the note", () => {
  assert.equal(CLOSURE_REASONS.length, 4);
  CLOSURE_REASONS.forEach((r) => {
    assert.ok(r.key && r.label && r.words, `incomplete reason: ${r.key}`);
  });
  assert.equal(new Set(CLOSURE_REASON_KEYS).size, 4);
  assert.equal(closureReasonLabel("spam"), "Spam");
  assert.equal(closureReasonLabel("nonsense"), "Other");
  assert.equal(isClosureReason("spam"), true);
  assert.equal(isClosureReason("made_up"), false);
});

// THE BUG THIS EXISTS TO PREVENT. A note is us writing to ourselves. Counting
// one as a reply would clear a card off the board without anybody answering the
// customer, which is the exact failure the board is meant to stop.
test("a note is not a reply", () => {
  assert.equal(countsAsReply("inbound"), true);
  assert.equal(countsAsReply("outbound"), true);
  assert.equal(countsAsReply("note"), false);
});

test("whose turn it is ignores notes entirely", () => {
  const messages = [
    msg("inbound", "2026-08-10"),
    msg("note", "2026-08-18"),
    msg("note", "2026-08-19"),
  ];
  assert.equal(lastRealDirection(messages), "inbound", "the notes must not take the customer's turn away");
  assert.equal(needsReply({ status: "open" }, messages), true);
});

test("an actual reply does take the turn", () => {
  const messages = [msg("inbound", "2026-08-10"), msg("outbound", "2026-08-11")];
  assert.equal(lastRealDirection(messages), "outbound");
  assert.equal(needsReply({ status: "open" }, messages), false);
});

test("a thread of nothing but notes is nobody's turn", () => {
  assert.equal(lastRealDirection([msg("note", "2026-08-19")]), null);
  assert.equal(lastRealDirection([]), null);
  assert.equal(needsReply({ status: "open" }, []), false);
});

// Closing is what takes a card off the board. A new inbound reopens the ticket
// through the mail sync, which is what makes it a line in time rather than a
// permanent dismissal.
test("a closed ticket needs nothing, whatever the messages say", () => {
  const messages = [msg("inbound", "2026-08-19")];
  assert.equal(needsReply({ status: "closed" }, messages), false);
  assert.equal(needsReply({ status: "open" }, messages), true, "and reopening brings it straight back");
});

test("no ticket is nobody's turn rather than an error", () => {
  assert.equal(needsReply(null, [msg("inbound", "2026-08-19")]), false);
});

test("messages out of order are still read newest first", () => {
  const messages = [msg("outbound", "2026-08-01"), msg("inbound", "2026-08-19"), msg("outbound", "2026-08-10")];
  assert.equal(lastRealDirection(messages), "inbound");
});

// ── the note ───────────────────────────────────────────────────────────────

test("the note says why, in words rather than a code", () => {
  assert.equal(closureNote("spam"), "Conversation closed. Spam or junk.");
  assert.match(closureNote("answered_by_phone"), /Handled on the phone/);
});

test("free text is kept, because Other on its own explains nothing", () => {
  assert.equal(
    closureNote("other", "They bought elsewhere."),
    "Conversation closed. No reply needed. They bought elsewhere."
  );
  assert.equal(closureNote("spam", "   "), "Conversation closed. Spam or junk.");
});

test("an unknown reason falls back rather than writing a blank note", () => {
  assert.match(closureNote("made_up"), /Conversation closed\./);
});

// ── validation ─────────────────────────────────────────────────────────────

test("a reason is required, and only Other has to be explained", () => {
  assert.ok(validateClosure({}).reason);
  assert.ok(validateClosure({ reason: "invented" }).reason);
  assert.deepEqual(validateClosure({ reason: "spam" }), {});
  assert.ok(validateClosure({ reason: "other" }).detail, "Other alone says nothing");
  assert.deepEqual(validateClosure({ reason: "other", detail: "They bought elsewhere." }), {});
});
