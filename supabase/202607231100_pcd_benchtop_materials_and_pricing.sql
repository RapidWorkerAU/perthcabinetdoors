-- Benchtops become a quotable product (audit Phase 2, p2-2).
--
-- Until now benchtops were DRAWN, NEVER QUOTED — the design tool modelled the
-- top (run, depth, thickness, waterfall ends, sink/cooktop cutouts) purely for
-- the drawing and the fabricator, with deliberately no material and no rate.
-- PCD now sells them, priced PER SQUARE METRE from a small benchtop material
-- catalogue, with sink/cooktop cutouts and waterfall ends charged as extras.
--
-- This migration adds:
--   1. pcd_benchtop_materials — the rate catalogue (name + $/m²), the benchtop
--      counterpart to the colour library.
--   2. benchtop_material / benchtop_cost_per_sqm on design items — the chosen
--      material and its frozen rate, set from the catalogue in the design tool
--      (mirrors how a cabinet carries cost_per_sqm_carcass).
--
-- The seeded rates are PLACEHOLDERS — adjust them to PCD's real ex-GST $/m².

create table if not exists public.pcd_benchtop_materials (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  cost_per_sqm_ex_gst numeric not null default 0,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.pcd_benchtop_materials enable row level security;

-- Admin-only, matching the other pcd_* catalogue tables. Adjust the policy name
-- / role check to match your existing admin RLS convention if it differs.
drop policy if exists pcd_benchtop_materials_admin_all on public.pcd_benchtop_materials;
create policy pcd_benchtop_materials_admin_all
  on public.pcd_benchtop_materials
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

insert into public.pcd_benchtop_materials (name, cost_per_sqm_ex_gst, sort_order)
values
  ('Laminate',           150, 10),
  ('Compact Laminate',   400, 20),
  ('Engineered Stone',   600, 30),
  ('Natural Stone',      800, 40),
  ('Timber',             500, 50)
on conflict do nothing;

alter table public.pcd_design_items
  add column if not exists benchtop_material     text,
  add column if not exists benchtop_cost_per_sqm numeric;

comment on column public.pcd_design_items.benchtop_cost_per_sqm is
  'Frozen ex-GST $/m² for this benchtop, copied from the chosen '
  'pcd_benchtop_materials row when the material is picked in the design tool. '
  'The quote import prices the benchtop run area at this rate; sink/cooktop '
  'cutouts and waterfall ends are added as extras.';

notify pgrst, 'reload schema';
