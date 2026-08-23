// PULL A SENT VARIATION BACK TO DRAFT, DELIBERATELY.
//
// The same mechanism as the quote override, for the same reason: a variation
// sitting with a customer is sealed, but a customer who never received the email
// can neither approve nor reject, and the work still has to move.
//
// Issuing a new access code is what makes it safe. The link the customer holds
// stops resolving, so they cannot approve a version that is being edited.
//
// Recorded against the ORDER as well as the variation, because a variation is a
// change to committed work and the order's history is where somebody looks when
// they ask why the job changed.

import { randomBytes } from "node:crypto";
import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../../../lib/pcd-activity-log";
import { editability, pullBackToDraftPatch } from "../../../../../../../../lib/pcd-document-lock";

function makeAccessCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const resolved = (await Promise.resolve(params)) || {};
    const orderId = resolved.id;
    const variationId = resolved.variationId;
    const payload = await request.json().catch(() => ({}));
    const reason = String(payload.reason || "").trim();

    if (!reason) {
      return Response.json(
        { ok: false, error: "Say why you are overriding. It is recorded against the order." },
        { status: 400 }
      );
    }

    const { data: variation, error } = await context.supabase
      .from("pcd_order_variations")
      .select("id, variation_number, status, access_code, sent_at, order_id")
      .eq("id", variationId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!variation) return Response.json({ ok: false, error: "Variation not found." }, { status: 404 });

    const state = editability("variation", variation.status);
    if (state === "open") {
      return Response.json(
        { ok: false, error: "This variation is already editable. No override is needed." },
        { status: 409 }
      );
    }
    // An approved variation has already rewritten the order. Overriding it would
    // mean un-making work the customer agreed to, silently. The next change is
    // another variation, which the customer sees and approves in its own right.
    if (state === "permanent") {
      return Response.json(
        {
          ok: false,
          error:
            "This variation has already been responded to and applied to the order. Raise another variation instead.",
        },
        { status: 409 }
      );
    }

    const previousCode = variation.access_code;
    const { data: updated, error: updateError } = await context.supabase
      .from("pcd_order_variations")
      .update(pullBackToDraftPatch("variation", makeAccessCode()))
      .eq("id", variationId)
      .eq("order_id", orderId)
      .select("*")
      .single();
    if (updateError) throw updateError;

    await logOrderActivity(context.supabase, {
      order_id: orderId,
      actor_type: "admin",
      action_type: "variation_override_to_draft",
      title: "Admin override: variation pulled back to draft",
      description: reason,
      metadata: {
        variation_number: variation.variation_number,
        previous_status: variation.status,
        reason,
        cancelled_access_code: previousCode,
        actor_email: context.user?.email || null,
      },
    });

    return Response.json({
      ok: true,
      variation: updated,
      message:
        "The customer's link has been cancelled and the variation is back in draft. Send it again when you are done.",
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not override this variation." },
      { status: error?.status || 500 }
    );
  }
}
