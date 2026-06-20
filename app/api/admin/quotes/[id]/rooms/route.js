import { requireAdminApiContext } from "../../../../../../lib/admin-api";

async function quoteIdFromParams(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.id;
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

export async function GET(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const quoteId = await quoteIdFromParams(params);

    const { data, error } = await context.supabase
      .from("pcd_rooms")
      .select("*")
      .eq("quote_id", quoteId)
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
    const quoteId = await quoteIdFromParams(params);
    const payload = await request.json();

    const name = dbText(payload.name);
    if (!name) {
      return Response.json({ ok: false, error: "Room name is required." }, { status: 422 });
    }

    const { data, error } = await context.supabase
      .from("pcd_rooms")
      .insert({
        quote_id: quoteId,
        name,
        width_mm: dbNullableInt(payload.width_mm),
        depth_mm: dbNullableInt(payload.depth_mm),
        height_mm: dbNullableInt(payload.height_mm),
        sort_order: dbNullableInt(payload.sort_order) ?? 0,
      })
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, room: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not create room." }, { status: 500 });
  }
}
