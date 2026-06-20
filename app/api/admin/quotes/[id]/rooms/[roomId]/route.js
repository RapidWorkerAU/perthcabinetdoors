import { requireAdminApiContext } from "../../../../../../../lib/admin-api";

async function roomIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.roomId;
}

function dbText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function dbNullableInt(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? number : null;
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const roomId = await roomIdFromParams(params);
    const payload = await request.json();

    const update = {};
    if (payload.name !== undefined) {
      const name = dbText(payload.name);
      if (!name) return Response.json({ ok: false, error: "Room name cannot be empty." }, { status: 422 });
      update.name = name;
    }
    if (payload.width_mm !== undefined) update.width_mm = dbNullableInt(payload.width_mm);
    if (payload.depth_mm !== undefined) update.depth_mm = dbNullableInt(payload.depth_mm);
    if (payload.height_mm !== undefined) update.height_mm = dbNullableInt(payload.height_mm);
    if (payload.sort_order !== undefined) update.sort_order = dbNullableInt(payload.sort_order) ?? 0;

    const { data, error } = await context.supabase
      .from("pcd_rooms")
      .update(update)
      .eq("id", roomId)
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
    const roomId = await roomIdFromParams(params);

    const { error } = await context.supabase
      .from("pcd_rooms")
      .delete()
      .eq("id", roomId);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete room." }, { status: 500 });
  }
}
