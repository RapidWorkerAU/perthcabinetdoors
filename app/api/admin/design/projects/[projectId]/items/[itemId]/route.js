import { requireAdminApiContext } from "../../../../../../../../lib/admin-api";

async function getIds(params) {
  const resolved = await Promise.resolve(params);
  return { projectId: resolved?.projectId, itemId: resolved?.itemId };
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

function buildPatch(payload) {
  const patch = {};
  const str = (key) => { if (key in payload) patch[key] = dbText(payload[key]); };
  const int = (key, fb = null) => { if (key in payload) patch[key] = dbInt(payload[key], fb); };
  const num = (key) => { if (key in payload) patch[key] = dbNum(payload[key]); };
  const bool = (key, fb = false) => { if (key in payload) patch[key] = Boolean(payload[key]); };

  str("label"); str("wall"); str("secondary_wall"); str("material"); str("finish"); str("colour"); str("notes");
  str("thickness"); str("profile_type"); str("profile"); str("edge_mould"); str("hinge_qty");
  str("shelf_material"); str("shelf_finish"); str("shelf_colour");
  int("x_mm", 0); int("y_mm", 0); int("rotation", 0); int("mount_height_mm");
  int("width_mm"); int("height_mm"); int("depth_mm"); int("qty", 1);
  int("secondary_width_mm");
  int("sort_order", 0);
  int("carcass_thickness_mm", 16); int("back_panel_thickness_mm", 16);
  int("scribe_thickness_mm", 18);
  int("shelf_qty", 0); int("shelf_thickness_mm", 16);
  num("cost_per_sqm_carcass"); num("cost_per_sqm_shelf");
  num("unit_cost_per_sqm_ex_gst");
  bool("back_panel_included"); bool("hinge_holes"); bool("hinge_supply");
  bool("has_kickboard");
  int("kickboard_height_mm", 150); int("kickboard_thickness_mm", 16); str("kickboard_span");
  bool("has_filler_panel");
  int("filler_panel_height_mm"); int("filler_panel_thickness_mm", 16); str("filler_panel_span");
  bool("end_panel_left"); bool("end_panel_right"); bool("has_back_panel"); bool("panel_to_floor");
  bool("back_panel_wall1"); bool("back_panel_wall2");
  str("back_panel_span"); int("back_panel_qty", 1);
  bool("has_bottom_panel"); str("bottom_panel_span"); int("bottom_panel_qty", 1);
  str("front_type");
  bool("has_rangehood");
  int("rangehood_housing_height_mm"); int("rangehood_channel_width_mm");
  if ("door_config" in payload) patch.door_config = payload.door_config ?? null;
  if ("door_style"  in payload) patch.door_style  = payload.door_style  ?? null;
  if ("finish_panel_style" in payload) patch.finish_panel_style = payload.finish_panel_style ?? null;
  if ("drawer_config"  in payload) patch.drawer_config  = payload.drawer_config  ?? null;
  if ("drawer_style"   in payload) patch.drawer_style   = payload.drawer_style   ?? null;
  if ("section_config" in payload) patch.section_config = payload.section_config ?? null;
  if ("room_id" in payload) patch.room_id = payload.room_id || null;
  if ("shelf_heights_mm" in payload) patch.shelf_heights_mm = Array.isArray(payload.shelf_heights_mm) ? payload.shelf_heights_mm : [];
  if ("unit_cost_mode" in payload) patch.unit_cost_mode = payload.unit_cost_mode === "manual" ? "manual" : "auto";
  return patch;
}

export async function PATCH(request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { projectId, itemId } = await getIds(params);
    const payload = await request.json();
    const patch = buildPatch(payload);

    if (!Object.keys(patch).length) {
      return Response.json({ ok: false, error: "No fields to update." }, { status: 422 });
    }

    const { data, error } = await context.supabase
      .from("pcd_design_items")
      .update(patch)
      .eq("id", itemId)
      .eq("design_project_id", projectId)
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, item: data });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not update item." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { projectId, itemId } = await getIds(params);
    const { error } = await context.supabase
      .from("pcd_design_items")
      .delete()
      .eq("id", itemId)
      .eq("design_project_id", projectId);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not delete item." }, { status: 500 });
  }
}
