-- Give the standalone "panel" item its own thickness field, retiring the
-- width_mm overload.
--
-- A standalone panel is a thin board on edge. Historically its board thickness
-- was stored in width_mm (the plan-view footprint dimension, which for an
-- on-edge panel genuinely equals the thickness) and kept loosely in sync with
-- the board "thickness" string. Overloading one column as both the plan
-- footprint and the board thickness was a foot-gun: the two could drift apart,
-- importing a panel with the wrong width or a blank thickness column.
--
-- panel_thickness_mm is now the single source of truth for a panel's thickness
-- (mirroring scribe_thickness_mm, added earlier). width_mm is kept as a derived
-- mirror of it so the existing plan/elevation/3D geometry — which reads width_mm
-- as the thin across-wall dimension — keeps working with no change. Backfill it
-- from the current width_mm so existing panels are unaffected.

alter table public.pcd_design_items
  add column if not exists panel_thickness_mm integer;

update public.pcd_design_items
  set panel_thickness_mm = width_mm
  where item_type = 'panel'
    and panel_thickness_mm is null
    and width_mm is not null;

comment on column public.pcd_design_items.panel_thickness_mm is
  'Standalone "panel" item only: the board thickness in mm — the single source '
  'of truth, replacing the old width_mm overload. width_mm is kept in sync as a '
  'derived mirror for the plan/3D geometry, which reads it as the thin '
  'across-wall footprint dimension. Mirrors scribe_thickness_mm.';

notify pgrst, 'reload schema';
