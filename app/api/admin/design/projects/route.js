import { requireAdminApiContext } from "../../../../../lib/admin-api";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { data, error } = await context.supabase
      .from("pcd_design_projects")
      .select("*, pcd_design_rooms(count)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json({ ok: true, projects: data || [] });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load projects." }, { status: 500 });
  }
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const payload = await request.json();
    const name = String(payload.name ?? "").trim();
    if (!name) {
      return Response.json({ ok: false, error: "Project name is required." }, { status: 422 });
    }

    const { data, error } = await context.supabase
      .from("pcd_design_projects")
      .insert({ name, status: "draft", notes: payload.notes || null })
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, project: data }, { status: 201 });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not create project." }, { status: 500 });
  }
}
