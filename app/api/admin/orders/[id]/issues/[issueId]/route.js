import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { logOrderActivity } from "../../../../../../../lib/pcd-activity-log";
import { issueKindLabel, validateResolution } from "../../../../../../../lib/pcd-order-issues";

async function idsFromParams(params) {
  const resolved = await params;
  return { orderId: resolved?.id, issueId: resolved?.issueId };
}

// Resolve, or reopen. Both go through here so the activity log always gets an
// entry either way, and neither can happen without the order matching.
export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { orderId, issueId } = await idsFromParams(params);
    const payload = await request.json();

    const { data: before } = await context.supabase
      .from("pcd_order_issues")
      .select("*")
      .eq("id", issueId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (!before) {
      return Response.json({ ok: false, error: "Issue not found on this order." }, { status: 404 });
    }

    const reopening = payload.reopen === true;
    let updates;

    if (reopening) {
      // The resolution is kept. It is what was tried last time, which is the
      // most useful thing to read when a problem comes back.
      updates = { resolved_at: null };
    } else {
      // Nothing closes silently.
      const errors = validateResolution(payload.resolution);
      if (Object.keys(errors).length) {
        return Response.json({ ok: false, error: "Say what was done about it.", fieldErrors: errors }, { status: 422 });
      }
      updates = { resolved_at: new Date().toISOString(), resolution: String(payload.resolution).trim() };
    }

    const { data: issue, error } = await context.supabase
      .from("pcd_order_issues")
      .update(updates)
      .eq("id", issueId)
      .eq("order_id", orderId)
      .select("*")
      .single();
    if (error) throw error;

    await logOrderActivity(context.supabase, {
      order_id: orderId,
      actor_type: "admin",
      action_type: reopening ? "issue_reopened" : "issue_resolved",
      title: reopening ? "Issue reopened" : "Issue resolved",
      description: reopening
        ? `${issueKindLabel(before.kind)} was reopened.`
        : `${issueKindLabel(before.kind)}. ${updates.resolution}`,
      metadata: { issue_id: issueId, kind: before.kind },
    });

    return Response.json({ ok: true, issue });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update the issue." }, { status: 500 });
  }
}
