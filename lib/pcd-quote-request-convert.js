// Turning a QUOTE REQUEST into QUOTE LINES.
//
// Lifted out of app/api/admin/quote-requests/route.js so it can be tested
// against a real request line without standing up a database. This is the seam
// where a customer's enquiry becomes something we can send a price for, so a
// field lost here is a field somebody has to ring the customer back for. The
// contract it has to keep is asserted in test/quote-request-flow.test.mjs.

import { boardCostLinePatch, lineAreaSqm } from "./pcd-board-cost";

// Hardware has no board behind it, and a benchtop is priced from the benchtop
// material list rather than the colour library, so neither has a colour to
// resolve.
//
// A cabinet DOES resolve its carcass board rate here, and safely: it carries no
// width or height (see lib/pcd-design-request-lines.js), so the area is zero and
// nothing costs a carcass as though it were one flat sheet. The rate is there so
// whoever configures the cabinet starts from the real board price instead of
// looking it up again.
export const NON_BOARD_PRODUCT_TYPES = new Set(["Hardware", "Benchtop"]);

/**
 * Turn one quote-request line into a fully costed quote line.
 *
 * This is the step that used to be missing. The conversion copied the spec
 * across and stopped, so every converted line landed at $0 in manual mode and
 * the only way to price it was to re-pick the colour by hand on every row. Now
 * each line is matched back to its colour library row (by the id the customer's
 * pick carried, falling back to the name) and stamped with the same fields the
 * quote editor's own colour picker stamps, so a converted line and a hand-added
 * line are indistinguishable.
 *
 * A line that cannot be matched is left manual at zero and reported back, rather
 * than being given a guessed rate.
 */
// A quote line CANNOT carry "supply hinges". calculateQuoteLine, the line
// saver and the duplicate route all force hinge_supply to false and its cost to
// zero, because we drill for hinges and do not supply them. The website still
// asks the customer, though, and stores their answer on the request, so the
// answer was arriving and then being silently dropped at exactly the point
// somebody would have acted on it.
//
// It cannot be priced, so it is not priced. It CAN be read, so it is written
// into the line's notes, where the person quoting is already looking.
export function withHingeSupplyNote(notes, line) {
  if (!line.hinge_supply) return notes || "";
  const asked = `Customer asked for hinges to be supplied${line.hinge_qty ? ` (${line.hinge_qty})` : ""}. Not priced on this quote.`;
  return [notes, asked].filter(Boolean).join(" ");
}

export function convertedQuoteLine(line, { resolveBoard, quoteRequest, businessDefaults }) {
  const notes = withHingeSupplyNote(line.notes, line);
  const base = {
    product_type: line.product_type,
    product_name: line.product_name || line.product_type || quoteRequest.product_name,
    description: notes,
    material: line.material,
    supplier_name: line.supplier_name || "",
    thickness: line.thickness,
    width_mm: line.width_mm,
    height_mm: line.height_mm,
    finish: line.finish,
    colour: line.colour,
    profile_type: line.profile_type,
    profile: line.profile,
    // profile_type / profile / edge_mould are all re-validated against the
    // material and thickness inside quoteLineRow, the same as every other write
    // path. The conversion used to check only the edge mould and let an invalid
    // profile through.
    edge_mould: line.edge_mould,
    qty: line.qty || 1,
    hinge_holes: line.hinge_holes,
    hinge_supply: line.hinge_supply,
    hinge_qty: line.hinge_qty,
    // Carried exactly. The customer answered these on the website form, and
    // asking them again at quote time is the double handling this is here to
    // stop. The cabinet falls back to the job level answer, which is what the
    // request form asks once for the whole job.
    cabinet_brand: line.cabinet_brand || quoteRequest.cabinet_brand || null,
    hinge_side: line.hinge_side || null,
    hinge_from_bottom_mm: line.hinge_from_bottom_mm ?? null,
    hinge_from_top_mm: line.hinge_from_top_mm ?? null,
    hinge_middles_mm: line.hinge_middles_mm || [],
    markup_percent: businessDefaults.markup_percent,
    notes,
    // Tags the line to the design it came from, so re-importing that design
    // REPLACES these lines instead of adding a second copy of everything. The
    // importer's sweep is scoped by exactly this column.
    design_project_id: quoteRequest.design_project_id || null,
  };

  if (NON_BOARD_PRODUCT_TYPES.has(line.product_type)) {
    return { line: base, match: null, skipped: true };
  }

  const match = resolveBoard({
    colourLibraryId: line.colour_library_id || null,
    material: line.material,
    thickness: line.thickness,
    finish: line.finish,
    colour: line.colour,
    supplier: line.supplier_name,
  });

  return {
    line: { ...base, ...boardCostLinePatch(match, { areaSqm: lineAreaSqm(base) }) },
    match,
    skipped: false,
  };
}

// Which lines could not be priced, and why, in words a person can act on.
export function unpricedSummary(entries) {
  return entries
    .filter((entry) => !entry.skipped && !entry.match?.ok)
    .map((entry) => ({
      product_name: entry.line.product_name || entry.line.product_type || "Line",
      colour: entry.line.colour || "",
      reason: entry.match?.reason || "not_found",
      message: entry.match?.message || "Could not resolve a board cost.",
    }));
}
