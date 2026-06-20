import { requireAdminApiContext } from "../../../../../../../lib/admin-api";

async function getProjectId(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.projectId;
}

function dbInt(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const projectId = await getProjectId(params);
    const { data, error } = await context.supabase
      .from("pcd_design_rooms")
      .select("*")
      .eq("design_project_id", projectId)
      .order("sort_order", { ascending: true });

    if (error) throw error;
    return Response.json({ ok: true, rooms: data || [] });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load rooms." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const projectId = await getProjectId(params);
    const payload = await request.json();
    const name = String(payload.name ?? "").trim();
    if (!name) {
      return Response.json({ ok: false, error: "Room name is required." }, { status: 422 });
    }

    const { data, error } = await context.supabase
      .from("pcd_design_rooms")
      .insert({
        design_project_id: projectId,
        name,
        width_mm:  dbInt(payload.width_mm),
        depth_mm:  dbInt(payload.depth_mm),
        height_mm: dbInt(payload.height_mm),
        sort_order: dbInt(payload.sort_order) ?? 0,
      })
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, room: data }, { status: 201 });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not create room." }, { status: 500 });
  }
}
