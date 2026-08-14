-- Carcass finish for props the customer already owns (IKEA).
--
-- Deliberately its OWN column rather than the existing material / finish /
-- colour columns. Those are the carcass selection, and kickboards, back panels
-- and fillers all fall back to the carcass when they have no override of their
-- own (see slotColourFields). Putting "IKEA oak effect" there would quietly
-- become the colour of a kickboard we manufacture and quote.
--
-- This column is read by exactly one thing: the 3D and plan views, to paint the
-- box so the customer recognises the cabinet standing in their kitchen. It is
-- never priced, never quoted, and has no link to pcd_colour_library.
--
-- Holds an IKEA finish name, e.g. 'Oak effect'. Null on everything else.

alter table public.pcd_design_items
  add column if not exists prop_carcass_finish text;

comment on column public.pcd_design_items.prop_carcass_finish is
  'Visual-only carcass finish for a customer-owned prop (IKEA). Not from our colour library and never quoted. Kept apart from material/finish/colour so finishing pieces cannot inherit it.';

-- Supabase caches the table shape; without this the API keeps reporting the new
-- column as missing long after it exists.
notify pgrst, 'reload schema';
