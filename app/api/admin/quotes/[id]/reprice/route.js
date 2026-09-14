// Re-resolve every priced line on a quote against the CURRENT option libraries.
//
// THREE LIBRARIES, ONE BUTTON. Boards come from the Board Library, hardware
// from the Hardware Library, benchtops from the Benchtop Library, and this used
// to refresh only the first of them. So a hinge price rise reached nothing, and
// a benchtop, which is only ever stored with a rate of zero and priced at
// import, could not be refreshed at all. The Profile Library is not here
// because it holds no prices; when it does, it goes in CATALOGUES beside the
// other two and this route does not change.
//
// WHY THIS EXISTS. A board rate used to be stamped onto a line once, at the
// moment somebody clicked a colour, and then never looked at again. Nothing
// re-resolved it on load, on save, or when the library's own prices changed. So
// three separate problems had no answer:
//
//   * quotes converted before the conversion learned to price lines sat at $0
//   * a line whose colour could not be matched stayed at $0 with no way back
//   * putting board prices up left every open draft quoting the old price
//
// This is that answer. It matches each line the same way the conversion does
// (by the library row id where one was captured, otherwise by supplier,
// material, thickness, finish and colour), writes the rate, and recalculates
// the line and the quote totals from it.
//
// WHAT IT WILL NOT TOUCH:
//   * a line a person deliberately overrode (unit_cost_mode 'manual' with a
//     cost typed on it), unless `includeManual` is passed. An override is a
//     decision, and quietly undoing it would be worse than leaving it.
//   * a hardware or benchtop line that names NO library row and carries a
//     typed price. That is somebody's own number, and the only override those
//     lines can have: being stored as "manual" is simply how a line priced per
//     piece is stored, not evidence anybody overrode it.
//   * cabinet lines' cut lists. The carcass board rate is refreshed; what the
//     cabinet costs still comes from its configuration.
//   * a locked quote. assertQuoteEditable is the same guard every write uses.

import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { getBusinessDefaults } from "../../../../../../lib/pcd-business-defaults";
import { assertQuoteEditable } from "../../../../../../lib/pcd-quote-lock";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";
import { calculateQuoteLine, roundMoney } from "../../../../../../lib/pcd-quote-utils";
import { boardCostLinePatch, createBoardCostResolver, lineAreaSqm } from "../../../../../../lib/pcd-board-cost";
import {
  CATALOGUES,
  catalogueForLine,
  catalogueNameForLine,
  matchCatalogueCost,
} from "../../../../../../lib/pcd-catalogue-cost";
import {
  isMissingSupplierNameSchemaError,
  loadQuoteLinesWithCabinets,
  quoteIdFromParams,
  quoteLineRow,
  recalculateQuoteTotals,
  withoutSupplierName,
} from "../_quote-line-save";

const CABINET_PRODUCT_TYPE = "base_cabinet";

// A price somebody typed OVER the automatic one, which a reprice leaves alone
// unless it is told otherwise.
//
// A cabinet is never one of these. Its price always comes from its cut list, so
// it is always "manual", and treating that as an override meant a configured
// cabinet's board rate was skipped by every ordinary reprice while the summary
// still offered to refresh it. Being priced a different way is not the same as
// being overridden.
function isManualOverride(line) {
  if (line.product_type === CABINET_PRODUCT_TYPE) return false;
  return line.unit_cost_mode !== "auto" && Number(line.product_unit_cost_ex_gst || 0) > 0;
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const quoteId = await quoteIdFromParams(params);
    const body = await request.json().catch(() => ({}));
    const includeManual = Boolean(body?.includeManual);

    await assertQuoteEditable(context.supabase, quoteId);
    const businessDefaults = await getBusinessDefaults(context.supabase);

    // With their cabinets attached: a cabinet line carries its build hours on
    // its configuration, and recalculating one without that would rewrite the
    // line back to the default hours.
    const lines = await loadQuoteLinesWithCabinets(context.supabase, quoteId);

    const resolveBoard = await createBoardCostResolver(context.supabase);

    // The other option libraries, read once each. Only the ones this quote
    // actually has lines for, so a quote of nothing but doors does not fetch
    // the hardware catalogue to ignore it.
    const wantedTypes = new Set((lines || []).map((l) => l.product_type));
    const catalogueRows = new Map();
    for (const catalogue of CATALOGUES) {
      if (!catalogue.productTypes.some((t) => wantedTypes.has(t))) continue;
      const { data, error } = await context.supabase
        .from(catalogue.table)
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      catalogueRows.set(catalogue.key, data || []);
    }

    const changed = [];
    const unmatched = [];
    // Boards that are made to order. They have no rate to reprice from and
    // never will, so they are counted apart from the ones that could not be
    // matched. Reported all the same, because "nothing happened to this line"
    // is worth saying either way.
    const madeToOrder = [];
    // A cabinet's money comes from its cut list, not from width x height x rate.
    // Refreshing its carcass board rate is still worth doing, because that is
    // what the configurator costs the cut list from, but the line total will not
    // move until someone opens the cabinet again. Called out separately so
    // "repriced" never overstates what happened.
    const cabinetsToReconfigure = [];
    let skipped = 0;

    // How many lines each library moved, so the report can say where the money
    // came from rather than one number for everything.
    const byLibrary = { board: 0, hardware: 0, benchtop: 0 };

    for (const line of lines || []) {
      // ── HARDWARE AND BENCHTOP, from their own libraries ──────────────────
      const catalogue = catalogueForLine(line);
      if (catalogue) {
        const rows = catalogueRows.get(catalogue.key) || [];
        const named = String(line.unit_cost_source_id || "").trim();
        // No id and a price on it is somebody's own number, and the only kind
        // of override these lines can carry.
        if (!named && !includeManual && Number(line[catalogue.rateField] || 0) > 0) { skipped += 1; continue; }

        const match = matchCatalogueCost(
          rows,
          { sourceId: named, name: catalogueNameForLine(line, catalogue) },
          catalogue
        );
        const entry = {
          id: line.id,
          product_name: line.product_name || line.product_type || "Line",
          colour: line.colour || line.material || "",
          library: catalogue.label,
        };
        if (!match.ok) {
          if (match.reason === "unpriced") skipped += 1;
          else unmatched.push({ ...entry, reason: match.reason, message: match.message });
          continue;
        }

        const before = Number(line[catalogue.rateField] || 0);
        if (roundMoney(before) === roundMoney(match.cost)) { skipped += 1; continue; }

        const patch = {
          [catalogue.rateField]: match.cost,
          unit_cost_source_id: match.id,
          unit_cost_source_label: match.label || line.unit_cost_source_label || null,
        };
        const calculated = calculateQuoteLine({ ...line, ...patch }, businessDefaults);
        const row = quoteLineRow(
          { ...calculated, design_item_id: line.design_item_id, design_project_id: line.design_project_id },
          quoteId,
          line.sort_order || 0
        );
        let catError = (await context.supabase.from("pcd_quote_line_items").update(row).eq("id", line.id)).error;
        if (catError && isMissingSupplierNameSchemaError(catError)) {
          catError = (
            await context.supabase.from("pcd_quote_line_items").update(withoutSupplierName(row, catError)).eq("id", line.id)
          ).error;
        }
        if (catError) throw catError;

        byLibrary[catalogue.key] += 1;
        changed.push({ ...entry, from_rate: roundMoney(before), to_rate: roundMoney(match.cost) });
        continue;
      }

      // ── BOARDS, from the Board Library ───────────────────────────────────
      if (!line.colour) {
        skipped += 1;
        continue;
      }
      if (!includeManual && isManualOverride(line)) {
        skipped += 1;
        continue;
      }

      const match = resolveBoard({
        colourLibraryId: line.unit_cost_source_id || null,
        material: line.material,
        thickness: line.thickness,
        finish: line.finish,
        colour: line.colour,
        supplier: line.supplier_name,
      });

      if (!match.ok) {
        const entry = {
          id: line.id,
          product_name: line.product_name || line.product_type || "Line",
          colour: line.colour || "",
          reason: match.reason,
          message: match.message,
        };
        if (match.reason === "made_to_order") madeToOrder.push(entry);
        else unmatched.push(entry);
        continue;
      }

      const beforeRate = Number(line.unit_cost_per_sqm_ex_gst || 0);
      const isCabinet = line.product_type === CABINET_PRODUCT_TYPE;
      // A CABINET IS NEVER PRICED AUTOMATICALLY, so its rate is refreshed
      // without its costing mode being touched. boardCostLinePatch writes
      // "auto" and a calculated cost of zero, which is the right answer for a
      // flat sheet priced by area and the wrong one for a box priced from its
      // cut list: a cabinet carries no width or height, so the area is zero and
      // the line was left labelled automatic at nothing while the real price
      // sat beside it. Only the rate the configurator reads is taken.
      const patch = isCabinet
        ? (() => {
            const { unit_cost_mode: _mode, calculated_unit_cost_ex_gst: _calc, ...rest } =
              boardCostLinePatch(match, { areaSqm: 0 });
            return rest;
          })()
        : boardCostLinePatch(match, { areaSqm: lineAreaSqm(line) });
      const afterRate = Number(patch.unit_cost_per_sqm_ex_gst || 0);
      // A cabinet is always manual, so the "already automatic at this rate"
      // test can never let one through and it is asked separately: nothing to
      // do when the rate has not moved.
      if (roundMoney(beforeRate) === roundMoney(afterRate) && (isCabinet || line.unit_cost_mode === "auto")) {
        skipped += 1;
        continue;
      }

      const calculated = calculateQuoteLine({ ...line, ...patch }, businessDefaults);
      const row = quoteLineRow(
        { ...calculated, design_item_id: line.design_item_id, design_project_id: line.design_project_id },
        quoteId,
        line.sort_order || 0
      );

      let updateError = (await context.supabase.from("pcd_quote_line_items").update(row).eq("id", line.id)).error;
      if (updateError && isMissingSupplierNameSchemaError(updateError)) {
        updateError = (
          await context.supabase.from("pcd_quote_line_items").update(withoutSupplierName(row, updateError)).eq("id", line.id)
        ).error;
      }
      if (updateError) throw updateError;

      const entry = {
        id: line.id,
        product_name: line.product_name || line.product_type || "Line",
        colour: line.colour || "",
        from_rate: roundMoney(beforeRate),
        to_rate: roundMoney(afterRate),
      };
      if (line.product_type === CABINET_PRODUCT_TYPE) cabinetsToReconfigure.push({ ...entry, library: "Board Library" });
      else { byLibrary.board += 1; changed.push({ ...entry, library: "Board Library" }); }
    }

    const quote = await recalculateQuoteTotals(context.supabase, quoteId, businessDefaults);

    if (changed.length || unmatched.length || madeToOrder.length || cabinetsToReconfigure.length) {
      await logOrderActivity(context.supabase, {
        quote_id: quoteId,
        actor_type: "admin",
        action_type: "quote_repriced",
        title: "Quote repriced from the option libraries",
        description: [
          `${changed.length} line${changed.length === 1 ? "" : "s"} repriced`,
          cabinetsToReconfigure.length ? `${cabinetsToReconfigure.length} cabinet board rate(s) refreshed` : "",
          madeToOrder.length ? `${madeToOrder.length} made to order` : "",
          `${unmatched.length} could not be matched`,
        ].filter(Boolean).join(", "),
        metadata: {
          changed,
          cabinets_to_reconfigure: cabinetsToReconfigure,
          unmatched,
          made_to_order: madeToOrder,
          skipped,
          by_library: byLibrary,
          include_manual: includeManual,
        },
      });
    }

    return Response.json({
      ok: true,
      quote,
      changedCount: changed.length,
      byLibrary,
      cabinetCount: cabinetsToReconfigure.length,
      unmatchedCount: unmatched.length,
      madeToOrderCount: madeToOrder.length,
      skippedCount: skipped,
      changed,
      cabinetsToReconfigure,
      unmatched,
      madeToOrder,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not reprice this quote." },
      { status: error?.status || 500 }
    );
  }
}
