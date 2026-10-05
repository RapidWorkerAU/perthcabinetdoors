import assert from "node:assert/strict";
import { test } from "node:test";

import { canRefreshPaymentRequest, canRequestPayment, hasPaymentRequest } from "../lib/pcd-payment-requests.js";

test("not_requested status is not treated as a sent payment request", () => {
  const payment = { request_status: "not_requested", is_paid: false, amount: 100 };

  assert.equal(hasPaymentRequest(payment), false);
  assert.equal(canRequestPayment(payment), true);
  assert.equal(canRefreshPaymentRequest(payment), false);
});

test("stored checkout details are treated as an existing request", () => {
  const payment = { request_status: "requested", request_url: "https://checkout.stripe.com/c/pay", is_paid: false, amount: 100 };

  assert.equal(hasPaymentRequest(payment), true);
  assert.equal(canRequestPayment(payment), false);
  assert.equal(canRefreshPaymentRequest(payment), true);
});

test("paid payments cannot be requested or refreshed", () => {
  const payment = { request_status: "paid", is_paid: true, amount: 100 };

  assert.equal(canRequestPayment(payment), false);
  assert.equal(canRefreshPaymentRequest(payment), false);
});

// CANCELLING A LINK. A progress link that was never paid has to be killable,
// or its amount stays locked against the order total and the final link that
// carries it is refused.
import { readFileSync } from "node:fs";
import {
  canCancelPaymentRequest,
  cancelPaymentRequestPatch,
  defaultCancelLinkMessage,
  sessionAlreadyPaid,
} from "../lib/pcd-payment-requests.js";

test("an unpaid line with a link out can be cancelled, and nothing else can", () => {
  assert.equal(canCancelPaymentRequest({ request_status: "requested", request_url: "https://x", is_paid: false, amount: 100 }), true);
  assert.equal(canCancelPaymentRequest({ request_status: "not_requested", is_paid: false, amount: 100 }), false);
  assert.equal(canCancelPaymentRequest({ request_status: "paid", is_paid: true, amount: 100 }), false);
});

test("a cancelled line goes back to unsent, so it can be edited, deleted or requested again", () => {
  const payment = { request_status: "requested", request_url: "https://x", stripe_checkout_session_id: "cs_1", is_paid: false, amount: 100 };
  const after = { ...payment, ...cancelPaymentRequestPatch() };
  assert.equal(hasPaymentRequest(after), false);
  assert.equal(canRequestPayment(after), true);
  assert.equal(canCancelPaymentRequest(after), false);
});

test("a link the customer paid, or started paying, is never cancelled", () => {
  assert.equal(sessionAlreadyPaid({ status: "complete", payment_status: "paid" }), true);
  assert.equal(sessionAlreadyPaid({ status: "complete", payment_status: "unpaid" }), true);
  assert.equal(sessionAlreadyPaid({ status: "expired", payment_status: "unpaid" }), false);
  assert.equal(sessionAlreadyPaid({ status: "open", payment_status: "unpaid" }), false);
});

test("the cancellation email names the amount and the order", () => {
  const text = defaultCancelLinkMessage({ customer_name: "Sam", order_number: "PCD-1001" }, { amount: 1500 });
  assert.match(text, /Hi Sam,/);
  assert.match(text, /\$1,500\.00/);
  assert.match(text, /PCD-1001/);
  assert.doesNotMatch(text, /[–—]/);
});

test("the route kills the Stripe link before it unlocks the line", () => {
  const source = readFileSync(new URL("../app/api/admin/orders/[id]/payments/[paymentId]/cancel-request/route.js", import.meta.url), "utf8");
  const expire = source.indexOf("expireCheckoutSession(sessionId)");
  const paidCheck = source.indexOf("sessionAlreadyPaid(session)");
  const unlock = source.indexOf(".update(cancelPaymentRequestPatch())");
  assert.ok(expire > 0 && paidCheck > expire && unlock > paidCheck);
  assert.match(source, /\.eq\("is_paid", false\)/);
});
