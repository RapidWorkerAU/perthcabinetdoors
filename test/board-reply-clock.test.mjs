// "THEY REACHED OUT 45 DAYS AGO" ON A CONVERSATION WE WERE IN ALL WEEK.
//
// Reported as: a reply card saying somebody had been waiting a month and a half,
// and a customer page showing back and forth within the last few days. It makes
// us look like we have dropped somebody when we have not, which is the one thing
// the board exists to prevent.
//
// Two separate faults produced it, and they need different fixes.
//
//   THE BOARD COULD NOT SEE OUR REPLY. Whether somebody is owed an answer is
//   decided by comparing what they sent to when we last wrote to them, and the
//   addresses that counted as theirs came only off their customer record. People
//   write from more than one address. We reply to whichever one they used, that
//   address never gets added to their record, and the board concludes we have
//   never answered that person at all. The rule for somebody we have never
//   answered is that EVERYTHING they ever sent is still waiting, however old, so
//   the card gets timed from their first ever email. Live data had three such
//   addresses and one card 31 days adrift.
//
//   THE CARD ONLY SHOWED THE OLD DATE. A card is timed from the oldest waiting
//   conversation, on purpose: that is the one overdue an answer and the one
//   worth sorting by. But shown alone it reads as a month of silence even when
//   they wrote again this morning. Both facts are true, only one was on screen.
//
// Neither is caught by a build or a type. The first is a join the page never
// made, the second is a number nobody printed. So they are caught here.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { replyCards } from "../lib/pcd-board.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const LOADER = read("lib/pcd-board-load.ts");
const CLIENT = read("app/admin/board/BoardClient.tsx");
const SQL = read("supabase/202609151400_pcd_board_customer_addresses.sql");

const TODAY = "2026-08-20";
const ticket = (extra) => ({
  id: "t1",
  customer_id: "c1",
  customerName: "Kristy",
  subjectId: "c1",
  ...extra,
});

// ── the card carries both clocks ────────────────────────────────────────────

test("a card whose newest message is newer than the one being timed says so", () => {
  const [card] = replyCards({
    enquiries: [],
    tickets: [ticket({
      waitingThreads: 3,
      oldestUnanswered: "2026-07-06T00:00:00Z",
      newestInbound: "2026-08-18T00:00:00Z",
    })],
  }, TODAY);

  // The clock is unchanged. The oldest is still what the card is timed from and
  // still what it sorts by: this adds a fact, it does not move the goalposts.
  assert.equal(card.days, 45);
  assert.equal(card.latest, 2);
});

test("one conversation gets one number, not the same number twice", () => {
  // Every card with a single waiting conversation has oldest === newest. A
  // second chip reading "newest 45d" beside "45d" is noise on most of the board.
  const [card] = replyCards({
    enquiries: [],
    tickets: [ticket({
      waitingThreads: 1,
      oldestUnanswered: "2026-07-06T00:00:00Z",
      newestInbound: "2026-07-06T00:00:00Z",
    })],
  }, TODAY);
  assert.equal(card.days, 45);
  assert.equal(card.latest, null);
});

test("the newest can never be older than the thing being timed", () => {
  // Defensive: oldest is picked as the minimum, so this cannot happen from the
  // loader. If it ever did, printing "newest 60d" next to "45d" would be a
  // contradiction on the card rather than a fact, so it is dropped instead.
  const [card] = replyCards({
    enquiries: [],
    tickets: [ticket({
      waitingThreads: 2,
      oldestUnanswered: "2026-08-18T00:00:00Z",
      newestInbound: "2026-07-06T00:00:00Z",
    })],
  }, TODAY);
  assert.equal(card.latest, null);
});

test("a card with no dates on it at all does not invent one", () => {
  const [card] = replyCards({ enquiries: [], tickets: [ticket({ waitingThreads: 1 })] }, TODAY);
  assert.equal(card.days, 0);
  assert.equal(card.latest, null);
});

test("the board screen actually prints it", () => {
  // The whole point is that somebody reading the card sees it. A field computed
  // and never rendered fixes nothing.
  assert.match(CLIENT, /latest\?: number \| null/, "the card type has to carry it");
  assert.match(CLIENT, /typeof card\.latest === 'number'/, "and only when there is one");
  assert.match(CLIENT, /newest \{card\.latest\}d/);
});

// ── the board has to be able to see our reply ───────────────────────────────

test("the addresses that count as somebody's include the ones they wrote from", () => {
  assert.match(LOADER, /customer_addresses\?: \{ customer_id: string; email: string \}\[\]/);
  const fn = LOADER.slice(LOADER.indexOf("const addressesFor ="));
  const body = fn.slice(0, fn.indexOf("\n  }"));
  assert.match(body, /writtenFrom\.get\(primary\)/, "their record alone was the bug");
  assert.match(body, /onRecord\.concat/, "and the record still counts, it is added to");
  assert.match(body, /new Set\(/, "the same address on both sides is one address");
});

test("those addresses are read through the merged record, like everything else", () => {
  // Somebody with two customer rows has one card and one clock. An address
  // learned against the duplicate has to reach the primary or it is invisible
  // again, which is the bug in a different costume.
  const block = LOADER.slice(LOADER.indexOf("const writtenFrom ="), LOADER.indexOf("const addressesFor ="));
  assert.match(block, /asPrimary\(a\.customer_id\)/);
});

test("the function only learns addresses people have WRITTEN FROM", () => {
  // Not outbound recipients. A reply on a job goes to the homeowner and their
  // builder, so counting recipients would make the builder's address one of the
  // homeowner's, and answering the builder would clear the homeowner's card
  // while they were still owed an answer. The safe direction is the card
  // staying up.
  const block = SQL.slice(SQL.indexOf("'customer_addresses'"), SQL.indexOf("comment on function"));
  assert.match(block, /m\.direction = 'inbound'/);
  assert.ok(!/unnest\(string_to_array\(m\.to_email/.test(block), "outbound recipients are deliberately excluded");
  assert.match(block, /tk\.customer_id is not null/, "an address with nobody to attach to teaches us nothing");
  assert.match(block, /lower\(btrim\(m\.from_email\)\)/, "matched the same way last_outbound is keyed");
});

test("it looks across closed tickets too", () => {
  // This is not asking what is open, it is asking which addresses belong to
  // whom. A thread that has since been closed still proves the address is
  // theirs. last_by_ticket filters on status; this must not.
  const block = SQL.slice(SQL.indexOf("'customer_addresses'"), SQL.indexOf("comment on function"));
  assert.ok(!/status/.test(block), "filtering on ticket status here would lose addresses");
});

test("the three keys the board already relied on are still there", () => {
  // This replaces the whole function, so the rest of it has to survive the edit.
  for (const key of ["last_by_ticket", "last_outbound", "last_inbound"]) {
    assert.match(SQL, new RegExp(`'${key}'`), `${key} went missing from the function`);
  }
  assert.match(SQL, /grant execute on function public\.pcd_board_message_state\(\)/);
});

test("the rule that made this visible is still the rule", () => {
  // Somebody we have genuinely never replied to still has everything they sent
  // counted as waiting. That is correct, and it is what made a missing address
  // so expensive. Widening the addresses is the fix; removing this would hide
  // real work.
  assert.match(LOADER, /if \(!replied\) return true/);
});
