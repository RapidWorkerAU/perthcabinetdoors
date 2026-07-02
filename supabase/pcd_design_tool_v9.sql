-- Finished back panels for corner base cabinets — one per leg (Wall 1 =
-- primary, against item.wall; Wall 2 = secondary, against
-- item.secondary_wall). Manual per-leg toggles rather than auto-detected
-- exposure, same rationale as the corner door's manual second-wall picker.
-- Reuses the existing panel_to_floor / has_kickboard / kickboard_height_mm
-- columns already on pcd_design_items — no new columns needed for those.
ALTER TABLE pcd_design_items
  ADD COLUMN IF NOT EXISTS back_panel_wall1 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS back_panel_wall2 boolean NOT NULL DEFAULT false;
