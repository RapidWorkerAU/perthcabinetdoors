/*
 * PLANNING A BIG ORDER WITHOUT BEING LOCKED OUT OF IT.
 *
 * The Item Planning, Supplier Made and Made To Order tables disabled every
 * field on an item while that item saved. On a thirty line order that is thirty
 * round trips, each one taking the row away from the person filling it in.
 *
 * The lock was also covering two real faults, and taking it off without fixing
 * them would turn a slow screen into a lying one:
 *
 *   1. A response carried the whole item back and was written over local state,
 *      so anything typed while the request was out reverted.
 *   2. panel_planning is ONE blob per item and several rows share an item, so
 *      two rows saving at once each sent the whole blob and the second landed
 *      on top of the first.
 *
 * These pin the queue that replaces the lock, and the bulk apply that is the
 * real answer to thirty lines with the same answer on them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BULK_FIELDS,
  bulkAppliesTo,
  bulkChanges,
  bulkFieldsFor,
  bulkSummary,
  hasPending,
  mergePlanning,
  pendingCount,
  pendingItemIds,
  queueChange,
  queuePatch,
  reconcilePlanning,
  requeue,
  scopeKeys,
  takeInflight,
} from "../lib/pcd-plan-queue.js";

// ── Queueing ─────────────────────────────────────────────────────────────────

test("two edits to one row both survive", () => {
  let q = {};
  q = queueChange(q, "i1", "p1", { supplier_name: "Polytec" });
  q = queueChange(q, "i1", "p1", { supplier_order_ref: "PO-88" });
  assert.deepEqual(q.i1.p1, { supplier_name: "Polytec", supplier_order_ref: "PO-88" });
});

test("two rows of the same item are one queued entry, not two racing requests", () => {
  // THE RACE THE LOCK WAS HIDING. panel_planning is one blob per item, so these
  // have to go out together or the second overwrites the first.
  let q = {};
  q = queueChange(q, "i1", "p1", { status: "ordered" });
  q = queueChange(q, "i1", "p2", { status: "received" });
  assert.deepEqual(pendingItemIds(q), ["i1"]);
  assert.deepEqual(Object.keys(q.i1), ["p1", "p2"]);
  assert.equal(pendingCount(q), 2);
});

test("an edit with no item or panel behind it is dropped rather than queued", () => {
  assert.deepEqual(queueChange({}, "", "p1", { a: 1 }), {});
  assert.deepEqual(queueChange({}, "i1", "", { a: 1 }), {});
});

// ── Sending, and what a response may change ──────────────────────────────────

test("what goes out leaves the queue, so anything typed after it is plainly newer", () => {
  let q = queueChange({}, "i1", "p1", { supplier_name: "Polytec" });
  const { inflight, pending } = takeInflight(q, "i1");
  assert.deepEqual(inflight, { p1: { supplier_name: "Polytec" } });
  assert.equal(hasPending(pending, "i1"), false);
});

test("a response is applied UNDER anything typed while it was in flight", () => {
  // The fault this exists to stop: the field somebody moved on to reverting to
  // what the server was told a second earlier.
  let q = queueChange({}, "i1", "p1", { supplier_name: "Polytec" });
  const taken = takeInflight(q, "i1");

  // They keep typing while the request is out.
  q = queueChange(taken.pending, "i1", "p1", { supplier_order_ref: "PO-99" });

  // The server answers with what it knew, which has no ref on it.
  const serverPlanning = { p1: { supplier_name: "Polytec", status: "ordered" } };
  const settled = reconcilePlanning(serverPlanning, q.i1);

  assert.equal(settled.p1.supplier_order_ref, "PO-99", "the newer edit was thrown away");
  assert.equal(settled.p1.status, "ordered", "and the server's own news still arrived");
});

test("a response does not resurrect a field the server has since cleared", () => {
  // Nothing queued means the server is the whole truth, which is what makes a
  // change made on another screen show up here.
  const settled = reconcilePlanning({ p1: { supplier_name: "" } }, null);
  assert.deepEqual(settled, { p1: { supplier_name: "" } });
});

test("a failed request goes back in the queue, still under anything newer", () => {
  const inflight = { p1: { supplier_name: "Polytec", supplier_eta: "2026-03-01" } };
  const newer = queueChange({}, "i1", "p1", { supplier_eta: "2026-04-01" });
  const back = requeue(newer, "i1", inflight);

  assert.equal(back.i1.p1.supplier_name, "Polytec", "the failed edit is not lost");
  assert.equal(back.i1.p1.supplier_eta, "2026-04-01", "but it does not undo a newer one");
});

test("a failure keeps panels the retry did not touch", () => {
  const inflight = { p1: { status: "ordered" } };
  const newer = queueChange({}, "i1", "p2", { status: "received" });
  const back = requeue(newer, "i1", inflight);
  assert.deepEqual(Object.keys(back.i1).sort(), ["p1", "p2"]);
});

test("planning merges panel by panel, never wholesale", () => {
  const merged = mergePlanning(
    { p1: { status: "ordered", supplier_name: "Polytec" }, p2: { status: "new" } },
    { p1: { supplier_eta: "2026-03-01" } }
  );
  assert.equal(merged.p1.status, "ordered", "the other fields on that panel survived");
  assert.equal(merged.p1.supplier_eta, "2026-03-01");
  assert.equal(merged.p2.status, "new", "and the other panel was untouched");
});

// ── Bulk ─────────────────────────────────────────────────────────────────────

const row = (over = {}) => ({
  key: over.key || "r1",
  panelKey: over.panelKey || "p1",
  item: { id: over.itemId || "i1" },
  section: over.section || "supplierMade",
  plan: over.plan || {},
  fulfilmentLocked: over.fulfilmentLocked || false,
});

test("one answer reaches every selected line", () => {
  const rows = [
    row({ key: "r1", itemId: "i1", panelKey: "p1" }),
    row({ key: "r2", itemId: "i2", panelKey: "p1" }),
    row({ key: "r3", itemId: "i3", panelKey: "p1" }),
  ];
  const out = bulkChanges(rows, ["r1", "r2", "r3"], { supplier_ordered_at: "2026-03-09" });
  assert.equal(out.applied, 3);
  assert.equal(out.itemCount, 3);
  assert.equal(out.patch.i2.p1.supplier_ordered_at, "2026-03-09");
});

test("rows that were not selected are not touched", () => {
  const rows = [row({ key: "r1" }), row({ key: "r2", itemId: "i2" })];
  const out = bulkChanges(rows, ["r1"], { status: "ordered" });
  assert.equal(out.applied, 1);
  assert.equal(out.patch.i2, undefined);
});

test("selected rows of one item collapse into a single entry", () => {
  // Otherwise a bulk apply becomes the same race the lock was hiding, only
  // thirty times over.
  const rows = [
    row({ key: "r1", itemId: "i1", panelKey: "p1" }),
    row({ key: "r2", itemId: "i1", panelKey: "p2" }),
    row({ key: "r3", itemId: "i1", panelKey: "p3" }),
  ];
  const out = bulkChanges(rows, ["r1", "r2", "r3"], { status: "ordered" });
  assert.equal(out.applied, 3);
  assert.equal(out.itemCount, 1, "one item, one request");
  assert.deepEqual(Object.keys(out.patch.i1).sort(), ["p1", "p2", "p3"]);
});

test("a board field is not written onto a line that needs no board", () => {
  // It would show up later as a supplier order nobody placed.
  const rows = [
    row({ key: "r1", section: "madeInHouse", plan: { board_required: true } }),
    row({ key: "r2", itemId: "i2", section: "madeInHouse", plan: { board_required: false } }),
  ];
  const out = bulkChanges(rows, ["r1", "r2"], { supplier_ordered_at: "2026-03-09" });
  assert.equal(out.applied, 1);
  assert.equal(out.skipped, 1);
  assert.equal(out.patch.i2, undefined);
});

test("board required itself can still be set on a line that has none", () => {
  // The field that turns the others on is not gated by them.
  const rows = [row({ key: "r1", section: "madeInHouse", plan: { board_required: false } })];
  const out = bulkChanges(rows, ["r1"], { board_required: true });
  assert.equal(out.applied, 1);
  assert.equal(out.patch.i1.p1.board_required, true);
});

test("a line that can only be supplier made keeps its fulfilment", () => {
  const rows = [
    row({ key: "r1", section: "items" }),
    row({ key: "r2", itemId: "i2", section: "items", fulfilmentLocked: true }),
  ];
  const out = bulkChanges(rows, ["r1", "r2"], { fulfilment_method: "in_house" });
  assert.equal(out.applied, 1);
  assert.equal(out.skipped, 1);
  assert.equal(bulkAppliesTo("fulfilment_method", rows[1]), false);
});

test("a blank answer is left alone rather than clearing the field", () => {
  // undefined means "not one of the fields being set". A bulk bar with six
  // boxes on it and one filled in must only write the one.
  const rows = [row({ key: "r1" })];
  const out = bulkChanges(rows, ["r1"], { supplier_name: undefined, supplier_order_ref: "PO-1" });
  assert.deepEqual(out.patch.i1.p1, { supplier_order_ref: "PO-1" });
});

test("clearing a field on purpose still works", () => {
  // An empty string is an answer: it means take the date off these lines.
  const rows = [row({ key: "r1" })];
  const out = bulkChanges(rows, ["r1"], { supplier_eta: "" });
  assert.equal(out.patch.i1.p1.supplier_eta, "");
});

test("the queue takes a whole bulk patch in one go", () => {
  const rows = [row({ key: "r1", itemId: "i1" }), row({ key: "r2", itemId: "i2" })];
  const { patch } = bulkChanges(rows, ["r1", "r2"], { status: "ordered" });
  const q = queuePatch({}, patch);
  assert.deepEqual(pendingItemIds(q).sort(), ["i1", "i2"]);
});

test("a bulk patch does not wipe an edit already queued for the same row", () => {
  let q = queueChange({}, "i1", "p1", { supplier_order_ref: "PO-typed" });
  const rows = [row({ key: "r1", itemId: "i1", panelKey: "p1" })];
  const { patch } = bulkChanges(rows, ["r1"], { supplier_ordered_at: "2026-03-09" });
  q = queuePatch(q, patch);
  assert.deepEqual(q.i1.p1, { supplier_order_ref: "PO-typed", supplier_ordered_at: "2026-03-09" });
});

test("each table offers only the fields where one answer is really one answer", () => {
  assert.deepEqual(bulkFieldsFor("items").map(f => f.field), ["fulfilment_method"]);
  assert.ok(bulkFieldsFor("supplierMade").some(f => f.field === "supplier_ordered_at"));
  assert.ok(bulkFieldsFor("madeInHouse").some(f => f.field === "production_stage"));
  // Per line by nature, so never offered in bulk.
  for (const key of Object.keys(BULK_FIELDS)) {
    const fields = BULK_FIELDS[key].map(f => f.field);
    assert.ok(!fields.includes("notes"), `${key} should not bulk set a note`);
  }
  assert.deepEqual(bulkFieldsFor("nonsense"), []);
});

test("it says what it did, including what it could not do", () => {
  assert.equal(bulkSummary({ applied: 24, skipped: 0 }), "24 lines updated.");
  assert.equal(bulkSummary({ applied: 1, skipped: 0 }), "1 line updated.");
  assert.match(bulkSummary({ applied: 24, skipped: 6 }), /24 lines updated, 6 skipped/);
  assert.equal(bulkSummary({ applied: 0, skipped: 0 }), "Nothing was selected.");
});

// ── Scope ────────────────────────────────────────────────────────────────────

test("all means every line in the table you are looking at", () => {
  const rows = [row({ key: "r1" }), row({ key: "r2" }), row({ key: "r3" })];
  assert.deepEqual(scopeKeys(rows, "all", { supplier_eta: "2026-03-01" }), ["r1", "r2", "r3"]);
});

test("filling the gaps leaves work somebody already did by hand alone", () => {
  // The second Monday problem: twenty eight were dated last week, two are new,
  // and stamping all thirty again would overwrite the twenty eight.
  const rows = [
    row({ key: "r1", plan: { supplier_ordered_at: "2026-03-02" } }),
    row({ key: "r2", plan: {} }),
    row({ key: "r3", plan: { supplier_ordered_at: "" } }),
  ];
  assert.deepEqual(scopeKeys(rows, "blank", { supplier_ordered_at: "2026-03-09" }), ["r2", "r3"]);
});

test("a line is skipped if ANY of the fields being set already has an answer", () => {
  const rows = [row({ key: "r1", plan: { supplier_name: "Polytec" } })];
  const changes = { supplier_name: "Laminex", supplier_order_ref: "PO-2" };
  assert.deepEqual(scopeKeys(rows, "blank", changes), [], "it would half overwrite the line");
});

test("false counts as an answer, because it is one", () => {
  // board_required: false is somebody saying no, not somebody saying nothing.
  const rows = [row({ key: "r1", plan: { board_required: false } })];
  assert.deepEqual(scopeKeys(rows, "blank", { board_required: true }), []);
});

// ── The guards only work if the row carries what they read ───────────────────

test("a row with no section on it does not silently pass the board guard", () => {
  // THE BUG THIS PINS. bulkAppliesTo reads row.section and row.fulfilmentLocked,
  // and buildOrderPlanningRows sets neither, because both are questions about
  // the ITEM rather than the panel. The screen has to decorate the rows before
  // handing them over, or every guard here answers "yes, go ahead" and the
  // count promises more than it can do.
  const bare = { key: "r1", panelKey: "p1", item: { id: "i1" }, plan: { board_required: false } };
  assert.equal(bulkAppliesTo("supplier_ordered_at", bare), true, "no section means the guard cannot fire");

  const decorated = { ...bare, section: "madeInHouse" };
  assert.equal(bulkAppliesTo("supplier_ordered_at", decorated), false, "with the section on it, it does");
});

test("the screen decorates rows with the two things the guards read", () => {
  const source = readFileSync(new URL("../app/admin/orders/[id]/OrderDetail.js", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("function bulkRowsFor("), source.indexOf("function bulkRowsFor(") + 400);
  assert.ok(fn.includes("section: sectionKey"), "the section is what turns on the board guard");
  assert.ok(fn.includes("fulfilmentLocked: isThermolaminatedItem"), "and this is what keeps a pressed front out of the count");
});

test("a table of lines that must be supplier made offers nothing to change", () => {
  // Item Planning on an all-thermolaminate order. Every row is locked, so the
  // apply is disabled rather than claiming it will change thirty lines.
  const rows = [
    row({ key: "r1", section: "items", fulfilmentLocked: true }),
    row({ key: "r2", itemId: "i2", section: "items", fulfilmentLocked: true }),
  ];
  const out = bulkChanges(rows, ["r1", "r2"], { fulfilment_method: "in_house" });
  assert.equal(out.applied, 0);
  assert.equal(out.skipped, 2);
  assert.deepEqual(out.patch, {});
});

test("the ones that can change still do, alongside the ones that cannot", () => {
  const rows = [
    row({ key: "r1", section: "items" }),
    row({ key: "r2", itemId: "i2", section: "items", fulfilmentLocked: true }),
    row({ key: "r3", itemId: "i3", section: "items" }),
  ];
  const out = bulkChanges(rows, ["r1", "r2", "r3"], { fulfilment_method: "in_house" });
  assert.equal(out.applied, 2);
  assert.equal(out.skipped, 1);
  assert.equal(out.patch.i2, undefined);
});

test("the bulk fields live behind a button, not in a panel above the table", () => {
  // Six fields nobody is using most of the time is a lot of screen to push a
  // thirty row table down the page for.
  const source = readFileSync(new URL("../app/admin/orders/[id]/OrderDetail.js", import.meta.url), "utf8");
  assert.ok(source.includes("function planBulkModal()"), "the fields should be in a modal");
  assert.ok(source.includes("function planStrip("), "and the table should carry a button, not the fields");
  assert.equal(source.includes("function planToolbar("), false, "the old inline panel is gone");
  for (const key of ["items", "supplierMade", "madeInHouse"]) {
    assert.ok(source.includes(`planStrip("${key}"`), `${key} lost its button`);
  }
});

// ── The buttons at the end of a row ──────────────────────────────────────────

/*
 * A NOTE, AN ISSUE MARK AND A MENU ARE THREE BUTTONS, NOT THREE COLUMNS.
 *
 * The two planning tables gave each of them a column of its own with a heading
 * over it, so a row ended in three narrow cells with a dash floating in the
 * middle one, and the columns people actually read lost the width. The quote
 * editor and the payments table on this same screen already group theirs into
 * one Actions cell, which is the pattern.
 */
const ORDER_DETAIL = readFileSync(new URL("../app/admin/orders/[id]/OrderDetail.js", import.meta.url), "utf8");

test("no planning table hands a button its own column", () => {
  for (const heading of ['"Notes","Issues",""', '"Notes","Issues"']) {
    assert.equal(ORDER_DETAIL.includes(heading), false, `a table still splits its buttons: ${heading}`);
  }
});

test("the buttons at the end of a row are grouped in one cell", () => {
  // The desktop tables only. The phone renders the same rows as cards, where
  // there are no columns to split in the first place, so the note button there
  // sits on its own quite correctly.
  const parts = ORDER_DETAIL.split("{panelNotesButton(row)}");
  const grouped = parts
    .slice(1)
    .filter(after => after.slice(0, 260).includes("panelIssueMark") && after.slice(0, 400).includes("ActionMenu"));
  assert.equal(grouped.length, 2, "both planning tables should put all three buttons in the one cell");

  // And each of those cells is the row's last, not one of three.
  for (const before of parts.slice(0, -1)) {
    const tail = before.slice(-260);
    if (!tail.includes("tdLast")) continue;
    assert.ok(!tail.includes('tw.td + " text-center"'), "a button still has a cell of its own");
  }
});

test("every column left in a planning table has a heading", () => {
  // A blank heading was how a button column announced itself. There are none.
  for (const table of ["Order status", "Board required"]) {
    const at = ORDER_DETAIL.indexOf(`"${table}"`);
    const header = ORDER_DETAIL.slice(at - 60, ORDER_DETAIL.indexOf("]", at) + 1);
    assert.ok(!header.includes('""'), `${table} table still has an unlabelled column`);
    assert.ok(header.includes('"Actions"'), `${table} table should end in one Actions column`);
  }
});

test("an empty planning table spans the columns it actually has", () => {
  // Merging three columns into one and leaving the colSpan behind is how an
  // empty state ends up sitting under a table that is narrower than it.
  assert.match(ORDER_DETAIL, /colSpan=\{7\}[^<]*>No supplier-made items yet/);
  assert.match(ORDER_DETAIL, /colSpan=\{8\}[^<]*>No made-in-house items yet/);
});

test("no issue mark means nothing, not a dash", () => {
  // The dash was there to stop a column of its own looking broken. There is no
  // column of its own any more, so it is a mark that means nothing.
  const fn = ORDER_DETAIL.slice(ORDER_DETAIL.indexOf("function panelIssueMark("), ORDER_DETAIL.indexOf("function panelIssueMark(") + 700);
  assert.ok(fn.includes("if (!rowIssues.length) return null;"), "an empty issue mark should render nothing");
});

// ── The save that deleted what it was meant to add ───────────────────────────

/*
 * THE REGRESSION THIS EXISTS TO STOP.
 *
 * A line was set to made in house on Item Planning, showed up on the Made In
 * House tab, and then editing any field on it wiped the assignment: the line
 * vanished from that tab and Item Planning read "not decided" again.
 *
 * The cause was one wrong property name. Line items live on the order under
 * pcd_order_line_items, and the flush looked for order.items. That is not an
 * error, it is undefined, which reads as an empty list, which reads as "this
 * item has no planning yet". The merge then had nothing to merge onto, and
 * because the endpoint REPLACES panel_planning wholesale, the save sent a blob
 * containing only the field being edited and deleted everything else on it.
 *
 * Two things guard it now: one accessor that knows the property name, and a
 * refusal to send anything at all when the item cannot be found.
 */

test("planning is merged onto what the item already has, never onto nothing", () => {
  // The endpoint replaces the whole blob, so this merge IS the save.
  const existing = { p1: { fulfilment_method: "in_house", status: "Not Ordered" } };
  const merged = mergePlanning(existing, { p1: { supplier_name: "Polytec" } });
  assert.equal(merged.p1.fulfilment_method, "in_house", "the assignment was deleted by its own save");
  assert.equal(merged.p1.status, "Not Ordered");
  assert.equal(merged.p1.supplier_name, "Polytec");
});

test("merging onto nothing is exactly the shape that caused the loss", () => {
  // Kept as a statement of the danger: this is what the wrong lookup produced,
  // and why the flush now refuses to send when the item is missing.
  const merged = mergePlanning({}, { p1: { supplier_name: "Polytec" } });
  assert.deepEqual(merged, { p1: { supplier_name: "Polytec" } });
});

test("the screen reads line items through one accessor, never off .items", () => {
  assert.ok(ORDER_DETAIL.includes("function findOrderItem(order, itemId)"), "the accessor is gone");
  assert.ok(
    ORDER_DETAIL.includes("order?.pcd_order_line_items || []"),
    "the accessor should name the real property"
  );
  // Nothing may reach for the property that does not exist.
  for (const wrong of ["orderRef.current.items", "current.items ||", "next.items ||", "order.items ||"]) {
    assert.equal(ORDER_DETAIL.includes(wrong), false, `something still reads ${wrong}`);
  }
});

test("a flush with no item behind it saves nothing at all", () => {
  // Better a visible error than a silent delete.
  const at = ORDER_DETAIL.indexOf("async function flushPlanItem");
  const fn = ORDER_DETAIL.slice(at, at + 2600);
  assert.ok(fn.includes("const item = findOrderItem(orderRef.current, itemId)"));
  assert.ok(fn.includes("if (!item) {"), "a missing item has to stop the save");
  const guard = fn.slice(fn.indexOf("if (!item) {"));
  assert.ok(guard.slice(0, 700).includes("requeue("), "the changes should go back in the queue");
  assert.ok(guard.slice(0, 700).includes("return;"), "and nothing should be sent");
  // The guard has to sit above the request, not below it.
  assert.ok(fn.indexOf("if (!item) {") < fn.indexOf("method: \"PATCH\""));
});

test("a local edit is built from the order as it stands, not from the row", () => {
  // Two edits inside one render share the row's copy of the item, so the second
  // one built from that copy would undo the first on screen.
  const at = ORDER_DETAIL.indexOf("function updatePanelPlanLocal");
  const fn = ORDER_DETAIL.slice(at, at + 900);
  assert.ok(fn.includes("findOrderItem(current, itemId)"), "it still reads the stale row copy");
  assert.equal(fn.includes("panelPlanning(item)"), false);
});
