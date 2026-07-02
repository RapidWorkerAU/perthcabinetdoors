-- End panels and finished back panels for base/tall cabinets (island runs etc).
-- panel_to_floor is shared by both: floor-to-top vs carcass-height-only
-- (kickboard, if any, continues to handle the floor-level recess).
ALTER TABLE pcd_design_items
  ADD COLUMN IF NOT EXISTS end_panel_left boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS end_panel_right boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_back_panel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS back_panel_span text NOT NULL DEFAULT 'continuous',
  ADD COLUMN IF NOT EXISTS back_panel_qty integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS panel_to_floor boolean NOT NULL DEFAULT false;
