-- pcd_design_tool_v12.sql
-- Filler panel columns for wall cabinets — the wall-cabinet mirror of
-- kickboard/plinth (has_kickboard/kickboard_height_mm/etc. from v4), closing
-- the gap between a wall cabinet's top and the ceiling instead of the
-- floor-level toe-kick. filler_panel_height_mm has no DEFAULT (unlike
-- kickboard_height_mm's 150) since it's meant to auto-fill to the room's
-- ceiling height when unset — see fillerPanelGapMm() in
-- lib/pcd-fillerpanel-utils.js.

ALTER TABLE pcd_design_items
  ADD COLUMN IF NOT EXISTS has_filler_panel        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS filler_panel_height_mm  integer,
  ADD COLUMN IF NOT EXISTS filler_panel_span       text    DEFAULT 'continuous',
  ADD COLUMN IF NOT EXISTS filler_panel_thickness_mm integer DEFAULT 16;

COMMENT ON COLUMN pcd_design_items.has_filler_panel         IS 'Whether this wall cabinet has a filler panel closing the gap to the ceiling';
COMMENT ON COLUMN pcd_design_items.filler_panel_height_mm   IS 'Filler panel height in mm — null means auto-fill to the gap between cabinet top and room ceiling height';
COMMENT ON COLUMN pcd_design_items.filler_panel_span        IS '"continuous" = one piece spans adjacent wall cabinets in a run; "individual" = separate piece per cabinet';
COMMENT ON COLUMN pcd_design_items.filler_panel_thickness_mm IS 'Board thickness for filler panel in mm — typically 16mm';
