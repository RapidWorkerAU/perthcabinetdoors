// TELLING THE CUSTOMER SOMETHING LANDED.
//
// Send an enquiry and you are thanked within seconds. Pay us a deposit and,
// until now, you heard nothing: sales@ got an email and the person who had just
// paid got silence. Approve a quote with nothing to pay, or approve a
// variation, and nothing was sent at all.
//
// These are short acknowledgements on purpose. Not receipts with a breakdown,
// and never a balance: a figure in an email is a figure we then have to keep
// true, and the next variation makes yesterday's balance wrong.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  customerPaymentReceivedHtml,
  customerQuoteApprovedHtml,
  customerVariationApprovedHtml,
} from "../lib/pcd-email-templates.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ── the wording ────────────────────────────────────────────────────────────

test("a payment confirmation says what arrived and against what", () => {
  const html = customerPaymentReceivedHtml({
    customerName: "Juliet",
    money: "$719.95",
    orderNumber: "PCD-O-2026-E7651A",
  });
  assert.match(html, /Hi Juliet/);
  assert.match(html, /received your payment of \$719\.95/);
  assert.match(html, /PCD-O-2026-E7651A/, "the number they will quote back at us");
  assert.match(html, /just reply to this email/);
});

test("a payment confirmation never states a balance", () => {
  // The next variation would make it wrong, and an email cannot be corrected.
  const html = customerPaymentReceivedHtml({ customerName: "Sam", money: "$500.00", orderNumber: "PCD-O-1" });
  assert.doesNotMatch(html, /outstanding|balance|remaining|still owing/i);
});

test("an approval confirmation carries the quote and the order number", () => {
  const html = customerQuoteApprovedHtml({
    customerName: "Sam",
    quoteNumber: "PCD-Q-88",
    orderNumber: "PCD-O-12",
  });
  assert.match(html, /Thanks for approving quote PCD-Q-88/);
  assert.match(html, /order number is PCD-O-12/);
});

test("a variation confirmation says it is now part of the order", () => {
  const html = customerVariationApprovedHtml({
    customerName: "Sam",
    variationNumber: "PCD-V-3",
    orderNumber: "PCD-O-12",
  });
  assert.match(html, /approving variation PCD-V-3/);
  assert.match(html, /now part of order PCD-O-12/);
});

test("a missing name is not a blank greeting", () => {
  assert.match(customerPaymentReceivedHtml({ money: "$1.00" }), /Hi there,/);
  assert.match(customerQuoteApprovedHtml({}), /Hi there,/);
  assert.match(customerVariationApprovedHtml({}), /Hi there,/);
});

test("all three use the same shell as every other email we send", () => {
  [
    customerPaymentReceivedHtml({ money: "$1.00" }),
    customerQuoteApprovedHtml({}),
    customerVariationApprovedHtml({}),
  ].forEach((html) => {
    assert.match(html, /Perth Cabinet Doors/);
    assert.match(html, /background:#f4f0e8/, "the page of the shared shell");
    assert.match(html, /background:#eef7ed/, "the cream shell every customer email uses");
  });
});

// ── where they fire ────────────────────────────────────────────────────────

test("a payment confirms whichever way the money arrived", () => {
  const stripe = read("app/api/stripe/webhook/route.js");
  assert.match(stripe, /sendPaymentReceivedToCustomer\(\{ payment, order, quote \}\)/);

  const settle = read("app/api/admin/orders/[id]/payments/[paymentId]/settle/route.js");
  assert.ok(settle.includes("sendPaymentReceivedToCustomer("), "marking it paid by hand tells them too");
  assert.ok(settle.includes("confirmationSent"), "and the screen says whether it went");
});

test("an approval with nothing to pay is no longer silent", () => {
  const workflow = read("app/api/quote-workflow/action/route.js");
  assert.ok(workflow.includes('if (action === "approved") {'), "only on an approval");
  assert.ok(workflow.includes("sendQuoteApprovedToCustomer("));

  // The deposit path returns further up, on its way to the payment page, so it
  // cannot reach this and cannot send two emails a minute apart.
  const depositReturn = workflow.indexOf("requiresPayment: true");
  const confirmation = workflow.indexOf("sendQuoteApprovedToCustomer(", depositReturn);
  assert.ok(depositReturn > 0 && confirmation > depositReturn, "the deposit path leaves before this");
});

test("accepting on somebody's behalf still confirms it to them", () => {
  // They said yes on the phone, so this written confirmation is the only record
  // they get, and the one they will look for.
  const accept = read("app/api/admin/quotes/[id]/accept/route.js");
  assert.ok(accept.includes("sendQuoteApprovedToCustomer("));
  assert.match(accept, /The customer was NOT emailed/, "and it says so when it did not go");
});

test("a variation approval confirms once it is on the order", () => {
  const variation = read("app/api/variation-workflow/action/route.js");
  const applied = variation.indexOf("applied: true");
  const confirmation = variation.lastIndexOf("sendVariationApprovedToCustomer(");
  assert.ok(confirmation > 0, "it sends");
  assert.ok(confirmation < applied, "after the change is on the order, not before");
});

test("no confirmation can undo the thing it is about", () => {
  // The money has arrived, or the approval is recorded, before any of this
  // runs. A refused email has to be a missing email, never a lost payment.
  const sender = read("lib/pcd-customer-confirmations.js");
  assert.doesNotMatch(sender, /\bthrow\b/, "nothing here throws");
  assert.ok(sender.includes("sendEmail(resend, {"), "and it reads the provider's answer");
});
