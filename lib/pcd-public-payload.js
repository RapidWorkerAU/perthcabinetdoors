// WHAT A CUSTOMER'S BROWSER IS ALLOWED TO RECEIVE.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// Found in the Pass 2 audit, 22 September 2026. The routes behind the pages a
// customer opens with an access code ended like this:
//
//     return Response.json({ ok: true, quote: { ...quote, ... } })
//
// A spread of the whole database row, read with the service role client so no
// row level security narrowed it either. Every column went to the browser. On a
// quote line that included `product_unit_cost_ex_gst`, what the item costs US,
// `markup_percent` and `markup_amount_ex_gst`, our margin on that line, and
// `notes`, the office's own note.
//
// That last one is the sharpest part, because the codebase already knew. There
// is a test called "the internal note is never printed" in
// test/quote-pdf-matches-editor.test.mjs, with the fixture note "Chase the
// deposit before cutting". It was kept off the PDF on purpose and then sent to
// the same customer in the JSON behind the page.
//
// The variation route was the same shape and wider: it selected `pcd_orders(*)`
// and returned the entire order row, for a page that reads four fields off it.
//
// ── WHY A NAMED LIST RATHER THAN STRIPPING WHAT IS SENSITIVE ─────────────────
//
// Because of which way it fails. A blocklist has to be remembered every time a
// column is added to a table, and forgetting means the new column goes to
// customers by default, silently, possibly for months. A named list means a new
// column is invisible until somebody deliberately adds it here, and the cost of
// forgetting is a field missing from a page, which somebody notices in a day.
//
// So: adding a field here is a decision. Make it the same way you would decide
// to print something on the quote, because it is the same decision.
//
// ── THE LISTS ARE PER TABLE, AND THEY ARE NOT COPIES OF EACH OTHER ───────────
//
// `notes` on a QUOTE line is the office's internal note and must never go out.
// `notes` on a VARIATION line is rendered in a table cell on the customer's own
// page, on purpose, because a variation has to say why it exists. Same column
// name, opposite answer. Nothing here may be copied from one list to another
// without checking what the page actually does with it.

/** Copy just the named fields, and only when the row actually has them. */
function pick(row, fields) {
  if (!row || typeof row !== "object") return null;
  const out = {};
  for (const field of fields) {
    if (field in row) out[field] = row[field];
  }
  return out;
}

// ── A QUOTE ──────────────────────────────────────────────────────────────────

/**
 * Deliberately absent, and why:
 *
 *   access_code            the credential itself. They already hold it; echoing
 *                          it back puts it in logs and screenshots for nothing.
 *   notes                  the office's own note on the job.
 *   markup_percent,        our margin.
 *   markup_amount_ex_gst
 *   manual_labour_hours,   the override behind a figure, not the figure.
 *   edging_cost_override_ex_gst
 *   customer_id,           our internal joins.
 *   project_id, order_id
 *   board_order_settings   how we buy the boards.
 *   source, sent_with_price, terms_term_ids
 *   archived_*, *_reminded_at, *_warned_at, *_notified_at, awaiting_deposit_at
 *                          our chasing and housekeeping, none of it theirs.
 *
 * worker_hourly_rate IS here, and that is worth a note rather than a silent
 * inclusion: the page shows a Labour line with the hours on it, and works the
 * amount out as hours times rate. The rate is therefore already derivable from
 * two numbers the customer can see, so withholding it would break the page
 * without concealing anything.
 */
export const PUBLIC_QUOTE_FIELDS = [
  "id",
  "quote_number",
  "title",
  "status",
  "currency",
  "gst_rate",
  // Their own details, back to them.
  "customer_name",
  "customer_email",
  "customer_phone",
  "site_address",
  "site_street",
  "site_suburb",
  "site_postcode",
  "project_name",
  // The priced breakdown the page shows. These are prices, not our costs: each
  // one already carries its markup. See calculateQuoteTotals.
  "material_cost_ex_gst",
  "labour_hours",
  "worker_hourly_rate",
  "labour_cost_ex_gst",
  "travel_cost_ex_gst",
  "delivery_cost_ex_gst",
  "installation_cost_ex_gst",
  "painting_cost_ex_gst",
  "glass_cost_ex_gst",
  "removal_cost_ex_gst",
  "other_cost_ex_gst",
  "edging_cost_ex_gst",
  "edging_lineal_metres",
  "subtotal_ex_gst",
  "gst_amount",
  "total_inc_gst",
  // What they pay and when.
  "deposit_required",
  "deposit_percent",
  "credit_applied_inc_gst",
  // What they are agreeing to.
  "terms",
  "assumptions",
  "exclusions",
  "client_notes",
  "suggested_start_date",
  "suggested_completion_date",
  "valid_until",
  "door_overlay",
  "existing_hinge_brand",
  // The clock, which the page and the emails both refer to.
  "sent_at",
  "viewed_at",
  "approved_at",
  "rejected_at",
  "created_at",
  "updated_at",
];

/**
 * Deliberately absent from a quote line, and why:
 *
 *   notes                       THE OFFICE'S OWN NOTE. client_note is the one
 *                               the customer is meant to read, and the two are
 *                               one keystroke apart in the editor.
 *   product_unit_cost_ex_gst    what it costs us before markup.
 *   product_cost_ex_gst
 *   markup_percent,             our margin.
 *   markup_amount_ex_gst
 *   unit_cost_source_id,        where we buy it and at what.
 *   unit_cost_source_label,
 *   unit_cost_per_sqm_ex_gst,
 *   calculated_unit_cost_ex_gst,
 *   unit_cost_mode
 *   material_cost_ex_gst        the same figure as line_total_ex_gst, under a
 *                               name that invites it to be read as our cost.
 *   supplier_name               who we buy from. The brand a customer needs to
 *                               know is already in the colour and the finish.
 *   labour_*, travel_*, delivery_*, installation_*, other_cost_ex_gst,
 *   hinge_drilling_cost_ex_gst, hinge_supply_cost_ex_gst
 *                               how the line's price was built up.
 *   design_item_id,             our internal joins.
 *   design_project_id, product_id, quote_id
 */
export const PUBLIC_QUOTE_LINE_FIELDS = [
  "id",
  "sort_order",
  // What it is. lib/pcd-quote-line-display.js groups and names a line from
  // these, so a field missing here is a line the customer cannot identify.
  "product_type",
  "product_name",
  "description",
  "material",
  "thickness",
  "finish",
  "colour",
  "width_mm",
  "height_mm",
  "profile_type",
  "profile",
  "edge_mould",
  "banded_edges",
  "edge_finish",
  "panel_use",
  "hardware_type",
  "supplied_by",
  "cabinet_brand",
  "qty",
  // The hinges, which the customer is told about because they affect fitting.
  "hinge_holes",
  "hinge_supply",
  "hinge_qty",
  "hinge_side",
  "hinge_from_bottom_mm",
  "hinge_from_top_mm",
  "hinge_middles_mm",
  // What they pay for it.
  "unit_price_ex_gst",
  "line_total_ex_gst",
  // The note written FOR them.
  "client_note",
];

// ── A VARIATION ──────────────────────────────────────────────────────────────

/**
 * `notes` IS here, unlike on a quote. A variation's note is rendered on the
 * customer's own page, because a change to work already agreed has to say why.
 * Do not "tidy" this to match the quote list above.
 */
export const PUBLIC_VARIATION_FIELDS = [
  "id",
  "variation_number",
  "status",
  "currency",
  "customer_name",
  "customer_email",
  "site_address",
  "subtotal_ex_gst",
  "gst_amount",
  "total_inc_gst",
  "revised_order_total_inc_gst",
  "deposit_topup_required",
  "notes",
  "terms",
  "sent_at",
  "viewed_at",
  "approved_at",
  "rejected_at",
  "created_at",
  "updated_at",
];

/**
 * product_unit_cost_ex_gst IS here, unlike on a quote line, and for a real
 * reason: on a job cost variation the page prints "3.5 hrs at $85.00 per hour",
 * and that rate is this column. It is a rate the customer is being asked to
 * agree to, not a cost we are hiding. See JobCostSpec.
 */
export const PUBLIC_VARIATION_LINE_FIELDS = [
  "id",
  "sort_order",
  "action",
  "cost_type",
  "title",
  "product_type",
  "material",
  "thickness",
  "finish",
  "colour",
  "width_mm",
  "height_mm",
  "profile_type",
  "profile",
  "edge_mould",
  "qty",
  "notes",
  "product_unit_cost_ex_gst",
  "original_line_total_ex_gst",
  "proposed_line_total_ex_gst",
  "line_total_ex_gst",
];

/**
 * The order behind a variation, which used to be sent whole as `pcd_orders(*)`.
 * The page reads four fields off it.
 */
export const PUBLIC_VARIATION_ORDER_FIELDS = ["id", "order_number", "customer_name", "customer_email", "site_address"];

/**
 * The item a variation line is changing, shown as "changed from". Specs only:
 * the page prints what it was, never what it cost us.
 */
export const PUBLIC_ORDER_ITEM_SPEC_FIELDS = [
  "id",
  "title",
  "product_type",
  "material",
  "thickness",
  "finish",
  "colour",
  "width_mm",
  "height_mm",
  "profile_type",
  "profile",
  "edge_mould",
  "qty",
];

// ── The shapers the routes actually call ─────────────────────────────────────

/**
 * A quote as the customer may receive it.
 *
 * `extras` carries the things the route works out rather than reads: a line's
 * cabinet drawing and the photograph of its colour. They are added AFTER the
 * pick, so a derived value never depends on a column surviving the list.
 */
export function publicQuote(quote, { lineExtras = () => ({}), attachments = [] } = {}) {
  if (!quote) return null;
  return {
    ...pick(quote, PUBLIC_QUOTE_FIELDS),
    pcd_quote_line_items: (quote.pcd_quote_line_items || []).map((line) => ({
      ...pick(line, PUBLIC_QUOTE_LINE_FIELDS),
      ...lineExtras(line),
    })),
    pcd_quote_attachments: attachments,
  };
}

/** A variation as the customer may receive it, order and original items included. */
export function publicVariation(variation) {
  if (!variation) return null;
  return {
    ...pick(variation, PUBLIC_VARIATION_FIELDS),
    pcd_orders: pick(variation.pcd_orders, PUBLIC_VARIATION_ORDER_FIELDS),
    pcd_order_variation_lines: (variation.pcd_order_variation_lines || []).map((line) => ({
      ...pick(line, PUBLIC_VARIATION_LINE_FIELDS),
      original_order_item: pick(line.original_order_item, PUBLIC_ORDER_ITEM_SPEC_FIELDS),
    })),
  };
}

// ── WHAT THE TESTS CHECK FOR ─────────────────────────────────────────────────
//
// Written out by hand rather than derived from the lists above, so a test
// cannot pass by agreeing with a mistake in them. Two lists, NOT one, for the
// same reason the field lists are per table: `notes` and
// `product_unit_cost_ex_gst` are refused on a quote and shown on purpose on a
// variation. One combined list would either miss the quote leak or fail the
// variation page for doing its job.

/** Refused everywhere, on any payload a customer receives. */
export const NEVER_PUBLIC_ANYWHERE = [
  "access_code",
  "markup_percent",
  "markup_amount_ex_gst",
  "product_cost_ex_gst",
  "unit_cost_source_id",
  "unit_cost_source_label",
  "unit_cost_per_sqm_ex_gst",
  "calculated_unit_cost_ex_gst",
  "unit_cost_mode",
  "supplier_name",
  "board_order_settings",
  "manual_labour_hours",
  "edging_cost_override_ex_gst",
  "customer_id",
  "project_id",
  "order_id",
];

/** Refused on a QUOTE, where these two mean something different. */
export const NEVER_PUBLIC_ON_A_QUOTE = [
  ...NEVER_PUBLIC_ANYWHERE,
  // The office's own note. client_note is the customer's one.
  "notes",
  // What the item costs us before markup.
  "product_unit_cost_ex_gst",
];
