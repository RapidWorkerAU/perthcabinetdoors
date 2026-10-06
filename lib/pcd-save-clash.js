// TWO PEOPLE, ONE QUOTE: WHO WINS.
//
// ── THE FAULT ────────────────────────────────────────────────────────────────
//
// The quote editor saves the whole header, and a line at a time the whole line,
// from what it loaded. If Jason fixes the customer's phone number while
// Ashleigh has the same quote open, Ashleigh's next save writes her stale copy
// of the phone number straight back over his, and nothing anywhere says so.
// Last save wins, silently. With Alfred also preparing changes, that stops
// being rare.
//
// ── THE RULE: A THREE WAY CHECK, FIELD BY FIELD ──────────────────────────────
//
// The screen sends what it loaded (the base) beside what it wants to save. For
// each field it is saving:
//
//   database still equals the base         nobody else touched it: yours saves
//   you did not change it, they did        theirs is kept, yours is dropped,
//                                          and the rest of your save goes ahead
//   you both changed it, the same way      saves
//   you both changed it, differently       refused, naming the field
//
// So a screen that sends every field (the quote header, a whole line) never
// writes its stale copy of a field over somebody else's change, and only a real
// disagreement stops a save.
//
// Field by field rather than "has the record changed at all", because saving a
// line rewrites the quote's totals and stamps it as changed. A record level
// check would refuse every second save somebody made, and a warning that fires
// constantly is a warning everybody learns to click past.
//
// Only fields a person types are judged. Totals and stamps are worked out by
// the server and are never anybody's to overwrite.
//
// A caller that sends no base is not checked. Every screen here sends one;
// anything older still saves as it always did.

export const QUOTE_HEADER_FIELDS = {
  title: "Title",
  customer_name: "Customer",
  customer_email: "Email",
  customer_phone: "Phone",
  site_street: "Street address",
  site_suburb: "Suburb",
  site_postcode: "Postcode",
  project_name: "Project",
  suggested_start_date: "Suggested start",
  suggested_completion_date: "Suggested completion",
  currency: "Currency",
  gst_rate: "GST rate",
  manual_labour_hours: "Labour hours",
  worker_hourly_rate: "Hourly rate",
  travel_cost_ex_gst: "Travel",
  delivery_cost_ex_gst: "Delivery",
  installation_cost_ex_gst: "Consumables",
  painting_cost_ex_gst: "Painting",
  glass_cost_ex_gst: "Glass",
  removal_cost_ex_gst: "Door removal",
  edging_cost_override_ex_gst: "Edging cost",
  other_cost_ex_gst: "Other cost",
  markup_percent: "Markup",
  deposit_required: "Deposit required",
  deposit_percent: "Deposit percentage",
  notes: "Internal notes",
  client_notes: "Client notes",
  assumptions: "Assumptions",
  exclusions: "Exclusions",
  terms: "Terms",
  terms_term_ids: "Terms",
};

export const QUOTE_LINE_FIELDS = {
  product_type: "Type",
  product_name: "Item",
  description: "Description",
  material: "Material",
  supplier_name: "Supplier",
  thickness: "Thickness",
  height_mm: "Height",
  width_mm: "Width",
  finish: "Finish",
  colour: "Colour",
  // WHAT WAS PRICED FROM THE BOARD travels with it. Without these, keeping
  // somebody else's colour kept their board but wrote this save's rate for the
  // old one, so the line was priced for a board no longer on it.
  unit_cost_source_id: "Board",
  unit_cost_source_label: "Board",
  unit_cost_per_sqm_ex_gst: "Board rate",
  cost_per_board_ex_gst: "Board cost",
  profile_type: "Profile type",
  profile: "Profile",
  edge_mould: "Edge profile",
  qty: "Quantity",
  hinge_holes: "Hinge drilling",
  hinge_qty: "Hinge quantity",
  hinge_side: "Hinge side",
  hinge_from_bottom_mm: "Bottom hinge",
  hinge_from_top_mm: "Top hinge",
  hinge_middles_mm: "Middle hinges",
  product_unit_cost_ex_gst: "Unit cost",
  unit_cost_mode: "Costing",
  markup_percent: "Markup",
  labour_hours: "Labour hours",
  cabinet_brand: "Cabinet",
  panel_use: "Panel use",
  grain_direction: "Grain",
  banded_edges: "Edges",
  edge_finish: "Edge finish",
  hole_type: "Hole type",
  supplied_by: "Supplied by",
  hardware_type: "Hardware type",
  client_note: "Note on the quote",
  notes: "Internal note",
};

export const ORDER_FIELDS = {
  name: "Job name",
  status: "Order status",
  customer_name: "Customer",
  customer_email: "Email",
  customer_phone: "Phone",
  site_address: "Site address",
  site_street: "Street address",
  site_suburb: "Suburb",
  site_postcode: "Postcode",
  deposit_required: "Deposit required",
  deposit_amount: "Deposit amount",
  deposit_paid: "Deposit paid",
  deposit_paid_at: "Deposit paid at",
  scheduled_start_date: "Scheduled start",
  target_completion_date: "Estimated completion",
  customer_comms: "Customer comms",
  internal_notes: "Internal notes",
};

/**
 * The same value, however it was written. "", null and undefined are the same
 * blank; 4 and "4.00" are the same number; lists and objects by content.
 */
export function sameValue(a, b) {
  const blank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
  if (blank(a) && blank(b)) return true;
  if (blank(a) || blank(b)) return false;
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  const na = Number(a);
  const nb = Number(b);
  if (typeof a !== "boolean" && typeof b !== "boolean" && String(a).trim() !== "" && Number.isFinite(na) && Number.isFinite(nb) && /^-?[\d.]+$/.test(String(a).trim()) && /^-?[\d.]+$/.test(String(b).trim())) {
    return na === nb;
  }
  return String(a).trim() === String(b).trim();
}

/**
 * Every field this save would undo somebody else's change to.
 *
 * @param current   the record as it is in the database now
 * @param base      what the screen loaded, or null to skip the check
 * @param incoming  what the screen is saving
 * @param fields    { column: label } of the fields a person types
 * @returns [{ field, label, theirs, yours }]
 */
export function saveClashes(current = {}, base = null, incoming = {}, fields = {}) {
  if (!base || typeof base !== "object") return [];
  const clashes = [];
  const seen = new Set();
  for (const [field, label] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(incoming, field)) continue;
    if (!Object.prototype.hasOwnProperty.call(base, field)) continue;
    const theirs = current?.[field];
    if (sameValue(theirs, base[field])) continue; // nobody else touched it
    if (sameValue(incoming[field], base[field])) continue; // only they changed it: see keepTheirs
    if (sameValue(incoming[field], theirs)) continue; // you agree with them
    if (seen.has(label)) continue; // terms and its ids are one thing to a person
    seen.add(label);
    clashes.push({ field, label, theirs, yours: incoming[field] });
  }
  return clashes;
}

function shown(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "blank";
  if (typeof value === "object") return "changed";
  const text = String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}

/**
 * The save with somebody else's changes kept: every field this screen did not
 * change, but somebody else did since it loaded, takes their value. Returns a
 * new object; the incoming one is not touched.
 */
export function keepTheirs(current = {}, base = null, incoming = {}, fields = {}) {
  if (!base || typeof base !== "object") return incoming;
  const kept = { ...incoming };
  for (const field of Object.keys(fields)) {
    if (!Object.prototype.hasOwnProperty.call(incoming, field)) continue;
    if (!Object.prototype.hasOwnProperty.call(base, field)) continue;
    const theirs = current?.[field];
    if (!sameValue(theirs, base[field]) && sameValue(incoming[field], base[field])) kept[field] = theirs;
  }
  return kept;
}

/** One sentence naming what clashed, for the toast. */
export function clashMessage(clashes, what = "this quote") {
  const first = clashes[0];
  const more = clashes.length > 1 ? ` and ${clashes.length - 1} other field${clashes.length === 2 ? "" : "s"}` : "";
  return (
    `Someone else changed ${first.label} on ${what} to "${shown(first.theirs)}"${more} since you opened it, ` +
    `and you changed it too, so nothing was saved. Reload to see their change, then make yours again.`
  );
}

/** The 409 a route returns, or null when the save is clear. */
export function clashResponse(clashes, what) {
  if (!clashes.length) return null;
  return Response.json(
    { ok: false, clash: true, error: clashMessage(clashes, what), clashes: clashes.map(({ field, label }) => ({ field, label })) },
    { status: 409 }
  );
}

/** The fields to send as the base: what was loaded, for the fields being saved. */
export function baseFor(record, fields) {
  if (!record) return null;
  const base = {};
  for (const field of Object.keys(fields)) {
    if (Object.prototype.hasOwnProperty.call(record, field)) base[field] = record[field];
  }
  return base;
}
