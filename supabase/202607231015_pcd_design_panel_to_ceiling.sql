-- Finished end/side panels that run up to the ceiling.
--
-- A finished end panel (base/tall/blind corner) or side panel (wall cabinet)
-- normally spans only the cabinet's own height. panel_to_floor already lets it
-- run DOWN through the kickboard recess to the floor. panel_to_ceiling is the
-- mirror at the top: the panel runs UP to the room ceiling instead of stopping
-- at the cabinet top — for a full-height finished end beside a fridge or oven
-- tower, or a wall cabinet whose finished side should carry on to the ceiling
-- (previously only faked with a detached standalone panel).
--
-- Independent of panel_to_floor: the two set the bottom and top of the panel
-- separately. NULL/false keeps the existing behaviour (stops at cabinet top).

alter table public.pcd_design_items
  add column if not exists panel_to_ceiling boolean not null default false;

comment on column public.pcd_design_items.panel_to_ceiling is
  'base/tall/blind-corner end panels and wall-cabinet side panels: when true '
  'the finished panel extends UP to the room ceiling instead of stopping at the '
  'cabinet top. Mirror of panel_to_floor (which extends DOWN to the floor); the '
  'two are independent. Height resolved by finishPanelVerticalSpanMm() so the '
  'quote import, front elevation and 3D view all agree.';

notify pgrst, 'reload schema';
