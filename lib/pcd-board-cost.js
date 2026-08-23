// Resolve a board spec (material / thickness / finish / colour) to its row in
// the colour library, and therefore to its cost per m².
//
// WHY THIS EXISTS. Until now there was no way to ask "what does this board
// cost?" from a name. The quote editor never looked a price up: the price rode
// along on the dropdown option a person clicked, so the CLICK was the lookup.
// Anything that produced a quote line without a click — converting a quote
// request, importing a customer's design — landed at $0 in manual mode, and the
// only way out was to re-pick the colour on every line by hand.
//
// So this is the one place that answers the question, and every server path
// that creates a priced line goes through it.
//
// MATCHING ORDER, most trustworthy first:
//   1. colourLibraryId — the exact row the customer clicked. Cannot be wrong.
//   2. supplier + material + thickness + finish + colour name.
//   3. material + thickness + finish + colour name, ignoring supplier.
//
// Step 3 can legitimately hit the same colour stocked by two brands at two
// prices. It does NOT pick one: an ambiguous match returns a miss with a reason,
// because quoting the wrong supplier's price silently is worse than telling
// someone a line needs a look.
//
// Everything is matched case-insensitively and thickness-normalised ("18mm",
// "18 mm" and 18 are the same board), because these values are free text that
// has come from four different places over the years.

import { getDatabaseColourRows, normaliseColourMaterialKey } from "./pcd-colour-library";

// "18mm" | "18 mm" | " 18 " | 18 → 18. Anything without a number → 0.
export function thicknessMm(value) {
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function lower(value) {
  return String(value ?? "").trim().toLowerCase();
}

// A quote request made on the website used to arrive with the finish glued onto
// the front of the colour ("Matt - Classic White"). That is fixed at the source
// now, but rows written before the fix are still in the database and still need
// repricing, so the resolver keeps undoing it. Only strips the finish it was
// given, so a colour genuinely named after its finish is left alone.
export function colourWithoutFinishPrefix(colour, finish) {
  const raw = String(colour ?? "").trim();
  const label = String(finish ?? "").trim();
  if (label && raw.toLowerCase().startsWith(`${label.toLowerCase()} - `)) {
    return raw.slice(label.length + 3).trim();
  }
  return raw;
}

// The label the quote editor writes when a person picks a colour by hand, so a
// resolved line and a hand-picked line read identically in the Source column
// (and supplierFromSourceLabel can still sniff the brand back out of it).
export function boardCostLabel(row) {
  const detail = [row.finish_type, row.name, row.thickness].filter(Boolean).join(" - ");
  return [row.supplier_name || "Polytec", detail].filter(Boolean).join(" - ");
}

function asMatch(row, matchedBy) {
  return {
    ok: true,
    matchedBy,
    id: row.id,
    label: boardCostLabel(row),
    supplier: row.supplier_name || "Polytec",
    material: row.material_type || "",
    thickness: String(row.thickness || "").trim(),
    finish: String(row.finish_type || "").trim(),
    colour: String(row.name || "").trim(),
    costPerSqmExGst: Number(row.cost_per_sqm_ex_gst || 0),
    costPerBoardExGst: Number(row.cost_per_board_ex_gst || 0),
  };
}

const MISS_MESSAGES = {
  no_material: "No material on the line, so there is nothing to price against.",
  no_colour: "No colour on the line, so there is nothing to price against.",
  no_thickness: "No thickness on the line. Board prices are held per finish and thickness, so a thickness is needed.",
  not_found: "No colour library row matches this material, thickness, finish and colour.",
  unpriced: "The matching colour library row has no cost per m² against it yet.",
  ambiguous: "More than one colour library row matches at different prices. Pick the supplier on the line.",
};

function asMiss(reason, extra = {}) {
  return { ok: false, reason, message: MISS_MESSAGES[reason] || "Could not resolve a board cost.", ...extra };
}

// Every distinct price in a candidate set. Two rows for the same colour at the
// same price are not an ambiguity worth stopping for — the answer is the same
// either way — so only a genuine price disagreement counts.
function distinctPrices(rows) {
  return new Set(rows.map((row) => Number(row.cost_per_sqm_ex_gst || 0)));
}

/**
 * Match one board spec against a pre-loaded set of colour library rows.
 * Pure, so it can be unit tested without a database.
 *
 * @param {Array} rows  active pcd_colour_library rows
 * @param {object} spec { colourLibraryId, material, thickness, finish, colour, supplier }
 * @returns {{ok: true, ...}|{ok: false, reason: string, message: string}}
 */
export function matchBoardCost(rows = [], spec = {}) {
  const { colourLibraryId, material, thickness, finish, colour, supplier } = spec;

  // 1. The exact row the customer clicked. Nothing to disambiguate.
  if (colourLibraryId) {
    const exact = rows.find((row) => row.id === colourLibraryId);
    if (exact) {
      const match = asMatch(exact, "id");
      return match.costPerSqmExGst > 0 ? match : asMiss("unpriced", { id: exact.id, label: match.label });
    }
    // A stale id (colour retired or renamed) falls through to name matching
    // rather than failing, so an old request still prices.
  }

  if (!material) return asMiss("no_material");

  const cleanedColour = lower(colourWithoutFinishPrefix(colour, finish));
  if (!cleanedColour) return asMiss("no_colour");

  const wantThickness = thicknessMm(thickness);
  if (!wantThickness) return asMiss("no_thickness");

  const materialKey = normaliseColourMaterialKey(material);
  const wantFinish = lower(finish);

  const candidates = rows.filter((row) => {
    if (normaliseColourMaterialKey(row.material_type) !== materialKey) return false;
    if (thicknessMm(row.thickness) !== wantThickness) return false;
    if (lower(row.name) !== cleanedColour) return false;
    // A blank finish on the line matches any finish. It is not a filter the
    // caller left out on purpose, it is a value that was never captured.
    if (wantFinish && lower(row.finish_type) !== wantFinish) return false;
    return true;
  });

  if (!candidates.length) return asMiss("not_found");

  // 2. Supplier named on the line wins outright.
  const wantSupplier = lower(supplier);
  if (wantSupplier) {
    const bySupplier = candidates.filter((row) => lower(row.supplier_name) === wantSupplier);
    if (bySupplier.length) {
      const priced = bySupplier.filter((row) => Number(row.cost_per_sqm_ex_gst || 0) > 0);
      if (!priced.length) return asMiss("unpriced", { id: bySupplier[0].id, label: boardCostLabel(bySupplier[0]) });
      if (distinctPrices(priced).size > 1) return asMiss("ambiguous");
      return asMatch(priced[0], "supplier");
    }
    // No row from that supplier. Fall through to a name-only match rather than
    // refusing: the supplier on a converted line is often just the default.
  }

  // 3. Name only. Refuses to guess between two real prices.
  const priced = candidates.filter((row) => Number(row.cost_per_sqm_ex_gst || 0) > 0);
  if (!priced.length) return asMiss("unpriced", { id: candidates[0].id, label: boardCostLabel(candidates[0]) });
  if (distinctPrices(priced).size > 1) return asMiss("ambiguous");
  return asMatch(priced[0], "name");
}

/**
 * Load the library once and return a resolver, for callers pricing many lines
 * at a time (converting a request, repricing a quote). One query, not one per
 * line.
 */
export async function createBoardCostResolver(supabase) {
  const rows = await getDatabaseColourRows(supabase, { activeOnly: true });
  const resolve = (spec) => matchBoardCost(rows, spec);
  resolve.rowCount = rows.length;
  return resolve;
}

/** Single-shot version, for callers pricing one line. */
export async function resolveBoardCost(supabase, spec) {
  const resolve = await createBoardCostResolver(supabase);
  return resolve(spec);
}

/**
 * Turn a resolver result into the pricing half of a quote line. Kept here so
 * the convert route, the reprice route and anything added later all stamp the
 * same fields the quote editor's own colour picker stamps.
 *
 * A miss deliberately leaves the line manual at zero rather than inventing a
 * rate, and clears the source fields with it — a label naming a board we did
 * not actually price from is worse than a blank one, because the quote editor
 * reads the supplier back out of that label.
 *
 * The REASON for a miss does not belong on the line: nothing renders that
 * column, so it would be written where nobody reads it. It goes back to the
 * caller instead (match.reason / match.message), and each caller puts it where
 * its own user is looking — the conversion reports it on screen and in the
 * quote's activity log, the design import raises it as a pre-flight warning.
 */
export function boardCostLinePatch(match, { areaSqm = 0 } = {}) {
  if (!match?.ok) {
    return {
      unit_cost_mode: "manual",
      unit_cost_source_id: null,
      unit_cost_source_label: "",
      unit_cost_per_sqm_ex_gst: 0,
      calculated_unit_cost_ex_gst: 0,
    };
  }

  const rate = Number(match.costPerSqmExGst) || 0;
  const calculated = areaSqm > 0 && rate > 0 ? Math.round((areaSqm * rate + Number.EPSILON) * 100) / 100 : 0;

  return {
    supplier_name: match.supplier,
    unit_cost_mode: "auto",
    unit_cost_source_id: match.id,
    unit_cost_source_label: match.label,
    unit_cost_per_sqm_ex_gst: rate,
    calculated_unit_cost_ex_gst: calculated,
    ...(calculated > 0 ? { product_unit_cost_ex_gst: calculated } : {}),
  };
}

/** Area of a flat board line in m². Zero when either side is missing. */
export function lineAreaSqm(line = {}) {
  const width = Number(line.width_mm || 0);
  const height = Number(line.height_mm || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
  return (width * height) / 1000000;
}

// WHICH BOARD A DESIGN-SOURCED LINE WAS PRICED FROM.
//
// The public form's conversion records this through boardCostLinePatch above,
// and the quote editor's colour picker records it through colourSelectionPatch.
// The design importer recorded the RATE but not the row it came from, so a line
// staged out of the backend design tool arrived priced with no way to say what
// it was priced from: a blank source label in the editor, and nothing for a
// later reprice to match on but five loose strings.
//
// A design item already carries the library row id, so this is only a matter of
// passing it on. Kept here beside the other two so all three routes stamp the
// same fields in the same shape.
export function designSourcePatch(style = {}, { rate = 0 } = {}) {
  const id = style.colour_library_id || null;
  const supplier = String(style.supplier_name || style.supplier || "").trim();
  const colour = String(style.colour || "").trim();

  // No id means the board was never picked from the library: a hand-typed
  // colour, or an older design saved before the picker recorded the row. The
  // rate still stands, so the line prices; it just cannot claim a source.
  if (!id) return {};

  return {
    unit_cost_source_id: id,
    unit_cost_source_label: [supplier, colour].filter(Boolean).join(" - "),
    ...(Number(rate) > 0 ? { unit_cost_per_sqm_ex_gst: Number(rate) } : {}),
  };
}
