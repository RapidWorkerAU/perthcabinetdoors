// A PAYMENT THAT ARRIVED SOME OTHER WAY.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// Sending a payment link locked the payment's financial fields, and is_paid was
// one of them. The reasoning was sound: Stripe owns a requested payment, and
// hand-marking one paid invites double counting.
//
// It did not allow for the ordinary case. A link went out, it did not work for
// the customer, they transferred the money instead, and the payment could never
// be closed. The money was in the bank and the system insisted it was still
// owing, on the order, in the financials and on every chase list.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// A payment can always be settled. What cannot happen is settling it without
// saying HOW, because "paid" with nothing behind it is what the locking was
// protecting against.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  canSettleOutsideLink,
  SETTLED_OUTSIDE,
  settlementDate,
  settlementMethodLabel,
  settlementPatch,
  settlementWantsReference,
  canUndoSettlement,
  undoSettlementPatch,
} from "../lib/pcd-payment-settlement.js";

const LINK_SENT = {
  id: "p1",
  amount: 1200,
  is_paid: false,
  payment_type: "deposit",
  request_status: "checkout_created",
  request_url: "https://checkout.stripe.com/x",
  stripe_checkout_session_id: "cs_test_1",
  notes: "30% deposit",
};

// ── the regression ─────────────────────────────────────────────────────────

test("a payment with a link out can still be settled", () => {
  assert.equal(canSettleOutsideLink(LINK_SENT), true, "this is the exact case that had no way forward");
});

test("settling it marks it paid and records how it arrived", () => {
  const { updates, error } = settlementPatch(LINK_SENT, { method: "bank_transfer", reference: "PCD-4471" });
  assert.equal(error, undefined);
  assert.equal(updates.is_paid, true);
  assert.equal(updates.settlement_method, "bank_transfer");
  assert.equal(updates.settlement_reference, "PCD-4471");
  assert.match(updates.notes, /30% deposit/, "the note already on it survives");
  assert.match(updates.notes, /bank transfer/i, "and the trail is appended, not substituted");
});

// Left open, the customer could still pay the dead link later and we would have
// the same money twice.
test("settling closes the outstanding link", () => {
  const { updates } = settlementPatch(LINK_SENT, { method: "bank_transfer", reference: "PCD-4471" });
  assert.equal(updates.request_status, SETTLED_OUTSIDE);
  assert.notEqual(updates.request_status, "paid", "a later look has to tell a transfer from a completed checkout");
});

// ── what it refuses ────────────────────────────────────────────────────────

test("it will not settle without saying how the money arrived", () => {
  const { error } = settlementPatch(LINK_SENT, { method: "" });
  assert.match(error, /Say how the payment arrived/);
});

// A reference is worth ASKING for and never worth refusing over: somebody
// closing off a job does not always have it to hand, and refusing would leave
// money in the bank showing as owing, which is the state this ended.
test("the form knows which methods have a reference worth asking for", () => {
  assert.equal(settlementWantsReference("bank_transfer"), true);
  assert.equal(settlementWantsReference("cash"), false, "cash has no reference to give");
  assert.equal(settlementWantsReference("nonsense"), false);
});

test("cash needs no reference and settles cleanly", () => {
  const { updates, error } = settlementPatch(LINK_SENT, { method: "cash" });
  assert.equal(error, undefined);
  assert.equal(updates.settlement_reference, null);
});

test("an already paid payment cannot be settled again", () => {
  const { error } = settlementPatch({ ...LINK_SENT, is_paid: true }, { method: "cash" });
  assert.match(error, /already marked as paid/, "settling twice is either a duplicate or a correction");
  assert.equal(canSettleOutsideLink({ ...LINK_SENT, is_paid: true }), false);
});

test("a payment with nothing owing cannot be settled", () => {
  assert.equal(canSettleOutsideLink({ amount: 0, is_paid: false }), false);
  assert.equal(canSettleOutsideLink(null), false, "called before anything has loaded");
});

// ── the date ───────────────────────────────────────────────────────────────

test("money cannot have arrived tomorrow", () => {
  const now = new Date("2026-08-22T00:00:00Z");
  assert.equal(settlementDate("2026-12-01", now), "2026-08-22", "a typed year would land outside every reporting period");
  assert.equal(settlementDate("2026-08-01", now), "2026-08-01", "a real earlier date is kept");
  assert.equal(settlementDate("", now), "2026-08-22", "blank means today");
  assert.equal(settlementDate("nonsense", now), "2026-08-22");
});

// ── the amount stays locked ────────────────────────────────────────────────
//
// Editing what was asked for after a link went out for a different figure is a
// real fault. Settling must not be the way round it.
test("settling never changes what was owed", () => {
  const { updates } = settlementPatch(LINK_SENT, { method: "cash" });
  assert.equal("amount" in updates, false);
  assert.equal("payment_type" in updates, false);
});

// ── the route and the screen ───────────────────────────────────────────────

const ROUTE = readFileSync(
  new URL("../app/api/admin/orders/[id]/payments/[paymentId]/settle/route.js", import.meta.url),
  "utf8"
);
const ORDER = readFileSync(new URL("../app/admin/orders/[id]/OrderDetail.js", import.meta.url), "utf8");

test("the route claims the payment conditionally, so two people cannot settle it twice", () => {
  assert.match(ROUTE, /\.eq\("is_paid", false\)/);
});

test("a deposit being settled updates whether the order is confirmed work", () => {
  assert.match(ROUTE, /syncDepositFields\(context\.supabase, orderId\)/);
});

test("the settlement is logged against the order", () => {
  assert.match(ROUTE, /payment_settled_outside_link/);
  assert.match(ROUTE, /had_open_request/, "worth knowing the link was live when the money came another way");
});

// Money in the bank showing as owing is a worse state than a settlement whose
// method was not filed, so a missing column must not block the close.
test("the payment still closes on a database without the new columns", () => {
  assert.match(ROUTE, /settlement_/);
  assert.match(ROUTE, /202608221800_pcd_payment_settled_outside\.sql/, "and it names the migration that fixes it");
});

test("the order screen offers it on anything unpaid", () => {
  assert.match(ORDER, /canSettleOutsideLink\(payment\)/);
  assert.match(ORDER, /Mark received/);
  assert.match(ORDER, /SettlePaymentModal/);
});

test("the modal warns when a live link is about to be closed", () => {
  const modal = readFileSync(new URL("../app/admin/_components/SettlePaymentModal.js", import.meta.url), "utf8");
  assert.match(modal, /cancels[\s\S]{0,40}that link at Stripe/i, "a flag in our database is not a closed link");
  assert.match(modal, /cannot pay it as well/i);
  assert.match(modal, /if that does not work/i, "and it must not promise more than it can deliver");
});

test("every method has a readable label and an unknown one does not crash", () => {
  assert.equal(settlementMethodLabel("bank_transfer"), "Bank transfer");
  assert.equal(settlementMethodLabel("nonsense"), "Some other way");
});

// ── THE LINK MUST ACTUALLY BE KILLED ───────────────────────────────────────
//
// Setting request_status here closes the link in OUR database and does nothing
// whatsoever to the session Stripe is hosting. The customer still holds the
// email, the link still opens, and it still takes money. Our books would show
// one payment, because the webhook ignores an already-paid row, and the customer
// would be out twice over with nothing here saying so.
//
// A flag is not a closed link.

const STRIPE = readFileSync(new URL("../lib/pcd-stripe.js", import.meta.url), "utf8");
const WEBHOOK = readFileSync(new URL("../app/api/stripe/webhook/route.js", import.meta.url), "utf8");

test("there is a way to expire a checkout session at Stripe", () => {
  assert.match(STRIPE, /export async function expireCheckoutSession/);
  assert.match(STRIPE, /\/expire`/, "Stripe's own endpoint, not a flag of our own");
});

test("settling a payment expires the session rather than only flagging it", () => {
  assert.match(ROUTE, /expireCheckoutSession\(payment\.stripe_checkout_session_id\)/);
});

// A settlement must not fail because Stripe was unreachable: the money did
// arrive and has to be recorded. But the person has to be told, because "the
// link is closed" and "we could not close the link" are different things.
test("a settlement still succeeds if Stripe cannot be reached, and says so", () => {
  assert.match(STRIPE, /It does not throw/, "recording the money matters more than reaching Stripe");
  assert.match(ROUTE, /could NOT be cancelled/, "and the message has to say what actually happened");
  assert.match(ROUTE, /linkClosed:/, "so the screen can act on it too");
});

test("an already expired or completed session counts as closed, not as a failure", () => {
  assert.match(STRIPE, /alreadyClosed/, "both mean the link will not take money again");
});

test("whether the link really died is recorded against the order", () => {
  assert.match(ROUTE, /link_expired:/);
  assert.match(ROUTE, /link_expiry_error:/, "so a question later has an answer rather than an assumption");
});

// ── money arriving twice anyway ────────────────────────────────────────────

test("a payment arriving on an already paid row is recorded, not swallowed", () => {
  assert.match(WEBHOOK, /payment_received_twice/, "returning quietly kept the books right and the customer wrong");
  assert.match(WEBHOOK, /refund/i, "and it has to say what somebody needs to do about it");
});

test("a duplicate does not overwrite the payment that was already correct", () => {
  const branch = WEBHOOK.slice(WEBHOOK.indexOf("if (existingPayment.is_paid)"), WEBHOOK.indexOf("const paidAt"));
  assert.doesNotMatch(branch, /\.update\(/, "the row is right; a second payment is not a correction to it");
});

// ── the reference is offered, not demanded ─────────────────────────────────

test("a bank transfer settles without a reference", () => {
  const { updates, error } = settlementPatch(LINK_SENT, { method: "bank_transfer", reference: "" });
  assert.equal(error, undefined, "refusing over this would leave money in the bank showing as owing");
  assert.equal(updates.is_paid, true);
  assert.equal(updates.settlement_reference, null);
});

test("a reference is still kept when there is one", () => {
  const { updates } = settlementPatch(LINK_SENT, { method: "bank_transfer", reference: " PCD-4471 " });
  assert.equal(updates.settlement_reference, "PCD-4471");
  assert.match(updates.notes, /ref PCD-4471/);
});

// ── UNDOING A SETTLEMENT ───────────────────────────────────────────────────
//
// Once anything was marked paid, the payment route refused every financial
// field. So a settlement typed against the wrong payment, or with the wrong
// date, could only be corrected in the database. Settling is now an ordinary
// action done by a person who can misclick, so it needs a way back.
//
// Only a settlement WE recorded. A payment Stripe completed is money that really
// arrived, and un-marking it would make the books disagree with the bank.

test("a hand-settled payment can be undone", () => {
  const settled = { ...LINK_SENT, is_paid: true, request_status: SETTLED_OUTSIDE, settlement_method: "cash" };
  assert.equal(canUndoSettlement(settled), true);
  const { updates, error } = undoSettlementPatch(settled, { reason: "Wrong payment on a two-payment order" });
  assert.equal(error, undefined);
  assert.equal(updates.is_paid, false);
  assert.equal(updates.paid_at, null);
  assert.equal(updates.settlement_method, null);
  assert.match(updates.notes, /Settlement undone/);
});

test("a Stripe payment can never be un-marked", () => {
  const throughStripe = { ...LINK_SENT, is_paid: true, request_status: "paid" };
  assert.equal(canUndoSettlement(throughStripe), false);
  const { error } = undoSettlementPatch(throughStripe, { reason: "changed my mind" });
  assert.match(error, /taken through Stripe/, "the money really arrived, and the books have to agree with the bank");
});

test("undoing needs a reason", () => {
  const settled = { ...LINK_SENT, is_paid: true, request_status: SETTLED_OUTSIDE };
  assert.match(undoSettlementPatch(settled, { reason: "  " }).error, /Say why/);
});

// The session was expired when it was settled. Leaving the payment pointing at
// it would show a link that will never open and block a new one being sent.
test("undoing clears the dead link so a new one can be requested", () => {
  const settled = { ...LINK_SENT, is_paid: true, request_status: SETTLED_OUTSIDE };
  const { updates } = undoSettlementPatch(settled, { reason: "wrong one" });
  assert.equal(updates.request_status, "not_requested");
  assert.equal(updates.request_url, null);
  assert.equal(updates.stripe_checkout_session_id, null, "that session is expired and cannot be revived");
});

test("an unpaid payment has no settlement to undo", () => {
  assert.equal(canUndoSettlement(LINK_SENT), false);
  assert.equal(canUndoSettlement(null), false);
  assert.match(undoSettlementPatch(LINK_SENT, { reason: "x" }).error, /not marked as paid/);
});

test("the undo is reachable, logged, and puts a deposit back to owing", () => {
  assert.match(ROUTE, /export async function DELETE/);
  assert.match(ROUTE, /payment_settlement_undone/);
  assert.match(ROUTE, /\.eq\("is_paid", true\)/, "conditional, so two people cannot undo the same one twice");
  const undoBranch = ROUTE.slice(ROUTE.indexOf("export async function DELETE"));
  assert.match(undoBranch, /syncDepositFields/, "a deposit going back to owing changes whether the order is confirmed");
});

// ── BOTH LAYOUTS ───────────────────────────────────────────────────────────
//
// The buttons went on the desktop table first and the mobile card view was left
// with no way to mark a payment received at all. Somebody standing in the
// workshop with a phone is exactly who needs it.
test("settle and undo are on the phone as well as the desktop", () => {
  assert.equal(
    (ORDER.match(/canSettleOutsideLink\(payment\)/g) || []).length,
    2,
    "the desktop table and the mobile cards are separate markup and both need it"
  );
  assert.equal((ORDER.match(/canUndoSettlement\(payment\)/g) || []).length, 2);
});

// ── THE WEBHOOK MUST NOT DEPEND ON THE NEW COLUMNS ─────────────────────────
//
// Naming settlement_method in the webhook's select made the whole webhook fail
// on a database without 202608221800, and a webhook that throws is every
// incoming payment silently not being recorded.
test("the webhook reads the payment without naming columns that may not exist", () => {
  // Every select in the file, so a named column cannot hide in one of them.
  const selects = [...WEBHOOK.matchAll(/\.select\("([^"]*)"\)/g)].map((match) => match[1]);
  const risky = selects.filter((columns) => columns.includes("settlement_"));
  assert.deepEqual(
    risky,
    [],
    "naming a column added by a later migration makes the whole webhook throw on a database without it, " +
      "and a webhook that throws is every incoming payment silently not being recorded"
  );
});
