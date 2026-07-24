import { requireAdminApiContext } from "@/lib/admin-api";

const TABLE = "pcd_hardware";
const TYPES = new Set(["handle", "hinge"]);

// Hardware catalogue (audit p2-3b) — handles & hinges as priced SKUs. GET is
// read by the design tool's handle / hinge pickers (filter with ?type=handle
// or ?type=hinge); POST/PATCH/DELETE back the admin catalogue page.

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
  const name = String(body.name || "").trim();
  const type = TYPES.has(body.type) ? body.type : "handle";
  if (!name) return Response.json({ ok: false, error: "Name is required." }, { status: 422 });

  const row = {
    type,
    name,
    unit_cost_ex_gst: Number(body.unit_cost_ex_gst) || 0,
    is_active: body.is_active !== false,
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
  };

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
  if (body.name !== undefined) patch.name = String(body.name || "").trim();
  if (body.type !== undefined && TYPES.has(body.type)) patch.type = body.type;
  if (body.unit_cost_ex_gst !== undefined) patch.unit_cost_ex_gst = Number(body.unit_cost_ex_gst) || 0;
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0;

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
