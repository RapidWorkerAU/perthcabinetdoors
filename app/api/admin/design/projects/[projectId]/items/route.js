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

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet"];

// Fills in blank board fields from the project's material_defaults —
// always just a fallback for a field the payload didn't already set
// (AddItemForm never sends material fields at all, so this is normally the
// only source), never overwrites something the caller actually specified.
function applyMaterialDefaults(payload, defaults) {
  if (!defaults) return payload;
  const merged = { ...payload };
  const blank = (v) => v === undefined || v === null || v === "";

  if (CABINET_TYPES.includes(payload.item_type)) {
    const carcass = defaults.carcass?.[payload.item_type];
    if (carcass) {
      if (blank(merged.material)) merged.material = carcass.material;
      if (blank(merged.finish))   merged.finish   = carcass.finish;
      if (blank(merged.colour))   merged.colour   = carcass.colour;
      if (blank(merged.carcass_thickness_mm)) merged.carcass_thickness_mm = carcass.thickness_mm;
      if (blank(merged.cost_per_sqm_carcass)) merged.cost_per_sqm_carcass = carcass.cost_per_sqm;
    }
    const shelf = defaults.shelf;
    if (shelf) {
      if (blank(merged.shelf_material)) merged.shelf_material = shelf.material;
      if (blank(merged.shelf_finish))   merged.shelf_finish   = shelf.finish;
      if (blank(merged.shelf_colour))   merged.shelf_colour   = shelf.colour;
      if (blank(merged.shelf_thickness_mm)) merged.shelf_thickness_mm = shelf.thickness_mm;
      if (blank(merged.cost_per_sqm_shelf)) merged.cost_per_sqm_shelf = shelf.cost_per_sqm;
    }
  } else if (payload.item_type === "panel") {
    const panel = defaults.panel;
    if (panel) {
      if (blank(merged.material)) merged.material = panel.material;
      if (blank(merged.finish))   merged.finish   = panel.finish;
      if (blank(merged.colour))   merged.colour   = panel.colour;
      if (blank(merged.unit_cost_per_sqm_ex_gst)) merged.unit_cost_per_sqm_ex_gst = panel.cost_per_sqm;
    }
  }

  return merged;
}

function buildRow(payload, projectId) {
  const isCabinet = CABINET_TYPES.includes(payload.item_type);
  const isObstruction = payload.item_type === "obstruction";
  return {
    design_project_id: projectId,
    room_id: payload.room_id || null,
    item_type: payload.item_type,
    label: dbText(payload.label),
    sort_order: dbInt(payload.sort_order) ?? 0,
    wall: dbText(payload.wall),
    secondary_wall: dbText(payload.secondary_wall),
    x_mm: dbInt(payload.x_mm) ?? 0,
    y_mm: dbInt(payload.y_mm) ?? 0,
    rotation: dbInt(payload.rotation) ?? 0,
    width_mm: dbInt(payload.width_mm),
    height_mm: dbInt(payload.height_mm),
    depth_mm: dbInt(payload.depth_mm),
    secondary_width_mm: dbInt(payload.secondary_width_mm),
    qty: dbInt(payload.qty) ?? 1,
    material: dbText(payload.material),
    finish: dbText(payload.finish),
    colour: dbText(payload.colour),
    notes: dbText(payload.notes),
    mount_height_mm: dbInt(payload.mount_height_mm) ?? 0,
    ...(isObstruction
      ? {}
      : isCabinet
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
          has_filler_panel:          Boolean(payload.has_filler_panel ?? false),
          filler_panel_height_mm:    dbInt(payload.filler_panel_height_mm),
          filler_panel_span:         dbText(payload.filler_panel_span) || "continuous",
          filler_panel_thickness_mm: dbInt(payload.filler_panel_thickness_mm) ?? 16,
          end_panel_left:         Boolean(payload.end_panel_left ?? false),
          end_panel_right:        Boolean(payload.end_panel_right ?? false),
          has_back_panel:         Boolean(payload.has_back_panel ?? false),
          back_panel_span:        dbText(payload.back_panel_span) || "continuous",
          back_panel_qty:         dbInt(payload.back_panel_qty) ?? 1,
          back_panel_wall1:       Boolean(payload.back_panel_wall1 ?? false),
          back_panel_wall2:       Boolean(payload.back_panel_wall2 ?? false),
          panel_to_floor:         Boolean(payload.panel_to_floor ?? false),
          front_type:             dbText(payload.front_type) || "none",
          door_config:            payload.door_config ?? null,
          door_style:             payload.door_style  ?? null,
          drawer_config:          payload.drawer_config  ?? null,
          drawer_style:           payload.drawer_style   ?? null,
          section_config:         payload.section_config ?? null,
          has_rangehood:                Boolean(payload.has_rangehood ?? false),
          rangehood_housing_height_mm:  dbInt(payload.rangehood_housing_height_mm),
          rangehood_channel_width_mm:   dbInt(payload.rangehood_channel_width_mm),
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

    const VALID_TYPES = [...CABINET_TYPES, "door", "drawer_front", "panel", "obstruction"];
    if (!VALID_TYPES.includes(payload.item_type)) {
      return Response.json({ ok: false, error: "Invalid item_type." }, { status: 422 });
    }

    const { data: projectRow } = await context.supabase
      .from("pcd_design_projects")
      .select("material_defaults")
      .eq("id", projectId)
      .single();

    const defaultedPayload = applyMaterialDefaults(payload, projectRow?.material_defaults);

    const { data, error } = await context.supabase
      .from("pcd_design_items")
      .insert(buildRow(defaultedPayload, projectId))
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, item: data }, { status: 201 });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not create item." }, { status: 500 });
  }
}
