// TWO PEOPLE SAVING THE SAME RECORD.
//
// ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────
//
//   NOBODY'S CHANGE IS SILENTLY UNDONE. A screen saving a stale copy of a
//   field somebody else changed keeps their value instead.
//
//   ONLY A REAL DISAGREEMENT STOPS A SAVE. Both people changing the same field
//   to different values is refused with the field named; anything else saves.
//
//   BACKGROUND STAMPS NEVER CLASH. Totals and timestamps are not fields a
//   person types, so a line save moving the quote total cannot block the next
//   header save.
//
//   PLANNING MERGES PANEL BY PANEL. The order page sends only what changed.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { baseFor, clashMessage, keepTheirs, ORDER_FIELDS, QUOTE_HEADER_FIELDS, saveClashes, sameValue } from "../lib/pcd-save-clash.js";
import { mergePlanning } from "../lib/pcd-plan-queue.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const loaded = { customer_phone: "0400 111 222", project_name: "Kitchen", travel_cost_ex_gst: 0, total_inc_gst: 1000 };

test("nobody else touched it: no clash, and yours saves", () => {
  const yours = { ...loaded, project_name: "Kitchen and laundry" };
  assert.deepEqual(saveClashes(loaded, loaded, yours, QUOTE_HEADER_FIELDS), []);
  assert.equal(keepTheirs(loaded, loaded, yours, QUOTE_HEADER_FIELDS).project_name, "Kitchen and laundry");
});

test("they changed a field you did not: theirs is kept and your save goes ahead", () => {
  const now = { ...loaded, customer_phone: "0400 999 888" };
  const yours = { ...loaded, project_name: "Kitchen and laundry" };
  assert.deepEqual(saveClashes(now, loaded, yours, QUOTE_HEADER_FIELDS), []);
  const saved = keepTheirs(now, loaded, yours, QUOTE_HEADER_FIELDS);
  assert.equal(saved.customer_phone, "0400 999 888", "their phone number survives");
  assert.equal(saved.project_name, "Kitchen and laundry", "your change still saves");
});

test("you both changed the same field differently: refused, naming it", () => {
  const now = { ...loaded, customer_phone: "0400 999 888" };
  const yours = { ...loaded, customer_phone: "0411 000 000" };
  const clashes = saveClashes(now, loaded, yours, QUOTE_HEADER_FIELDS);
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].label, "Phone");
  assert.match(clashMessage(clashes), /^Someone else changed Phone on this quote to "0400 999 888" since you opened it, and you changed it too, so nothing was saved\./);
});

test("you both made the same change: no clash", () => {
  const now = { ...loaded, customer_phone: "0400 999 888" };
  assert.deepEqual(saveClashes(now, loaded, { ...loaded, customer_phone: "0400 999 888" }, QUOTE_HEADER_FIELDS), []);
});

test("totals and stamps are never a clash", () => {
  const now = { ...loaded, total_inc_gst: 1500, updated_at: "later" };
  assert.deepEqual(saveClashes(now, loaded, { ...loaded, total_inc_gst: 900 }, QUOTE_HEADER_FIELDS), []);
});

test("blank, null and number formatting count as the same value", () => {
  assert.ok(sameValue("", null));
  assert.ok(sameValue(undefined, ""));
  assert.ok(sameValue(4, "4.00"));
  assert.ok(!sameValue(0, ""));
  assert.ok(sameValue("2026-10-05", "2026-10-05"));
  assert.ok(sameValue([1, 2], [1, 2]));
});

test("no base sent means no check, so older callers save as before", () => {
  const now = { ...loaded, customer_phone: "0400 999 888" };
  assert.deepEqual(saveClashes(now, null, { customer_phone: "x" }, QUOTE_HEADER_FIELDS), []);
  assert.deepEqual(keepTheirs(now, null, { customer_phone: "x" }, QUOTE_HEADER_FIELDS), { customer_phone: "x" });
});

test("the base is only the typed fields that were loaded", () => {
  assert.deepEqual(baseFor({ name: "Job", total_inc_gst: 5, status: "active" }, ORDER_FIELDS), { name: "Job", status: "active" });
  assert.equal(baseFor(null, ORDER_FIELDS), null);
});

test("two people planning different panels on one line both keep their work", () => {
  const saved = { p1: { status: "Ordered" }, p2: { production_stage: "Cutting" } };
  const merged = mergePlanning(saved, { p2: { production_stage: "Edging" }, p3: { status: "Received" } });
  assert.deepEqual(merged, { p1: { status: "Ordered" }, p2: { production_stage: "Edging" }, p3: { status: "Received" } });
});

test("every save path and screen is wired", () => {
  assert.match(read("app/api/admin/quotes/[id]/route.js"), /keepTheirs\(beforeQuote, payload\.base, payload, QUOTE_HEADER_FIELDS\)/);
  assert.match(read("app/api/admin/quotes/[id]/_quote-line-save.js"), /keepTheirs\(before, lineBase, line, QUOTE_LINE_FIELDS\)/);
  assert.match(read("lib/pcd-order-header-save.js"), /keepTheirs\(beforeOrder \|\| \{\}, payload\.base, updates, ORDER_FIELDS\)/);
  assert.match(read("lib/pcd-order-item-save.js"), /mergePlanning\(beforeItem\.panel_planning \|\| \{\}, planChanges\)/);
  const editor = read("app/admin/quotes/[id]/QuoteEditor.js");
  assert.match(editor, /base: baseFor\(serverQuoteRef\.current, QUOTE_HEADER_FIELDS\)/);
  assert.match(editor, /base: baseFor\(serverLinesRef\.current\.get\(nextLine\.id\), QUOTE_LINE_FIELDS\)/);
  const order = read("app/admin/orders/[id]/OrderDetail.js");
  assert.match(order, /base: baseFor\(serverOrderRef\.current, ORDER_FIELDS\)/);
  assert.match(order, /panel_planning_changes: taken\.inflight/);
});
