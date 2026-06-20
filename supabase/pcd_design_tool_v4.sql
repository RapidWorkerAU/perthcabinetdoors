-- pcd_design_tool_v4.sql
-- Adds kickboard/plinth columns to pcd_design_items

ALTER TABLE pcd_design_items
  ADD COLUMN IF NOT EXISTS has_kickboard        boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS kickboard_height_mm  integer  DEFAULT 150,
  ADD COLUMN IF NOT EXISTS kickboard_span       text     DEFAULT 'continuous',
  ADD COLUMN IF NOT EXISTS kickboard_thickness_mm integer DEFAULT 16;

COMMENT ON COLUMN pcd_design_items.has_kickboard         IS 'Whether this cabinet has a kickboard/plinth at floor level';
COMMENT ON COLUMN pcd_design_items.kickboard_height_mm   IS 'Kickboard height in mm — Australian standard is 150mm';
COMMENT ON COLUMN pcd_design_items.kickboard_span        IS '"continuous" = one piece spans adjacent cabinets in a run; "individual" = separate piece per cabinet';
COMMENT ON COLUMN pcd_design_items.kickboard_thickness_mm IS 'Board thickness for kickboard in mm — typically 16mm';
