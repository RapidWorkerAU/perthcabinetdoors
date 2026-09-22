// A PAYMENT THAT DOES NOT SETTLE THE INSTANT IT IS MADE.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// Found in the Pass 3 audit, 22 September 2026. The whole money path was written
// as though every payment settles the moment the customer presses Pay, which is
// true of a card and not of anything else.
//
// The payment methods switched on for this Stripe account were read during that
// pass: card, apple_pay, link, klarna, zip, pix, bancontact, blik, eps, mb_way
// and satispay. Several of those settle later by their nature.
//
// Two things followed from that assumption, and both cost real money:
//
//   The payment was marked received on checkout.session.completed whatever
//   Stripe said about whether the money had arrived, and the failure event was
//   handled for site measures and the deposit gate and for nothing else. So a
//   payment that bounced afterwards went on reading as paid, the deposit gate
//   let the job into production, and the first anybody knew was the bank
//   reconciliation.
//
//   The normal success sequence for those methods is two events for one
//   payment, completed then async_payment_succeeded. The second was treated as
//   the customer paying twice, so staff were told to refund money that had only
//   been paid once. A Stripe redelivery did the same.
//
// ── WHY THESE ARE TESTED AS FUNCTIONS AND NOT THROUGH THE ROUTE ──────────────
//
// The route needs a database. These two decisions do not, so they live in
// lib/pcd-stripe.js and are checked here against the literal values Stripe
// sends. The route is checked separately, at the bottom, for still asking them.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSameSessionAgain, paymentHasSettled } from "../lib/pcd-stripe.js";

// ── Has the money arrived ────────────────────────────────────────────────────

test("only Stripe's own words for settled count as settled", () => {
  // These three are the whole set Stripe sends on a Checkout Session.
  assert.equal(paymentHasSettled({ payment_status: "paid" }), true);
  assert.equal(paymentHasSettled({ payment_status: "no_payment_required" }), true);
  assert.equal(paymentHasSettled({ payment_status: "unpaid" }), false);
});

test("a session that says nothing about payment is not settled", () => {
  // The old code defaulted a missing status to "paid" when it wrote the row.
  // Absence of bad news is not good news where money is concerned.
  assert.equal(paymentHasSettled({}), false);
  assert.equal(paymentHasSettled(null), false);
  assert.equal(paymentHasSettled({ payment_status: "" }), false);
  assert.equal(paymentHasSettled({ payment_status: "processing" }), false);
});

// ── Is this the same payment arriving again ──────────────────────────────────

test("the same session arriving twice is not a second payment", () => {
  const payment = { is_paid: true, stripe_checkout_session_id: "cs_test_123" };
  assert.equal(isSameSessionAgain(payment, { id: "cs_test_123" }), true);
});

test("a different session on an already paid payment IS a second payment", () => {
  // This is the genuine duplicate: settled by hand because the link did not
  // work, and then the link was paid as well. It must still be shouted about.
  const payment = { is_paid: true, stripe_checkout_session_id: "cs_test_123" };
  assert.equal(isSameSessionAgain(payment, { id: "cs_test_999" }), false);
});

test("a payment settled by hand with no session recorded is not mistaken for a redelivery", () => {
  // Marked paid over the phone, so no session id. A Stripe payment arriving
  // afterwards is a real duplicate and must not be swallowed by this check.
  const payment = { is_paid: true, stripe_checkout_session_id: null };
  assert.equal(isSameSessionAgain(payment, { id: "cs_test_123" }), false);
});

test("a payment that is not paid yet is never a redelivery", () => {
  const payment = { is_paid: false, stripe_checkout_session_id: "cs_test_123" };
  assert.equal(isSameSessionAgain(payment, { id: "cs_test_123" }), false);
});

// ── The sequence, end to end ─────────────────────────────────────────────────

test("the two events of one asynchronous payment settle it exactly once", () => {
  // completed arrives first with the money still moving, then
  // async_payment_succeeded arrives with it landed. Walking the decisions in
  // order is what proves the pair behaves as one payment.
  let row = { is_paid: false, stripe_checkout_session_id: null };
  const session = { id: "cs_test_abc" };

  // 1. completed, payment_status unpaid.
  assert.equal(isSameSessionAgain(row, session), false, "nothing to redeliver yet");
  assert.equal(paymentHasSettled({ ...session, payment_status: "unpaid" }), false, "must not be marked paid");
  row = { ...row, stripe_checkout_session_id: session.id };

  // 2. async_payment_succeeded, payment_status paid.
  assert.equal(isSameSessionAgain(row, session), false, "still unpaid, so this is the real settlement");
  assert.equal(paymentHasSettled({ ...session, payment_status: "paid" }), true);
  row = { ...row, is_paid: true };

  // 3. Stripe redelivers the same event.
  assert.equal(isSameSessionAgain(row, session), true, "a redelivery must be ignored, not reported as a refund");
});

// ── The route has to actually ask ────────────────────────────────────────────

test("the webhook asks both questions and handles a failed ordinary payment", () => {
  const source = readFileSync(new URL("../app/api/stripe/webhook/route.js", import.meta.url), "utf8");

  assert.match(source, /isSameSessionAgain\(existingPayment, session\)/, "a redelivery must be recognised");
  assert.match(source, /paymentHasSettled\(session\)/, "the money must be confirmed before the row says paid");

  // The failure event used to be handled for site measures and the deposit gate
  // and for nothing else, which is how an ordinary payment could bounce in
  // silence. This is the branch that was missing.
  assert.match(
    source,
    /async_payment_failed" && !isDepositGate && !isSiteMeasure/,
    "an ordinary order payment that fails must be handled too"
  );
});
