// A REPLY ON A THREAD WE ALREADY HOLD BELONGS TO THAT THREAD.
//
// The sender gate exists to stop strangers writing in and becoming customers.
// It was being applied to every message including our own replies, so a reply
// sent from Outlook to a customer's SECOND address was treated as an unknown
// sender asking to be let in: parked in the pending list, never filed, never on
// her desk, and the board went on saying nobody had answered her.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SYNC = read("lib/pcd-desk-sync.js");
const RPC = read("supabase/202608241200_pcd_board_outbound_recipients.sql");

test("a message on a conversation we already hold skips the sender gate", () => {
  assert.ok(
    SYNC.includes("const onKnownThread = message.conversation_id"),
    "the thread is looked up before the gate"
  );
  assert.ok(
    SYNC.includes('if (decision !== "customer" && !known && !onKnownThread) {'),
    "and a known thread is enough to file it"
  );
});

test("a message on a known thread is filed against that thread's customer", () => {
  // Looking the address up instead would make a SECOND record for the same
  // person the first time they use their other address, which is the duplicate
  // the desk spends its life undoing.
  assert.ok(
    SYNC.includes("const customer = onKnownThread?.customer_id"),
    "it takes the customer from the ticket"
  );
  assert.ok(
    SYNC.includes("{ id: onKnownThread.customer_id, email: null }"),
    "rather than upserting on an address nobody has linked"
  );
});

test("an unknown address on an unknown thread is still held for approval", () => {
  // The gate still does its job: a stranger writing in for the first time does
  // not become a customer on the strength of having written.
  assert.ok(SYNC.includes("summary.awaiting += 1"), "still parked");
  assert.ok(SYNC.includes("pendingUpdates.set(address, tally)"), "and still tallied");
});

test("the board counts a reply against every person it went to", () => {
  // to_email holds every recipient joined with commas. Grouping on that whole
  // string learned that we had written to "a@x.com, b@y.com", which is nobody,
  // and left both real people looking unanswered.
  assert.ok(
    RPC.includes("unnest(string_to_array(m.to_email, ','))"),
    "the recipients are split apart"
  );
  assert.ok(RPC.includes("group by lower(btrim(recipient))"), "and counted one by one");
});

test("the other two answers are unchanged", () => {
  assert.ok(RPC.includes("'last_by_ticket'"), "a thread already knows whose it is");
  assert.ok(RPC.includes("'last_inbound'"), "and an inbound message has one sender");
  assert.ok(RPC.includes("m.direction in ('inbound', 'outbound')"), "notes still excluded");
});
