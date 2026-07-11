-- pcd_design_tool_v15.sql
-- Finishing-panel material for cabinets. A finished end/side/back/underside
-- panel is a separate finished board that sits OVER the carcass side — it is
-- NOT carcass material. Until now these panels inherited the cabinet's carcass
-- material and were priced at cost_per_sqm_carcass, which is wrong.
--
-- finish_panel_style holds its own material/finish/colour/thickness/rate,
-- shaped exactly like door_style / drawer_style (see FrontStyleFields in
-- app/admin/design/_components/DesignRightPanel.js). It defaults (in the UI and
-- in pricing fallbacks) to the door/front material, since finishing panels are
-- normally made to match the doors. Applies to base, tall AND wall cabinets and
-- flows through to the quote import.
ALTER TABLE pcd_design_items
  ADD COLUMN IF NOT EXISTS finish_panel_style jsonb;

COMMENT ON COLUMN pcd_design_items.finish_panel_style IS 'Finishing (end/side/back/underside) panel material for a cabinet: { material, finish, colour, thickness_mm, cost_per_sqm }. A finished board over the carcass side, distinct from carcass material. Defaults to the door/front material.';
