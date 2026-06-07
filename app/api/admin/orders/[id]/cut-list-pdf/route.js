import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { generateOrderCutListPdf } from "../../../../../../lib/pcd-cabinet-pdf";

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

async function loadOrderForCutListPdf(supabase, orderId) {
  const { data: order, error: orderError } = await supabase
    .from("pcd_orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (orderError) throw orderError;

  const { data: items, error: itemsError } = await supabase
    .from("pcd_order_line_items")
    .select("*")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (itemsError) throw itemsError;

  const quoteLineIds = (items || []).map((item) => item.quote_line_item_id).filter(Boolean);
  if (!quoteLineIds.length) return { order, items: items || [] };

  const { data: cabinetConfigs, error: configsError } = await supabase
    .from("pcd_cabinet_configs")
    .select("*")
    .in("line_item_id", quoteLineIds);
  if (configsError) throw configsError;

  const configsByLineId = new Map((cabinetConfigs || []).map((config) => [config.line_item_id, config]));
  return {
    order,
    items: (items || []).map((item) => ({
      ...item,
      cabinet_config: configsByLineId.get(item.quote_line_item_id) || null,
    })),
  };
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const orderId = await orderIdFromParams(params);
    const { order, items } = await loadOrderForCutListPdf(context.supabase, orderId);
    const pdfBuffer = generateOrderCutListPdf({ order, items });
    const orderNumber = cleanFilePart(order.order_number, "order");
    const fileName = `cut-list-${orderNumber}.pdf`;

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
