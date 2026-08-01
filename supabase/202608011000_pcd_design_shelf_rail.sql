-- Shelf & Rail — a new design-tool item_type ("shelf_rail") for the wardrobe
-- module that spans an opening on cleats: a shelf carried on a back cleat and
-- two end cleats, with an optional front rail stiffening its leading edge.
--
-- It is NOT a cabinet — no carcass, no doors, no back. Everything it needs that
-- already exists is reused from the base columns (wall / x_mm / width_mm as the
-- clear span / depth_mm / mount_height_mm / material / finish / colour /
-- carcass_thickness_mm as the shelf board thickness / cost_per_sqm_carcass), so
-- the only new storage is the parts config below.
--
-- item_type is a free-text column (no enum / CHECK constraint — see v13), so no
-- change is needed there.

ALTER TABLE pcd_design_items
  ADD COLUMN IF NOT EXISTS shelf_rail_config jsonb;

COMMENT ON COLUMN pcd_design_items.shelf_rail_config IS
  'shelf_rail items only. The parts of a Shelf & Rail module: '
  '{ left_support, right_support ("wall" | "cabinet" | "panel" | "open"), '
  'back_cleat, end_cleat_left, end_cleat_right (booleans), '
  'rail_height_mm (the cleats AND the front rail share one height so both rip '
  'from the same strip), cleat_thickness_mm (always 18 — cleats are structural), '
  'front_rail: { on, setback_mm }, cleat_style (optional own colour, restricted '
  'to library colours available in 18mm), rails: [] (reserved — hanging rails '
  'are deliberately out of scope for the first version, the array is here so '
  'adding one later needs no migration).';
