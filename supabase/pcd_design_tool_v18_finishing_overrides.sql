-- Per-piece finishing colour overrides for design-tool cabinets.
--
-- Kickboards, fillers, underside panels and finished back panels normally match
-- another part of the cabinet (the carcass, or the doors for a filler on a
-- doored cabinet). These optional *_style jsonb overrides let a piece carry its
-- own { material, finish, colour, thickness_mm, cost_per_sqm } instead — e.g. a
-- black kickboard or a door-matched filler over a white carcass. NULL / empty
-- means "match" (the existing behaviour), so this is backward compatible.

alter table public.pcd_design_items
  add column if not exists kickboard_style    jsonb,
  add column if not exists filler_panel_style jsonb,
  add column if not exists bottom_panel_style jsonb,
  add column if not exists back_panel_style   jsonb;

notify pgrst, 'reload schema';
