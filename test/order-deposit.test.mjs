// The deposit rules, which used to live in two places and disagree.

import test from "node:test";
import assert from "node:assert/strict";

import { depositUpdates, PENDING_DEPOSIT } from "../lib/pcd-order-deposit.js";
import { ORDER_STATUSES } from "../lib/pcd-quote-utils.js";

test("pending_deposit is a real order status", () => {
  assert.ok(ORDER_STATUSES.includes(PENDING_DEPOSIT), "the status list must carry it");
});

test("an order with no deposit rows needs no deposit", () => {
  const out = depositUpdates([], "active");
  assert.equal(out.deposit_required, false);
  assert.equal(out.deposit_amount, 0);
  assert.equal(out.deposit_paid, false);
  assert.equal(out.deposit_paid_at, null);
  assert.equal("accepted_at" in out, false);
  assert.equal("status" in out, false);
});

test("an unpaid deposit leaves the order where it is", () => {
  const out = depositUpdates([{ amount: 2655, is_paid: false }], PENDING_DEPOSIT);
  assert.equal(out.deposit_required, true);
  assert.equal(out.deposit_amount, 2655);
  assert.equal(out.deposit_paid, false);
  assert.equal("accepted_at" in out, false);
  assert.equal("status" in out, false);
});

// The whole point of the change: paying the deposit confirms the job and puts
// it on the bench, whichever way the money arrived.
test("paying the deposit promotes a pending order to active and stamps it", () => {
  const out = depositUpdates([{ amount: 2655, is_paid: true, paid_at: "2026-08-19" }], PENDING_DEPOSIT);
  assert.equal(out.deposit_paid, true);
  assert.equal(out.deposit_paid_at, "2026-08-19");
  assert.equal(out.status, "active");
  assert.ok(out.accepted_at, "accepted_at must be stamped");
});

// This is the bug that was live: the admin tick did not stamp accepted_at, so a
// bank transfer left a paid job permanently unconfirmed.
test("a deposit ticked by hand on an already active order still stamps accepted_at", () => {
  const out = depositUpdates([{ amount: 1000, is_paid: true, paid_at: "2026-08-19" }], "active");
  assert.ok(out.accepted_at, "accepted_at must be stamped however the money arrived");
  assert.equal("status" in out, false, "an active order does not need promoting");
});

// Paying a deposit must never reopen an order somebody closed.
test("a cancelled order is never promoted by a deposit payment", () => {
  const out = depositUpdates([{ amount: 500, is_paid: true, paid_at: "2026-08-19" }], "cancelled");
  assert.equal("status" in out, false);
});

test("a completed order is not dragged back to active either", () => {
  const out = depositUpdates([{ amount: 500, is_paid: true, paid_at: "2026-08-19" }], "complete");
  assert.equal("status" in out, false);
});

// An order split into two deposit lines is not confirmed halfway through.
test("every deposit line must be paid, not just one", () => {
  const half = depositUpdates(
    [{ amount: 500, is_paid: true, paid_at: "2026-08-19" }, { amount: 500, is_paid: false }],
    PENDING_DEPOSIT
  );
  assert.equal(half.deposit_paid, false);
  assert.equal(half.deposit_amount, 1000);
  assert.equal("status" in half, false);

  const both = depositUpdates(
    [{ amount: 500, is_paid: true, paid_at: "2026-08-19" }, { amount: 500, is_paid: true, paid_at: "2026-08-20" }],
    PENDING_DEPOSIT
  );
  assert.equal(both.deposit_paid, true);
  assert.equal(both.status, "active");
});

test("a deposit paid with no date recorded still counts, dated today", () => {
  const out = depositUpdates([{ amount: 400, is_paid: true }], PENDING_DEPOSIT);
  assert.equal(out.deposit_paid, true);
  assert.match(out.deposit_paid_at, /^\d{4}-\d{2}-\d{2}$/);
});

test("a non-numeric amount counts as nothing rather than NaN", () => {
  assert.equal(depositUpdates([{ amount: null, is_paid: false }], "active").deposit_amount, 0);
  assert.equal(depositUpdates([{ amount: "250.50", is_paid: false }], "active").deposit_amount, 250.5);
});

// Unticking a payment must undo the deposit flags rather than leaving a stale
// paid date behind.
test("unticking the only deposit clears the paid flags", () => {
  const out = depositUpdates([{ amount: 900, is_paid: false }], "active");
  assert.equal(out.deposit_paid, false);
  assert.equal(out.deposit_paid_at, null);
});
