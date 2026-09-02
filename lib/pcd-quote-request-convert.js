// Turning a QUOTE REQUEST into QUOTE LINES.
//
// Lifted out of app/api/admin/quote-requests/route.js so it can be tested
// against a real request line without standing up a database. This is the seam
// where a customer's enquiry becomes something we can send a price for, so a
// field lost here is a field somebody has to ring the customer back for. The
// contract it has to keep is asserted in test/quote-request-flow.test.mjs.

import { boardCostLinePatch, lineAreaSqm } from "./pcd-board-cost";
import { calculateCabinetTotals, normalizeCabinetConfig } from "./pcd-cabinet-utils";
import { cabinetDescription } from "./pcd-cabinet-from-design";

// Hardware has no board behind it, and a benchtop is priced from the benchtop
// material list rather than the colour library, so neither has a colour to
// resolve.
//
// A cabinet DOES resolve its carcass board rate here, and safely: it carries no
// width or height (see lib/pcd-design-request-lines.js), so the area is zero and
// nothing costs a carcass as though it were one flat sheet. That rate then
// prices the cut list, which is what a cabinet actually costs.
export const NON_BOARD_PRODUCT_TYPES = new Set(["Hardware", "Benchtop"]);

const CABINET_PRODUCT_TYPE = "base_cabinet";

/**
 * BUILD THE CABINET, not just a line that says there is one.
 *
 * A cabinet is priced from a cut list worked out from its box. The box now
 * travels on the request as cabinet_spec (see the migration and
 * lib/pcd-cabinet-from-design.js), so this is where it becomes the quote
 * cabinet's configuration, priced at today's board rates and costed.
 *
 * Before this, a cabinet from a customer's design converted with no height, no
 * width, no depth and no shelves. Whoever opened it got the configurator's own
 * starting values and re-typed the cabinet from a sentence in the description.
 *
 * The carcass rate is the one already resolved for the line. The shelf gets its
 * own look-up, because a shelf is routinely a different board from the box it
 * sits in; when it cannot be resolved the cut list falls back to the carcass
 * rate, which is what a shelf is usually made of anyway.
 *
 * A spec that is not there (an older request, a cabinet added by hand, or a
 * request saved before the migration ran) returns null and the line converts
 * the way it always did, needing its sizes typed in.
 */
export function convertedCabinetConfig(line, { resolveBoard, carcassRate = 0 } = {}) {
  const spec = line?.cabinet_spec;
  if (!spec || typeof spec !== "object") return null;

  const shelfMatch =
    typeof resolveBoard === "function" && spec.shelf_colour
      ? resolveBoard({
          material: spec.shelf_material,
          thickness: spec.shelf_thickness_mm,
          finish: spec.shelf_finish,
          colour: spec.shelf_colour,
          supplier: line.supplier_name,
        })
      : null;

  const config = {
    ...spec,
    label: spec.label || line.product_name || "Base cabinet",
    cost_per_sqm_carcass: Number(carcassRate) || Number(spec.cost_per_sqm_carcass) || 0,
    cost_per_sqm_shelf: shelfMatch?.ok
      ? Number(shelfMatch.costPerSqmExGst) || 0
      : Number(spec.cost_per_sqm_shelf) || Number(carcassRate) || 0,
    notes: spec.notes || line.notes || "",
  };

  // Stored normalised, the same as the admin importer stores it, so what is
  // written is exactly what was costed. It also fills in what the drawing left
  // implied: a shelf with no height recorded is spaced evenly, which is where
  // it was drawn and where it gets cut.
  const totals = calculateCabinetTotals(config);
  return {
    ...config,
    ...normalizeCabinetConfig(config),
    calculated_cut_list: totals.cut_list,
    calculated_material_cost_ex_gst: totals.calculated_material_cost_ex_gst,
    labour_hours: totals.labour_hours,
    total_cabinet_cost_ex_gst: totals.total_cabinet_cost_ex_gst,
  };
}

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
    // And which item in it, where the request recorded one, so a line can be
    // traced back to the piece the customer drew.
    design_item_id: line.design_item_id || null,
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

  const priced = { ...base, ...boardCostLinePatch(match, { areaSqm: lineAreaSqm(base) }) };

  if (line.product_type === CABINET_PRODUCT_TYPE) {
    const carcassRate = Number(priced.unit_cost_per_sqm_ex_gst) || 0;
    const config = convertedCabinetConfig(line, { resolveBoard, carcassRate });
    if (config) {
      priced.cabinet_config = config;
      // The Cabinets tab shows this under the cabinet name, and it is the same
      // sentence the configurator writes when somebody saves one by hand. The
      // full brief the customer's design produced stays in the notes.
      priced.description = cabinetDescription(config);

      // COSTED ONLY WHEN THE CARCASS BOARD HAS A PRICE.
      //
      // The box is nearly all carcass, so a cut list run at a zero carcass rate
      // comes out as the shelves and nothing else: a small, confident, wrong
      // number where a cabinet should be. Half the colour library has no cost
      // against it yet, so this happens often rather than rarely.
      //
      // The cabinet is still fully built either way. All that waits is the
      // money, and the line stays manual at zero so it is counted among the
      // lines with no board cost and reported back with the reason.
      if (carcassRate > 0) {
        const cost = Number(config.calculated_material_cost_ex_gst) || 0;
        priced.product_unit_cost_ex_gst = cost;
        priced.calculated_unit_cost_ex_gst = cost;
        priced.unit_cost_mode = cost > 0 ? "auto" : "manual";
      }
    }
  }

  return { line: priced, match, skipped: false };
}

// Which lines could not be priced, and why, in words a person can act on.
//
// A made-to-order board is NOT in here. It has no rate to look up and never
// will: the job goes to the supplier and comes back priced. Reporting it
// alongside a colour we genuinely have not priced trains people to skim the
// list, which is how the one line that does need a look gets missed. It comes
// back separately from madeToOrderSummary below.
export function unpricedSummary(entries) {
  return entries
    .filter((entry) => !entry.skipped && !entry.match?.ok && entry.match?.reason !== "made_to_order")
    .map((entry) => ({
      product_name: entry.line.product_name || entry.line.product_type || "Line",
      colour: entry.line.colour || "",
      reason: entry.match?.reason || "not_found",
      message: entry.match?.message || "Could not resolve a board cost.",
    }));
}

// Lines whose board is made to order, so they are priced by hand from the
// supplier's quote. Normal, and worth naming so nobody goes looking for a rate
// that does not exist.
export function madeToOrderSummary(entries) {
  return entries
    .filter((entry) => !entry.skipped && entry.match?.reason === "made_to_order")
    .map((entry) => ({
      product_name: entry.line.product_name || entry.line.product_type || "Line",
      colour: entry.line.colour || "",
      message: entry.match.message,
    }));
}
