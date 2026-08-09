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
