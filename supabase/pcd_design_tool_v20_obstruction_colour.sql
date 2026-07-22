-- pcd_design_tool_v20_obstruction_colour.sql
-- Per-item display colour override for the design tool. Obstructions (nib
-- walls, windows on a wall, brick recesses, etc.) all render in one hardcoded
-- grey; this lets an individual obstruction be recoloured on the design tool
-- (e.g. a window obstruction shown in light blue) with the colour persisting
-- for that item. Stored as a raw hex string ("#RRGGBB"); NULL means "use the
-- default per-type colour". Named colour_hex — distinct from the existing
-- free-text `colour` column, which stores a colour-LIBRARY name for cabinet
-- carcasses, not a display hex.
ALTER TABLE pcd_design_items
  ADD COLUMN IF NOT EXISTS colour_hex text;

COMMENT ON COLUMN pcd_design_items.colour_hex IS 'Design-tool-only per-item display colour override as a hex string (#RRGGBB); NULL = use the default per-type colour. Currently surfaced for obstruction items via the colour picker in the design tool.';
