-- pcd_design_tool_v13.sql
-- Scribe support — a new design-tool item_type ("scribe") for a side filler
-- piece that sits flush against a cabinet's front face and runs sideways to
-- an obstruction, as opposed to the existing "panel" item type which runs
-- depth-wise. item_type is a free-text column (no enum/CHECK constraint),
-- so no schema change is needed for the new type value itself — only its
-- own thickness field.
--
-- Unlike "panel" (which overloads width_mm as thickness and depth_mm as its
-- real span, noted as a confusing hack in the app code), scribe keeps
-- width_mm/height_mm at their normal meaning and gets its own dedicated
-- scribe_thickness_mm column instead of overloading depth_mm — named with
-- the scribe_ prefix for the same reason kickboard_thickness_mm/
-- filler_panel_thickness_mm/shelf_thickness_mm are all feature-prefixed
-- rather than a single ambiguous "thickness_mm".
ALTER TABLE pcd_design_items
  ADD COLUMN IF NOT EXISTS scribe_thickness_mm integer DEFAULT 18;

COMMENT ON COLUMN pcd_design_items.scribe_thickness_mm IS 'Material thickness in mm for a scribe item (item_type = scribe) — its plan-view footprint depth, since scribe uses width_mm for its real along-wall span rather than overloading it like panel does';
