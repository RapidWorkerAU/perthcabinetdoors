// ACCEPTING A QUOTE MUST NEVER FAIL BECAUSE A MIGRATION HAS NOT BEEN RUN.
//
// createOrderFromQuote runs at the moment a customer approves. If it throws, the
// approval has been taken and no order exists to make: the customer believes the
// work is under way and there is nothing on our side that says so. It is the
// worst failure in the system, and the one most easily caused by something as
// ordinary as deploying before running a migration.
//
// The order line copy now carries five columns that only exist after
// 202608211200. This proves that a database without them still raises the order,
// loses only those five fields, and says so where somebody will see it.
//
// Written against a stub client rather than by reading the source, because what
// matters here is what actually happens on the failing path, and that path only
// ever runs when something has already gone wrong.

import test from "node:test";
import assert from "node:assert/strict";

import { createOrderFromQuote } from "../lib/pcd-order-from-quote.js";

const QUOTE = {
  id: "quote-1",
  quote_number: "PCD-Q-2026-0001",
  customer_id: "cust-1",
  customer_name: "A customer",
  subtotal_ex_gst: 100,
  gst_amount: 10,
  total_inc_gst: 110,
};

const QUOTE_LINES = [
  {
    id: "ql-1",
    sort_order: 0,
    product_name: "Door",
    product_type: "Door",
    material: "Decorative Board",
    thickness: "18mm",
    colour: "Boston Oak",
    supplier_name: "Polytec",
    hinge_holes: true,
    hinge_qty: "2 hinges",
    unit_cost_source_id: "lib-1",
    unit_cost_source_label: "Polytec - Boston Oak",
    qty: 1,
    line_total_ex_gst: 100,
  },
];

/**
 * The smallest Supabase stand-in that createOrderFromQuote can run against.
 *
 * `missingColumns` names columns this pretend database does not have; inserting
 * them comes back as the PGRST204 PostgREST really returns.
 */
function stubSupabase({ missingColumns = [] } = {}) {
  const inserted = { pcd_order_line_items: [] };

  const rejectsFor = (rows) => {
    const offending = missingColumns.find((column) => rows.some((row) => column in row));
    if (!offending) return null;
    return { code: "PGRST204", message: `Could not find the '${offending}' column of 'pcd_order_line_items' in the schema cache` };
  };

  const from = (table) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      in: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: { id: "order-1", order_number: "PCD-O-2026-AAAAAA" }, error: null }),
      update: () => chain,
      then: undefined,
    };

    if (table === "pcd_quote_line_items") {
      chain.order = () => Promise.resolve({ data: QUOTE_LINES, error: null });
    }

    chain.insert = (rows) => {
      const list = Array.isArray(rows) ? rows : [rows];
      if (table === "pcd_order_line_items") {
        const error = rejectsFor(list);
        if (error) return Promise.resolve({ data: null, error });
        inserted.pcd_order_line_items.push(...list);
        return Promise.resolve({ data: list, error: null });
      }
      return chain;
    };

    return chain;
  };

  return { client: { from }, inserted };
}

// Quiet the deliberate console.error so the run stays readable, and hand back
// what it said so the test can check it is worth reading.
async function captureErrors(run) {
  const said = [];
  const original = console.error;
  console.error = (...args) => said.push(args.join(" "));
  try {
    return { result: await run(), said };
  } finally {
    console.error = original;
  }
}

test("a database with every column raises the order and carries the spec", async () => {
  const { client, inserted } = stubSupabase();
  const orderId = await createOrderFromQuote(client, QUOTE);
  assert.equal(orderId, "order-1");

  const [line] = inserted.pcd_order_line_items;
  assert.equal(line.supplier_name, "Polytec", "the brand the quote recorded");
  assert.equal(line.hinge_holes, true);
  assert.equal(line.hinge_qty, "2 hinges");
  assert.equal(line.unit_cost_source_id, "lib-1");
});

test("a database missing the new columns still raises the order", async () => {
  const { client, inserted } = stubSupabase({ missingColumns: ["hinge_holes"] });
  const { result: orderId } = await captureErrors(() => createOrderFromQuote(client, QUOTE));

  assert.equal(orderId, "order-1", "the customer accepted, so an order has to exist");
  assert.equal(inserted.pcd_order_line_items.length, 1, "the line still has to be written");
  assert.equal("hinge_holes" in inserted.pcd_order_line_items[0], false, "the missing column is dropped, not sent again");
  assert.equal(
    inserted.pcd_order_line_items[0].material,
    "Decorative Board",
    "everything the database DOES have still has to arrive"
  );
});

test("dropping the columns is said out loud, naming the migration to run", async () => {
  const { client } = stubSupabase({ missingColumns: ["supplier_name"] });
  const { said } = await captureErrors(() => createOrderFromQuote(client, QUOTE));

  assert.equal(said.length, 1, "it has to say something, once");
  assert.match(said[0], /202608211200/, "and name the migration that fixes it");
  assert.match(said[0], /PCD-O-2026-AAAAAA/, "and which order is affected, so it can be backfilled");
});

// The fallback is only for a missing column. Anything else is a real fault and
// swallowing it would raise an order with no lines on it at all, which reads on
// every screen as an order with nothing to make.
test("a real database failure is still a failure", async () => {
  const { client } = stubSupabase();
  const brokenFrom = client.from;
  client.from = (table) => {
    if (table !== "pcd_order_line_items") return brokenFrom(table);
    return { insert: () => Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key value" } }) };
  };

  // Caught by hand rather than with assert.rejects: what PostgREST rejects with
  // is a plain object, not an Error, and matching a regex against one of those
  // compares "[object Object]" and passes for the wrong reason.
  let thrown = null;
  try {
    await createOrderFromQuote(client, QUOTE);
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, "a genuine write failure must not be mistaken for a missing column and swallowed");
  assert.equal(thrown.code, "23505", "and it has to come back as itself, not as something else");
});
