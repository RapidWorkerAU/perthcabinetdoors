import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import { PROJECT_LINE_STATUSES } from "../../../../../../../lib/pcd-quote-utils";

async function resolvedParams(params) {
  return Promise.resolve(params);
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id, itemId } = await resolvedParams(params);
    const payload = await request.json();
    const status = payload.status;

    if (!PROJECT_LINE_STATUSES.includes(status)) {
      return Response.json({ ok: false, error: "Invalid line item status." }, { status: 400 });
    }

    const updatePayload = {
      status,
      status_updated_at: new Date().toISOString(),
    };

    if (Object.prototype.hasOwnProperty.call(payload, "notes")) {
      updatePayload.notes = payload.notes;
    }

    const { data, error } = await context.supabase
      .from("pcd_project_line_items")
      .update(updatePayload)
      .eq("id", itemId)
      .eq("project_id", id)
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, item: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update line item." }, { status: 500 });
  }
}
