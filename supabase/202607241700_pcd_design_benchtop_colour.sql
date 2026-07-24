-- Benchtop VISUAL colour — design-tool only, NEVER quoted.
--
-- Independent of benchtop_material (which drives the per-m² price). A benchtop
-- left as "Drawn only" (no material, off the quote) can still be coloured so it
-- reads correctly in the plan, elevation and 3D views.
--
-- Two ways to colour it, mirroring how cabinet finishes work:
--   benchtop_colour_style — a colour-library selection {material, finish,
--     colour} (typically a Compact Laminate), resolved to a tile image and used
--     to texture the benchtop like a cabinet finish (shows when "show colours"
--     is on).
--   benchtop_colour_hex — a flat colour, shown always.
-- The UI sets one or the other (picking one clears the other).

alter table public.pcd_design_items
  add column if not exists benchtop_colour_style jsonb,
  add column if not exists benchtop_colour_hex text;

comment on column public.pcd_design_items.benchtop_colour_style is
  'Design-tool only (never quoted): colour-library selection {material,finish,colour} used to texture the benchtop visual. Independent of benchtop_material.';
comment on column public.pcd_design_items.benchtop_colour_hex is
  'Design-tool only (never quoted): flat hex colour for the benchtop visual, when not using a library colour.';

notify pgrst, 'reload schema';
