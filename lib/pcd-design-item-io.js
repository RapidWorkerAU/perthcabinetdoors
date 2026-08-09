// Shared design-item persistence helpers — the single source of truth for how a
// design item's payload becomes a `pcd_design_items` row (create) or a sparse
// update (patch), plus material-default back-fill. Extracted from the admin
// items routes so the PUBLIC (no-login) planner writes byte-identical rows and
// the two can never drift. Pure — no DB, no request — so both the admin routes
// (service-role, email-gated) and the public routes (service-role, code-scoped)
// call the same functions.

import { CABINET_MOUNT_MM } from "./pcd-kickboard-utils";

export function dbInt(value, fallback = null) {
  if (value === "" || value === null || value === undefined) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function dbNum(value, fallback = null) {
  if (value === "" || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function dbText(value) {
  const s = String(value ?? "").trim();
  return s || null;
}

// A bookcase counts as a cabinet everywhere that matters — it is a
// floor-standing carcass with a solid back and internal shelves, so it cuts,
// prices and imports exactly like one. What makes it a bookcase rather than a
// tall cabinet is that it is always open (front_type "none") and never takes a
// benchtop or a door, which the forms enforce rather than the data model.
export const CABINET_TYPES = ["base_cabinet", "wall_cabinet", "tall_cabinet", "corner_base_cabinet", "corner_tall_cabinet", "blind_corner_cabinet", "bookcase"];

// Every item_type the design tool can persist. The public planner passes its own
// tighter allowlist (a consumer subset) before ever reaching buildItemRow.
export const VALID_ITEM_TYPES = [...CABINET_TYPES, "floating_shelf", "shelf_rail", "door", "drawer_front", "panel", "scribe", "obstruction", "window", "door_opening", "appliance", "brick_corner_pantry"];

// Fills in blank board fields from the project's material_defaults — always just
// a fallback for a field the payload didn't already set (AddItemForm never sends
// material fields at all, so this is normally the only source), never overwrites
// something the caller actually specified.
export function applyMaterialDefaults(payload, defaults) {
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
  } else if (payload.item_type === "floating_shelf") {
    // Floating shelves are decorative-board boxes — they store their finish in
    // the same base/carcass columns a panel/carcass reads back from.
    const fs = defaults.floating_shelf;
    if (fs) {
      if (blank(merged.material)) merged.material = fs.material;
      if (blank(merged.finish))   merged.finish   = fs.finish;
      if (blank(merged.colour))   merged.colour   = fs.colour;
      if (blank(merged.carcass_thickness_mm)) merged.carcass_thickness_mm = fs.thickness_mm;
      if (blank(merged.cost_per_sqm_carcass)) merged.cost_per_sqm_carcass = fs.cost_per_sqm;
    }
  } else if (payload.item_type === "shelf_rail") {
    // A Shelf & Rail's SHELF board reads from the same base columns a panel or
    // a floating shelf does. Its cleats are always 18mm and carry their own
    // optional colour inside shelf_rail_config, so they're not defaulted here.
    const sr = defaults.shelf_rail || defaults.shelf;
    if (sr) {
      if (blank(merged.material)) merged.material = sr.material;
      if (blank(merged.finish))   merged.finish   = sr.finish;
      if (blank(merged.colour))   merged.colour   = sr.colour;
      if (blank(merged.carcass_thickness_mm)) merged.carcass_thickness_mm = sr.thickness_mm;
      if (blank(merged.cost_per_sqm_carcass)) merged.cost_per_sqm_carcass = sr.cost_per_sqm;
    }
  } else if (payload.item_type === "panel" || payload.item_type === "scribe") {
    // Scribe reuses the same material-defaults bucket as panel — it's quoted as
    // a "Panel" product line too, just a distinct design-tool item_type for its
    // own drag/snap/render rules.
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

// Default board thickness for a cabinet type's carcass and shelves. A bookcase
// carries books rather than crockery on a fixed shelf, so it's built out of the
// heavier 18mm board by default instead of the 16mm a kitchen carcass uses.
function defaultBoardThicknessMm(itemType) {
  return itemType === "bookcase" ? 18 : 16;
}

export function buildItemRow(payload, projectId) {
  const isCabinet = CABINET_TYPES.includes(payload.item_type);
  const isObstruction = payload.item_type === "obstruction";
  const boardT = defaultBoardThicknessMm(payload.item_type);
  return {
    design_project_id: projectId,
    room_id: payload.room_id || null,
    item_type: payload.item_type,
    label: dbText(payload.label),
    sort_order: dbInt(payload.sort_order) ?? 0,
    wall: dbText(payload.wall),
    secondary_wall: dbText(payload.secondary_wall),
    corner_style: dbText(payload.corner_style),
    x_mm: dbInt(payload.x_mm) ?? 0,
    y_mm: dbInt(payload.y_mm) ?? 0,
    rotation: dbInt(payload.rotation) ?? 0,
    width_mm: dbInt(payload.width_mm),
    height_mm: dbInt(payload.height_mm),
    depth_mm: dbInt(payload.depth_mm),
    secondary_width_mm: dbInt(payload.secondary_width_mm),
    blind_width_mm: dbInt(payload.blind_width_mm),
    blind_side: dbText(payload.blind_side),
    qty: dbInt(payload.qty) ?? 1,
    material: dbText(payload.material),
    finish: dbText(payload.finish),
    colour: dbText(payload.colour),
    // Per-item display colour override (hex). Base column so it persists for any
    // item type, incl. obstructions (whose branch below adds nothing).
    colour_hex: dbText(payload.colour_hex),
    appliance_kind: dbText(payload.appliance_kind),
    notes: dbText(payload.notes),
    // Per-type, not a hard 0. Every reader falls back with
    // `mount_height_mm ?? CABINET_MOUNT_MM[item_type]` (wall = 1400), but a
    // stored 0 is not null, so it defeated all of them: the add form never sends
    // a mount height, so every new wall cabinet was written at floor level.
    mount_height_mm: dbInt(payload.mount_height_mm) ?? CABINET_MOUNT_MM[payload.item_type] ?? 0,
    ...(isObstruction
      ? {}
      : isCabinet
      ? {
          carcass_thickness_mm: dbInt(payload.carcass_thickness_mm) ?? boardT,
          back_panel_included: payload.back_panel_included ?? true,
          back_panel_thickness_mm: dbInt(payload.back_panel_thickness_mm) ?? 16,
          shelf_qty: dbInt(payload.shelf_qty) ?? 0,
          shelf_material: dbText(payload.shelf_material),
          shelf_finish: dbText(payload.shelf_finish),
          shelf_colour: dbText(payload.shelf_colour),
          shelf_thickness_mm: dbInt(payload.shelf_thickness_mm) ?? boardT,
          shelf_heights_mm: Array.isArray(payload.shelf_heights_mm) ? payload.shelf_heights_mm : [],
          cost_per_sqm_carcass: dbNum(payload.cost_per_sqm_carcass),
          cost_per_sqm_shelf: dbNum(payload.cost_per_sqm_shelf),
          unit_cost_per_sqm_ex_gst: dbNum(payload.unit_cost_per_sqm_ex_gst),
          unit_cost_mode: payload.unit_cost_mode === "manual" ? "manual" : "auto",
          has_kickboard:          Boolean(payload.has_kickboard ?? false),
          kickboard_height_mm:    dbInt(payload.kickboard_height_mm) ?? 120,
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
          panel_to_ceiling:       Boolean(payload.panel_to_ceiling ?? false),
          side_filler_left:          Boolean(payload.side_filler_left ?? false),
          side_filler_right:         Boolean(payload.side_filler_right ?? false),
          side_filler_left_width_mm:  dbInt(payload.side_filler_left_width_mm),
          side_filler_right_width_mm: dbInt(payload.side_filler_right_width_mm),
          side_filler_thickness_mm:   dbInt(payload.side_filler_thickness_mm) ?? 18,
          has_benchtop:              Boolean(payload.has_benchtop ?? false),
          benchtop_span:             dbText(payload.benchtop_span) || "continuous",
          benchtop_thickness_mm:     dbInt(payload.benchtop_thickness_mm) ?? 40,
          benchtop_overhang_mm:      dbInt(payload.benchtop_overhang_mm) ?? 20,
          benchtop_waterfall_left:   Boolean(payload.benchtop_waterfall_left ?? false),
          benchtop_waterfall_right:  Boolean(payload.benchtop_waterfall_right ?? false),
          benchtop_cutouts:          Array.isArray(payload.benchtop_cutouts) ? payload.benchtop_cutouts : [],
          benchtop_material:         dbText(payload.benchtop_material),
          benchtop_cost_per_sqm:     dbNum(payload.benchtop_cost_per_sqm),
          benchtop_colour_style:     payload.benchtop_colour_style ?? null,
          benchtop_colour_hex:       dbText(payload.benchtop_colour_hex),
          handle_name:               dbText(payload.handle_name),
          handle_cost_ex_gst:        dbNum(payload.handle_cost_ex_gst),
          hinge_model:               dbText(payload.hinge_model),
          hinge_cost_ex_gst:         dbNum(payload.hinge_cost_ex_gst),
          has_bottom_panel:       Boolean(payload.has_bottom_panel ?? false),
          bottom_panel_span:      dbText(payload.bottom_panel_span) || "continuous",
          bottom_panel_qty:       dbInt(payload.bottom_panel_qty) ?? 1,
          has_top_panel:          Boolean(payload.has_top_panel ?? false),
          top_panel_span:         dbText(payload.top_panel_span) || "continuous",
          top_panel_qty:          dbInt(payload.top_panel_qty) ?? 1,
          finish_panel_style:     payload.finish_panel_style ?? null,
          front_type:             dbText(payload.front_type) || "none",
          front_panel_mode:       dbText(payload.front_panel_mode) || "over_side_panels",
          door_config:            payload.door_config ?? null,
          door_style:             payload.door_style  ?? null,
          drawer_config:          payload.drawer_config  ?? null,
          drawer_style:           payload.drawer_style   ?? null,
          section_config:         payload.section_config ?? null,
          has_rangehood:                Boolean(payload.has_rangehood ?? false),
          rangehood_housing_height_mm:  dbInt(payload.rangehood_housing_height_mm),
          rangehood_channel_width_mm:   dbInt(payload.rangehood_channel_width_mm),
        }
      : payload.item_type === "floating_shelf"
      ? {
          // Reads back through floatingShelfStyle(): finish in the base
          // material/finish/colour columns, thickness + cost in the carcass
          // columns. Persisted here so a material default set at creation sticks.
          carcass_thickness_mm: dbInt(payload.carcass_thickness_mm) ?? 18,
          cost_per_sqm_carcass: dbNum(payload.cost_per_sqm_carcass),
          end_panel_left:  Boolean(payload.end_panel_left ?? false),
          end_panel_right: Boolean(payload.end_panel_right ?? false),
        }
      : payload.item_type === "shelf_rail"
      ? {
          // Shelf board finish in the base columns (read back through
          // shelfRailStyle); everything that makes it a Shelf & Rail — the
          // cleats, the front rail, what each end lands on — is one JSONB blob.
          carcass_thickness_mm: dbInt(payload.carcass_thickness_mm) ?? 18,
          cost_per_sqm_carcass: dbNum(payload.cost_per_sqm_carcass),
          shelf_rail_config: payload.shelf_rail_config ?? null,
        }
      : {
          thickness: dbText(payload.thickness),
          profile_type: dbText(payload.profile_type),
          profile: dbText(payload.profile),
          edge_mould: dbText(payload.edge_mould),
          hinge_holes: Boolean(payload.hinge_holes),
          hinge_supply: Boolean(payload.hinge_supply),
          hinge_qty: dbText(payload.hinge_qty),
          scribe_thickness_mm: dbInt(payload.scribe_thickness_mm) ?? 18,
          panel_thickness_mm: dbInt(payload.panel_thickness_mm),
        }),
  };
}

export function buildItemPatch(payload) {
  const patch = {};
  const str = (key) => { if (key in payload) patch[key] = dbText(payload[key]); };
  const int = (key, fb = null) => { if (key in payload) patch[key] = dbInt(payload[key], fb); };
  const num = (key) => { if (key in payload) patch[key] = dbNum(payload[key]); };
  const bool = (key) => { if (key in payload) patch[key] = Boolean(payload[key]); };

  str("label"); str("wall"); str("secondary_wall"); str("material"); str("finish"); str("colour"); str("colour_hex"); str("notes");
  str("corner_style"); str("appliance_kind");
  str("thickness"); str("profile_type"); str("profile"); str("edge_mould"); str("hinge_qty");
  str("shelf_material"); str("shelf_finish"); str("shelf_colour");
  int("x_mm", 0); int("y_mm", 0); int("rotation", 0); int("mount_height_mm");
  int("width_mm"); int("height_mm"); int("depth_mm"); int("qty", 1);
  int("secondary_width_mm"); int("blind_width_mm"); str("blind_side");
  int("sort_order", 0);
  int("carcass_thickness_mm", 16); int("back_panel_thickness_mm", 16);
  int("scribe_thickness_mm", 18); int("panel_thickness_mm");
  int("shelf_qty", 0); int("shelf_thickness_mm", 16);
  num("cost_per_sqm_carcass"); num("cost_per_sqm_shelf");
  num("unit_cost_per_sqm_ex_gst");
  bool("back_panel_included"); bool("hinge_holes"); bool("hinge_supply");
  bool("has_kickboard");
  int("kickboard_height_mm", 120); int("kickboard_thickness_mm", 16); str("kickboard_span");
  bool("has_filler_panel");
  int("filler_panel_height_mm"); int("filler_panel_thickness_mm", 16); str("filler_panel_span");
  bool("end_panel_left"); bool("end_panel_right"); bool("has_back_panel"); bool("panel_to_floor");
  bool("panel_to_ceiling");
  bool("side_filler_left"); bool("side_filler_right");
  int("side_filler_left_width_mm"); int("side_filler_right_width_mm"); int("side_filler_thickness_mm", 18);
  bool("back_panel_wall1"); bool("back_panel_wall2");
  str("back_panel_span"); int("back_panel_qty", 1);
  bool("has_benchtop"); str("benchtop_span");
  str("benchtop_material"); num("benchtop_cost_per_sqm");
  str("benchtop_colour_hex");
  if ("benchtop_colour_style" in payload) patch.benchtop_colour_style = payload.benchtop_colour_style ?? null;
  int("benchtop_thickness_mm", 40); int("benchtop_overhang_mm", 20);
  bool("benchtop_waterfall_left"); bool("benchtop_waterfall_right");
  if ("benchtop_cutouts" in payload) patch.benchtop_cutouts = Array.isArray(payload.benchtop_cutouts) ? payload.benchtop_cutouts : [];
  bool("has_bottom_panel"); str("bottom_panel_span"); int("bottom_panel_qty", 1);
  bool("has_top_panel"); str("top_panel_span"); int("top_panel_qty", 1);
  str("front_type");
  str("front_panel_mode");
  str("handle_name"); num("handle_cost_ex_gst"); str("hinge_model"); num("hinge_cost_ex_gst");
  bool("has_rangehood");
  int("rangehood_housing_height_mm"); int("rangehood_channel_width_mm");
  if ("door_config" in payload) patch.door_config = payload.door_config ?? null;
  if ("door_style"  in payload) patch.door_style  = payload.door_style  ?? null;
  if ("finish_panel_style" in payload) patch.finish_panel_style = payload.finish_panel_style ?? null;
  // Optional per-piece finishing colour overrides (each defaults to a "match").
  if ("kickboard_style" in payload) patch.kickboard_style = payload.kickboard_style ?? null;
  if ("filler_panel_style" in payload) patch.filler_panel_style = payload.filler_panel_style ?? null;
  if ("bottom_panel_style" in payload) patch.bottom_panel_style = payload.bottom_panel_style ?? null;
  if ("top_panel_style" in payload) patch.top_panel_style = payload.top_panel_style ?? null;
  if ("back_panel_style" in payload) patch.back_panel_style = payload.back_panel_style ?? null;
  if ("drawer_config"  in payload) patch.drawer_config  = payload.drawer_config  ?? null;
  if ("drawer_style"   in payload) patch.drawer_style   = payload.drawer_style   ?? null;
  if ("section_config" in payload) patch.section_config = payload.section_config ?? null;
  if ("shelf_rail_config" in payload) patch.shelf_rail_config = payload.shelf_rail_config ?? null;
  if ("room_id" in payload) patch.room_id = payload.room_id || null;
  if ("shelf_heights_mm" in payload) patch.shelf_heights_mm = Array.isArray(payload.shelf_heights_mm) ? payload.shelf_heights_mm : [];
  if ("unit_cost_mode" in payload) patch.unit_cost_mode = payload.unit_cost_mode === "manual" ? "manual" : "auto";
  return patch;
}
