// ASK ALFRED: CHANGES, BATCHES AND THE SHARED SAVES.
//
// ── WHAT THIS PROTECTS (Ashleigh, 2026-10-06) ────────────────────────────────
//
//   HIGHLY REGIMENTED. Alfred only proposes. The value and the items are picked
//   from buttons built out of the real order, every change is shown as from and
//   to, and it is applied only when a person approves it by name.
//
//   ONLY WHAT IS ALLOWED. Planning, Active and On hold, the two dates, and notes
//   that are only ever added to. Never complete, cancel, archive, money,
//   suppliers' names or what the customer agreed to.
//
//   NOTHING MOVED UNDERNEATH. If a panel no longer holds what the preview
//   showed, nothing is saved.
//
//   ONE SAVE. Alfred saves through the order page's own code.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyChange,
  CHANGE_FIELDS,
  CHANGEABLE_ORDER_STATUSES,
  itemChoices,
  noteLine,
  panelState,
  previewChange,
  valueProblem,
} from "../lib/pcd-alfred-changes.js";
import { checkAsk } from "../lib/pcd-alfred-ask.js";
import { panelKeyFor, panelsOfItem } from "../lib/pcd-order-panel-keys.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const door = { id: "11111111-1111-1111-1111-111111111111", sort_order: 0, product_type: "Door", qty: 4, material: "Decorative board", colour: "Snow", height_mm: 720, width_mm: 450, fulfilment_method: "supplier_ready_made", status: "Not Ordered" };
const thermo = { id: "22222222-2222-2222-2222-222222222222", sort_order: 1, product_type: "Door", qty: 2, material: "Thermolaminate", colour: "Oak", height_mm: 720, width_mm: 450 };
const panel = { id: "33333333-3333-3333-3333-333333333333", sort_order: 2, product_type: "Panel", qty: 1, material: "Decorative board", colour: "Snow", fulfilment_method: "in_house", production_stage: "Cutting" };
const order = { id: "o1", order_number: "PCD-1042", status: "active", customer_name: "Sarah Nguyen", pcd_order_line_items: [door, thermo, panel] };

/** Reads only: every from() returns the fixture rows for that table, and any write fails the test. */
function fakeSupabase(fixtures) {
  const client = {
    from(table) {
      const rows = fixtures[table] || [];
      const done = { then: (r) => r({ data: rows, error: null }), maybeSingle: async () => ({ data: rows[0] || null }), single: async () => ({ data: rows[0] || null }) };
      return new Proxy(
        {},
        {
          get: (_, k) =>
            k in done
              ? done[k]
              : () => {
                  if (["insert", "update", "upsert", "delete"].includes(k)) throw new Error(`wrote to ${table}`);
                  return client.from(table);
                },
        }
      );
    },
  };
  return client;
}

test("the allowed changes are exactly the ones agreed", () => {
  assert.deepEqual(Object.keys(CHANGE_FIELDS).sort(), [
    "board_required",
    "fulfilment",
    "note",
    "order_status",
    "production_stage",
    "scheduled_start_date",
    "supplier_eta",
    "supplier_order_ref",
    "supplier_ordered_at",
    "supplier_status",
    "target_completion_date",
  ]);
  // Complete added 2026-10-06. Cancel and archive stay with a person.
  assert.deepEqual(CHANGE_FIELDS.order_status.values.map((v) => v.value), ["active", "on_hold", "complete"], "never cancel or archive");
  assert.deepEqual(CHANGEABLE_ORDER_STATUSES, ["pending_deposit", "active", "on_hold"]);
  assert.equal(CHANGE_FIELDS.supplier_name, undefined, "a supplier's name is never Alfred's to change");
});

test("a value must be one the order page offers", () => {
  assert.equal(valueProblem("supplier_status", "Ordered"), "");
  assert.match(valueProblem("supplier_status", "Shipped"), /^Pick one of: Not Ordered/);
  assert.equal(valueProblem("order_status", "complete"), "");
  assert.match(valueProblem("order_status", "cancelled"), /Active, On hold, Complete/);
  assert.match(valueProblem("order_status", "archived"), /Pick one of/);
  assert.equal(valueProblem("supplier_eta", "2026-10-20"), "");
  assert.equal(valueProblem("supplier_eta", "next Tuesday"), "Pick a date.");
  assert.equal(valueProblem("note", "  "), "Write the note.");
});

test("each item is offered only for the changes that fit who makes it", () => {
  const status = itemChoices(order, "supplier_status");
  assert.equal(status[0].eligiblePanels, 1);
  assert.equal(status[0].now, "Not Ordered");
  assert.equal(status[1].eligiblePanels, 1, "thermolaminate is always supplier made");
  assert.equal(status[2].eligiblePanels, 0);
  assert.match(status[2].notEligible, /Only supplier made items/);
  const who = itemChoices(order, "fulfilment");
  assert.equal(who[1].eligiblePanels, 0, "thermolaminate cannot be moved in house");
  const stage = itemChoices(order, "production_stage");
  assert.equal(stage[2].now, "Cutting");
  assert.match(status[0].label, /^Line 1: 4 x /);
});

test("panels are read the way the order page reads them, and keyed the same way", () => {
  const key = panelKeyFor("line", "x");
  assert.equal(panelState({ status: "Ordered", panel_planning: { [key]: { status: "Received" } } }, key).status, "Received");
  assert.equal(panelState({}, key).status, "Not Ordered");
  assert.equal(panelState({}, key).fulfilment, "", "undecided reads as undecided");
  const cabinet = { id: "c", qty: 2, product_type: "base_cabinet", cabinet_config: { calculated_cut_list: [{ label: "Side Panel", qty: 2 }] } };
  assert.deepEqual(
    panelsOfItem(cabinet).map((p) => p.panelKey),
    ["cabinet:0:side-panel:0", "cabinet:0:side-panel:1", "cabinet:1:side-panel:0", "cabinet:1:side-panel:1"]
  );
  const page = read("app/admin/orders/[id]/OrderDetail.js");
  assert.ok(page.includes('import { panelKeyFor } from "../../../../lib/pcd-order-panel-keys"'));
  assert.ok(!page.includes("function panelKeyFor"));
});

test("the preview shows every panel's from and to, and skips what already holds it", async () => {
  const supabase = fakeSupabase({ pcd_orders: [order] });
  const preview = await previewChange(supabase, { field: "supplier_status", recordId: "o1", value: "Ordered", itemIds: [door.id, thermo.id, panel.id] });
  assert.deepEqual(
    preview.rows.map((r) => [r.label, r.from, r.to]),
    [
      ["Line 1", "Not Ordered", "Ordered"],
      ["Line 2", "Not Ordered", "Ordered"],
    ]
  );
  const same = await previewChange(supabase, { field: "supplier_status", recordId: "o1", value: "Not Ordered", itemIds: [door.id] });
  assert.equal(same.nothing, true);
  await assert.rejects(previewChange(supabase, { field: "supplier_status", recordId: "o1", value: "Ordered", itemIds: [] }), /Pick at least one item/);
  await assert.rejects(
    previewChange(fakeSupabase({ pcd_orders: [{ ...order, status: "complete" }] }), { field: "supplier_status", recordId: "o1", value: "Ordered", itemIds: [door.id] }),
    /can no longer be changed/
  );
});

test("if anything moved since the preview, nothing is saved", async () => {
  const supabase = fakeSupabase({ pcd_orders: [order] });
  const selection = { field: "supplier_status", recordId: "o1", value: "Ordered", itemIds: [door.id] };
  const stale = [{ itemId: door.id, panelKey: panelKeyFor("line", door.id), fromRaw: "Received" }];
  await assert.rejects(applyChange(supabase, selection, stale, { approvedBy: "Ashleigh" }), /changed since you reviewed this/);
  await assert.rejects(applyChange(supabase, selection, [], { approvedBy: "" }), /Choose who is approving/);
});

test("Alfred saves through the order page's own code, by name", () => {
  const changes = read("lib/pcd-alfred-changes.js");
  assert.ok(changes.includes('saveOrderItem(supabase, selection.recordId, itemId, { panel_planning_changes: changes }, { actorType: "alfred", approvedBy })'));
  assert.ok(changes.includes("saveOrderHeader("));
  assert.doesNotMatch(changes, /from\("pcd_order_line_items"\)[\s\S]{0,80}\.update\(/, "never writes order lines directly");
  assert.ok(read("app/api/admin/orders/[id]/items/[itemId]/route.js").includes('saveOrderItem(context.supabase, id, itemId, payload, { actorType: "admin" })'));
  assert.ok(read("app/api/admin/orders/[id]/route.js").includes('saveOrderHeader(context.supabase, id, payload, { actorType: "admin" })'));
});

test("notes are only ever added to, dated and named", () => {
  assert.equal(noteLine("Rang about the ETA — all fine", "Jason", new Date("2026-10-06T02:00:00Z")), "6 Oct 2026, Jason via Alfred: Rang about the ETA, all fine");
  assert.ok(read("lib/pcd-alfred-changes.js").includes("const notes = record.notes ? `${record.notes}\\n${line}` : line;"));
});

test("a proposed change needs a record and items Alfred actually looked up", () => {
  const seen = new Set(["o1", door.id]);
  const raw = (change) => ({
    kind: "change",
    text: "Mark them ordered.",
    facts_used: [],
    change: { field: "supplier_status", record_type: "order", record_id: "o1", value: "Ordered", item_ids: [door.id, "made-up"], all_items: false, ...change },
  });
  const ok = checkAsk(raw(), { seen });
  assert.deepEqual(ok.result.proposal.itemIds, [door.id], "an item id it never saw is dropped");
  assert.equal(checkAsk(raw({ all_items: true }), { seen }).result.proposal.itemIds, "all");
  assert.match(checkAsk(raw({ record_id: "o9" }), { seen }).problem, /without looking the record up/);
  assert.match(checkAsk(raw({ field: "supplier_name" }), { seen }).problem, /not allowed/);
});

test("a batch is at most 20 customers Alfred looked up, and only drafts", () => {
  const seen = new Set(Array.from({ length: 25 }, (_, i) => `c${i}`));
  const raw = (ids) => ({ kind: "batch", text: "I will email them.", facts_used: [], batch: { customer_ids: ids, instruction: "Say the paint shop is running a week behind." } });
  assert.equal(checkAsk(raw(["c1", "c2"]), { seen }).ok, true);
  assert.match(checkAsk(raw(["c1", "nobody"]), { seen }).problem, /never looked up/);
  assert.match(checkAsk(raw(Array.from({ length: 21 }, (_, i) => `c${i}`)), { seen }).problem, /at most 20/);
  const ask = read("lib/pcd-alfred-ask.js");
  const batch = ask.slice(ask.indexOf("export async function draftBatch"), ask.indexOf("export async function changeCard"));
  assert.doesNotMatch(batch, /approveDraft|sendDeskReply/, "a batch never sends");
});

test("the change buttons are built from the database, never from the model", () => {
  const route = read("app/api/admin/alfred/ask/route.js");
  assert.ok(route.includes("const built = await changeCard(supabase, reply.proposal);"));
  assert.ok(route.includes("delete reply.proposal;"));
});

test("completing shows what is owing and unfinished first, as figures", async () => {
  const supabase = fakeSupabase({ pcd_orders: [{ ...order, total_inc_gst: 4200 }], pcd_order_payments: [{ order_id: "o1", amount: 2100, is_paid: true }] });
  const preview = await previewChange(supabase, { field: "order_status", recordId: "o1", value: "complete" });
  assert.deepEqual(preview.rows.map((r) => [r.from, r.to]), [["Active", "Complete"]]);
  assert.equal(preview.notes[0], "$2,100.00 is still owing on this order.");
  assert.match(preview.notes[1], /^3 of 3 panels are not yet marked made, checked or installed\.$/);
  assert.match(preview.notes[2], /Google review request/);
  for (const note of preview.notes) assert.doesNotMatch(note, /should|ready to|safe to/i, "figures, never a verdict");
  await assert.rejects(
    previewChange(fakeSupabase({ pcd_orders: [{ ...order, status: "pending_deposit" }] }), { field: "order_status", recordId: "o1", value: "complete" }),
    /awaiting its deposit/
  );
});

test("completing through Alfred lines up the review request exactly as the order page does", () => {
  const changes = read("lib/pcd-alfred-changes.js");
  assert.ok(changes.includes('await reviewRequestOnTimeline(supabase, order.id, saved.beforeOrder, saved.updates, { actorType: "alfred", approvedBy });'));
  assert.ok(read("app/api/admin/orders/[id]/route.js").includes('reviewRequestOnTimeline(context.supabase, id, beforeOrder, updates, { actorType: "admin" })'));
  assert.match(read("lib/pcd-order-header-save.js"), /action_type: isComplete \? "review_request_lined_up" : "review_request_taken_down"/);
});
