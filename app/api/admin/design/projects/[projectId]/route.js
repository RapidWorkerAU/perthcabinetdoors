import { requireAdminApiContext } from "../../../../../../lib/admin-api";

async function getProjectId(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.projectId;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const projectId = await getProjectId(params);
    const { data, error } = await context.supabase
      .from("pcd_design_projects")
      .select("*, pcd_design_rooms(*, pcd_design_items(count))")
      .eq("id", projectId)
      .single();

    if (error) throw error;
    if (!data) return Response.json({ ok: false, error: "Project not found." }, { status: 404 });
    return Response.json({ ok: true, project: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load project." }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const projectId = await getProjectId(params);
    const payload = await request.json();

    const patch = {};
    if ("name"   in payload) patch.name   = String(payload.name ?? "").trim() || null;
    if ("status" in payload) patch.status = String(payload.status ?? "").trim() || null;
    if ("notes"  in payload) patch.notes  = String(payload.notes ?? "").trim() || null;
    if ("material_defaults" in payload) patch.material_defaults = payload.material_defaults ?? null;

    if (!Object.keys(patch).length) {
      return Response.json({ ok: false, error: "No fields to update." }, { status: 422 });
    }

    const { data, error } = await context.supabase
      .from("pcd_design_projects")
      .update(patch)
      .eq("id", projectId)
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, project: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update project." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const projectId = await getProjectId(params);
    const { error } = await context.supabase
      .from("pcd_design_projects")
      .delete()
      .eq("id", projectId);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete project." }, { status: 500 });
  }
}
