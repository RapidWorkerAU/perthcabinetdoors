-- ============================================================
-- Design Tool v5 — Cabinet door configuration
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE pcd_design_items
  -- 'none' | 'doors' | 'drawers'
  ADD COLUMN IF NOT EXISTS front_type   text    DEFAULT 'none',
  -- JSON: { columns, rows, hinges, equal_width, width_ratios }
  ADD COLUMN IF NOT EXISTS door_config  jsonb   DEFAULT NULL,
  -- JSON: { material, finish, colour, thickness_mm, profile_type, profile, edge_mould, cost_per_sqm }
  ADD COLUMN IF NOT EXISTS door_style   jsonb   DEFAULT NULL;
