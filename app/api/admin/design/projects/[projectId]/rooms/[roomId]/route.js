import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";

async function getIds(params) {
  const resolved = await Promise.resolve(params);
  return { projectId: resolved?.projectId, roomId: resolved?.roomId };
}

function dbInt(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { projectId, roomId } = await getIds(params);
    const payload = await request.json();

    const patch = {};
    if ("name"      in payload) patch.name      = String(payload.name ?? "").trim() || null;
    if ("width_mm"  in payload) patch.width_mm  = dbInt(payload.width_mm);
    if ("depth_mm"  in payload) patch.depth_mm  = dbInt(payload.depth_mm);
    if ("height_mm" in payload) patch.height_mm = dbInt(payload.height_mm);
    if ("sort_order" in payload) patch.sort_order = dbInt(payload.sort_order) ?? 0;

    const { data, error } = await context.supabase
      .from("pcd_design_rooms")
      .update(patch)
      .eq("id", roomId)
      .eq("design_project_id", projectId)
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, room: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update room." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { projectId, roomId } = await getIds(params);
    const { error } = await context.supabase
      .from("pcd_design_rooms")
      .delete()
      .eq("id", roomId)
      .eq("design_project_id", projectId);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete room." }, { status: 500 });
  }
}
