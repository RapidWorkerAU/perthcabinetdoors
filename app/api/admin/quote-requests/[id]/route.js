import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { describeChanges, logOrderActivity } from "../../../../../lib/pcd-activity-log";

const allowedStatuses = new Set(["new", "reviewing", "waiting_on_customer", "converted_to_quote", "closed"]);

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id } = await Promise.resolve(params);
    const payload = await request.json();

    const { data: before } = await context.supabase
      .from("pcd_quote_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (before?.status === "converted_to_quote" && payload.status && payload.status !== before.status) {
      return Response.json({ ok: false, error: "Converted quote requests cannot have their status changed." }, { status: 400 });
    }

    const update = {};
    if (allowedStatuses.has(payload.status)) update.status = payload.status;
    if (typeof payload.internal_notes === "string") update.internal_notes = payload.internal_notes;

    const { data, error } = await context.supabase
      .from("pcd_quote_requests")
      .update(update)
      .eq("id", id)
      .select("*, pcd_quote_request_line_items(*)")
      .single();
    if (error) throw error;

    const changes = describeChanges(before || {}, update, {
      internal_notes: "Internal notes",
    });
    if (changes.length) {
      await logOrderActivity(context.supabase, {
        quote_id: data.converted_quote_id || null,
        quote_request_id: data.id,
        actor_type: "admin",
        action_type: "quote_request_updated",
        title: "Quote request updated",
        description: changes.join("; "),
        metadata: { changes },
      });
    }

    return Response.json({ ok: true, quoteRequest: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update quote request." }, { status: 500 });
  }
}
