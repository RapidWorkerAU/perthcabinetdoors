// Job costs on a variation.
//
// A variation could add, change and remove items but could not touch labour,
// travel, delivery, consumables, painting, glass or removal, so a job that grew
// by two hours on site had nowhere to put them.
//
// The chosen design shows the customer what each cost IS NOW and what it
// BECOMES. That is only honest while three things keep happening:
//
//   1. an accepted quote copies its costs onto the order
//   2. an applied variation writes the revised figure back to the order
//   3. a new variation reads "currently" from the order, not from the quote
//
// Break any one of them and the "currently" figure drifts further from the truth
// with every variation while still looking authoritative, which is worse than
// showing nothing. Most of what is below guards that chain.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  JOB_COST_ACTION,
  JOB_COST_KEYS,
  JOB_COST_TYPES,
  jobCostChangeLabel,
  jobCostType,
  orderCostColumnsFromQuote,
  orderJobCostAmount,
  orderLabourParts,
  orderPatchForJobCostLine,
} from "../lib/pcd-order-costs.js";
import {
  applyAcceptedVariation,
  calculateVariationTotals,
  variationLineDelta,
  VARIATION_LINE_ACTIONS,
} from "../lib/pcd-order-variations.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ORDER = {
  id: "order-1",
  labour_hours: 42,
  worker_hourly_rate: 85,
  travel_cost_ex_gst: 180,
  delivery_cost_ex_gst: 260,
  installation_cost_ex_gst: 1850,
  painting_cost_ex_gst: 0,
  glass_cost_ex_gst: 0,
  removal_cost_ex_gst: 340,
  subtotal_ex_gst: 15340,
  gst_amount: 1534,
  total_inc_gst: 16874,
};

// ── the delta rule ───────────────────────────────────────────────────────────

test("a job cost charges the difference, not the whole revised figure", () => {
  // Labour going from $3,570 to $4,080 costs the customer $510, not $4,080.
  const line = { action: JOB_COST_ACTION, original_line_total_ex_gst: 3570, proposed_line_total_ex_gst: 4080 };
  assert.equal(variationLineDelta(line), 510);
});

test("a job cost that goes down credits the customer", () => {
  const line = { action: JOB_COST_ACTION, original_line_total_ex_gst: 340, proposed_line_total_ex_gst: 0 };
  assert.equal(variationLineDelta(line), -340);
});

test("a job cost revised to the same figure changes nothing", () => {
  const line = { action: JOB_COST_ACTION, original_line_total_ex_gst: 260, proposed_line_total_ex_gst: 260 };
  assert.equal(variationLineDelta(line), 0);
});

test("job costs and item changes add up together", () => {
  const lines = [
    { action: "add", proposed_line_total_ex_gst: 286 },
    { action: "change", original_line_total_ex_gst: 92, proposed_line_total_ex_gst: 118 },
    { action: "remove", original_line_total_ex_gst: 140 },
    { action: JOB_COST_ACTION, original_line_total_ex_gst: 3570, proposed_line_total_ex_gst: 4080 },
  ];
  const totals = calculateVariationTotals(lines, 0.1);
  assert.equal(totals.subtotal_ex_gst, 682); // 286 + 26 - 140 + 510
  assert.equal(totals.gst_amount, 68.2);
  assert.equal(totals.total_inc_gst, 750.2);
});

test("job_cost is an allowed line action", () => {
  assert.ok(VARIATION_LINE_ACTIONS.includes(JOB_COST_ACTION));
});

// ── reading "currently" off the order ────────────────────────────────────────

test("labour is derived from hours and rate, so the two can never disagree", () => {
  assert.equal(orderJobCostAmount(ORDER, "labour"), 3570);
  const parts = orderLabourParts(ORDER);
  assert.equal(parts.hours, 42);
  assert.equal(parts.rate, 85);
});

test("every other cost reads its own column", () => {
  assert.equal(orderJobCostAmount(ORDER, "travel"), 180);
  assert.equal(orderJobCostAmount(ORDER, "delivery"), 260);
  assert.equal(orderJobCostAmount(ORDER, "consumables"), 1850);
  assert.equal(orderJobCostAmount(ORDER, "removal"), 340);
});

test("consumables reads the installation column, matching the quote", () => {
  // The column is installation_cost_ex_gst everywhere; the label has always been
  // Consumables. Getting this pair wrong would silently price the wrong cost.
  assert.equal(jobCostType("consumables").orderField, "installation_cost_ex_gst");
});

test("a cost that is zero reads as zero, not as missing", () => {
  assert.equal(orderJobCostAmount(ORDER, "glass"), 0);
});

test("an order with no breakdown yet reads as zero rather than throwing", () => {
  assert.equal(orderJobCostAmount({}, "labour"), 0);
  assert.equal(orderJobCostAmount(null, "travel"), 0);
});

// ── writing the revised figure back ──────────────────────────────────────────

test("an applied labour line writes the hours and the rate, not the money", () => {
  // The money is derived from these two wherever it is read, so storing it as
  // well would give it a second source that can drift.
  const patch = orderPatchForJobCostLine({
    action: JOB_COST_ACTION, cost_type: "labour", qty: 48, product_unit_cost_ex_gst: 85,
    proposed_line_total_ex_gst: 4080,
  });
  assert.deepEqual(patch, { labour_hours: 48, worker_hourly_rate: 85 });
});

test("an applied flat cost writes its own money column", () => {
  const patch = orderPatchForJobCostLine({
    action: JOB_COST_ACTION, cost_type: "consumables", proposed_line_total_ex_gst: 2070,
  });
  assert.deepEqual(patch, { installation_cost_ex_gst: 2070 });
});

test("a line with no cost type writes nothing rather than guessing", () => {
  assert.equal(orderPatchForJobCostLine({ action: JOB_COST_ACTION, cost_type: null }), null);
  assert.equal(orderPatchForJobCostLine({ action: JOB_COST_ACTION, cost_type: "invented" }), null);
});

// ── the quote hands its costs to the order ───────────────────────────────────

test("accepting a quote carries every job cost onto the order", () => {
  const columns = orderCostColumnsFromQuote({
    labour_hours: 42, worker_hourly_rate: 85, travel_cost_ex_gst: 180,
    delivery_cost_ex_gst: 260, installation_cost_ex_gst: 1850,
    painting_cost_ex_gst: 0, glass_cost_ex_gst: 0, removal_cost_ex_gst: 340,
  });
  assert.equal(columns.labour_hours, 42);
  assert.equal(columns.worker_hourly_rate, 85);
  assert.equal(columns.installation_cost_ex_gst, 1850);
  assert.equal(columns.removal_cost_ex_gst, 340);
});

test("every cost type has somewhere on the order to live", () => {
  const columns = Object.keys(orderCostColumnsFromQuote({}));
  JOB_COST_TYPES.forEach((type) => {
    const field = type.hours ? type.hoursField : type.orderField;
    assert.ok(columns.includes(field), `${type.key} has no column on the order`);
  });
});

// ── the database agrees with the code ────────────────────────────────────────

test("the cost types allowed by the database are exactly the ones the code knows", () => {
  // Two lists of the same thing is how they drift. If a cost is added to one and
  // not the other, a variation either cannot be saved or is applied to nothing.
  const sql = read("supabase/202608171800_pcd_order_job_costs.sql");
  const match = sql.match(/cost_type in \(([^)]+)\)/);
  assert.ok(match, "the migration must constrain cost_type");
  const inSql = match[1].split(",").map((s) => s.trim().replace(/'/g, "")).sort();
  assert.deepEqual(inSql, [...JOB_COST_KEYS].sort());
});

test("the database refuses a job cost with no cost type, and the reverse", () => {
  const sql = read("supabase/202608171800_pcd_order_job_costs.sql");
  assert.match(sql, /action = 'job_cost' and cost_type in/);
  assert.match(sql, /action <> 'job_cost' and cost_type is null/);
});

test("the order gains every column the code writes to", () => {
  const sql = read("supabase/202608171800_pcd_order_job_costs.sql");
  Object.keys(orderCostColumnsFromQuote({})).forEach((column) => {
    assert.ok(sql.includes(`add column if not exists ${column}`), `${column} is never added to pcd_orders`);
  });
});

// ── applying a variation ─────────────────────────────────────────────────────

// Just enough Supabase to drive applyAcceptedVariation. Records what it was
// asked to write so the test can assert on it.
function stubSupabase({ variation, order, lines }) {
  const writes = { orderUpdates: [], lineInserts: [], lineUpdates: [], variationUpdates: [] };

  function table(name) {
    const api = {
      _filters: {},
      select() { return api; },
      eq() { return api; },
      order() { return api; },
      limit() { return Promise.resolve({ data: [{ sort_order: 3 }], error: null }); },
      maybeSingle() {
        if (name === "pcd_order_variations") return Promise.resolve({ data: { ...variation, pcd_orders: order }, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        if (name === "pcd_order_variations") return Promise.resolve({ data: { ...variation, status: "applied" }, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      insert(row) {
        if (name === "pcd_order_line_items") writes.lineInserts.push(row);
        return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }), then: (r) => r({ error: null }) };
      },
      update(patch) {
        if (name === "pcd_orders") writes.orderUpdates.push(patch);
        if (name === "pcd_order_line_items") writes.lineUpdates.push(patch);
        if (name === "pcd_order_variations") writes.variationUpdates.push(patch);
        const chain = {
          eq: () => chain,
          select: () => ({ single: () => Promise.resolve({ data: { ...variation, ...patch }, error: null }) }),
          then: (resolve) => resolve({ error: null }),
        };
        return chain;
      },
    };
    // The line fetch resolves as a promise at the end of a select().eq().order()
    api.then = (resolve) => {
      if (name === "pcd_order_variation_lines") return resolve({ data: lines, error: null });
      if (name === "pcd_order_line_items") return resolve({ data: [], error: null });
      if (name === "pcd_order_payments") return resolve({ data: [], error: null });
      return resolve({ data: null, error: null });
    };
    return api;
  }

  return { from: table, writes };
}

test("applying a variation writes the revised job costs onto the order", async () => {
  const variation = {
    id: "var-1", order_id: "order-1", variation_number: "PCD-V-2026-0001",
    status: "approved", subtotal_ex_gst: 682, gst_amount: 68.2, total_inc_gst: 750.2, currency: "AUD",
  };
  const lines = [
    { action: JOB_COST_ACTION, cost_type: "labour", qty: 48, product_unit_cost_ex_gst: 85, original_line_total_ex_gst: 3570, proposed_line_total_ex_gst: 4080 },
    { action: JOB_COST_ACTION, cost_type: "consumables", original_line_total_ex_gst: 1850, proposed_line_total_ex_gst: 2070 },
  ];
  const supabase = stubSupabase({ variation, order: ORDER, lines });

  await applyAcceptedVariation(supabase, "var-1");

  assert.equal(supabase.writes.orderUpdates.length, 1);
  const patch = supabase.writes.orderUpdates[0];

  // The revised figures, so the NEXT variation reads a true "currently".
  assert.equal(patch.labour_hours, 48);
  assert.equal(patch.worker_hourly_rate, 85);
  assert.equal(patch.installation_cost_ex_gst, 2070);

  // And the totals still move by the variation's own total.
  assert.equal(patch.subtotal_ex_gst, 16022);
  assert.equal(patch.total_inc_gst, 17624.2);
});

test("a job cost never becomes a line item on the order", async () => {
  // This is the whole reason job_cost exists rather than reusing the price
  // adjustment line: extra labour must not turn up as a product on the order or
  // in the production paperwork.
  const variation = { id: "var-2", order_id: "order-1", variation_number: "PCD-V-2026-0002", status: "approved", subtotal_ex_gst: 510, gst_amount: 51, total_inc_gst: 561 };
  const lines = [
    { action: JOB_COST_ACTION, cost_type: "labour", qty: 48, product_unit_cost_ex_gst: 85, original_line_total_ex_gst: 3570, proposed_line_total_ex_gst: 4080 },
  ];
  const supabase = stubSupabase({ variation, order: ORDER, lines });

  await applyAcceptedVariation(supabase, "var-2");

  assert.equal(supabase.writes.lineInserts.length, 0, "a job cost must not be inserted as an order line item");
});

test("a price adjustment still does become a line item, unchanged", async () => {
  const variation = { id: "var-3", order_id: "order-1", variation_number: "PCD-V-2026-0003", status: "approved", subtotal_ex_gst: 200, gst_amount: 20, total_inc_gst: 220 };
  const lines = [{ action: "price_adjustment", title: "Site access charge", proposed_line_total_ex_gst: 200, qty: 1 }];
  const supabase = stubSupabase({ variation, order: ORDER, lines });

  await applyAcceptedVariation(supabase, "var-3");

  assert.equal(supabase.writes.lineInserts.length, 1);
});

// ── wording ──────────────────────────────────────────────────────────────────

test("the change is described in words, so a minus sign is never the only clue", () => {
  assert.equal(jobCostChangeLabel("labour", 510), "Additional labour");
  assert.equal(jobCostChangeLabel("removal", -340), "Reduced door removal and disposal");
  assert.equal(jobCostChangeLabel("travel", 0), "Travel unchanged");
});

test("the customer wording matches what the quote page already calls these", () => {
  const quoteSrc = read("app/(site)/quotes/QuoteApprovalClient.js");
  ["Travel", "Delivery", "Consumables", "Painting", "Glass", "Door removal and disposal"].forEach((label) => {
    assert.ok(quoteSrc.includes(`"${label}"`), `the quote page no longer says "${label}"`);
    assert.ok(JOB_COST_TYPES.some((t) => t.customer === label), `no job cost is labelled "${label}"`);
  });
});
