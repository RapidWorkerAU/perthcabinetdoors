import { requireAdminApiContext } from "../../../../../../../lib/admin-api";
import {
  applyMaterialDefaults,
  buildItemRow,
  isMissingDesignColourSourceError,
  VALID_ITEM_TYPES,
  withoutDesignColourSource,
} from "../../../../../../../lib/pcd-design-item-io";

async function getProjectId(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.projectId;
}

export async function GET(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const projectId = await getProjectId(params);
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("room_id");

    let query = context.supabase
      .from("pcd_design_items")
      .select("*")
      .eq("design_project_id", projectId)
      .order("sort_order", { ascending: true });

    if (roomId) query = query.eq("room_id", roomId);

    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ ok: true, items: data || [] });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load items." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const projectId = await getProjectId(params);
    const payload = await request.json();

    if (!VALID_ITEM_TYPES.includes(payload.item_type)) {
      return Response.json({ ok: false, error: "Invalid item_type." }, { status: 422 });
    }

    const { data: projectRow } = await context.supabase
      .from("pcd_design_projects")
      .select("material_defaults")
      .eq("id", projectId)
      .single();

    const defaultedPayload = applyMaterialDefaults(payload, projectRow?.material_defaults);

    const row = buildItemRow(defaultedPayload, projectId);
    const create = (values) =>
      context.supabase.from("pcd_design_items").insert(values).select("*").single();

    let { data, error } = await create(row);
    // See the update route: the colour-source columns arrive with a migration,
    // and a new item must still be placeable before it has been run.
    if (error && isMissingDesignColourSourceError(error)) {
      ({ data, error } = await create(withoutDesignColourSource(row)));
    }

    if (error) throw error;
    return Response.json({ ok: true, item: data }, { status: 201 });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not create item." }, { status: 500 });
  }
}
