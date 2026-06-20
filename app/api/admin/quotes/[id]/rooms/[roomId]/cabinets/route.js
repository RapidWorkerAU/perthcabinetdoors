import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";

const VALID_CABINET_TYPES = new Set(["base", "wall", "tall", "corner_base", "corner_wall", "island"]);
const VALID_WALLS = new Set(["top", "bottom", "left", "right", "island"]);

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

function dbNullableUuid(value) {
  if (value === "" || value === null || value === undefined) return null;
  return String(value).trim() || null;
}

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const roomId = await roomIdFromParams(params);

    const { data, error } = await context.supabase
      .from("pcd_room_cabinets")
      .select("*")
      .eq("room_id", roomId)
      .order("sort_order", { ascending: true });

    if (error) throw error;
    return Response.json({ ok: true, cabinets: data || [] });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load cabinets." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const roomId = await roomIdFromParams(params);
    const payload = await request.json();

    const cabinetType = dbText(payload.cabinet_type);
    if (!cabinetType || !VALID_CABINET_TYPES.has(cabinetType)) {
      return Response.json(
        { ok: false, error: `cabinet_type must be one of: ${[...VALID_CABINET_TYPES].join(", ")}.` },
        { status: 422 }
      );
    }

    const wall = dbText(payload.wall);
    if (wall !== null && !VALID_WALLS.has(wall)) {
      return Response.json(
        { ok: false, error: `wall must be one of: ${[...VALID_WALLS].join(", ")}.` },
        { status: 422 }
      );
    }

    const { data, error } = await context.supabase
      .from("pcd_room_cabinets")
      .insert({
        room_id: roomId,
        quote_line_item_id: dbNullableUuid(payload.quote_line_item_id),
        cabinet_type: cabinetType,
        label: dbText(payload.label),
        x_mm: dbNullableInt(payload.x_mm),
        wall,
        width_mm: dbNullableInt(payload.width_mm),
        height_mm: dbNullableInt(payload.height_mm),
        depth_mm: dbNullableInt(payload.depth_mm),
        sort_order: dbNullableInt(payload.sort_order) ?? 0,
        notes: dbText(payload.notes),
      })
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, cabinet: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not create cabinet." }, { status: 500 });
  }
}
