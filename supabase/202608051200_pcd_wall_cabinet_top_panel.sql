-- Finished top panels for wall cabinets.
--
-- Mirrors the existing finished underside panel fields, but the board sits on
-- top of the wall-cabinet carcass. When finished side panels are enabled, the
-- top panel is cut wider so it covers those side panels too.

alter table public.pcd_design_items
  add column if not exists has_top_panel boolean default false,
  add column if not exists top_panel_span text default 'continuous',
  add column if not exists top_panel_qty integer default 1,
  add column if not exists top_panel_style jsonb;

comment on column public.pcd_design_items.has_top_panel is
  'Whether this wall cabinet has a finished panel covering its visible top.';

comment on column public.pcd_design_items.top_panel_span is
  '"continuous" = one top panel run spans adjacent wall cabinets; "individual" = separate top panel per cabinet.';

comment on column public.pcd_design_items.top_panel_qty is
  'Number of equal-width panels to split a continuous top-panel run into.';

comment on column public.pcd_design_items.top_panel_style is
  'Optional colour/rate override for a finished wall-cabinet top panel. Defaults to finish_panel_style / door style / carcass.';

notify pgrst, 'reload schema';
