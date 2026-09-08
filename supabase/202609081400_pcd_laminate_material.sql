-- LAMINATE, THE FOURTH MATERIAL IN THE COLOUR LIBRARY.
--
-- We sell four things off the colour library now: decorative board,
-- thermolaminate, compact laminate and plain laminate. Laminate is the 0.7mm
-- sheet on its own, sold as the sheet rather than as the stock a door is cut
-- from, so it is its own material with its own thickness and its own colours.
--
-- The check constraint written in pcd_quote_builder_refinement_setup.sql only
-- allowed the first three, so saving a laminate colour failed at the database
-- even once the app offered it. This relaxes it to allow the fourth and nothing
-- else, because the point of the constraint is to stop a typo becoming a
-- material.

begin;

alter table public.pcd_colour_library
  drop constraint if exists pcd_colour_library_material_type_check;

alter table public.pcd_colour_library
  add constraint pcd_colour_library_material_type_check
  check (material_type in ('decorative board', 'thermolaminate', 'compact laminate', 'laminate'));

commit;
