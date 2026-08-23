// The production cut list.
//
// Every case here is something the bench would be misled by: a piece that has
// been cancelled still printing, a pending change looking like live work, or a
// value being trimmed so the material on the sheet is not the material to cut.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVariationContext,
  proposedAdditionFlag,
  proposedAdditionNote,
  variationStateForItem,
} from "../lib/pcd-cut-list-variations.js";
import { generateOrderCutListPdf } from "../lib/pcd-cabinet-pdf.js";

const ORDER = {
  id: "order-1",
  order_number: "PCD-O-2026-E7651A",
  customer_name: "Juliet Grist",
  internal_notes: "Customer collecting from the workshop.",
};

function door(overrides = {}) {
  return {
    id: overrides.id || "item-1",
    order_id: "order-1",
    title: "Door",
    product_type: "Door",
    material: "Decorative Board",
    finish: "Woodmatt",
    colour: "Florentine Walnut",
    thickness: "16mm",
    width_mm: 597,
    height_mm: 1397,
    qty: 1,
    edge_mould: "1mm Square Edge",
    fulfilment_method: "in_house",
    ...overrides,
  };
}

const APPLIED = {
  id: "var-applied",
  variation_number: "PCD-V-2026-5051F3",
  status: "applied",
  applied_at: "2026-08-12T02:00:00.000Z",
};

const PENDING = {
  id: "var-pending",
  variation_number: "PCD-V-2026-6120B2",
  status: "sent",
  sent_at: "2026-08-14T02:00:00.000Z",
};

test("a line an applied variation removed never reaches the sheet", () => {
  const items = [
    door({ id: "keep" }),
    door({ id: "gone", variation_status: "removed", variation_id: APPLIED.id }),
  ];
  const pdf = generateOrderCutListPdf({ order: ORDER, items, variations: [APPLIED], variationLines: [] });
  // Two live rows would have been cut; only one is.
  assert.ok(pdf.length > 0);
  const text = pdf.toString("latin1");
  assert.match(text, /1 rows to cut/);
});

test("an applied change is live work, and says what it was", () => {
  const item = door({ id: "changed", variation_status: "changed", variation_id: APPLIED.id, height_mm: 747, width_mm: 347 });
  const context = buildVariationContext({
    variations: [APPLIED],
    variationLines: [{
      id: "line-1",
      variation_id: APPLIED.id,
      order_line_item_id: "changed",
      action: "change",
      original_item_snapshot: { width_mm: 347, height_mm: 697, material: "Decorative Board", colour: "Florentine Walnut", qty: 1 },
    }],
  });
  const state = variationStateForItem(item, context);
  assert.equal(state.state, "approved");
  assert.match(state.flag, /Changed/);
  assert.match(state.note.body, /697 x 347mm/);
  assert.match(state.note.body, /Cut to the specification on this row/);
});

test("a pending change is held, never counted as live work", () => {
  const item = door({ id: "held" });
  const context = buildVariationContext({
    variations: [PENDING],
    variationLines: [{
      id: "line-2",
      variation_id: PENDING.id,
      order_line_item_id: "held",
      action: "change",
      colour: "Sepia Oak",
      material: "Decorative Board",
      width_mm: 397,
      height_mm: 1397,
      qty: 2,
    }],
  });
  const state = variationStateForItem(item, context);
  assert.equal(state.state, "hold");
  assert.match(state.note.body, /Do not cut until the variation is approved/);
  assert.match(state.note.body, /Sepia Oak/);
});

test("a pending removal is held rather than dropped", () => {
  // Dropping it early would be cutting the customer's decision for them: the
  // variation can still be declined.
  const item = door({ id: "maybe-gone" });
  const context = buildVariationContext({
    variations: [PENDING],
    variationLines: [{ id: "line-3", variation_id: PENDING.id, order_line_item_id: "maybe-gone", action: "remove" }],
  });
  const state = variationStateForItem(item, context);
  assert.equal(state.state, "removal");
  assert.match(state.note.body, /Hold until the variation is approved or declined/);
});

test("a pending variation outranks an applied one on the same line", () => {
  const item = door({ id: "both", variation_status: "changed", variation_id: APPLIED.id });
  const context = buildVariationContext({
    variations: [APPLIED, PENDING],
    variationLines: [
      { id: "a", variation_id: APPLIED.id, order_line_item_id: "both", action: "change" },
      { id: "b", variation_id: PENDING.id, order_line_item_id: "both", action: "change", width_mm: 400, height_mm: 700 },
    ],
  });
  assert.equal(variationStateForItem(item, context).state, "hold");
});

test("a piece proposed by a pending variation prints as a row, but is not counted", () => {
  // It has to be a row: a piece described only in a footnote is a piece nobody
  // reads. It must not reach the count, because it is not cuttable work.
  const context = buildVariationContext({
    variations: [PENDING],
    variationLines: [{
      id: "line-4",
      variation_id: PENDING.id,
      action: "add",
      title: "Door",
      width_mm: 497,
      height_mm: 747,
      qty: 1,
      material: "Decorative Board",
      colour: "Florentine Walnut",
    }],
  });
  assert.equal(context.proposedAdditions.length, 1);
  assert.match(proposedAdditionFlag(PENDING), /Proposed, PCD-V-2026-6120B2/);
  assert.match(proposedAdditionNote(PENDING).body, /Not part of the cut count/);

  const pdf = generateOrderCutListPdf({
    order: ORDER,
    items: [door({ id: "only" })],
    variations: [PENDING],
    variationLines: [{
      id: "line-4", variation_id: PENDING.id, action: "add", title: "Door",
      width_mm: 497, height_mm: 747, qty: 1, material: "Decorative Board", colour: "Florentine Walnut",
    }],
  });
  const text = pdf.toString("latin1");

  // One cuttable row in the count, the proposed piece on the sheet as a row
  // with its own size and flag, and the summary saying it is not counted.
  assert.match(text, /1 rows to cut/);
  assert.match(text, /747mm x 497mm/);
  assert.match(text, /Proposed, PCD-V-2026-6120B2/);
  assert.match(text, /1 proposed piece listed at the end, not counted/);

  // And no grouped block heading: it is a row like every other row.
  assert.ok(!/Proposed on a pending variation, not part of the cut count/.test(text));
});

test("a rejected variation is not shown to the bench at all", () => {
  const item = door({ id: "clean" });
  const context = buildVariationContext({
    variations: [{ id: "var-dead", variation_number: "PCD-V-2026-9999", status: "rejected" }],
    variationLines: [{ id: "line-5", variation_id: "var-dead", order_line_item_id: "clean", action: "change" }],
  });
  assert.equal(variationStateForItem(item, context), null);
});

test("made to order items get their own page, and the notes page is always last", () => {
  const items = [
    door({ id: "in-house" }),
    door({ id: "supplier", material: "Thermolaminate", fulfilment_method: "supplier_ready_made", status: "Ordered" }),
  ];
  const pdf = generateOrderCutListPdf({ order: ORDER, items, variations: [], variationLines: [] });
  const text = pdf.toString("latin1");

  // One cut page, one made to order page, one notes page.
  assert.equal((text.match(/\/Type \/Page[^s]/g) || []).length, 3);
  assert.match(text, /Made to order items/);
  assert.match(text, /Page 3 of 3/);
});

test("the notes page carries the order and customer so it cannot be orphaned", () => {
  const pdf = generateOrderCutListPdf({
    order: ORDER,
    items: [door()],
    variations: [],
    variationLines: [],
  });
  const text = pdf.toString("latin1");
  assert.match(text, /Notes/);
  assert.match(text, /Customer collecting from the workshop/);
  // The header on every page names the order and the customer.
  assert.ok((text.match(/Juliet Grist/g) || []).length >= 3);
});

test("a note reads as one sentence in two weights", () => {
  // Which variation and where it is up to is the fact, so it is bold. What it
  // means for the piece follows in regular. Both have to reach the page, and
  // the bold half must actually be drawn bold.
  const state = variationStateForItem(
    door({ id: "held" }),
    buildVariationContext({
      variations: [PENDING],
      variationLines: [{ id: "l", variation_id: PENDING.id, order_line_item_id: "held", action: "change", colour: "Sepia Oak" }],
    })
  );
  assert.match(state.note.lead, /^Pending variation PCD-V-2026-6120B2, sent /);
  assert.ok(!state.note.body.includes(state.note.lead), "the lead is not repeated in the body");

  const pdf = generateOrderCutListPdf({
    order: ORDER,
    items: [door({ id: "held" })],
    variations: [PENDING],
    variationLines: [{ id: "l", variation_id: PENDING.id, order_line_item_id: "held", action: "change", colour: "Sepia Oak" }],
  });
  const text = pdf.toString("latin1");
  // F2 is the bold font, F1 the regular one. The lead is drawn bold and the
  // body picks up straight after it in regular, on the same line.
  assert.match(text, /\/F2 7 Tf[^)]*\(Pending variation/);
  assert.match(text, /\/F1 7 Tf[^)]*\(Proposed:/);
});

test("hold is hatched with thin diagonals, approved is a solid edge", () => {
  // The pattern is what separates them on a black and white print. Diagonals
  // are drawn as clipped strokes; a solid edge is a filled rectangle.
  const pdf = generateOrderCutListPdf({
    order: ORDER,
    items: [door({ id: "held" })],
    variations: [PENDING],
    variationLines: [{ id: "l", variation_id: PENDING.id, order_line_item_id: "held", action: "change" }],
  });
  const text = pdf.toString("latin1");
  assert.match(text, /re W n/, "the hatching is clipped to the edge strip");
  // A diagonal moves in both axes between m and l; a horizontal bar does not.
  const diagonals = (text.match(/(\d+\.\d+) (\d+\.\d+) m (\d+\.\d+) (\d+\.\d+) l S/g) || []).filter((segment) => {
    const [, x1, y1, x2, y2] = segment.match(/(\d+\.\d+) (\d+\.\d+) m (\d+\.\d+) (\d+\.\d+) l S/);
    return x1 !== x2 && y1 !== y2;
  });
  assert.ok(diagonals.length > 3, "hold rows are hatched with diagonals");
});

test("an order with nothing on it fails loudly rather than printing an empty sheet", () => {
  assert.throws(
    () => generateOrderCutListPdf({ order: ORDER, items: [], variations: [], variationLines: [] }),
    /No cut list or made to order rows/
  );
});
