// AN EMAIL THE APP SENT HAS TO REACH THE CONVERSATION.
//
// The board decides whose turn it is from pcd_messages alone. A quote, a
// variation and a payment request all go out through Resend, which never
// touches the mailbox the desk syncs, so none of them left a trace and the card
// sat there saying the customer was waiting on an answer they had been sent.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { recordOutboundEmail } from "../lib/pcd-desk-outbound.js";
import { lastRealDirection, needsReply } from "../lib/pcd-ticket-closure.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// A stand-in for the supabase client, recording what it was asked to do.
function fakeDb({ tickets = [], failOn = null } = {}) {
  const calls = { inserts: [], updates: [], created: [] };
  const api = {
    calls,
    from(table) {
      const state = { table, filters: {} };
      const chain = {
        select: () => chain,
        eq: (col, value) => { state.filters[col] = value; return chain; },
        neq: (col, value) => { state.filters[`not:${col}`] = value; return chain; },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (state.table !== "pcd_tickets") return { data: null };
          const open = tickets.filter((t) => t.status !== "closed");
          return { data: open[0] || null };
        },
        single: async () => {
          if (failOn === state.table) return { data: null, error: new Error("nope") };
          const row = { id: `${state.table}-new`, ...state.payload };
          if (state.table === "pcd_tickets") calls.created.push(row);
          return { data: row, error: null };
        },
        insert(payload) {
          state.payload = payload;
          calls.inserts.push({ table: state.table, payload });
          return chain;
        },
        update(payload) {
          calls.updates.push({ table: state.table, payload });
          return chain;
        },
      };
      return chain;
    },
  };
  return api;
}

const email = {
  customerId: "cust-1",
  toEmail: "someone@example.com",
  subject: "Q-1042 - Perth Cabinet Doors quote",
  bodyHtml: "<p>Your quote is ready.</p>",
  bodyText: "Your quote is ready.",
};

test("a sent quote is filed as an outbound message on the open conversation", async () => {
  const db = fakeDb({ tickets: [{ id: "t-1", status: "open" }] });
  const result = await recordOutboundEmail(db, email);

  assert.equal(result.ok, true);
  assert.equal(result.ticketId, "t-1");
  const message = db.calls.inserts.find((i) => i.table === "pcd_messages");
  assert.ok(message, "a message row was written");
  assert.equal(message.payload.direction, "outbound", "outbound, or the board still counts the customer as last");
  assert.equal(message.payload.ticket_id, "t-1");
  assert.equal(message.payload.to_email, email.toEmail);
  assert.equal(message.payload.body_html, email.bodyHtml, "the email we actually sent, not a one line note");
});

test("sending hands the ball back to the customer", async () => {
  const db = fakeDb({ tickets: [{ id: "t-1", status: "open" }] });
  await recordOutboundEmail(db, email);
  const update = db.calls.updates.find((u) => u.table === "pcd_tickets");
  assert.equal(update.payload.status, "waiting");
  assert.ok(update.payload.last_message_at, "and the thread moves to the top of the desk");
});

test("a closed conversation stays closed, and a new one is started", async () => {
  // Closing draws a line in time. Dragging a settled thread open because we
  // sent an unrelated quote would undo somebody's decision.
  const db = fakeDb({ tickets: [{ id: "t-old", status: "closed" }] });
  const result = await recordOutboundEmail(db, email);
  assert.equal(result.ok, true);
  assert.equal(db.calls.created.length, 1, "a new conversation");
  assert.notEqual(result.ticketId, "t-old");
});

test("nothing to file it against is a no-op, not a failure", async () => {
  const db = fakeDb();
  assert.equal((await recordOutboundEmail(db, { ...email, customerId: null })).ok, false);
  assert.equal((await recordOutboundEmail(db, { ...email, toEmail: "" })).ok, false);
  assert.equal(db.calls.inserts.length, 0, "and writes nothing");
});

test("a write that fails never fails the send", async () => {
  // The email has already gone by the time this runs.
  const db = fakeDb({ tickets: [], failOn: "pcd_tickets" });
  const result = await recordOutboundEmail(db, email);
  assert.equal(result.ok, false);
  assert.ok(result.reason, "it says what went wrong rather than throwing");
});

test("an outbound message is what clears the card", () => {
  // The rule the board reads, so the fix above is aimed at the right thing.
  const ticket = { status: "open" };
  const inbound = [{ direction: "inbound", created_at: "2026-08-24T01:00:00Z" }];
  assert.equal(needsReply(ticket, inbound), true);

  const answered = [...inbound, { direction: "outbound", created_at: "2026-08-24T02:00:00Z" }];
  assert.equal(lastRealDirection(answered), "outbound");
  assert.equal(needsReply(ticket, answered), false);

  // A note is us writing to ourselves and must not clear anything.
  const noted = [...inbound, { direction: "note", created_at: "2026-08-24T02:00:00Z" }];
  assert.equal(needsReply(ticket, noted), true);
});

test("every route that emails a customer files it", () => {
  const routes = [
    "app/api/admin/quotes/[id]/send/route.js",
    "app/api/admin/orders/[id]/variations/[variationId]/send/route.js",
    "app/api/admin/orders/[id]/payments/[paymentId]/request/route.js",
  ];
  for (const route of routes) {
    const src = read(route);
    assert.ok(src.includes("recordOutboundEmail("), `${route} files the email it sent`);
    // Through sendEmail, which reads the answer. Resend returns a refusal
    // rather than throwing one, and calling it directly is how every send in
    // this app used to report "sent" whatever actually happened. See
    // lib/pcd-send-email.js.
    assert.ok(
      src.includes("sendEmail(resend, {") || src.includes("resend.emails.send"),
      `${route} still sends it`
    );
  }
});
