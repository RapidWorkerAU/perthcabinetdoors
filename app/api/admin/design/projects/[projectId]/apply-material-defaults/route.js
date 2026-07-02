import { requireAdminApiContext } from "../../../../../../../lib/admin-api";

async function getProjectId(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.projectId;
}

function dbText(value) {
  const s = String(value ?? "").trim();
  return s || null;
}

const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet"];

// Unlike applyMaterialDefaults() in items/route.js (which only fills blank
// fields when an item is first created), this OVERWRITES every relevant
// field with the project's current defaults — the whole point of "apply to
// all" is to force everything back in line, even items a user has already
// customized. A category is only touched at all if that default has a
// material set; categories the user never configured are left untouched.
function buildForcedPatch(item, defaults) {
  const patch = {};
  const hasMaterial = (obj) => obj && String(obj.material || "").trim();

  if (CABINET_TYPES.includes(item.item_type)) {
    const carcass = defaults.carcass?.[item.item_type];
    if (hasMaterial(carcass)) {
      patch.material = dbText(carcass.material);
      patch.finish = dbText(carcass.finish);
      patch.colour = dbText(carcass.colour);
      if (carcass.thickness_mm) patch.carcass_thickness_mm = carcass.thickness_mm;
      if (carcass.cost_per_sqm != null) patch.cost_per_sqm_carcass = carcass.cost_per_sqm;
    }

    const shelf = defaults.shelf;
    if (hasMaterial(shelf)) {
      patch.shelf_material = dbText(shelf.material);
      patch.shelf_finish = dbText(shelf.finish);
      patch.shelf_colour = dbText(shelf.colour);
      if (shelf.thickness_mm) patch.shelf_thickness_mm = shelf.thickness_mm;
      if (shelf.cost_per_sqm != null) patch.cost_per_sqm_shelf = shelf.cost_per_sqm;
    }

    const door = defaults.door;
    if (hasMaterial(door) && (item.front_type === "doors" || item.front_type === "mixed")) {
      patch.door_style = { ...(item.door_style || {}), ...door };
    }

    const drawer = defaults.drawer;
    if (hasMaterial(drawer) && (item.front_type === "drawers" || item.front_type === "mixed")) {
      patch.drawer_style = { ...(item.drawer_style || {}), ...drawer };
    }
  } else if (item.item_type === "panel") {
    const panel = defaults.panel;
    if (hasMaterial(panel)) {
      patch.material = dbText(panel.material);
      patch.finish = dbText(panel.finish);
      patch.colour = dbText(panel.colour);
      if (panel.cost_per_sqm != null) patch.unit_cost_per_sqm_ex_gst = panel.cost_per_sqm;
    }
  }

  return patch;
}

export async function POST(_request, { params }) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const projectId = await getProjectId(params);

    const { data: projectRow, error: projectError } = await context.supabase
      .from("pcd_design_projects")
      .select("material_defaults")
      .eq("id", projectId)
      .single();
    if (projectError) throw projectError;

    const defaults = projectRow?.material_defaults;
    if (!defaults) {
      return Response.json({ ok: false, error: "No material defaults set for this project yet." }, { status: 422 });
    }

    const { data: items, error: itemsError } = await context.supabase
      .from("pcd_design_items")
      .select("*")
      .eq("design_project_id", projectId);
    if (itemsError) throw itemsError;

    let updated = 0;
    for (const item of items || []) {
      const patch = buildForcedPatch(item, defaults);
      if (!Object.keys(patch).length) continue;
      const { error } = await context.supabase
        .from("pcd_design_items")
        .update(patch)
        .eq("id", item.id);
      if (error) throw error;
      updated += 1;
    }

    return Response.json({ ok: true, updated });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not apply material defaults." }, { status: 500 });
  }
}
