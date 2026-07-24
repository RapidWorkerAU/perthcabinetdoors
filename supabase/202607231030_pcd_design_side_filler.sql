-- Attached side-filler panels.
--
-- A side filler closes the horizontal gap BESIDE a cabinet — between the
-- cabinet end and an adjacent wall, tall unit, appliance cavity or obstruction
-- (e.g. a scribe filler beside a fridge, or infill to the wall at the end of a
-- run). Previously this could only be faked with a detached standalone panel,
-- which didn't move or delete with the cabinet and was easy to leave stranded.
--
-- Unlike the existing filler_panel_* fields (which close the gap ABOVE a
-- wall/tall cabinet to the ceiling), the side filler is horizontal and applies
-- to every cabinet type. It's attached to the cabinet: per-side toggles, a
-- manual width per side (the measured gap), and a shared thickness. Its height
-- follows the cabinet via finishPanelVerticalSpanMm (so panel_to_floor /
-- panel_to_ceiling carry through), and its colour matches the doors/carcass —
-- the same defaults the kickboard uses. Priced as a "Panel" quote line.

alter table public.pcd_design_items
  add column if not exists side_filler_left        boolean not null default false,
  add column if not exists side_filler_right       boolean not null default false,
  add column if not exists side_filler_left_width_mm  integer,
  add column if not exists side_filler_right_width_mm integer,
  add column if not exists side_filler_thickness_mm   integer;

comment on column public.pcd_design_items.side_filler_left_width_mm is
  'Attached side filler (left end, viewer-facing): the measured gap width in mm '
  'the filler closes. Null/0 means the filler is off or unconfigured. Height '
  'follows the cabinet (finishPanelVerticalSpanMm); colour matches doors/carcass.';

comment on column public.pcd_design_items.side_filler_right_width_mm is
  'Attached side filler (right end, viewer-facing): the measured gap width in mm.';

notify pgrst, 'reload schema';
