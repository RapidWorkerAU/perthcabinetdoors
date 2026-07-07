-- pcd_design_tool_v14.sql
-- Underside panel columns for wall cabinets — the counterpart to
-- back_panel_included/back_panel_span/back_panel_qty (v7/pcd_design_tool
-- setup) for finishing a wall cabinet's visible underside instead of a
-- floor-standing cabinet's back face. Continuous runs across adjacent wall
-- cabinets split into bottom_panel_qty equal panels, same mechanic as back
-- panel — see lib/pcd-bottompanel-utils.js.
ALTER TABLE pcd_design_items
  ADD COLUMN IF NOT EXISTS has_bottom_panel boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bottom_panel_span text DEFAULT 'continuous',
  ADD COLUMN IF NOT EXISTS bottom_panel_qty integer DEFAULT 1;

COMMENT ON COLUMN pcd_design_items.has_bottom_panel IS 'Whether this wall cabinet has a finished panel covering its visible underside';
COMMENT ON COLUMN pcd_design_items.bottom_panel_span IS '"continuous" = one piece spans adjacent wall cabinets in a run; "individual" = separate piece per cabinet';
COMMENT ON COLUMN pcd_design_items.bottom_panel_qty IS 'Number of equal-width panels to split a continuous underside-panel run into (e.g. 2 or 3 boards instead of one very wide one)';
