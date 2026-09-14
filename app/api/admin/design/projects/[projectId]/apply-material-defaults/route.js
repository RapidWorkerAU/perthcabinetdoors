import { requireAdminApiContext } from "../../../../../../../lib/admin-api";

async function getProjectId(params) {
  const resolved = await Promise.resolve(params);
  return resolved?.projectId;
}

function dbText(value) {
  const s = String(value ?? "").trim();
  return s || null;
}

// One definition, in lib/pcd-design-item-io.js. This was written out by hand
// in seven files; see test/one-definition.test.mjs for why it now is not.
import { CABINET_TYPES } from "../../../../../../../lib/pcd-design-item-io";
import { PANEL_STYLE_DEFAULTS, panelStyleFromDefault } from "../../../../../../../lib/pcd-panel-options";

// Unlike applyMaterialDefaults() in items/route.js (which only fills blank
// fields when an item is first created), this OVERWRITES every relevant
// field with the project's current defaults — the whole point of "apply to
// all" is to force everything back in line, even items a user has already
// customized. A category is only touched at all if that default has a
// material set; categories the user never configured are left untouched.
//
// AND IT WRITES THE BOARD, NOT JUST THE WORDS. A board is two things on an
// item: the words (material, finish, colour, thickness) and WHICH LIBRARY ROW
// it is, which is what every price downstream is read from. This wrote the
// words and left the row alone, so a wardrobe rewritten to Black Texture 16mm
// went on pointing at a Laminex Black AbsoluteMatte 18mm and reached the quote
// at $145.49 a square metre with "16mm Black Texture" printed beside it. The
// row and the supplier are now set from the default every time, and set to
// NOTHING when the default has none, because a leftover id is worse than no id:
// no id prices by name and says when it cannot, a wrong id prices confidently
// off the wrong board.
function buildForcedPatch(item, defaults) {
  const patch = {};
  const hasMaterial = (obj) => obj && String(obj.material || "").trim();
  // Which library row this board is, and whose it is, read from one place so no
  // branch below can forget it again.
  const boardId = (obj) => obj.colour_library_id || null;
  const boardSupplier = (obj) => dbText(obj.supplier || obj.supplier_name);

  if (CABINET_TYPES.includes(item.item_type)) {
    const carcass = defaults.carcass?.[item.item_type];
    if (hasMaterial(carcass)) {
      patch.material = dbText(carcass.material);
      patch.finish = dbText(carcass.finish);
      patch.colour = dbText(carcass.colour);
      if (carcass.thickness_mm) patch.carcass_thickness_mm = carcass.thickness_mm;
      if (carcass.cost_per_sqm != null) patch.cost_per_sqm_carcass = carcass.cost_per_sqm;
      patch.colour_library_id = boardId(carcass);
      patch.supplier_name = boardSupplier(carcass);
    }

    const shelf = defaults.shelf;
    if (hasMaterial(shelf)) {
      patch.shelf_material = dbText(shelf.material);
      patch.shelf_finish = dbText(shelf.finish);
      patch.shelf_colour = dbText(shelf.colour);
      if (shelf.thickness_mm) patch.shelf_thickness_mm = shelf.thickness_mm;
      if (shelf.cost_per_sqm != null) patch.cost_per_sqm_shelf = shelf.cost_per_sqm;
      patch.shelf_colour_library_id = boardId(shelf);
      patch.shelf_supplier_name = boardSupplier(shelf);
    }

    const door = defaults.door;
    if (hasMaterial(door) && (item.front_type === "doors" || item.front_type === "mixed")) {
      // Merged so the door-only fields (profile, edge mould) survive, but the
      // board identity is stated outright: without it the new colour sat on top
      // of the library row the doors used to be.
      patch.door_style = { ...(item.door_style || {}), ...door, colour_library_id: boardId(door), supplier: boardSupplier(door) || null };
    }

    const drawer = defaults.drawer;
    if (hasMaterial(drawer) && (item.front_type === "drawers" || item.front_type === "mixed")) {
      patch.drawer_style = { ...(item.drawer_style || {}), ...drawer, colour_library_id: boardId(drawer), supplier: boardSupplier(drawer) || null };
    }

    // THE APPLIED PANELS: the kickboard, the filler and the finished panels.
    // These were the one thing "apply to all" could not reach, so a kickboard
    // with a colour picked on it stayed that colour for ever. Replaced whole
    // rather than merged, because a half-overwritten style keeps the old
    // supplier and library row behind the new colour.
    for (const def of PANEL_STYLE_DEFAULTS) {
      if (!def.applies(item)) continue;
      const style = panelStyleFromDefault(def, defaults[def.key]);
      if (!style) continue;
      patch[def.styleKey] = style;
      if (style.thickness_mm && def.thicknessField) patch[def.thicknessField] = style.thickness_mm;
      // A colour picked on ONE end panel beats the finished-panel default, so
      // it has to go or nothing on the drawing changes.
      for (const key of def.clears) patch[key] = null;
    }
  } else if (item.item_type === "shelf_rail") {
    const sr = defaults.shelf_rail || defaults.shelf;
    if (hasMaterial(sr)) {
      patch.material = dbText(sr.material);
      patch.finish = dbText(sr.finish);
      patch.colour = dbText(sr.colour);
      if (sr.thickness_mm) patch.carcass_thickness_mm = sr.thickness_mm;
      if (sr.cost_per_sqm != null) patch.cost_per_sqm_carcass = sr.cost_per_sqm;
      patch.colour_library_id = boardId(sr);
      patch.supplier_name = boardSupplier(sr);
    }
    // The cleats and the front rail, which live inside the config blob rather
    // than in columns of their own. Merged into the config so the supports, the
    // rail height and the setback on this one are not thrown away.
    const cleat = defaults.shelf_rail_cleat;
    if (hasMaterial(cleat)) {
      patch.shelf_rail_config = {
        ...(item.shelf_rail_config || {}),
        cleat_style: {
          material: dbText(cleat.material),
          finish: dbText(cleat.finish),
          colour: dbText(cleat.colour),
          thickness_mm: cleat.thickness_mm || 18,
          cost_per_sqm: Number(cleat.cost_per_sqm) || 0,
          colour_library_id: boardId(cleat),
          supplier: boardSupplier(cleat) || "",
        },
      };
    }
  } else if (item.item_type === "floating_shelf") {
    const fs = defaults.floating_shelf;
    if (hasMaterial(fs)) {
      patch.material = dbText(fs.material);
      patch.finish = dbText(fs.finish);
      patch.colour = dbText(fs.colour);
      if (fs.thickness_mm) patch.carcass_thickness_mm = fs.thickness_mm;
      if (fs.cost_per_sqm != null) patch.cost_per_sqm_carcass = fs.cost_per_sqm;
      patch.colour_library_id = boardId(fs);
      patch.supplier_name = boardSupplier(fs);
    }
  } else if (item.item_type === "panel" || item.item_type === "scribe") {
    const panel = defaults.panel;
    if (hasMaterial(panel)) {
      patch.material = dbText(panel.material);
      patch.finish = dbText(panel.finish);
      patch.colour = dbText(panel.colour);
      if (panel.cost_per_sqm != null) patch.unit_cost_per_sqm_ex_gst = panel.cost_per_sqm;
      patch.colour_library_id = boardId(panel);
      patch.supplier_name = boardSupplier(panel);
      // AND ITS THICKNESS, the other half of the same mistake: a scribe kept
      // the 18mm it was created at while every other line in the job moved to
      // 16mm. A scribe and a panel keep theirs in their own columns, not in
      // carcass_thickness_mm.
      if (panel.thickness_mm) {
        if (item.item_type === "scribe") patch.scribe_thickness_mm = panel.thickness_mm;
        else patch.panel_thickness_mm = panel.thickness_mm;
      }
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
