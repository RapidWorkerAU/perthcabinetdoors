import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { generateDeliveryLabelPdf } from "../../../../../../lib/pcd-order-label-delivery";

// The delivery label for one order.
//
// Every other label on this roll is about a piece. This one is about the order,
// and it is read by whoever is loading the van or handing a job over the
// counter, so it carries the customer rather than the cut size.
//
// It reads the order and its lines and nothing else. The customer details are
// taken from the ORDER, not from the customer record they were copied from: the
// order is what was agreed, and a customer who has since moved house has not
// moved the job that is going out today.

export const dynamic = "force-dynamic";

async function orderIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

function cleanFilePart(value, fallback) {
  return (
    String(value || fallback)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const orderId = await orderIdFromParams(params);

    const { data: order, error } = await context.supabase
      .from("pcd_orders")
      .select("*, pcd_order_line_items(id, qty, variation_status)")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw new Error("That order could not be found.");

    const pdf = generateDeliveryLabelPdf({ order, items: order.pcd_order_line_items || [] });
    const fileName = `delivery-label-${cleanFilePart(order.order_number, "order")}.pdf`;

    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not make the delivery label." },
      { status: 500 }
    );
  }
}
