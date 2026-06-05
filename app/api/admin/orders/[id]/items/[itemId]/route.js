import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { describeChanges, logOrderActivity } from "../../../../../../../lib/pcd-activity-log";
import { ORDER_LINE_STATUSES, ORDER_PRODUCTION_STAGES } from "../../../../../../../lib/pcd-quote-utils";

async function idsFromParams(params) {
  const resolved = await params;
  return { id: resolved?.id, itemId: resolved?.itemId };
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id, itemId } = await idsFromParams(params);
    const payload = await request.json();
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(payload, "status")) {
      if (!ORDER_LINE_STATUSES.includes(payload.status)) {
        return Response.json({ ok: false, error: "Invalid item status." }, { status: 400 });
      }
      updates.status = payload.status;
      updates.status_updated_at = new Date().toISOString();
    }

    if (Object.prototype.hasOwnProperty.call(payload, "production_stage")) {
      if (!ORDER_PRODUCTION_STAGES.includes(payload.production_stage)) {
        return Response.json({ ok: false, error: "Invalid production stage." }, { status: 400 });
      }
      updates.production_stage = payload.production_stage;
    }

    [
      "fulfilment_method",
      "thickness",
      "supplier_name",
      "supplier_order_ref",
      "supplier_ordered_at",
      "supplier_eta",
      "board_required",
      "board_ordered",
      "board_available",
      "notes",
      "production_notes",
    ].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        updates[field] = payload[field] === "" ? null : payload[field];
      }
    });

    if (updates.fulfilment_method && !["in_house", "supplier_ready_made"].includes(updates.fulfilment_method)) {
      return Response.json({ ok: false, error: "Invalid fulfilment method." }, { status: 400 });
    }

    if (!Object.keys(updates).length) {
      return Response.json({ ok: false, error: "No item updates supplied." }, { status: 400 });
    }

    const { data: beforeItem } = await context.supabase
      .from("pcd_order_line_items")
      .select("*, pcd_orders(quote_id)")
      .eq("id", itemId)
      .eq("order_id", id)
      .maybeSingle();

    const { data, error } = await context.supabase
      .from("pcd_order_line_items")
      .update(updates)
      .eq("id", itemId)
      .eq("order_id", id)
      .select("*")
      .maybeSingle();

    if (error || !data) throw error || new Error("Order item not found.");

    const changes = describeChanges(beforeItem || {}, updates, {
      production_stage: "Production stage",
      fulfilment_method: "Fulfilment",
      supplier_name: "Supplier",
      supplier_order_ref: "Supplier ref",
      supplier_ordered_at: "Supplier ordered",
      supplier_eta: "Supplier ETA",
      board_required: "Board required",
      board_ordered: "Board ordered",
      board_available: "Board available",
      production_notes: "Production notes",
    });
    if (changes.length) {
      await logOrderActivity(context.supabase, {
        order_id: id,
        quote_id: beforeItem?.pcd_orders?.quote_id || null,
        actor_type: "admin",
        action_type: "order_item_updated",
        title: `Order item updated: ${data.title || data.product_type || "Cabinetry item"}`,
        description: changes.join("; "),
        metadata: {
          item_id: itemId,
          changes,
        },
      });
    }

    return Response.json({ ok: true, item: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update order item." }, { status: 500 });
  }
}
