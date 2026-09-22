// WHAT LEAVES THE BUILDING WHEN A CUSTOMER OPENS THEIR QUOTE.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// Found in the Pass 2 audit, 22 September 2026. The public routes spread the
// whole database row into the response, so a customer's browser received what
// each item costs us, our markup on it, and the office's own note on the line.
//
// The part that makes it worth a test rather than just a fix: the codebase
// already knew that note was not for customers. There is a test called "the
// internal note is never printed" keeping the same column off the PDF. The
// document was guarded and the API behind it was not, and nothing anywhere
// asserted what those routes actually returned.
//
// So this checks the payload itself, which is the thing that was unwatched.
//
// ── THE FIXTURES ARE DELIBERATELY FULL OF THINGS THAT MUST NOT GO OUT ────────
//
// Every row below carries every sensitive column, filled in. A fixture with
// realistic-looking gaps would let a leak through on the one field nobody
// thought to set.

import test from "node:test";
import assert from "node:assert/strict";
import {
  NEVER_PUBLIC_ANYWHERE,
  NEVER_PUBLIC_ON_A_QUOTE,
  publicQuote,
  publicVariation,
} from "../lib/pcd-public-payload.js";

const SECRET = "SHOULD-NEVER-REACH-A-CUSTOMER";

const quoteRow = {
  id: "q1",
  quote_number: "PCD-Q-2026-0001",
  title: "Kitchen",
  status: "sent",
  currency: "AUD",
  customer_name: "A Customer",
  total_inc_gst: 1100,
  subtotal_ex_gst: 1000,
  gst_amount: 100,
  terms: "Our terms",
  client_notes: "Something for the customer",
  // Everything below here is ours.
  access_code: SECRET,
  notes: "Chase the deposit before cutting",
  markup_percent: 40,
  markup_amount_ex_gst: 300,
  manual_labour_hours: 9,
  edging_cost_override_ex_gst: 12,
  board_order_settings: { supplier: SECRET },
  customer_id: SECRET,
  project_id: SECRET,
  order_id: SECRET,
  pcd_quote_line_items: [
    {
      id: "l1",
      product_type: "Door",
      product_name: "Door",
      material: "Thermolaminate",
      finish: "Smooth",
      colour: "Agave",
      thickness: "18mm",
      width_mm: 397,
      height_mm: 720,
      qty: 2,
      unit_price_ex_gst: 100,
      line_total_ex_gst: 200,
      client_note: "Handles supplied by you",
      // Ours.
      notes: "Chase the deposit before cutting",
      product_unit_cost_ex_gst: 55,
      product_cost_ex_gst: 110,
      material_cost_ex_gst: 200,
      markup_percent: 40,
      markup_amount_ex_gst: 80,
      unit_cost_source_id: SECRET,
      unit_cost_source_label: SECRET,
      unit_cost_per_sqm_ex_gst: 88,
      calculated_unit_cost_ex_gst: 55,
      unit_cost_mode: "library",
      supplier_name: "Polytec",
      quote_id: SECRET,
      product_id: SECRET,
    },
  ],
};

const variationRow = {
  id: "v1",
  variation_number: "PCD-V-0001",
  status: "sent",
  currency: "AUD",
  customer_name: "A Customer",
  total_inc_gst: 220,
  notes: "Why this change is needed",
  access_code: SECRET,
  pcd_orders: {
    id: "o1",
    order_number: "PCD-O-0001",
    customer_name: "A Customer",
    customer_email: "a@example.com",
    site_address: "14 Rokeby Road",
    // The whole order row used to go out. None of this may.
    access_code: SECRET,
    markup_percent: 40,
    board_order_settings: { supplier: SECRET },
    customer_id: SECRET,
    supplier_name: SECRET,
  },
  pcd_order_variation_lines: [
    {
      id: "vl1",
      action: "change",
      title: "Door",
      qty: 1,
      notes: "Customer asked for a different colour",
      product_unit_cost_ex_gst: 85,
      original_line_total_ex_gst: 100,
      proposed_line_total_ex_gst: 140,
      markup_percent: 40,
      supplier_name: SECRET,
      original_order_item: {
        id: "oi1",
        title: "Door",
        material: "Thermolaminate",
        colour: "Agave",
        qty: 1,
        markup_percent: 40,
        product_cost_ex_gst: 60,
        supplier_name: SECRET,
      },
    },
  ],
};

/** Every value anywhere in a payload, however deeply nested. */
function everyValue(node, found = []) {
  if (node === null || typeof node !== "object") {
    found.push(node);
    return found;
  }
  for (const value of Object.values(node)) everyValue(value, found);
  return found;
}

/** Every key name anywhere in a payload. */
function everyKey(node, found = new Set()) {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    node.forEach((entry) => everyKey(entry, found));
    return found;
  }
  for (const [key, value] of Object.entries(node)) {
    found.add(key);
    everyKey(value, found);
  }
  return found;
}

// ── A quote ──────────────────────────────────────────────────────────────────

test("a quote payload carries none of the fields that are ours", () => {
  const keys = everyKey(publicQuote(quoteRow));
  const leaked = NEVER_PUBLIC_ON_A_QUOTE.filter((field) => keys.has(field));
  assert.deepEqual(leaked, [], "these reached the customer's browser");
});

test("nothing marked as ours survives anywhere in a quote payload, by value", () => {
  // The check above is by field NAME. This one is by VALUE, so a field renamed
  // on its way out is caught too.
  const values = everyValue(publicQuote(quoteRow));
  assert.equal(values.includes(SECRET), false, "a secret value reached the payload under some other name");
  assert.equal(
    values.includes("Chase the deposit before cutting"),
    false,
    "the office's internal note reached the customer"
  );
});

test("a quote payload still carries everything the page needs", () => {
  const payload = publicQuote(quoteRow);
  for (const field of ["quote_number", "status", "currency", "total_inc_gst", "subtotal_ex_gst", "gst_amount", "terms", "client_notes"]) {
    assert.ok(field in payload, `the page reads ${field} and it is not in the payload`);
  }
  const [line] = payload.pcd_quote_line_items;
  for (const field of ["id", "product_type", "material", "finish", "colour", "thickness", "width_mm", "height_mm", "qty", "unit_price_ex_gst", "line_total_ex_gst", "client_note"]) {
    assert.ok(field in line, `the page reads line.${field} and it is not in the payload`);
  }
});

test("the derived fields are added after the filter, not filtered out", () => {
  // cabinet_config and colour_src are worked out by the route rather than read
  // from a column, so they must survive a list that does not name them.
  const payload = publicQuote(quoteRow, {
    lineExtras: () => ({ cabinet_config: { id: "c1" }, colour_src: "/images/agave.jpg" }),
  });
  const [line] = payload.pcd_quote_line_items;
  assert.equal(line.colour_src, "/images/agave.jpg");
  assert.deepEqual(line.cabinet_config, { id: "c1" });
});

// ── A variation ──────────────────────────────────────────────────────────────

test("a variation payload carries none of the fields that are ours", () => {
  const keys = everyKey(publicVariation(variationRow));
  const leaked = NEVER_PUBLIC_ANYWHERE.filter((field) => keys.has(field));
  assert.deepEqual(leaked, [], "these reached the customer's browser");
});

test("the whole order row no longer travels with a variation", () => {
  const values = everyValue(publicVariation(variationRow));
  assert.equal(values.includes(SECRET), false, "something from the order row reached the customer");
});

test("a variation keeps the two fields a quote refuses, because its page shows them", () => {
  // `notes` explains why the change exists, and product_unit_cost_ex_gst is the
  // rate printed as "3.5 hrs at $85.00 per hour". Both are customer-facing HERE
  // and not on a quote. If this test ever fails because somebody tidied the two
  // lists into one, the tidy is the bug.
  const payload = publicVariation(variationRow);
  assert.equal(payload.notes, "Why this change is needed");
  const [line] = payload.pcd_order_variation_lines;
  assert.equal(line.notes, "Customer asked for a different colour");
  assert.equal(line.product_unit_cost_ex_gst, 85);
});

test("a variation payload still carries what its page needs", () => {
  const payload = publicVariation(variationRow);
  assert.equal(payload.pcd_orders.order_number, "PCD-O-0001");
  const [line] = payload.pcd_order_variation_lines;
  assert.equal(line.original_order_item.title, "Door");
  assert.equal(line.original_line_total_ex_gst, 100);
  assert.equal(line.proposed_line_total_ex_gst, 140);
});

// ── The routes must actually use it ──────────────────────────────────────────
//
// The lists above are worth nothing if a route goes back to spreading the row.
// This is a source check on purpose: it is about what the route does, not about
// what one payload came out as.

test("both public routes shape their response through the safe list", async () => {
  const { readFileSync } = await import("node:fs");

  // THE SUCCESS RESPONSE, with the comments taken out first.
  //
  // Two things make the naive version of this check wrong, and both bit while
  // it was being written. Each route has more than one `Response.json`, and the
  // refusals come first, so matching the first one reads the wrong block. And
  // the comment above the fixed code quotes the old broken code, so a search for
  // a spread finds the explanation of the bug rather than the bug.
  //
  // Both routes also spread rows legitimately while assembling: the variation
  // route builds `original_order_item` onto each line before anything is
  // filtered. So this looks only at what is handed to the customer.
  const withoutComments = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  for (const route of ["app/api/quote-workflow/get/route.js", "app/api/variation-workflow/get/route.js"]) {
    const source = withoutComments(readFileSync(new URL(`../${route}`, import.meta.url), "utf8"));
    const start = source.indexOf("ok: true");
    assert.ok(start > 0, `could not find the success response in ${route}`);
    const response = source.slice(start);

    assert.match(response, /public(Quote|Variation)\(/, `${route} must shape its response through pcd-public-payload`);
    assert.equal(
      /\.\.\.(quote|variation|line)\b/.test(response),
      false,
      `${route} spreads a database row straight into its response again`
    );
  }
});
