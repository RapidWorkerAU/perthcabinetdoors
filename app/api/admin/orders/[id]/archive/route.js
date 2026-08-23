// ARCHIVE OR RESTORE AN ORDER.
//
// The same rule as the quote: its own route, because archiving records the
// status it is archiving FROM so a restore is exact, and a status dropdown
// cannot do that half of it.
//
// An order carries money. Archiving one takes its payments out of the
// financials with it, which is the point, so the route refuses to do it
// quietly: an order with money still owed on it has to be said out loud first.

import { requireAdminApiContext } from "../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../lib/pcd-activity-log";
import { archivePatch, isArchived, restorePatch, ORDER_RESTORE_FALLBACK } from "../../../../../../lib/pcd-archive";

async function orderIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await orderIdFromParams(params);
    const payload = await request.json().catch(() => ({}));
    const archiving = payload?.archived !== false;
    // Set by the screen once the person has been told what is outstanding.
    const acknowledged = payload?.acknowledge_outstanding === true;

    const { data: order, error } = await context.supabase
      .from("pcd_orders")
      .select("id, order_number, status, customer_id, total_inc_gst, archived_from_status")
      .eq("id", id)
      .single();
    if (error) throw error;

    if (archiving === isArchived(order)) {
      return Response.json({ ok: true, order, unchanged: true });
    }

    if (archiving && !acknowledged) {
      const { data: payments } = await context.supabase
        .from("pcd_order_payments")
        .select("amount, is_paid")
        .eq("order_id", id);
      const paid = (payments || [])
        .filter((p) => p.is_paid)
        .reduce((total, p) => total + Number(p.amount || 0), 0);
      const outstanding = Math.round((Number(order.total_inc_gst || 0) - paid) * 100) / 100;

      // MONEY LEAVING THE FINANCIALS HAS TO BE SAID OUT LOUD. Archiving is for
      // tidying up, not for writing off what somebody owes, and the two look
      // identical the moment the row is out of every list.
      if (outstanding >= 1) {
        return Response.json(
          {
            ok: false,
            needsAcknowledgement: true,
            outstanding,
            error:
              `${order.order_number} still has $${outstanding.toLocaleString("en-AU")} outstanding. ` +
              `Archiving takes it out of the financials and off the board. Confirm if that is what you mean.`,
          },
          { status: 409 }
        );
      }
    }

    const patch = archiving ? archivePatch(order) : restorePatch(order, ORDER_RESTORE_FALLBACK);
    const { data: saved, error: saveError } = await context.supabase
      .from("pcd_orders")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (saveError) throw saveError;

    await logOrderActivity(context.supabase, {
      order_id: order.id,
      customer_id: order.customer_id || null,
      actor_type: "admin",
      action_type: archiving ? "order_archived" : "order_restored",
      title: archiving ? "Order archived" : "Order restored",
      description: archiving
        ? `${order.order_number} archived from ${order.status}. It stops counting anywhere until it is restored.`
        : `${order.order_number} restored to ${saved.status}.`,
    });

    return Response.json({ ok: true, order: saved });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not archive that order." },
      { status: error?.status || 500 }
    );
  }
}
