import { requireAdminApiContext } from "@/lib/admin-api";

const TABLE = "pcd_hardware";
const TYPES = new Set([
  "handle",
  "hinge",
  "drawer_runner",
  "push_to_open",
  "cutlery_tray",
  "wardrobe_hanging_rail",
  "slide_out_bin",
  "bi_fold_door",
  "cabinet_inserts",
]);

function cleanText(value) {
  return String(value || "").trim();
}

function nullableNumber(value) {
  if (value === "" || value === null || typeof value === "undefined") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function nextSortOrder(supabase, type) {
  const { data } = await supabase
    .from(TABLE)
    .select("sort_order")
    .eq("type", type)
    .order("sort_order", { ascending: false })
    .limit(1);
  return (Number(data?.[0]?.sort_order || 0) || 0) + 10;
}

function hardwarePayload(body, type, sortOrder) {
  return {
    type,
    name: cleanText(body.name),
    brand: cleanText(body.brand),
    sku: cleanText(body.sku),
    description: cleanText(body.description),
    image_url: cleanText(body.image_url),
    image_path: cleanText(body.image_path) || null,
    unit_cost_ex_gst: Number(body.unit_cost_ex_gst) || 0,
    width_mm: nullableNumber(body.width_mm),
    height_mm: nullableNumber(body.height_mm),
    depth_mm: nullableNumber(body.depth_mm),
    length_mm: nullableNumber(body.length_mm),
    hole_spacing_mm: nullableNumber(body.hole_spacing_mm),
    projection_mm: nullableNumber(body.projection_mm),
    is_active: body.is_active !== false,
    ...(sortOrder == null ? {} : { sort_order: sortOrder }),
  };
}

export async function GET(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  let query = context.supabase
    .from(TABLE)
    .select("*")
    .order("type", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (type && TYPES.has(type)) query = query.eq("type", type);

  const { data, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, hardware: data || [] });
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const body = await request.json();
  const name = cleanText(body.name);
  const type = TYPES.has(body.type) ? body.type : "handle";
  if (!name) return Response.json({ ok: false, error: "Name is required." }, { status: 422 });

  const row = hardwarePayload(body, type, await nextSortOrder(context.supabase, type));

  const { data, error } = await context.supabase.from(TABLE).insert(row).select().single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, hardware: data });
}

export async function PATCH(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const body = await request.json();
  if (!body.id) return Response.json({ ok: false, error: "id is required." }, { status: 422 });

  const patch = { updated_at: new Date().toISOString() };
  const payload = hardwarePayload(body, TYPES.has(body.type) ? body.type : "handle", null);
  for (const key of [
    "name",
    "brand",
    "sku",
    "description",
    "image_url",
    "image_path",
    "unit_cost_ex_gst",
    "width_mm",
    "height_mm",
    "depth_mm",
    "length_mm",
    "hole_spacing_mm",
    "projection_mm",
    "is_active",
  ]) {
    if (body[key] !== undefined) patch[key] = payload[key];
  }
  if (body.type !== undefined && TYPES.has(body.type)) patch.type = body.type;

  const { data, error } = await context.supabase.from(TABLE).update(patch).eq("id", body.id).select().single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, hardware: data });
}

export async function DELETE(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "id is required." }, { status: 422 });

  const { error } = await context.supabase.from(TABLE).delete().eq("id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
