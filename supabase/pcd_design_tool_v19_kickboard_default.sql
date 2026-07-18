-- Kickboard height default lowered from 150mm to 120mm.
--
-- New cabinets should default to a 120mm kickboard. Existing rows keep their
-- stored value (this only changes the column default for future inserts that
-- don't specify a height; the app always sends one, so this is belt-and-braces).

alter table public.pcd_design_items
  alter column kickboard_height_mm set default 120;

comment on column public.pcd_design_items.kickboard_height_mm is 'Kickboard height in mm — default 120mm';

notify pgrst, 'reload schema';
