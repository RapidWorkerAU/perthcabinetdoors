// A quote stops being editable once it becomes an order.
//
// Every case here is a way an order's committed work could be changed without a
// variation, or a way the workshop could be handed a sheet with no panels on
// it. Both have happened: a real order printed two cabinets as single rows
// because the configs their panels came from had been deleted from the quote.
import test from "node:test";
import assert from "node:assert/strict";
import { assertQuoteEditable, orderForQuote, unconfiguredCabinets } from "../lib/pcd-quote-lock.js";

// The lock now asks two questions, so the stub has to answer both: has this
// quote become an order, and is it currently sitting with a customer.
function fakeSupabase(order, quoteStatus = "draft") {
  return {
    from(table) {
      const row = table === "pcd_orders" ? order : { status: quoteStatus };
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
        }),
      };
    },
  };
}

test("a draft quote with no order is editable", async () => {
  await assertQuoteEditable(fakeSupabase(null, "draft"), "quote-1");
});

// The customer said no, so there is nothing of theirs left to protect and the
// next version is a new proposal.
test("a rejected quote is editable again", async () => {
  await assertQuoteEditable(fakeSupabase(null, "rejected"), "quote-1");
});

// The fault this closed: a sent quote was as editable as a draft, so a customer
// could approve a version that had changed since they read it.
["sent", "viewed"].forEach((status) => {
  test(`a ${status} quote is sealed while the customer holds it`, async () => {
    await assert.rejects(
      () => assertQuoteEditable(fakeSupabase(null, status), "quote-1"),
      (error) => {
        assert.equal(error.status, 409, "a rule, not a crash");
        assert.equal(error.lockState, "sealed");
        assert.equal(error.canOverride, true, "the screen has to know it can offer the override");
        assert.match(error.message, /admin override/i, "and the message has to say the way through");
        return true;
      }
    );
  });
});

// A status nobody anticipated must not be a way past the rule.
test("an unrecognised status is treated as sealed, not open", async () => {
  await assert.rejects(() => assertQuoteEditable(fakeSupabase(null, "awaiting_something_new"), "quote-1"));
});

test("a quote behind an order is refused, and the message names the order", async () => {
  // Naming it matters: the person is being told where to go instead, which is
  // the variation pathway on that order.
  const db = fakeSupabase({ id: "order-1", order_number: "PCD-O-2026-E7651A" });
  await assert.rejects(
    () => assertQuoteEditable(db, "quote-1"),
    (error) => {
      assert.match(error.message, /PCD-O-2026-E7651A/);
      assert.match(error.message, /raise a variation/i);
      assert.equal(error.status, 409, "a conflict, not a server error");
      return true;
    }
  );
});

test("the order table is the authority, not the quote's own pointer", async () => {
  // An order can exist while the quote's order_id write failed. Trusting the
  // pointer would leave that quote editable behind a live order.
  const db = fakeSupabase({ id: "order-2", order_number: "PCD-O-2026-AAA" });
  const order = await orderForQuote(db, "quote-with-no-pointer");
  assert.equal(order.id, "order-2");
});

test("a quote id of nothing is not treated as a locked quote", async () => {
  assert.equal(await orderForQuote(fakeSupabase(null), null), null);
});

// ── cabinets with no panels ─────────────────────────────────────────────────

const cabinet = (id, name) => ({ id, product_type: "base_cabinet", product_name: name });

test("a cabinet with a cut list is fine", () => {
  const configs = new Map([["c1", { calculated_cut_list: [{ label: "Left side panel" }] }]]);
  assert.deepEqual(unconfiguredCabinets([cabinet("c1", "Oven cabinet")], configs), []);
});

test("a cabinet with no config at all is caught", () => {
  // This is the exact state that printed a cabinet as one row: base cabinet
  // line, no config row, so no panels for the workshop.
  assert.deepEqual(
    unconfiguredCabinets([cabinet("c1", "Base cabinet")], new Map()),
    ["Base cabinet"]
  );
});

test("a cabinet with a config but an empty cut list is caught too", () => {
  // Configured enough to have a row, not enough to cut from.
  const configs = new Map([["c1", { calculated_cut_list: [] }]]);
  assert.deepEqual(unconfiguredCabinets([cabinet("c1", "Base cabinet")], configs), ["Base cabinet"]);
});

test("doors and panels are not cabinets and are never flagged", () => {
  const lines = [
    { id: "d1", product_type: "Door", product_name: "Door" },
    { id: "p1", product_type: "Panel", product_name: "Panel" },
  ];
  assert.deepEqual(unconfiguredCabinets(lines, new Map()), []);
});

test("every unconfigured cabinet is named, not just the first", () => {
  // The message is a to-do list, so it has to be complete or someone fixes one
  // and hits the same wall again.
  const lines = [cabinet("c1", "Oven cabinet"), cabinet("c2", "Tall cabinet")];
  assert.deepEqual(unconfiguredCabinets(lines, new Map()), ["Oven cabinet", "Tall cabinet"]);
});
