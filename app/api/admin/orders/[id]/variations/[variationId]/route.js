import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../../lib/pcd-activity-log";
import { recalcVariation, VARIATION_STATUSES } from "../../../../../../../lib/pcd-order-variations";
import { lockError } from "../../../../../../../lib/pcd-document-lock";
import { toNumber } from "../../../../../../../lib/pcd-quote-utils";

async function idsFromParams(params) {
  const resolved = await Promise.resolve(params);
  return { orderId: resolved?.id, variationId: resolved?.variationId };
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { orderId, variationId } = await idsFromParams(params);
    const { data, error } = await context.supabase
      .from("pcd_order_variations")
      .select("*, pcd_order_variation_lines(*)")
      .eq("id", variationId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (error || !data) throw error || new Error("Variation not found.");
    return Response.json({ ok: true, variation: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load variation." }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { orderId, variationId } = await idsFromParams(params);
    const payload = await request.json();
    const { data: before } = await context.supabase
      .from("pcd_order_variations")
      .select("*, pcd_orders(quote_id)")
      .eq("id", variationId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (!before) return Response.json({ ok: false, error: "Variation not found." }, { status: 404 });

    const updates = {};
    ["title", "customer_name", "customer_email", "customer_phone", "site_address", "notes", "terms"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(payload, field)) updates[field] = payload[field] === "" ? null : payload[field];
    });
    if (Object.prototype.hasOwnProperty.call(payload, "status")) {
      if (!VARIATION_STATUSES.includes(payload.status)) {
        return Response.json({ ok: false, error: "Invalid variation status." }, { status: 400 });
      }
      updates.status = payload.status;
    }

    // Everything above except the status is content the customer reads. Once the
    // variation is with them it is sealed, and the way through is the override,
    // which pulls it back to draft and cancels the link they hold.
    //
    // A status change on its own is still allowed, so a sealed variation can be
    // cancelled or moved on without first being pulled back. Cancelling is not
    // editing: it withdraws the proposal rather than changing what it says.
    const changesContent = Object.keys(updates).some((field) => field !== "status");
    if (changesContent) {
      const lock = lockError("variation", before.status);
      if (lock) {
        return Response.json(
          { ok: false, error: lock.message, lockState: lock.lockState, canOverride: lock.canOverride },
          { status: 409 }
        );
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, "deposit_required")) updates.deposit_required = Boolean(payload.deposit_required);
    if (Object.prototype.hasOwnProperty.call(payload, "deposit_percent")) {
      updates.deposit_percent = Math.max(0, Math.min(100, toNumber(payload.deposit_percent)));
    }

    if (!Object.keys(updates).length) {
      return Response.json({ ok: false, error: "No variation updates supplied." }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("pcd_order_variations")
      .update(updates)
      .eq("id", variationId)
      .eq("order_id", orderId)
      .select("*")
      .single();
    if (error) throw error;

    const variation = await recalcVariation(context.supabase, variationId);
    await logOrderActivity(context.supabase, {
      order_id: orderId,
      quote_id: before.pcd_orders?.quote_id || null,
      variation_id: variationId,
      actor_type: "admin",
      action_type: "variation_updated",
      title: "Variation updated",
      description: data.variation_number,
      metadata: { variation_number: data.variation_number },
    });

    return Response.json({ ok: true, variation });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update variation." }, { status: 500 });
  }
}
