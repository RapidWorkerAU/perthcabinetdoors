// WHOSE DETAILS ARE THESE?
//
// ── THE ARRANGEMENT ──────────────────────────────────────────────────────────
//
// The CUSTOMER RECORD is who somebody is: the details we keep current, and what
// prefills every new quote. The QUOTE and the ORDER each carry their own COPY,
// taken when they were raised, and that copy is allowed to differ. A second
// kitchen at an investment property is a real job at a real address that is not
// where the customer lives.
//
// So the two never sync on their own, in either direction. Editing a job
// changes that job. Editing the customer changes the record, and then ASKS.
//
// ── THE BUG THIS STARTED FROM ────────────────────────────────────────────────
//
// The customer page saved the three address parts and never rebuilt the joined
// one liner. site_address is what every list, label and PDF actually reads, so
// a customer moved to Myaree still read as their old suburb in the customers
// table, on their orders, and on the delivery label printed from one. The
// address had been corrected and nothing that mattered had changed.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  addressColumnsFromPayload,
  customerFieldsFromPayload,
  normalizeCustomerPayload,
} from "../lib/pcd-customer-utils.js";
import {
  PUSHABLE_FIELDS,
  changedFields,
  defaultSelection,
  detailsFromCustomer,
  pushTargets,
  targetKey,
} from "../lib/pcd-customer-push.js";

const CUSTOMER = {
  id: "c1",
  name: "Darryl Cooksley",
  email: "darryl@example.com",
  phone: "0417 483 662",
  site_street: "12 Bilyana Way",
  site_suburb: "Myaree",
  site_postcode: "6154",
};

// ── The one liner follows the parts ─────────────────────────────────────────

test("saving the three parts rebuilds the address everything else reads", () => {
  const columns = addressColumnsFromPayload({
    site_street: "12 Bilyana Way",
    site_suburb: "Myaree",
    site_postcode: "6154",
  });
  assert.equal(columns.site_address, "12 Bilyana Way, Myaree 6154");
  assert.equal(columns.site_suburb, "Myaree");
});

test("a stale one liner cannot survive a change to the parts", () => {
  // This is the bug, in one assertion: the payload still carries the OLD joined
  // address, exactly as a screen sending both would, and the parts must win.
  const columns = addressColumnsFromPayload({
    site_address: "9 Old Street, Midvale 6056",
    site_street: "12 Bilyana Way",
    site_suburb: "Myaree",
    site_postcode: "6154",
  });
  assert.equal(columns.site_address, "12 Bilyana Way, Myaree 6154", "the parts are the truth");
});

test("a form with only one address box still works", () => {
  // Older public forms have a single field and send no parts at all. Their own
  // one liner is then the best answer there is.
  const columns = addressColumnsFromPayload({ site_address: "14 Rokeby Road, Subiaco 6008" });
  assert.equal(columns.site_address, "14 Rokeby Road, Subiaco 6008");
  assert.equal(columns.site_street, null, "nothing is invented for the parts");
});

test("clearing the three boxes clears the address too", () => {
  const columns = addressColumnsFromPayload({ site_street: "", site_suburb: "", site_postcode: "" });
  assert.equal(columns.site_address, null, "an emptied address is empty, not the one from before");
});

test("both normalisers build the address the same way", () => {
  // One writes customers, the other writes quotes and orders. They disagreeing
  // is how a customer and their own job end up at different houses.
  const parts = { site_street: "12 Bilyana Way", site_suburb: "Myaree", site_postcode: "6154" };
  assert.equal(
    normalizeCustomerPayload({ ...parts, name: "D", email: "d@x.com" }).site_address,
    customerFieldsFromPayload({ ...parts, customer_name: "D" }).site_address
  );
});

// ── What a push would do ────────────────────────────────────────────────────

test("the email is never pushed, because it is the anchor", () => {
  // Every message and every form match is filed against it. Changing it on a
  // quote would orphan that history.
  assert.ok(!PUSHABLE_FIELDS.some((field) => /email/.test(field.key)), "no email field is pushable");
  assert.ok(!Object.keys(detailsFromCustomer(CUSTOMER)).some((key) => /email/.test(key)));
});

test("the details taken from a customer carry the rebuilt address", () => {
  const details = detailsFromCustomer(CUSTOMER);
  assert.equal(details.site_address, "12 Bilyana Way, Myaree 6154");
  assert.equal(details.customer_name, "Darryl Cooksley");
  assert.equal(details.customer_phone, "0417 483 662");
});

test("a job that already matches is not offered at all", () => {
  // A list of twelve jobs where eleven are already right makes somebody hunt
  // for the one that is not, and ticking it changes nothing anyway.
  const details = detailsFromCustomer(CUSTOMER);
  const matching = { id: "o1", order_number: "PCD-O-1", status: "active", ...details };
  assert.deepEqual(changedFields(matching, details), []);
  assert.deepEqual(pushTargets({ orders: [matching], details }), []);
});

test("a job that differs says which fields would change and what it says now", () => {
  const details = detailsFromCustomer(CUSTOMER);
  const stale = {
    id: "o1",
    order_number: "PCD-O-2026-6AC6A5",
    name: "Cabinetry Quote",
    status: "active",
    customer_name: "Darryl Cooksley",
    customer_phone: "0417 483 662",
    site_address: "9 Old Street, Midvale 6056",
    site_street: "9 Old Street",
    site_suburb: "Midvale",
    site_postcode: "6056",
  };
  const [target] = pushTargets({ orders: [stale], details });
  assert.equal(target.ref, "PCD-O-2026-6AC6A5");
  assert.deepEqual(target.changed, ["Street", "Suburb", "Postcode"], "only the address moved");
  assert.equal(target.currentAddress, "9 Old Street, Midvale 6056", "what is being replaced is shown");
  assert.equal(target.live, true, "an active order is still in play");
});

test("finished and cancelled work is offered but never pre-ticked", () => {
  // Changing where a delivered job went is a rewrite, not a correction.
  const details = detailsFromCustomer(CUSTOMER);
  const stale = (id, status, type) =>
    type === "quote"
      ? { id, quote_number: `Q-${id}`, status, site_suburb: "Midvale" }
      : { id, order_number: `O-${id}`, status, site_suburb: "Midvale" };

  const targets = pushTargets({
    quotes: [stale("q1", "sent", "quote"), stale("q2", "approved", "quote"), stale("q3", "rejected", "quote")],
    orders: [stale("o1", "active"), stale("o2", "complete"), stale("o3", "cancelled")],
    details,
  });

  assert.equal(targets.length, 6, "everything that differs is shown");
  const ticked = defaultSelection(targets);
  assert.deepEqual(ticked.sort(), ["order:o1", "quote:q1"], "only what is still in play");
});

test("live jobs are listed first, because they are the decision", () => {
  const details = detailsFromCustomer(CUSTOMER);
  const targets = pushTargets({
    orders: [
      { id: "o2", order_number: "O-2", status: "complete", site_suburb: "Midvale" },
      { id: "o1", order_number: "O-1", status: "active", site_suburb: "Midvale" },
    ],
    details,
  });
  assert.equal(targets[0].id, "o1");
  assert.equal(targetKey(targets[0]), "order:o1");
});

// ── The route only touches what it offered ──────────────────────────────────

test("a push can only reach a job the preview listed", () => {
  // Otherwise a request could name any id and have the details written onto it,
  // including somebody else's job.
  const route = readFileSync(
    new URL("../app/api/admin/customers/[id]/push-details/route.js", import.meta.url),
    "utf8"
  );
  assert.match(route, /targets\.filter\(\(target\) => wanted\.has\(targetKey\(target\)\)\)/);
  // And both halves read the same functions, so they cannot disagree.
  assert.match(route, /pushTargets/);
  assert.match(route, /detailsFromCustomer/);
});

test("nothing is pushed unless something was ticked", () => {
  const route = readFileSync(
    new URL("../app/api/admin/customers/[id]/push-details/route.js", import.meta.url),
    "utf8"
  );
  assert.match(route, /if \(!wanted\.size\) return Response\.json\(\{ ok: true, updated: 0/);
});

// ── The screens say which way round it works ────────────────────────────────

test("a quote and an order both say their details are their own", () => {
  const note = readFileSync(new URL("../components/admin/JobDetailsScopeNote.js", import.meta.url), "utf8");
  assert.match(note, /These details belong to this/);
  assert.match(note, /their customer record/, "and where to go to change it everywhere");

  for (const path of ["app/admin/orders/[id]/OrderDetail.js", "app/admin/quotes/[id]/QuoteEditor.js"]) {
    const page = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(page, /<JobDetailsScopeNote/, `${path} does not say whose details these are`);
  }
});

test("saving a customer asks about their jobs", () => {
  const page = readFileSync(
    new URL("../app/admin/customers/[id]/CustomerDeskClient.js", import.meta.url),
    "utf8"
  );
  assert.match(page, /setPushOpen\(true\)/, "the question is asked after the record is saved");
  assert.match(page, /<PushDetailsModal/);
  // Saved first, unconditionally. Whether the jobs follow is a separate answer.
  const save = page.slice(page.indexOf("async function saveCustomer"), page.indexOf("setPushOpen(true)"));
  assert.match(save, /toast\(\{ title: "Customer saved\./, "the record is saved either way");
});

// ── The email is two different things with one name ─────────────────────────
//
// On the customer record it is IDENTITY: every message and form match is filed
// against it, so it is locked. On a quote or an order it is WHERE THAT JOB'S
// PAPERWORK GOES, so it is editable. The two screens looked like they
// contradicted each other until both of them said which was which.

test("the customer email is locked, and says why and what you can still do", () => {
  const page = readFileSync(
    new URL("../app/admin/customers/[id]/CustomerDeskClient.js", import.meta.url),
    "utf8"
  );
  assert.match(page, /readOnly/, "identity is not edited here");
  assert.match(page, /filed against it/, "and it says why");
  assert.match(page, /without changing this/, "and that a job can still be sent elsewhere");
});

test("a job's email says it is a send-to address, not who the job belongs to", () => {
  for (const [path, expected] of [
    ["app/admin/orders/[id]/OrderDetail.js", /payment requests, refunds and variations are sent/],
    ["app/admin/quotes/[id]/QuoteEditor.js", /Where this quote is sent/],
  ]) {
    const page = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(page, expected, `${path} does not say what its email field does`);
    assert.match(page, /does not change who the/, `${path} does not say what it leaves alone`);
  }
});

test("changing a job's email cannot move the job to another customer", () => {
  // Outbound mail is filed against customer_id, not the address it was sent to,
  // so a job posted to accounts@ still belongs to the person you deal with.
  const refund = readFileSync(
    new URL("../app/api/admin/orders/[id]/payments/[paymentId]/process-refund/route.js", import.meta.url),
    "utf8"
  );
  assert.match(refund, /customerId: order\.customer_id \|\| null/, "filed by the link, never by the address");
  assert.match(refund, /to: \[order\.customer_email\]/, "sent to the job's own address");
});
