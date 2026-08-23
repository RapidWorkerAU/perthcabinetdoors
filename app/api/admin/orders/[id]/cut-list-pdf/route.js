import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { buildCutListRows, buildMadeToOrderRows, generateOrderCutListPdf } from "../../../../../../lib/pcd-cabinet-pdf";
import { buildVariationContext } from "../../../../../../lib/pcd-cut-list-variations";
import { loadOrderProductionData } from "../../../../../../lib/pcd-order-production-data";
import { ensurePanelNumbers } from "../../../../../../lib/pcd-order-panel-numbers";

async function orderIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

function cleanFilePart(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const orderId = await orderIdFromParams(params);
    // The same loader and the same numbering the labels use, so a label's
    // number is always the panel number on this sheet.
    const { order, items, quoteLines, variations, variationLines } = await loadOrderProductionData(context.supabase, orderId);
    const variationContext = buildVariationContext({ variations, variationLines });
    const { numbers } = await ensurePanelNumbers(context.supabase, orderId, [
      ...buildCutListRows(items, variationContext),
      ...buildMadeToOrderRows(items, variationContext),
    ]);

    // Problems already reported against this order. Open ones only: a resolved
    // issue is history and belongs on the screen, not on a sheet somebody is
    // working from today.
    //
    // Read soft on purpose. An issue table that cannot be read must not stop a
    // production sheet printing, because the sheet is what the workshop needs to
    // start. A print with no issues section is worse than no print at all only
    // if nobody says so, which is why it is logged rather than swallowed.
    let issues = [];
    const issuesResult = await context.supabase
      .from("pcd_order_issues")
      .select("*")
      .eq("order_id", orderId)
      .is("resolved_at", null)
      .order("raised_at", { ascending: true });
    if (issuesResult.error) {
      console.error(
        "[cut-list-pdf] could not read pcd_order_issues for " + orderId + ", so this sheet printed without the " +
          "open issues section: " + issuesResult.error.message
      );
    } else {
      issues = issuesResult.data || [];
    }

    const pdfBuffer = generateOrderCutListPdf({ order, items, quoteLines, variations, variationLines, panelNumbers: numbers, issues });
    const orderNumber = cleanFilePart(order.order_number, "order");
    const fileName = `production-sheet-${orderNumber}.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not generate cut list PDF." },
      { status: 500 }
    );
  }
}
