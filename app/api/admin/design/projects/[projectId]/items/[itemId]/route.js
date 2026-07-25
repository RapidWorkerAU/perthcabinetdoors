import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";
import { buildItemPatch } from "../../../../../../../../lib/pcd-design-item-io";

async function getIds(params) {
  const resolved = await Promise.resolve(params);
  return { projectId: resolved?.projectId, itemId: resolved?.itemId };
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { projectId, itemId } = await getIds(params);
    const payload = await request.json();
    const patch = buildItemPatch(payload);

    if (!Object.keys(patch).length) {
      return Response.json({ ok: false, error: "No fields to update." }, { status: 422 });
    }

    const { data, error } = await context.supabase
      .from("pcd_design_items")
      .update(patch)
      .eq("id", itemId)
      .eq("design_project_id", projectId)
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, item: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update item." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { projectId, itemId } = await getIds(params);
    const { error } = await context.supabase
      .from("pcd_design_items")
      .delete()
      .eq("id", itemId)
      .eq("design_project_id", projectId);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete item." }, { status: 500 });
  }
}
