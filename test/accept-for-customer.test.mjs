// ACCEPTING A QUOTE ON THE CUSTOMER'S BEHALF.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// The quote editor had a Status dropdown with "Approved" on it. Choosing it
// wrote the word and did nothing else. No order was raised. So a quote read as
// accepted on every screen while the workshop had nothing to make, and nobody
// found out until somebody went looking for the job.
//
// Sealing accepted quotes made it worse rather than better. An approved quote is
// permanently read only and the refusal says to raise a variation on the order.
// There was no order. One click on a dropdown that looked like a setting created
// a record that could not be edited, could not be un-accepted, and had nothing to
// raise a variation against.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// Accepting is an event, not a field. It raises the order and records who
// accepted and how, whether the customer pressed the button or somebody here did
// it for them.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { acceptanceChannelLabel, ACCEPTANCE_CHANNEL_KEYS } from "../lib/pcd-acceptance-channels.js";
import { acceptanceGaps, depositAmountForQuote } from "../lib/pcd-quote-acceptance.js";

const QUOTE_PATCH = readFileSync(new URL("../app/api/admin/quotes/[id]/route.js", import.meta.url), "utf8");
const ACCEPT_ROUTE = readFileSync(new URL("../app/api/admin/quotes/[id]/accept/route.js", import.meta.url), "utf8");
const ACCEPTANCE = readFileSync(new URL("../lib/pcd-quote-acceptance.js", import.meta.url), "utf8");
const EDITOR = readFileSync(new URL("../app/admin/quotes/[id]/QuoteEditor.js", import.meta.url), "utf8");
const MODAL = readFileSync(new URL("../app/admin/_components/AcceptForCustomerModal.js", import.meta.url), "utf8");

// ── the trap is closed ─────────────────────────────────────────────────────

test("saving a quote can no longer set an outcome status", () => {
  assert.match(QUOTE_PATCH, /OUTCOME_STATUSES/, "approved and rejected must not be writable by a save");
  assert.match(
    QUOTE_PATCH,
    /OUTCOME_STATUSES\.has\(payload\.status\) \? undefined :/,
    "a save that asks for approved has to be ignored, not obeyed"
  );
});

test("the status dropdown cannot be used to accept", () => {
  const dropdown = EDITOR.slice(EDITOR.indexOf('value={form.status}'), EDITOR.indexOf("</select>"));
  assert.doesNotMatch(
    dropdown,
    /<option value="approved">Approved<\/option>\s*\n\s*<option value="rejected">/,
    "these were selectable and raised no order"
  );
  assert.match(dropdown, /form\.status === "approved" \?/, "shown only to display what a quote already is");
});

test("the editor offers the real action instead", () => {
  assert.match(EDITOR, /Accept for the customer/, "a warning with no way to do the thing is a dead end");
  assert.match(EDITOR, /\/accept`/, "and it has to reach the route that raises the order");
});

// ── the acceptance itself ──────────────────────────────────────────────────

test("accepting on their behalf raises the order through the same function the customer path uses", () => {
  assert.match(ACCEPTANCE, /createOrderFromQuote/, "otherwise the two paths drift and one stops raising orders");
  assert.match(ACCEPTANCE, /order_id: orderId/, "and the quote has to point at what it became");
});

test("the status is claimed conditionally, so a customer approving at once cannot be overwritten", () => {
  assert.match(ACCEPTANCE, /\.eq\("status", quote\.status\)/);
});

test("who accepted and how is required, not optional", () => {
  assert.match(ACCEPT_ROUTE, /Say how the customer accepted/);
  assert.match(ACCEPT_ROUTE, /Say who accepted it/);
  assert.match(MODAL, /Who accepted it\? Required/);
});

test("the record says a person here entered it, not that the customer clicked", () => {
  assert.match(ACCEPTANCE, /recorded_by_staff: true/, "recording it as a customer click would be worse than not recording it");
  assert.match(ACCEPTANCE, /staff_email/);
  assert.match(ACCEPTANCE, /acceptance_channel/);
  assert.match(ACCEPTANCE, /quote_accepted_by_staff/, "and the activity has to be distinguishable from a real one");
});

// A customer at a screen can pay. Somebody on the phone cannot, so inventing a
// checkout nobody asked for would be worse than recording the deposit as owing.
test("no payment link is invented for a phone acceptance", () => {
  assert.doesNotMatch(ACCEPTANCE, /createCheckoutSession/);
  assert.match(ACCEPTANCE, /payment_type: "deposit"/, "but the deposit still has to be recorded as owing");
});

// ── what it refuses ────────────────────────────────────────────────────────

test("a quote with no address cannot be accepted into an undeliverable order", () => {
  assert.deepEqual(acceptanceGaps({ customer_name: "J Smith", customer_email: "j@example.com", site_suburb: "Wembley" }), []);
  assert.deepEqual(acceptanceGaps({}), ["the customer's name", "an email address", "a delivery address"]);
  assert.deepEqual(
    acceptanceGaps({ customer_name: "J", customer_email: "j@e.com" }),
    ["a delivery address"],
    "the customer path collects this and refuses without it; the shortcut has to hold the same line"
  );
});

test("a full site address counts even without a suburb of its own", () => {
  assert.deepEqual(acceptanceGaps({ customer_name: "J", customer_email: "j@e.com", site_address: "12 A St, Wembley" }), []);
});

test("pressing accept twice lands on the same order rather than an error", () => {
  assert.match(ACCEPT_ROUTE, /alreadyAccepted: true/);
});

// ── the deposit ────────────────────────────────────────────────────────────

test("the deposit is worked out the same way the customer path works it out", () => {
  assert.equal(depositAmountForQuote({ deposit_required: true, deposit_percent: 30, total_inc_gst: 1000 }), 300);
  assert.equal(depositAmountForQuote({ deposit_required: false, deposit_percent: 30, total_inc_gst: 1000 }), 0);
  assert.equal(depositAmountForQuote({ deposit_required: true, deposit_percent: 0, total_inc_gst: 1000 }), 0);
  assert.equal(depositAmountForQuote({}), 0);
  assert.equal(depositAmountForQuote(null), 0, "called before anything has loaded");
});

// ── the channel list ───────────────────────────────────────────────────────

test("the channel list is shared, so the modal and the route cannot disagree", () => {
  assert.ok(ACCEPTANCE_CHANNEL_KEYS.includes("phone"));
  assert.equal(acceptanceChannelLabel("phone"), "Over the phone");
  assert.equal(acceptanceChannelLabel("nonsense"), "Some other way", "an unknown channel is not a crash");
});

// The modal is a client component. Importing the acceptance module would drag
// node:crypto into the browser bundle and fail the build, which it did.
test("the client modal does not import the server-only acceptance module", () => {
  assert.match(MODAL, /pcd-acceptance-channels/);
  assert.doesNotMatch(MODAL, /from "\.\.\/\.\.\/\.\.\/lib\/pcd-quote-acceptance"/);
});
