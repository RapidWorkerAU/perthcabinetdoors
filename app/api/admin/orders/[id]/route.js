import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { ORDER_STATUSES } from "../../../../../lib/pcd-quote-utils";

async function orderIdFromParams(params) {
  const resolved = await params;
  return resolved?.id;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await orderIdFromParams(params);
    const { data, error } = await context.supabase
      .from("pcd_orders")
      .select("*, pcd_order_line_items(*)")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return Response.json({ ok: false, error: "Order not found." }, { status: 404 });
    }

    return Response.json({ ok: true, order: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load order." }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await orderIdFromParams(params);
    const payload = await request.json();
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(payload, "status")) {
      if (!ORDER_STATUSES.includes(payload.status)) {
        return Response.json({ ok: false, error: "Invalid order status." }, { status: 400 });
      }
      updates.status = payload.status;
    }

    [
      "name",
      "customer_name",
      "customer_email",
      "customer_phone",
      "site_address",
      "deposit_required",
      "deposit_amount",
      "deposit_paid",
      "deposit_paid_at",
      "target_completion_date",
      "customer_comms",
      "internal_notes",
    ].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        updates[field] = payload[field] === "" ? null : payload[field];
      }
    });

    if (!Object.keys(updates).length) {
      return Response.json({ ok: false, error: "No order updates supplied." }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("pcd_orders")
      .update(updates)
      .eq("id", id)
      .select("*, pcd_order_line_items(*)")
      .maybeSingle();

    if (error || !data) throw error || new Error("Order not found.");
    return Response.json({ ok: true, order: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update order." }, { status: 500 });
  }
}
