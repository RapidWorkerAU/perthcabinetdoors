import { requireAdminApiContext } from "../../../../../lib/admin-api";

const allowedStatuses = new Set(["new", "in_progress", "responded", "closed", "not_required"]);

export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id } = await Promise.resolve(params);
    const { error } = await context.supabase.from("pcd_enquiries").delete().eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete enquiry." }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { id } = await Promise.resolve(params);
    const payload = await request.json();
    const update = {};
    if (allowedStatuses.has(payload.status)) update.status = payload.status;
    if (typeof payload.internal_notes === "string") update.internal_notes = payload.internal_notes;

    const { data, error } = await context.supabase
      .from("pcd_enquiries")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return Response.json({ ok: true, enquiry: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update enquiry." }, { status: 500 });
  }
}

