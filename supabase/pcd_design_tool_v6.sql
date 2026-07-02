-- ============================================================
-- Design Tool v6 — Corner base cabinets + fixes for two columns
-- the app already relied on but were never actually migrated
-- (rotation, y_mm)
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE pcd_design_items
  -- Footprint width along the item's SECOND wall — only used by
  -- corner_base_cabinet. width_mm continues to mean the footprint along
  -- the primary `wall`; secondary_width_mm is the equivalent for
  -- `secondary_wall`. depth_mm is shared between both legs.
  ADD COLUMN IF NOT EXISTS secondary_width_mm integer,
  -- The second wall a corner cabinet's footprint touches (same enum as
  -- `wall`: top / bottom / left / right). NULL for every non-corner item,
  -- and for a corner cabinet sitting away from an actual room corner
  -- (e.g. mid-island) where only one elevation is relevant.
  ADD COLUMN IF NOT EXISTS secondary_wall text,
  -- Rotation in degrees (0/90/180/270) — used for island-placed cabinets
  -- to indicate which edge faces the room. Referenced by the app since
  -- the original setup but never added to the schema until now.
  ADD COLUMN IF NOT EXISTS rotation integer NOT NULL DEFAULT 0,
  -- Position along the vertical (depth) axis for left/right wall items —
  -- referenced by the app since the original setup but never added to
  -- the schema until now.
  ADD COLUMN IF NOT EXISTS y_mm integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN pcd_design_items.secondary_width_mm IS 'Footprint width along secondary_wall for corner_base_cabinet items';
COMMENT ON COLUMN pcd_design_items.secondary_wall IS 'Second wall a corner cabinet touches — NULL for non-corner items';
COMMENT ON COLUMN pcd_design_items.rotation IS 'Rotation in degrees (0/90/180/270), used for island-placed items';
COMMENT ON COLUMN pcd_design_items.y_mm IS 'Position along the depth axis for left/right wall items';
