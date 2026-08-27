// ONE PERSON, MORE THAN ONE CUSTOMER RECORD.
//
// The same person writes from two addresses, or their partner answers for them,
// and the mail sync makes a second record because it has nothing else to go on.
// Kristy Smith had a quote, an order and 17 messages under one address and 9
// messages under another. Same person, counted twice on the board and split
// across two customer pages.
//
// THE RULE THESE LOCK: nothing is ever moved. A record is marked as belonging
// to another and everything reads through that link, so separating them again
// is exact rather than a best effort. A merge that repointed rows could not be
// undone honestly, because anything edited while merged has no way to say which
// record it started on.

import test from "node:test";
import assert from "node:assert/strict";

import {
  contactsFor,
  describeHistory,
  emailsFor,
  isEmptyRecord,
  isSecondary,
  possibleDuplicates,
  primaryFor,
  primaryIdIndex,
  validateMerge,
} from "../lib/pcd-customer-links.js";

const outlook = { id: "k1", name: "Kristy Smith", email: "kristysmitharch@outlook.com", merged_into_id: null };
const gmail = { id: "k2", name: "Kristy Smith", email: "kristywsmith@gmail.com", merged_into_id: "k1" };
const other = { id: "o1", name: "Courtney King", email: "courtney@example.com", merged_into_id: null };

// ── resolving ───────────────────────────────────────────────────────────────

test("a secondary record reads as its primary", () => {
  const all = [outlook, gmail, other];
  assert.equal(primaryFor(gmail, all).id, "k1");
  assert.equal(primaryFor(outlook, all).id, "k1", "a primary is its own primary");
  assert.equal(isSecondary(gmail), true);
  assert.equal(isSecondary(outlook), false);
});

test("the index maps every record to the one it should be grouped under", () => {
  const index = primaryIdIndex([outlook, gmail, other]);
  assert.equal(index.get("k2"), "k1");
  assert.equal(index.get("k1"), "k1");
  assert.equal(index.get("o1"), "o1");
});

test("both addresses reach the same person", () => {
  // What makes a reply sent to either one count as having answered them.
  assert.deepEqual(emailsFor("k1", [outlook, gmail, other]), [
    "kristysmitharch@outlook.com",
    "kristywsmith@gmail.com",
  ]);
});

test("the primary is listed first among its contacts", () => {
  const contacts = contactsFor("k1", [gmail, outlook, other]);
  assert.deepEqual(contacts.map((c) => c.id), ["k1", "k2"]);
});

// ── what a merge refuses ────────────────────────────────────────────────────

test("a record cannot be merged into itself", () => {
  assert.match(validateMerge({ secondary: outlook, primary: outlook, customers: [outlook] }), /same record/i);
});

test("you cannot merge into somebody who is already a secondary", () => {
  // Chains would turn "who is the primary" into a walk instead of a lookup, and
  // the first one formed mid merge would leave nobody able to predict what the
  // customer page showed.
  const problem = validateMerge({ secondary: other, primary: gmail, customers: [outlook, gmail, other] });
  assert.match(problem, /already belongs to somebody else/i);
});

test("you cannot merge a record that has contacts of its own", () => {
  const problem = validateMerge({ secondary: outlook, primary: other, customers: [outlook, gmail, other] });
  assert.match(problem, /contacts of its own/i);
});

test("merging the same pair twice is refused rather than repeated", () => {
  assert.match(validateMerge({ secondary: gmail, primary: outlook, customers: [outlook, gmail] }), /already merged/i);
});

test("a real merge is allowed", () => {
  const fresh = { id: "k2", name: "Kristy Smith", email: "kristywsmith@gmail.com", merged_into_id: null };
  assert.equal(validateMerge({ secondary: fresh, primary: outlook, customers: [outlook, fresh] }), null);
});

// ── deleting a mistake rather than merging it ───────────────────────────────

test("a record with nothing on it is a mistake, not a second contact", () => {
  // Simon Keelan's typo address: no quotes, orders or messages. Merging it
  // would keep a contact that never existed.
  assert.equal(isEmptyRecord({ quotes: 0, orders: 0, tickets: 0, messages: 0, enquiries: 0, requests: 0 }), true);
  assert.equal(isEmptyRecord({ quotes: 1 }), false);
  assert.equal(isEmptyRecord({ messages: 9 }), false);
  assert.equal(isEmptyRecord({}), true);
});

test("what a record holds is said in words before it is touched", () => {
  assert.equal(describeHistory({ quotes: 1, orders: 1, messages: 17 }), "1 quote, 1 order and 17 messages");
  assert.equal(describeHistory({ messages: 9 }), "9 messages");
  assert.equal(describeHistory({}), "nothing on it");
});

// ── suggesting duplicates ───────────────────────────────────────────────────

test("duplicates are suggested on the name, never on the address", () => {
  // No two records share an address, and two people at one house genuinely have
  // different ones. A suggestion is a prompt to look, never a decision.
  const fresh = { id: "k2", name: "Kristy Smith", email: "kristywsmith@gmail.com", merged_into_id: null };
  const groups = possibleDuplicates([outlook, fresh, other]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "kristy smith");
  assert.deepEqual(groups[0].records.map((r) => r.id).sort(), ["k1", "k2"]);
});

test("a pair already merged stops being suggested", () => {
  assert.deepEqual(possibleDuplicates([outlook, gmail, other]), []);
});

test("records with no name are never suggested", () => {
  const blank = [
    { id: "a", name: "", email: "", merged_into_id: null },
    { id: "b", name: "   ", email: "", merged_into_id: null },
  ];
  assert.deepEqual(possibleDuplicates(blank), []);
});

// ── the desk reads every record of theirs ───────────────────────────────────
//
// These read the code rather than the database, the same way the financials and
// board page tests do. The rule they hold is that no read is left scoped to one
// record, because that is what would show half a person's history on a page
// that looks complete.

test("the desk loads the whole group, not the one record that was asked for", async () => {
  const { readFileSync } = await import("node:fs");
  const desk = readFileSync(new URL("../lib/pcd-desk-data.js", import.meta.url), "utf8");

  // Every table on the desk has to be scoped to the group.
  for (const table of ["pcd_tickets", "pcd_messages", "pcd_quotes", "pcd_orders", "pcd_enquiries", "pcd_quote_requests", "pcd_order_activity"]) {
    const line = desk.split("\n").filter((l) => l.includes(`from("${table}")`))[0] || "";
    assert.match(line, /\.in\("customer_id", ids\)/, `${table} is still scoped to one record`);
  }
  // And the desk answers as the primary, whichever record was opened.
  assert.match(desk, /customer: primary/);
  assert.match(desk, /contacts: group/);
});

test("opening a linked contact lands on the person, not half of them", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../app/admin/customers/[id]/page.js", import.meta.url), "utf8");
  assert.match(page, /redirect\(`\/admin\/customers\/\$\{desk\.customer\.id\}`\)/);
});

test("a reply goes to whoever is in that conversation, not to the main contact", async () => {
  // The desk shows one person, so the record in the url is the primary. Sending
  // to its address would answer the wrong person when the partner wrote in.
  const { readFileSync } = await import("node:fs");
  const reply = readFileSync(new URL("../app/api/admin/customer-desk/[customerId]/reply/route.js", import.meta.url), "utf8");
  assert.match(reply, /let replyTo = customer\.email/);
  assert.match(reply, /if \(ticket\?\.customer_id && ticket\.customer_id !== customerId\)/);
  assert.match(reply, /to: replyTo,/);
  assert.match(reply, /to_email: isNote \? null : replyTo,/);
  assert.ok(!reply.includes("to: customer.email,"), "the reply still hardcodes the primary's address");
});

test("the board groups a merged person into one card", async () => {
  const { readFileSync } = await import("node:fs");
  const board = readFileSync(new URL("../lib/pcd-board-load.ts", import.meta.url), "utf8");
  assert.match(board, /primaryIdIndex/);
  assert.match(board, /customer:\$\{asPrimary\(t\.customer_id as string\)\}/);
  // And judges the turn against every address that reaches them.
  assert.match(board, /const addressesFor =/);
});

// ── nothing with a consequence happens on one click ─────────────────────────
//
// Separating, linking and deleting all change what a page shows, and two of the
// three sit inches from a customer's name. They get the same two steps a delete
// gets, through the admin's own Modal rather than a browser confirm box.

test("separating from the customer page asks first", async () => {
  const { readFileSync } = await import("node:fs");
  const desk = readFileSync(new URL("../app/admin/customers/[id]/CustomerDeskClient.js", import.meta.url), "utf8");
  // The button opens the question; it does not do the thing.
  assert.match(desk, /onClick=\{\(\) => setConfirmSeparate\(contact\)\}/);
  assert.ok(!desk.includes("onClick={() => separate(contact.id)}"), "the button still acts on one click");
  // And the modal says what it will and will not do.
  assert.match(desk, /open=\{Boolean\(confirmSeparate\)\}/);
  assert.match(desk, /Nothing is deleted and nothing moves/);
  assert.match(desk, /link them again at any time/);
});

test("linking, separating and deleting all ask first, wherever they live", async () => {
  const { readFileSync } = await import("node:fs");
  const duplicates = readFileSync(new URL("../app/admin/customers/DuplicatesPanel.js", import.meta.url), "utf8");
  const linked = readFileSync(new URL("../app/admin/customers/LinkedContactsPanel.js", import.meta.url), "utf8");

  // Linking and deleting are decisions made on the duplicates tab.
  for (const kind of ["merge", "delete"]) {
    assert.match(duplicates, new RegExp(`kind: "${kind}"`), `${kind} does not go through the confirm`);
  }
  // Separating is done from the linked contacts tab and from the customer page.
  assert.ok(linked.includes("setConfirming({ record: secondary, into: primary })"), "separate does not open a confirm");
  assert.match(linked, /<Modal/);

  // No browser confirm box anywhere: it cannot say what is at stake and it does
  // not look like the rest of the admin.
  for (const [name, source] of [["duplicates", duplicates], ["linked", linked]]) {
    assert.ok(!source.includes("window.confirm"), `a raw browser confirm is still in ${name}`);
  }
  // Deleting is the only one that cannot be undone, and it says so.
  assert.match(duplicates, /This one cannot be undone/);
});

// ── the customers page is three lists, one at a time ────────────────────────
//
// Possible duplicates and undecided senders used to sit as blocks above the
// customer table and push it down the page. Neither is daily work and both
// grow: fifty duplicates would have buried the list the page is for.

test("the customers page defaults to the customers, with counts on the other tabs", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../app/admin/customers/CustomersManager.tsx", import.meta.url), "utf8");

  assert.match(page, /React\.useState<'customers' \| 'duplicates' \| 'senders' \| 'linked'>\('customers'\)/);
  // A queue must never be invisible just because its tab is not open.
  assert.match(page, /onCount=\{setDuplicateCount\}/);
  assert.match(page, /onCount=\{setSenderCount\}/);
  // All three stay mounted so the counts are live and switching back is instant.
  assert.match(page, /view === 'customers' \? '' : 'hidden'/);
});

test("both queues are tables, not blocks that push the page down", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of ["DuplicatesPanel.js", "NewSendersPanel.js"]) {
    const source = readFileSync(new URL(`../app/admin/customers/${file}`, import.meta.url), "utf8");
    assert.match(source, /<AdminDataTable/, `${file} is not a table`);
    assert.match(source, /mobileCard=/, `${file} has no phone layout`);
    assert.match(source, /onCount/, `${file} does not report its count`);
  }
});

test("a duplicate group of three becomes two decisions, not one", async () => {
  // Each row is a pair: this record, and the one it would become a contact of.
  const { readFileSync } = await import("node:fs");
  const panel = readFileSync(new URL("../app/admin/customers/DuplicatesPanel.js", import.meta.url), "utf8");
  assert.match(panel, /for \(const other of rest\) rows\.push/);
  // And which one is kept can be swapped, because the suggestion is only a
  // suggestion.
  assert.match(panel, /title="Swap which one is the main contact"/);
});
