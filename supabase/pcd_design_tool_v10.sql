-- Project-level material defaults, applied once per project (not per room)
-- to pre-fill new items' board fields — always just a starting value, fully
-- editable afterward. Mirrors the door_style/drawer_style JSONB shape
-- already used on pcd_design_items.
-- Shape:
-- {
--   "carcass": {
--     "base_cabinet":         { material, thickness_mm, finish, colour, cost_per_sqm },
--     "wall_cabinet":         { ... },
--     "tall_cabinet":         { ... },
--     "corner_base_cabinet":  { ... }
--   },
--   "shelf":  { material, thickness_mm, finish, colour, cost_per_sqm },
--   "door":   { material, thickness_mm, finish, colour, profile_type, profile, edge_mould, cost_per_sqm },
--   "drawer": { same shape as door },
--   "panel":  { material, finish, colour, cost_per_sqm }
-- }
ALTER TABLE pcd_design_projects
  ADD COLUMN IF NOT EXISTS material_defaults jsonb;
