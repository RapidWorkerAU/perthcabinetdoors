// WRITE AN APPROVED VARIATION ONTO THE ORDER.
//
// Approving is two steps: the customer's answer is recorded, then the variation
// is written onto the order and the totals move. The second step can fail on
// its own, and when it does the variation sits at "approved" while the order
// still shows the old money. Nothing about the order looks wrong, which is what
// makes it dangerous: the balance owing is short by exactly the amount the
// customer just agreed to.
//
// This is the way to finish it, once whatever stopped it has been dealt with.
// It is the same function the customer's approval calls, so there is no second
// version of what applying means.

import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import { applyAcceptedVariation } from "../../../../../../../../lib/pcd-order-variations";

async function idsFromParams(params) {
  const resolved = await Promise.resolve(params);
  return { orderId: resolved?.id, variationId: resolved?.variationId };
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { orderId, variationId } = await idsFromParams(params);

    const { data: variation, error } = await context.supabase
      .from("pcd_order_variations")
      .select("id, order_id, variation_number, status")
      .eq("id", variationId)
      .eq("order_id", orderId)
      .single();
    if (error) throw error;

    if (variation.status === "applied") {
      return Response.json({ ok: true, alreadyApplied: true, variation });
    }
    if (!["approved", "approved_pending_payment"].includes(variation.status)) {
      return Response.json(
        {
          ok: false,
          error: `${variation.variation_number} is ${variation.status}. Only a variation the customer has approved can be written onto the order.`,
        },
        { status: 409 }
      );
    }

    const applied = await applyAcceptedVariation(context.supabase, variation.id, { actorType: "admin" });
    return Response.json({ ok: true, variation: applied });
  } catch (error) {
    // The message is the useful part here: it is whatever stopped it the first
    // time, and it is what somebody needs to fix before pressing this again.
    return Response.json(
      { ok: false, error: error?.message || "Could not write this variation onto the order." },
      { status: error?.status || 500 }
    );
  }
}
