import { requireAdminApiContext } from "../../../../../../../../../lib/admin-api";

const VALID_CABINET_TYPES = new Set(["base", "wall", "tall", "corner_base", "corner_wall", "island"]);
const VALID_WALLS = new Set(["top", "bottom", "left", "right", "island"]);

async function cabinetIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.cabinetId;
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

function dbNullableUuid(value) {
  if (value === "" || value === null || value === undefined) return null;
  return String(value).trim() || null;
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const cabinetId = await cabinetIdFromParams(params);
    const payload = await request.json();

    const update = {};

    if (payload.cabinet_type !== undefined) {
      const cabinetType = dbText(payload.cabinet_type);
      if (!cabinetType || !VALID_CABINET_TYPES.has(cabinetType)) {
        return Response.json(
          { ok: false, error: `cabinet_type must be one of: ${[...VALID_CABINET_TYPES].join(", ")}.` },
          { status: 422 }
        );
      }
      update.cabinet_type = cabinetType;
    }

    if (payload.wall !== undefined) {
      const wall = dbText(payload.wall);
      if (wall !== null && !VALID_WALLS.has(wall)) {
        return Response.json(
          { ok: false, error: `wall must be one of: ${[...VALID_WALLS].join(", ")}.` },
          { status: 422 }
        );
      }
      update.wall = wall;
    }

    if (payload.quote_line_item_id !== undefined) update.quote_line_item_id = dbNullableUuid(payload.quote_line_item_id);
    if (payload.label !== undefined) update.label = dbText(payload.label);
    if (payload.x_mm !== undefined) update.x_mm = dbNullableInt(payload.x_mm);
    if (payload.width_mm !== undefined) update.width_mm = dbNullableInt(payload.width_mm);
    if (payload.height_mm !== undefined) update.height_mm = dbNullableInt(payload.height_mm);
    if (payload.depth_mm !== undefined) update.depth_mm = dbNullableInt(payload.depth_mm);
    if (payload.sort_order !== undefined) update.sort_order = dbNullableInt(payload.sort_order) ?? 0;
    if (payload.notes !== undefined) update.notes = dbText(payload.notes);

    const { data, error } = await context.supabase
      .from("pcd_room_cabinets")
      .update(update)
      .eq("id", cabinetId)
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, cabinet: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update cabinet." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const cabinetId = await cabinetIdFromParams(params);

    const { error } = await context.supabase
      .from("pcd_room_cabinets")
      .delete()
      .eq("id", cabinetId);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete cabinet." }, { status: 500 });
  }
}
