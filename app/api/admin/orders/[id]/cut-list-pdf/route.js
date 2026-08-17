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

    const pdfBuffer = generateOrderCutListPdf({ order, items, quoteLines, variations, variationLines, panelNumbers: numbers });
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
