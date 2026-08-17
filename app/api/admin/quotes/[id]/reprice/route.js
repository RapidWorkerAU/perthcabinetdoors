// Re-resolve every board line on a quote against the CURRENT colour library.
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
//   * hardware and benchtop lines, which are not priced from the colour library
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
  isMissingSupplierNameSchemaError,
  quoteIdFromParams,
  quoteLineRow,
  recalculateQuoteTotals,
  withoutSupplierName,
} from "../_quote-line-save";

const NON_BOARD_PRODUCT_TYPES = new Set(["Hardware", "Benchtop"]);
const CABINET_PRODUCT_TYPE = "base_cabinet";

function isManualOverride(line) {
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

    const { data: lines, error: linesError } = await context.supabase
      .from("pcd_quote_line_items")
      .select("*")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: true });
    if (linesError) throw linesError;

    const resolveBoard = await createBoardCostResolver(context.supabase);

    const changed = [];
    const unmatched = [];
    // A cabinet's money comes from its cut list, not from width x height x rate.
    // Refreshing its carcass board rate is still worth doing, because that is
    // what the configurator costs the cut list from, but the line total will not
    // move until someone opens the cabinet again. Called out separately so
    // "repriced" never overstates what happened.
    const cabinetsToReconfigure = [];
    let skipped = 0;

    for (const line of lines || []) {
      if (NON_BOARD_PRODUCT_TYPES.has(line.product_type) || !line.colour) {
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
        unmatched.push({
          id: line.id,
          product_name: line.product_name || line.product_type || "Line",
          colour: line.colour || "",
          reason: match.reason,
          message: match.message,
        });
        continue;
      }

      const beforeRate = Number(line.unit_cost_per_sqm_ex_gst || 0);
      const patch = boardCostLinePatch(match, { areaSqm: lineAreaSqm(line) });
      const afterRate = Number(patch.unit_cost_per_sqm_ex_gst || 0);
      if (roundMoney(beforeRate) === roundMoney(afterRate) && line.unit_cost_mode === "auto") {
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
          await context.supabase.from("pcd_quote_line_items").update(withoutSupplierName(row)).eq("id", line.id)
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
      if (line.product_type === CABINET_PRODUCT_TYPE) cabinetsToReconfigure.push(entry);
      else changed.push(entry);
    }

    const quote = await recalculateQuoteTotals(context.supabase, quoteId, businessDefaults);

    if (changed.length || unmatched.length || cabinetsToReconfigure.length) {
      await logOrderActivity(context.supabase, {
        quote_id: quoteId,
        actor_type: "admin",
        action_type: "quote_repriced",
        title: "Quote repriced from the colour library",
        description: [
          `${changed.length} line${changed.length === 1 ? "" : "s"} repriced`,
          cabinetsToReconfigure.length ? `${cabinetsToReconfigure.length} cabinet board rate(s) refreshed` : "",
          `${unmatched.length} could not be matched`,
        ].filter(Boolean).join(", "),
        metadata: {
          changed,
          cabinets_to_reconfigure: cabinetsToReconfigure,
          unmatched,
          skipped,
          include_manual: includeManual,
        },
      });
    }

    return Response.json({
      ok: true,
      quote,
      changedCount: changed.length,
      cabinetCount: cabinetsToReconfigure.length,
      unmatchedCount: unmatched.length,
      skippedCount: skipped,
      changed,
      cabinetsToReconfigure,
      unmatched,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not reprice this quote." },
      { status: error?.status || 500 }
    );
  }
}
