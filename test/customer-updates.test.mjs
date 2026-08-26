// THE WEEKLY CUSTOMER UPDATE.
//
// ── WHY IT EXISTS ────────────────────────────────────────────────────────────
//
// Once a week somebody reads who has had something happen on their order and
// sends them a note about it. The sentences come out of an activity log that
// was never written for a customer to read: it holds "Fulfilment changed from
// in_house to supplier_ready_made", supplier names, and free text the workshop
// wrote for itself.
//
// So every sentence is written deliberately, and the danger is not that the
// wording is ugly. It is that we tell somebody a date we do not control, or
// quote them a number that is wrong, on the one email they will keep.
//
// ── WHAT MUST STAY TRUE ──────────────────────────────────────────────────────
//
//   NOTHING SENDS ITSELF. There is no cron. A person reads it and presses send.
//
//   A FUTURE DATE IS ALWAYS HEDGED. Every time, no exceptions.
//
//   EVERY MOVEMENT SAYS WHERE THE GOODS ARE GOING. "Our workshop", never a bare
//   "received", which a customer reads as received by them.
//
//   THE MONEY IS THE MONEY. Not the year out of a reference number, and not a
//   credit because a separator looked like a minus.
//
//   NOTHING WITHOUT A SENTENCE IS SENT. Silence is the default for anything
//   nobody has decided the words for.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ITEM_STATUS_WORDS,
  NEVER_SENT,
  STAGE_WORDS,
  UPDATE_AUTOMATIC_NOTE,
  UPDATE_REPLY_LINE,
  sentenceFor,
  updateEmailBody,
} from "../lib/pcd-update-wording.js";
import { CUSTOMER_FACING_ACTIONS, UPDATE_SENT_ACTION } from "../lib/pcd-weekly-updates.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const WEEKLY = read("lib/pcd-weekly-updates.js");
const WORDING = read("lib/pcd-update-wording.js");
const SEND_ROUTE = read("app/api/admin/reporting/customer-updates/send/route.js");
const REPORT_ROUTE = read("app/api/admin/reporting/customer-updates/route.js");
const CLIENT = read("app/admin/reporting/customer-updates/CustomerUpdatesReport.js");

// ─── nothing sends itself ────────────────────────────────────────────────────

test("no schedule anywhere near this", () => {
  // The whole value of the report is the person in the middle reading it. A
  // cron would quietly remove them and nobody would notice until a customer was
  // told their doors were finished on the morning we found a problem.
  [WEEKLY, WORDING, SEND_ROUTE, REPORT_ROUTE].forEach((source) => {
    assert.ok(!/CRON_SECRET/.test(source), "no cron endpoint");
    assert.ok(!/setInterval|setTimeout\(/.test(source), "nothing self triggering");
  });
  // Deliberately not a search for the word "cron": the routes say in their
  // comments that a cron is exactly what they are not, and a test that forbids
  // naming the thing forbids explaining it.
  assert.ok(!/schedule:|export const revalidate = \d/.test(REPORT_ROUTE));
});

test("the report route only reads", () => {
  assert.ok(!/\.insert\(|\.update\(|\.delete\(/.test(REPORT_ROUTE));
  assert.match(REPORT_ROUTE, /export async function GET/);
  assert.ok(!/export async function POST/.test(REPORT_ROUTE));
});

test("sending is recorded only when it actually went", () => {
  // A row saying an update was sent, written after a refusal, is worse than no
  // row: the report shows the customer as handled and the next email starts
  // from a date nothing was sent on, so that week is lost for good.
  // Measured inside the handler. logOrderActivity is also an import at the top
  // of the file, which says nothing about the order things run in.
  const handler = SEND_ROUTE.slice(SEND_ROUTE.indexOf("export async function POST"));
  const bail = handler.indexOf("if (!sent.ok)");
  const log = handler.indexOf("logOrderActivity");
  assert.ok(bail > 0, "the send result must be checked");
  assert.ok(log > bail, "the failure return comes before the activity row");
});

// ─── the money ───────────────────────────────────────────────────────────────

test("an amount is never read out of a reference number", () => {
  // "PCD-V-2026-5051F3 - $719.95" produced $2,026.00 before the $ was required:
  // the year, invoiced back to the customer.
  const money = WEEKLY.match(/const money = \(value\) => \{[\s\S]*?\n\};/);
  assert.ok(money, "the money parser must exist");
  assert.match(money[0], /\\\$/, "it anchors on a dollar sign");
  assert.ok(!/\(-\?\)\\s\*\\\$/.test(money[0]), "and the minus must touch the $, or a separator reads as one");
});

test("the amount and its sign survive a real description", () => {
  // Both of these are real rows out of pcd_order_activity.
  const positive = sentenceFor({ kind: "variation_applied", reference: "PCD-V-2026-5051F3", amount: 719.95 });
  assert.match(positive, /\$719\.95/);
  assert.ok(!positive.includes("-$719.95"), "an addition must not read as a credit");

  const credit = sentenceFor({ kind: "variation_applied", reference: "PCD-V-2026-4F8313", amount: -472.52 });
  assert.match(credit, /-\$472\.52/);
});

// ─── the dangerous sentences ─────────────────────────────────────────────────

test("every future date is hedged", () => {
  const eta = sentenceFor({ kind: "item_eta_set", to: "2026-09-12" });
  assert.match(eta, /around/i);
  assert.match(eta, /estimate/i);
  assert.match(eta, /can move/i);

  const target = sentenceFor({ kind: "target_completion", to: "2026-09-21" });
  assert.match(target, /aiming/i);
  assert.match(target, /around/i);
  assert.match(target, /current estimate/i);
  assert.match(target, /let you know if it changes/i);
});

test("goods movements say whose workshop", () => {
  assert.match(sentenceFor({ kind: "item_eta_set", to: "2026-09-12" }), /our workshop/);
  assert.match(sentenceFor({ kind: "item_eta_moved", from: "2026-09-05", to: "2026-09-12" }), /our workshop/);
  const received = sentenceFor({ kind: "item_status", to: "Received", qty: 10, itemLabel: "Profiled doors", on: "2026-09-12" });
  assert.match(received, /arrived at our workshop/);
  // A bare "received" is the exact ambiguity this avoids.
  assert.ok(!/^10 x Profiled doors received/.test(received));
});

test("finished is not ready for collection", () => {
  const done = sentenceFor({ kind: "item_status", to: "Complete", qty: 10, itemLabel: "Profiled doors" });
  assert.match(done, /finished/);
  assert.ok(!/collect|pick ?up|ready for/i.test(done), "the report cannot know what happens next");
  assert.match(sentenceFor({ kind: "order_complete" }), /^Your order is now complete\.$/);
});

test("a rolled up line counts the pieces", () => {
  const ordered = sentenceFor({ kind: "item_status", to: "Ordered", qty: 10, itemLabel: "Profiled doors", on: "2026-08-20" });
  assert.match(ordered, /^10 x Profiled doors ordered on 20 August 2026$/);
});

test("suppliers are only named when we choose to", () => {
  const quiet = sentenceFor({ kind: "item_status", to: "Ordered", qty: 10, itemLabel: "doors", on: "2026-08-20" });
  assert.ok(!/supplier/i.test(quiet), "off by default");
  const named = sentenceFor(
    { kind: "item_status", to: "Ordered", qty: 10, itemLabel: "doors", on: "2026-08-20" },
    { nameSupplier: true }
  );
  assert.match(named, /with our supplier/);
});

// ─── silence is the default ──────────────────────────────────────────────────

test("nothing bad is announced by a machine", () => {
  assert.equal(sentenceFor({ kind: "issue_raised" }), null, "issues are off by default");
  assert.equal(sentenceFor({ kind: "order_hold" }), null, "so are holds");
  assert.ok(sentenceFor({ kind: "issue_raised" }, { includeIssues: true }));
  assert.ok(sentenceFor({ kind: "order_hold" }, { includeHolds: true }));
});

test("an issue never carries its detail", () => {
  // The log holds "Wrong size on The whole order. This panel only.", written
  // for the workshop. There is no safe way to forward that.
  const said = sentenceFor({ kind: "issue_raised", detail: "Wrong size on The whole order" }, { includeIssues: true });
  assert.ok(!said.includes("Wrong size"));
});

test("going backwards is not an update", () => {
  assert.equal(ITEM_STATUS_WORDS["Not Ordered"], false);
  assert.equal(STAGE_WORDS["Not Started"], false);
  assert.equal(sentenceFor({ kind: "item_status", to: "Not Ordered", qty: 3, itemLabel: "doors" }), null);
});

test("a change nobody has written words for is silent", () => {
  assert.equal(sentenceFor({ kind: "something_added_next_year" }), null);
  assert.equal(sentenceFor({ kind: "internal", detail: "Name changed from x to y" }), null);
});

test("the internal fields are listed with their reasons", () => {
  ["fulfilment_method", "supplier_name", "supplier_order_ref", "board_available", "production_notes", "status_updated_at"]
    .forEach((field) => {
      assert.ok(NEVER_SENT[field], `${field} must be named as never sent`);
      assert.ok(NEVER_SENT[field].length > 20, `${field} needs a reason, not a tick`);
    });
});

test("no raw database value can reach a customer", () => {
  const values = ["in_house", "supplier_ready_made", "status_updated_at", "pending_deposit"];
  const said = Object.values(STAGE_WORDS).filter(Boolean).join(" ");
  values.forEach((value) => assert.ok(!said.includes(value)));
  // And the stage names are translated rather than printed.
  assert.equal(STAGE_WORDS.Thermolaminating, "Your doors are being finished");
});

// ─── the email ───────────────────────────────────────────────────────────────

const SAMPLE = {
  customerName: "Juliet Grist",
  orders: [
    {
      number: "PCD-O-2026-E7651A",
      name: "Kitchen doors",
      changes: [
        { kind: "item_status", to: "Ordered", qty: 10, itemLabel: "Profiled doors", on: "2026-08-20", at: "2026-08-20T02:00:00Z" },
        { kind: "item_eta_set", to: "2026-09-12", at: "2026-08-20T02:05:00Z" },
        { kind: "payment_received", label: "final", amount: 1653.3, at: "2026-08-24T01:00:00Z" },
        { kind: "issue_raised", at: "2026-08-24T02:00:00Z" },
        { kind: "internal", detail: "Street address changed", at: "2026-08-22T01:00:00Z" },
      ],
    },
  ],
};

test("the email carries the reply line and says a machine wrote it", () => {
  const body = updateEmailBody(SAMPLE);
  assert.ok(body.includes(UPDATE_REPLY_LINE));
  assert.ok(body.includes(UPDATE_AUTOMATIC_NOTE));
  // The reply line first, so nobody reads a disclaimer to find out how to
  // reach us.
  assert.ok(body.indexOf(UPDATE_REPLY_LINE) < body.indexOf(UPDATE_AUTOMATIC_NOTE));
  assert.match(UPDATE_AUTOMATIC_NOTE, /not a request for payment/);
});

test("the count in the intro is what is actually listed", () => {
  // "4 updates" above three lines is the sort of thing a person notices once
  // and never quite trusts again. Internal edits and the suppressed issue are
  // both excluded here.
  const body = updateEmailBody(SAMPLE);
  assert.match(body, /We have had 3 updates/);
  const listed = body.split("\n").filter((line) => /^ {2}\d/.test(line));
  assert.equal(listed.length, 3);
});

test("the email never contains an internal edit", () => {
  const body = updateEmailBody(SAMPLE);
  assert.ok(!body.includes("Street address changed"));
  assert.ok(!body.includes("Wrong size"));
});

test("orders become headings so a customer with two jobs can tell them apart", () => {
  const body = updateEmailBody({
    customerName: "Ashleigh",
    orders: [
      { number: "PCD-O-2026-DA223F", name: "Pantry", changes: [{ kind: "order_complete", at: "2026-08-21T00:00:00Z" }] },
      { number: "PCD-O-2026-800C52", name: "Robe", changes: [{ kind: "order_complete", at: "2026-08-22T00:00:00Z" }] },
    ],
  });
  assert.match(body, /across your 2 orders/);
  assert.ok(body.includes("PCD-O-2026-DA223F - Pantry"));
  assert.ok(body.includes("PCD-O-2026-800C52 - Robe"));
});

// ─── reading the log ─────────────────────────────────────────────────────────

test("a lookup that fails is thrown, never an empty report", () => {
  // Asking pcd_orders for a currency column it does not have failed the whole
  // lookup, every row was skipped for having no order, and the report came back
  // empty. An empty report does not look like a fault, it looks like a quiet
  // week, so nobody would ever have chased it.
  assert.match(WEEKLY, /if \(ordersResult\.error\) throw ordersResult\.error/);
  assert.match(WEEKLY, /if \(itemsResult\.error\) throw itemsResult\.error/);
  assert.ok(!/select\("id, order_number, name, status, customer_id, customer_name, customer_email, currency"/.test(WEEKLY));
});

test("the events read are a curated list, not everything", () => {
  // A blocklist would put a newly added action type straight into customer
  // emails. This way a new one is silent until somebody decides the words.
  assert.ok(CUSTOMER_FACING_ACTIONS.length > 0);
  ["payment_added", "payment_requested", "payment_deleted", "quote_updated", "order_spec_realigned_to_quote"]
    .forEach((noise) => assert.ok(!CUSTOMER_FACING_ACTIONS.includes(noise), `${noise} is bookkeeping`));
});

test("what was sent is read back out of the log, not stored twice", () => {
  // One truth. A last_sent column on the customer would be a second copy to
  // keep in step, and the one that drifts decides who gets emailed.
  assert.equal(UPDATE_SENT_ACTION, "customer_update_sent");
  assert.match(WEEKLY, /\.eq\("action_type", UPDATE_SENT_ACTION\)/);
  assert.ok(!/last_update_sent_at|update_sent_at/.test(WEEKLY), "no column shadowing the log");
});

test("the roll up groups by field, value and day", () => {
  const key = WEEKLY.match(/const key = \[[^\]]+\]/);
  assert.ok(key, "the roll up key must exist");
  ["change.kind", "change.to", "change.itemLabel", "dayOf(change.at)"].forEach((part) => {
    assert.ok(key[0].includes(part), `the key must include ${part}`);
  });
});

// ─── the screen ──────────────────────────────────────────────────────────────

test("the review screen shows the exact sentence, not its own version", () => {
  // Two renderings of the same fact drift, and the one that drifts is the
  // wording on the email a customer keeps.
  assert.match(CLIENT, /import \{[\s\S]*?sentenceFor[\s\S]*?\} from '@\/lib\/pcd-update-wording'/);
  assert.match(CLIENT, /const line = sentenceFor\(change\)/);
  assert.ok(!/`\$\{change/.test(CLIENT), "the screen must not assemble its own sentences");
});

test("the email body sent is the one that was on screen", () => {
  // It may have been edited. Rebuilding it server side would quietly discard
  // whatever was typed and send something nobody read.
  assert.match(SEND_ROUTE, /const body = String\(payload\.body/, "taken from the request");
  assert.ok(!/updateEmailBody/.test(SEND_ROUTE), "the server must not rebuild it");
  // And it is what gets rendered, rather than being logged and then ignored.
  assert.match(SEND_ROUTE, /customerUpdateHtml\(\{ customerName, body \}\)/);
});
