// THE ORDER HAS TO CARRY EVERYTHING THE QUOTE SAID.
//
// An order line is a copy of a quote line, taken when the quote is accepted.
// Every field the copy drops is a fact the workshop then has to guess at or do
// without, and the guess is silent.
//
// It dropped three things for a long time:
//
//   supplier_name   which brand of board. Without it the order page and the
//                   workshop label guessed the brand back from the colour NAME,
//                   twelve attempts, first hit wins. Two suppliers stocking the
//                   same colour name is normal, so the label could name the
//                   wrong brand with nothing to say so.
//
//   hinge_holes     whether to drill, and how many. A line a variation added
//   hinge_qty       had no quote line to read back through and printed
//                   "Not recorded" for ever. A door that needed drilling and
//                   did not get it is scrap.
//
//   unit_cost_      which colour library row priced the line, so a reprice has
//   source_id       something to match on other than five loose strings that
//                   change the moment somebody tidies the library.
//
// The variation path copied all of them from the start, so a line a variation
// ADDED carried more information than the line the order was raised from. That
// is the asymmetry this file exists to stop coming back.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CONVERSION = readFileSync(new URL("../lib/pcd-order-from-quote.js", import.meta.url), "utf8");
const VARIATION = readFileSync(new URL("../lib/pcd-order-variations.js", import.meta.url), "utf8");

// The block that builds the order lines, so a mention of a field anywhere else
// in the file cannot pass for carrying it.
const ORDER_LINES = CONVERSION.slice(
  CONVERSION.indexOf("const orderLines = lines.map("),
  CONVERSION.indexOf("pcd_order_line_items")
);

test("the order line builder was actually found", () => {
  assert.ok(ORDER_LINES.length > 200, "could not locate the order line mapping, so this test checks nothing");
});

// Everything that describes the physical item. Money and status are not here:
// an order's totals are deliberately its own once a variation moves them.
const SPEC = [
  ["product_type", "what kind of thing it is"],
  ["material", "what it is made from"],
  ["thickness", "which board"],
  ["finish", "the finish"],
  ["colour", "the colour the customer chose"],
  ["supplier_name", "the brand, because a colour name is not unique across suppliers"],
  ["profile_type", "whether it is profiled"],
  ["profile", "the profile itself"],
  ["edge_mould", "the edge"],
  ["width_mm", "how wide"],
  ["height_mm", "how tall"],
  ["qty", "how many"],
  ["hinge_holes", "whether to drill it"],
  ["hinge_qty", "how many hinges"],
  ["unit_cost_source_id", "which board priced it"],
  ["unit_cost_source_label", "which board priced it, in words"],
];

SPEC.forEach(([field, why]) => {
  test(`accepting a quote carries ${field}, ${why}`, () => {
    assert.match(
      ORDER_LINES,
      new RegExp(`\\b${field}\\s*:`),
      `the order line does not carry ${field}, so the workshop has to guess it or do without`
    );
  });
});

// The asymmetry itself. Whatever a variation thinks is worth carrying onto an
// order line, accepting a quote has to carry too, or the same order holds lines
// that know different amounts about themselves depending on how they got there.
test("accepting a quote carries everything a variation carries", () => {
  const variationLine = VARIATION.slice(
    VARIATION.indexOf("export function orderLineFromVariationLine"),
    VARIATION.indexOf("export async function applyAcceptedVariation")
  );
  const fieldsOf = (source) => new Set([...source.matchAll(/^\s{2,}([a-z_]+):/gm)].map((match) => match[1]));

  // Only ever set by one path, for a stated reason.
  const ONLY_ONE_PATH = new Set([
    "quote_line_item_id", // a variation line has no quote line behind it
    "variation_id", // says which variation added it
    "variation_status", // says it was added rather than quoted
    "cabinet_config_snapshot", // taken from the quote's cabinet at acceptance
    "order_id",
    "sort_order",
    "title",
    "description",
    "notes",
    "status",
    "fulfilment_method", // conversion leaves it unset so unplanned work is countable
    "line_total_ex_gst",
    // Costs. An order's own totals are its own once a variation moves them, and
    // the quote's are already on the quote.
    "unit_cost_per_sqm_ex_gst",
    "calculated_unit_cost_ex_gst",
    "product_unit_cost_ex_gst",
    "markup_percent",
  ]);

  const missing = [...fieldsOf(variationLine)]
    .filter((field) => !ONLY_ONE_PATH.has(field))
    .filter((field) => !fieldsOf(ORDER_LINES).has(field));

  assert.deepEqual(
    missing,
    [],
    "a variation carries these onto an order line and accepting a quote does not, so the same order " +
      `holds lines that know different amounts about themselves: ${missing.join(", ")}`
  );
});

// ── the fulfilment default, which is deliberate and easy to undo by accident ──
test("accepting a quote leaves fulfilment undecided so unplanned work stays countable", () => {
  assert.match(
    ORDER_LINES,
    /fulfilment_method:\s*isThermolaminatedLine\(line\)\s*\?\s*"supplier_ready_made"\s*:\s*null/,
    "defaulting this to in house makes an order nobody has looked at indistinguishable from a planned one"
  );
});

// ── a spec field must not be editable outside a variation ──────────────────
//
// thickness sat in the order item route's list of editable fields, among the
// planning fields. It is the one field there that changes what the workshop
// cuts, so it could be altered from the order page with no variation, no price
// and no trail, leaving the production list describing a different job to the
// quote it came from.
test("the order item route cannot change what a piece is, only how it gets made", () => {
  const route = readFileSync(
    new URL("../app/api/admin/orders/[id]/items/[itemId]/route.js", import.meta.url),
    "utf8"
  );
  const editable = route.slice(route.indexOf('"fulfilment_method"'), route.indexOf("].forEach"));
  const specFields = [
    "thickness",
    "material",
    "colour",
    "finish",
    "profile",
    "profile_type",
    "edge_mould",
    "width_mm",
    "height_mm",
    "qty",
  ];
  const editableSpec = specFields.filter((field) => editable.includes(`"${field}"`));
  assert.deepEqual(
    editableSpec,
    [],
    `these change what the workshop makes and can be set from the order page with no variation: ${editableSpec.join(", ")}`
  );
});

// ── which cabinet a piece belongs to ───────────────────────────────────────
//
// The production sheet groups a cabinet with its own doors, fronts, kickboard
// and panels. The link that makes that work is design_item_id, and it lived only
// on the QUOTE line: an order line reached it by reading back through
// quote_line_item_id. A line a VARIATION added has no quote line, so it could
// never be grouped and printed loose forever, which is exactly the piece
// somebody at the bench most needs to see in context.
test("accepting a quote carries which cabinet each piece belongs to", () => {
  assert.match(
    ORDER_LINES,
    /design_item_id:/,
    "without this the production sheet cannot group a piece with its cabinet on its own"
  );
});

test("the production sheet reads the line's own cabinet link before reading back", () => {
  const groups = readFileSync(new URL("../lib/pcd-production-groups.js", import.meta.url), "utf8");
  assert.match(groups, /function designItemFor/, "one place decides which cabinet a piece belongs to");
  assert.match(
    groups,
    /item\?\.design_item_id \|\|/,
    "the line's own link has to win, or a variation-added piece can never be grouped"
  );
});

// Accepting a quote deliberately leaves fulfilment unset so unplanned work stays
// countable. A variation used to hardcode in_house, so its work counted as
// planned the moment it applied and the metric silently under-reported.
test("a variation leaves fulfilment undecided, exactly as accepting a quote does", () => {
  const variations = readFileSync(new URL("../lib/pcd-order-variations.js", import.meta.url), "utf8");
  const builder = variations.slice(
    variations.indexOf("export function orderLineFromVariationLine"),
    variations.indexOf("export async function applyAcceptedVariation")
  );
  assert.doesNotMatch(
    builder,
    /fulfilment_method:\s*"in_house"/,
    "hardcoding this makes a variation's work count as planned before anybody has looked at it"
  );
  assert.match(builder, /isThermolaminatedVariationLine/, "thermolaminate is the one thing that is never undecided");
});

// A column with no write path is worse than no column: everything downstream
// reads it, finds null, and behaves as though the fact were unknown rather than
// unrecorded. design_item_id was added to variation lines and then never set by
// anything, so the grouping fix would have done nothing for the exact case it
// was built for.
test("a variation line records which cabinet its piece belongs to", () => {
  [
    ["adding a line", new URL("../app/api/admin/orders/[id]/variations/[variationId]/lines/route.js", import.meta.url)],
    [
      "editing a line",
      new URL("../app/api/admin/orders/[id]/variations/[variationId]/lines/[lineId]/route.js", import.meta.url),
    ],
  ].forEach(([label, url]) => {
    const source = readFileSync(url, "utf8");
    assert.match(
      source,
      /design_item_id[\s\S]{0,80}sourceLine\?\.design_item_id|updates\.design_item_id/,
      `${label} never sets design_item_id, so the column stays null and the production sheet still cannot group the piece`
    );
    assert.match(
      source,
      /isMissingDesignItemColumn/,
      `${label} must still save the line on a database without the column`
    );
  });
});
