// GIVING MONEY BACK.
//
// ── THE SHAPE ────────────────────────────────────────────────────────────────
//
// A refund is a payment line with a negative amount. That is the whole design,
// and it is not a shortcut: every sum in the system already adds payment
// amounts up, so a refund held as a positive number with a flag beside it would
// need all of them to learn about the flag, and the one that was missed would
// be quietly wrong about money.
//
// ── WHAT MUST NEVER HAPPEN ───────────────────────────────────────────────────
//
//   SENT TWICE. A card refund cannot be taken back. A retry after a timeout
//   that actually succeeded must not put the money back on the card again.
//
//   MORE BACK THAN CAME IN. Two refunds raised against the same payment must
//   not add up to more than that payment, whether or not either was processed.
//
//   SENT WITHOUT BEING RECORDED. A refund that moved money and left no row is
//   one that gets sent again.
//
//   TOLD BEFORE IT IS TRUE. The email says money is on its way, so it goes
//   after the money does, never before.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  REFUND_METHODS,
  canProcessRefund,
  canRefundPayment,
  canRefundToCard,
  defaultRefundMessage,
  defaultRefundSubject,
  isRefund,
  refundAmount,
  refundProblem,
  refundRowFromInput,
  refundableAmount,
  refundablePayments,
} from "../lib/pcd-refunds.js";
import { receivedPayments } from "../lib/pcd-financials.js";

const MIGRATION = readFileSync(new URL("../supabase/202608242000_pcd_order_refunds.sql", import.meta.url), "utf8");
const PROCESS = readFileSync(
  new URL("../app/api/admin/orders/[id]/payments/[paymentId]/process-refund/route.js", import.meta.url),
  "utf8"
);
const STRIPE = readFileSync(new URL("../lib/pcd-stripe.js", import.meta.url), "utf8");
const ORDER_PAGE = readFileSync(new URL("../app/admin/orders/[id]/OrderDetail.js", import.meta.url), "utf8");

const card = { id: "p1", payment_type: "deposit", amount: 1000, is_paid: true, paid_at: "2026-08-01", stripe_payment_intent_id: "pi_1" };
const cash = { id: "p2", payment_type: "progress", amount: 500, is_paid: true, paid_at: "2026-08-02" };
const unpaid = { id: "p3", payment_type: "final", amount: 300, is_paid: false };

// ── The sign ────────────────────────────────────────────────────────────────

test("a refund is written negative, so every existing sum nets it off untouched", () => {
  const row = refundRowFromInput({ amount: 150, refund_method: "stripe", refund_reason: "x" }, "o1");
  assert.equal(row.amount, -150, "negative in the database");
  assert.equal(row.payment_type, "refund");
  assert.equal(row.is_paid, false, "raising it moves no money");

  // Typed as a negative by somebody being helpful, it still lands negative
  // rather than flipping back to a payment.
  assert.equal(refundRowFromInput({ amount: -150, refund_method: "cash", refund_reason: "x" }, "o1").amount, -150);
});

test("the financials net a refund off without knowing what a refund is", () => {
  const rows = [card, cash, { id: "r1", payment_type: "refund", amount: -150, is_paid: true, paid_at: "2026-08-10" }];
  const received = receivedPayments(rows, { from: "2026-01-01", to: "2026-12-31" });
  assert.equal(received.reduce((total, row) => total + row.amount, 0), 1350, "1500 in, 150 back");
});

test("the database will not let the sign and the type disagree", () => {
  // A refund stored positive would be counted as money received by every sum in
  // the system, which is the exact opposite of what happened.
  assert.match(MIGRATION, /payment_type = 'refund' and amount <= 0/);
  assert.match(MIGRATION, /payment_type <> 'refund' and amount >= 0/);
  assert.match(MIGRATION, /payment_type in \('deposit', 'progress', 'final', 'other', 'refund'\)/);
});

// ── What can be refunded ────────────────────────────────────────────────────

test("only money that actually arrived can be given back", () => {
  assert.equal(canRefundPayment(card), true);
  assert.equal(canRefundPayment(unpaid), false, "refunding money that never came is deleting a line, not refunding");
  assert.equal(canRefundPayment({ ...card, payment_type: "refund", amount: -50 }), false, "a refund is not refundable");
});

test("only a payment taken through the link can go back to a card", () => {
  assert.equal(canRefundToCard(card), true);
  assert.equal(canRefundToCard(cash), false, "settled by hand, so Stripe has nothing to refund");
  assert.match(
    refundProblem({ amount: 100, refund_method: "stripe", refund_reason: "x" }, { payment: cash, allPayments: [cash] }),
    /did not come through the payment link/
  );
});

test("a refund already raised counts against the payment, processed or not", () => {
  // A refund waiting to be processed is money already promised. Letting a
  // second one be raised for the same amount is how a customer gets paid twice.
  const pending = { id: "r1", payment_type: "refund", amount: -150, is_paid: false, refund_of_payment_id: "p1" };
  const done = { id: "r2", payment_type: "refund", amount: -200, is_paid: true, refund_of_payment_id: "p1" };
  assert.equal(refundableAmount(card, [card, pending, done]), 650, "1000 less 150 promised and 200 sent");
  assert.equal(refundableAmount(cash, [card, cash, pending, done]), 500, "nothing has come off this one");
});

test("more cannot be sent back than came in", () => {
  const already = { id: "r1", payment_type: "refund", amount: -900, is_paid: true, refund_of_payment_id: "p1" };
  const problem = refundProblem(
    { amount: 200, refund_method: "stripe", refund_reason: "x" },
    { payment: card, allPayments: [card, already] }
  );
  assert.match(problem, /more than is left/);

  const full = { id: "r2", payment_type: "refund", amount: -1000, is_paid: true, refund_of_payment_id: "p1" };
  assert.match(
    refundProblem({ amount: 1, refund_method: "stripe", refund_reason: "x" }, { payment: card, allPayments: [card, full] }),
    /already been refunded in full/
  );
});

test("a payment with nothing left is not offered at all", () => {
  const full = { id: "r1", payment_type: "refund", amount: -1000, is_paid: true, refund_of_payment_id: "p1" };
  const offered = refundablePayments([card, cash, unpaid, full]).map((payment) => payment.id);
  assert.deepEqual(offered, ["p2"], "the emptied one and the unpaid one are both left out");
});

// ── What the form will not let through ──────────────────────────────────────

test("a refund has to say how much, how, and why", () => {
  const base = { amount: 100, refund_method: "stripe", refund_reason: "Priced wrong" };
  assert.equal(refundProblem(base, { payment: card, allPayments: [card] }), "", "a complete one passes");

  assert.match(refundProblem({ ...base, amount: 0 }, { payment: card }), /how much/);
  assert.match(refundProblem({ ...base, refund_method: "" }, { payment: card }), /how the money is going back/);
  assert.match(refundProblem({ ...base, refund_reason: " " }, { payment: card, allPayments: [card] }), /Say why/);
});

test("a refund sent by hand has to say where it can be found again", () => {
  const byHand = { amount: 100, refund_method: "bank_transfer", refund_reason: "x" };
  assert.match(refundProblem(byHand, { payment: card, allPayments: [card] }), /reference/);
  assert.equal(
    refundProblem({ ...byHand, settlement_reference: "REF-1" }, { payment: card, allPayments: [card] }),
    ""
  );
  // Cash has no reference to give, so it is not asked for.
  assert.equal(
    refundProblem({ amount: 100, refund_method: "cash", refund_reason: "x" }, { payment: card, allPayments: [card] }),
    ""
  );
});

test("only one method actually moves money from here", () => {
  const sends = REFUND_METHODS.filter((method) => method.sendsMoney).map((method) => method.value);
  assert.deepEqual(sends, ["stripe"], "the rest are a record of something a person did");
});

// ── Processing ──────────────────────────────────────────────────────────────

test("a refund can only be processed once", () => {
  const raised = { payment_type: "refund", amount: -150, is_paid: false };
  assert.equal(canProcessRefund(raised), true);
  assert.equal(canProcessRefund({ ...raised, is_paid: true }), false, "already sent");
  assert.equal(canProcessRefund({ payment_type: "deposit", amount: 150, is_paid: false }), false, "not a refund");
  assert.equal(isRefund(raised), true);
  assert.equal(refundAmount(raised), 150, "said as a person would say it");
});

test("Stripe is told not to send the same refund twice", () => {
  // A card refund cannot be taken back, so a retry after a timeout that
  // actually succeeded must return the first refund rather than make another.
  assert.match(STRIPE, /Idempotency-Key/, "the request carries a key");
  assert.match(PROCESS, /idempotencyKey: refund\.id/, "and the key is the refund line's own id");
  assert.match(MIGRATION, /unique index[\s\S]*?stripe_refund_id/, "and the database refuses a second one anyway");
});

test("a partial refund is the default and a full one has to be asked for", () => {
  // Nearly every refund is a correction to part of a job.
  assert.match(STRIPE, /if \(amount !== null && amount !== undefined\) params\.set\("amount"/);
});

test("the money moves, then it is recorded, then the customer is told", () => {
  // The order is the whole safety of this. Recording before sending would claim
  // a refund that Stripe might refuse; telling before recording would promise
  // money that nothing knows about.
  const money = PROCESS.indexOf("── 1. The money");
  const record = PROCESS.indexOf("── 2. The record");
  const customer = PROCESS.indexOf("── 3. The customer");
  assert.ok(money > 0 && record > money && customer > record, "the three steps are in that order");
});

test("an email that fails does not undo a refund that succeeded", () => {
  // The money really has gone back. Failing the request now would leave the
  // screen saying the refund did not happen when it did.
  const tail = PROCESS.slice(PROCESS.indexOf("── 3. The customer"));
  assert.match(tail, /catch \(sendError\)/, "the send is caught on its own");
  assert.match(tail, /emailError = /, "and reported rather than thrown");
  // A real throw statement, not the word inside "rethrown" in the comment
  // that explains why there is not one.
  assert.ok(
    !/throws/.test(tail.slice(0, tail.indexOf("return Response.json"))),
    "nothing after the money moves rethrows"
  );
});

// ── The words the customer reads ────────────────────────────────────────────

test("the email says the amount, the order, and why", () => {
  const message = defaultRefundMessage({
    order: { customer_name: "Kate Hollis", order_number: "PCD-O-2026-A3F91C" },
    amount: 150,
    reason: "Two doors were priced at the wrong size.",
  });
  assert.match(message, /Hi Kate Hollis/);
  assert.match(message, /\$150\.00 is being processed for PCD-O-2026-A3F91C/);
  assert.match(message, /Two doors were priced at the wrong size\./);
  assert.match(defaultRefundSubject({ order_number: "PCD-O-2026-A3F91C" }), /PCD-O-2026-A3F91C/);
});

test("a refund with no reason still reads as a sentence", () => {
  const message = defaultRefundMessage({ order: {}, amount: 40, reason: "" });
  assert.match(message, /Hi there/);
  assert.ok(!message.includes("\n\n\n"), "no hole where the reason would have been");
});

// ── The screen ──────────────────────────────────────────────────────────────

test("a refund is processed, never requested, and never marked received", () => {
  // Requesting asks a customer for money and marking received records money
  // coming in. Neither is a thing you do to a refund.
  assert.match(ORDER_PAGE, /!isRefund\(payment\) && canRequestPaymentLine\(payment\)/);
  assert.equal(
    (ORDER_PAGE.match(/!isRefund\(payment\) && canSettleOutsideLink\(payment\)/g) || []).length,
    2,
    "on the table and on the phone card"
  );
  assert.equal(
    (ORDER_PAGE.match(/canProcessRefund\(payment\) && \(/g) || []).length,
    2,
    "and Process is offered on both"
  );
});

test("processing opens the email before anything is sent", () => {
  assert.match(ORDER_PAGE, /onClick=\{\(\) => openRefundEmail\(payment\)\}/, "the button opens the email");
  assert.match(ORDER_PAGE, /processRefund\(refund, \{ message, subject \}\)/, "and only the modal sends it");
});

// ── A key is not a label ────────────────────────────────────────────────────
//
// payment_type stores "deposit" and "progress"; status stores "pending_deposit".
// They are keys. Printed straight at somebody they arrive in lower case with
// underscores in them, which reads as a typo rather than as a status.

test("the refund modal names payments the way a person would", () => {
  const modal = readFileSync(new URL("../app/admin/_components/RefundModal.js", import.meta.url), "utf8");
  assert.match(modal, /paymentTypeLabel\(payment\.payment_type\)/, "the label, not the column");
  assert.ok(
    !/\$\{payment\.payment_type\}/.test(modal),
    "the raw key is never interpolated into what somebody reads"
  );
});

test("no modal prints a raw payment type or status at a person", () => {
  const files = [
    "app/admin/_components/RefundModal.js",
    "app/admin/_components/SettlePaymentModal.js",
    "app/admin/_components/PushDetailsModal.js",
  ];
  for (const path of files) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.ok(!/\$\{payment\.payment_type\b/.test(source), `${path} prints a payment type key`);
    assert.ok(!/\.status\.replace\(/.test(source), `${path} hand rolls a status label instead of using the shared one`);
  }
});
