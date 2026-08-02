import { requireAdminApiContext } from "@/lib/admin-api";

const TABLE = "pcd_benchtop_materials";

function cleanText(value) {
  return String(value || "").trim();
}

async function nextSortOrder(supabase) {
  const { data } = await supabase
    .from(TABLE)
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  return (Number(data?.[0]?.sort_order || 0) || 0) + 10;
}

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const { data, error } = await context.supabase
    .from(TABLE)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, materials: data || [] });
}

export async function POST(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const body = await request.json();
  const name = cleanText(body.name);
  if (!name) return Response.json({ ok: false, error: "Name is required." }, { status: 422 });

  const row = {
    name,
    cost_per_sqm_ex_gst: Number(body.cost_per_sqm_ex_gst) || 0,
    is_active: body.is_active !== false,
    sort_order: await nextSortOrder(context.supabase),
  };

  const { data, error } = await context.supabase.from(TABLE).insert(row).select().single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, material: data });
}

export async function PATCH(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  const body = await request.json();
  if (!body.id) return Response.json({ ok: false, error: "id is required." }, { status: 422 });

  const patch = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = cleanText(body.name);
  if (body.cost_per_sqm_ex_gst !== undefined) patch.cost_per_sqm_ex_gst = Number(body.cost_per_sqm_ex_gst) || 0;
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

  const { data, error } = await context.supabase.from(TABLE).update(patch).eq("id", body.id).select().single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, material: data });
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
