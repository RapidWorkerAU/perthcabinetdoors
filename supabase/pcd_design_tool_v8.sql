-- Drawers (single-column drawer bank) and mixed door+drawer cabinet fronts.
-- drawer_config: { heights_mm: [...], gap_enabled, gap_mm, runner_type }
-- drawer_style: same shape as door_style (material/thickness_mm/finish/colour/
--   profile_type/profile/edge_mould/cost_per_sqm)
-- section_config: { sections: [ { height_mm, type: "doors"|"drawers", door: {...}, drawer: {...} }, ... ] }
--   used when front_type = "mixed" — door_style/drawer_style still apply
--   cabinet-wide to every section of that type, not per-section.
ALTER TABLE pcd_design_items
  ADD COLUMN IF NOT EXISTS drawer_config jsonb,
  ADD COLUMN IF NOT EXISTS drawer_style jsonb,
  ADD COLUMN IF NOT EXISTS section_config jsonb;
