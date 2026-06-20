import { requireAdminApiContext } from "../../../../../../../lib/admin-api";

async function getProjectId(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.projectId;
}

function dbInt(value, fallback = null) {
  if (value === "" || value === null || value === undefined) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function dbNum(value, fallback = null) {
  if (value === "" || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dbText(value) {
  const s = String(value ?? "").trim();
  return s || null;
}

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet"];

function buildRow(payload, projectId) {
  const isCabinet = CABINET_TYPES.includes(payload.item_type);
  return {
    design_project_id: projectId,
    room_id: payload.room_id || null,
    item_type: payload.item_type,
    label: dbText(payload.label),
    sort_order: dbInt(payload.sort_order) ?? 0,
    wall: dbText(payload.wall),
    x_mm: dbInt(payload.x_mm) ?? 0,
    y_mm: dbInt(payload.y_mm) ?? 0,
    rotation: dbInt(payload.rotation) ?? 0,
    width_mm: dbInt(payload.width_mm),
    height_mm: dbInt(payload.height_mm),
    depth_mm: dbInt(payload.depth_mm),
    qty: dbInt(payload.qty) ?? 1,
    material: dbText(payload.material),
    finish: dbText(payload.finish),
    colour: dbText(payload.colour),
    notes: dbText(payload.notes),
    ...(isCabinet
      ? {
          carcass_thickness_mm: dbInt(payload.carcass_thickness_mm) ?? 16,
          back_panel_included: payload.back_panel_included ?? true,
          back_panel_thickness_mm: dbInt(payload.back_panel_thickness_mm) ?? 16,
          shelf_qty: dbInt(payload.shelf_qty) ?? 0,
          shelf_material: dbText(payload.shelf_material),
          shelf_finish: dbText(payload.shelf_finish),
          shelf_colour: dbText(payload.shelf_colour),
          shelf_thickness_mm: dbInt(payload.shelf_thickness_mm) ?? 16,
          shelf_heights_mm: Array.isArray(payload.shelf_heights_mm) ? payload.shelf_heights_mm : [],
          cost_per_sqm_carcass: dbNum(payload.cost_per_sqm_carcass),
          cost_per_sqm_shelf: dbNum(payload.cost_per_sqm_shelf),
          unit_cost_per_sqm_ex_gst: dbNum(payload.unit_cost_per_sqm_ex_gst),
          unit_cost_mode: payload.unit_cost_mode === "manual" ? "manual" : "auto",
          has_kickboard:          Boolean(payload.has_kickboard ?? false),
          kickboard_height_mm:    dbInt(payload.kickboard_height_mm) ?? 150,
          kickboard_span:         dbText(payload.kickboard_span) || "continuous",
          kickboard_thickness_mm: dbInt(payload.kickboard_thickness_mm) ?? 16,
          front_type:             dbText(payload.front_type) || "none",
          door_config:            payload.door_config ?? null,
          door_style:             payload.door_style  ?? null,
        }
      : {
          thickness: dbText(payload.thickness),
          profile_type: dbText(payload.profile_type),
          profile: dbText(payload.profile),
          edge_mould: dbText(payload.edge_mould),
          hinge_holes: Boolean(payload.hinge_holes),
          hinge_supply: Boolean(payload.hinge_supply),
          hinge_qty: dbText(payload.hinge_qty),
        }),
  };
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

    const VALID_TYPES = [...CABINET_TYPES, "door", "drawer_front", "panel"];
    if (!VALID_TYPES.includes(payload.item_type)) {
      return Response.json({ ok: false, error: "Invalid item_type." }, { status: 422 });
    }

    const { data, error } = await context.supabase
      .from("pcd_design_items")
      .insert(buildRow(payload, projectId))
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, item: data }, { status: 201 });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not create item." }, { status: 500 });
  }
}
