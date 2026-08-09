-- Door/drawer front placement relative to finished side panels.

alter table public.pcd_design_items
  add column if not exists front_panel_mode text default 'over_side_panels';

comment on column public.pcd_design_items.front_panel_mode is
  '"over_side_panels" = fronts widen over finished side-panel front edges; "inset_between_side_panels" = finished side panels project forward and fronts sit between them.';

notify pgrst, 'reload schema';
