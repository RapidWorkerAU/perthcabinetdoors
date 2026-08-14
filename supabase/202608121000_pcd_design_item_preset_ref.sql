-- IKEA props in the public design planner.
--
-- An IKEA cabinet in the planner is NOT a new item type. It is an ordinary
-- base / wall / tall cabinet whose box size is fixed to a standard IKEA frame,
-- so the customer can plan the doors, drawer fronts and panels that go on a
-- cabinet they already own. It is configured exactly like any other cabinet.
--
-- preset_ref is the only thing that marks one, e.g. 'ikea:metod:base:600x800'.
-- Two things read it:
--   * the right hand panel, to lock the width / height / depth fields
--   * the quote request builder, to leave the carcass out entirely (we do not
--     supply IKEA cabinets), exactly the way a fridge space or a window is
--     already left out
--
-- Null on every existing row and on everything we build ourselves.

alter table public.pcd_design_items
  add column if not exists preset_ref text;

comment on column public.pcd_design_items.preset_ref is
  'Set only on standard-size props the customer already owns (IKEA). Locks the box size in the planner and excludes the carcass from quote requests. Null for anything we manufacture.';

-- Quote request building filters on this, so keep the lookup cheap. Partial,
-- because the overwhelming majority of rows are null.
create index if not exists idx_pcd_design_items_preset_ref
  on public.pcd_design_items(design_project_id, preset_ref)
  where preset_ref is not null;

-- Supabase caches the table shape. Without this the API keeps reporting the new
-- column as missing ("Could not find the 'preset_ref' column ... in the schema
-- cache") long after it exists, and every insert that mentions it fails.
notify pgrst, 'reload schema';
