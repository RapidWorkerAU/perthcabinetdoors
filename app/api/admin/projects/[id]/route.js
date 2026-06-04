import { requireAdminApiContext } from "../../../../../lib/admin-api";
import { PROJECT_STATUSES } from "../../../../../lib/pcd-quote-utils";

async function projectIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await projectIdFromParams(params);
    const { data, error } = await context.supabase
      .from("pcd_projects")
      .select("*, pcd_project_line_items(*)")
      .eq("id", id)
      .single();

    if (error) throw error;
    return Response.json({ ok: true, project: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load project." }, { status: 404 });
  }
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const id = await projectIdFromParams(params);
    const payload = await request.json();
    const updatePayload = {};

    if (Object.prototype.hasOwnProperty.call(payload, "status")) {
      if (!PROJECT_STATUSES.includes(payload.status)) {
        return Response.json({ ok: false, error: "Invalid project status." }, { status: 400 });
      }
      updatePayload.status = payload.status;
    }

    if (!Object.keys(updatePayload).length) {
      return Response.json({ ok: false, error: "No project updates supplied." }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("pcd_projects")
      .update(updatePayload)
      .eq("id", id)
      .select("*, pcd_project_line_items(*)")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, project: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update project." }, { status: 500 });
  }
}
