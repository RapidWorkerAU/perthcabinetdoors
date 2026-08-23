// ARCHIVING A QUOTE OR AN ORDER.
//
// Archived means the record is still there and can still be opened, but has
// stopped counting: no board card, no line in the financials, out of the lists.
// Restoring has to put it back exactly, which is the part that is easy to get
// wrong: overwrite the status and the thing it used to be is gone.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ARCHIVED,
  archivePatch,
  isArchived,
  restorePatch,
  ORDER_RESTORE_FALLBACK,
  QUOTE_RESTORE_FALLBACK,
} from "../lib/pcd-archive.js";
import { assertSendable, editability, lockError } from "../lib/pcd-document-lock.js";
import { outstandingPayments, receivedPayments } from "../lib/pcd-financials.js";
import { ORDER_FILTER_STATUSES, ORDER_STATUSES } from "../lib/pcd-quote-utils.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("archiving remembers what it was, so restoring is exact", () => {
  const quote = { id: "q1", status: "rejected" };
  const patch = archivePatch(quote, "2026-08-24T01:00:00Z");
  assert.equal(patch.status, ARCHIVED);
  assert.equal(patch.archived_from_status, "rejected");
  assert.equal(patch.archived_at, "2026-08-24T01:00:00Z");

  const back = restorePatch({ ...quote, ...patch }, QUOTE_RESTORE_FALLBACK);
  assert.equal(back.status, "rejected", "a rejected quote comes back rejected, not as a draft");
  assert.equal(back.archived_at, null);
  assert.equal(back.archived_from_status, null);
});

test("archiving twice does not lose the original status", () => {
  const once = archivePatch({ status: "approved" });
  const twice = archivePatch({ status: ARCHIVED, archived_from_status: once.archived_from_status });
  assert.equal(twice.archived_from_status, "approved");
});

test("a row archived by hand with nothing recorded restores to the caller's default", () => {
  // Somebody editing the table directly in Supabase. There is nothing to put it
  // back to, and this module has no business guessing.
  assert.equal(restorePatch({ status: ARCHIVED }, ORDER_RESTORE_FALLBACK).status, "active");
  assert.equal(restorePatch({ status: ARCHIVED }, QUOTE_RESTORE_FALLBACK).status, "draft");
});

test("isArchived reads either table's row", () => {
  assert.equal(isArchived({ status: ARCHIVED }), true);
  assert.equal(isArchived({ status: "complete" }), false);
  assert.equal(isArchived(null), false);
});

// ── it cannot be worked on while it is put away ────────────────────────────

test("an archived quote cannot be edited or sent, and the refusal says what to do", () => {
  assert.equal(editability("quote", ARCHIVED), "archived");

  const edit = lockError("quote", ARCHIVED);
  assert.match(edit.message, /archived/i);
  assert.match(edit.message, /Restore it/i, "the way out is named");
  assert.equal(edit.canOverride, false, "the sent-quote override is not the answer here");

  assert.throws(() => assertSendable("quote", ARCHIVED), /Restore it before sending it/);
});

test("everything else about the lock is unchanged", () => {
  assert.equal(editability("quote", "draft"), "open");
  assert.equal(editability("quote", "sent"), "sealed");
  assert.equal(editability("quote", "approved"), "permanent");
  assert.doesNotThrow(() => assertSendable("quote", "draft"));
  assert.doesNotThrow(() => assertSendable("quote", "sent"));
});

// ── it stops counting ──────────────────────────────────────────────────────

test("money on an archived order is neither owed nor received", () => {
  const payments = [
    { id: "a", is_paid: false, amount: 500, order_status: "active", requested_at: "2026-08-01" },
    { id: "b", is_paid: false, amount: 900, order_status: ARCHIVED, requested_at: "2026-08-01" },
    { id: "c", is_paid: false, amount: 100, order_status: "cancelled", requested_at: "2026-08-01" },
  ];
  const owed = outstandingPayments(payments, "2026-08-24").map((p) => p.id);
  assert.deepEqual(owed, ["a"], "archived and cancelled both drop out");

  const received = [
    { id: "d", is_paid: true, amount: 500, order_status: "complete", paid_at: "2026-08-02" },
    { id: "e", is_paid: true, amount: 900, order_status: ARCHIVED, paid_at: "2026-08-02" },
  ];
  const inTotal = receivedPayments(received, {}).map((p) => p.id);
  assert.deepEqual(inTotal, ["d"]);
});

test("the financials and the dashboard both leave archived orders out", () => {
  const financials = read("app/admin/financials/page.tsx");
  assert.ok(financials.includes(".neq('status', 'archived')"), "the orders query drops them");

  const dashboard = read("app/admin/dashboard/page.tsx");
  assert.ok(
    dashboard.includes("['cancelled', 'archived'].includes"),
    "and so does the unpaid payments list"
  );
});

// ── it is a filter, never something you pick by accident ───────────────────

test("archived can be filtered by but not set from the status dropdown", () => {
  assert.ok(!ORDER_STATUSES.includes(ARCHIVED), "not in the settable list");
  assert.ok(ORDER_FILTER_STATUSES.includes(ARCHIVED), "but a tab you can go to");

  // Choosing it from a dropdown could not record what it was archived FROM,
  // which is the half that makes restore exact.
  const route = read("app/api/admin/orders/[id]/route.js");
  assert.ok(route.includes("ORDER_STATUSES.includes(payload.status)"), "the status route still refuses it");
});

test("neither list lands you in the archive", () => {
  const quotes = read("app/admin/quotes/QuotesTable.tsx");
  assert.ok(quotes.includes("!== 'archived'"), "All means all the live ones");
  const orders = read("app/admin/orders/OrdersManager.tsx");
  assert.ok(orders.includes("['cancelled', 'archived'].includes"), "same for orders");
});

test("a quote that became an order cannot be archived", () => {
  // The order and the financials behind it still read from that quote.
  const route = read("app/api/admin/quotes/[id]/archive/route.js");
  assert.ok(route.includes("quote.order_id"), "the route checks");
  assert.match(route, /Archive the order instead/);
});

test("archiving an order with money on it has to be said out loud", () => {
  const route = read("app/api/admin/orders/[id]/archive/route.js");
  assert.ok(route.includes("needsAcknowledgement"), "it refuses once and asks");
  assert.ok(route.includes("acknowledge_outstanding"), "and takes the answer");
});
