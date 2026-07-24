-- Hardware catalogue: handles & hinges as priced SKUs (audit Phase 2, p2-3b).
--
-- Runners are priced from fixed business-default rates (they're a fixed set of
-- 3 types — see runner_unit_cost_* in DEFAULT_BUSINESS_DEFAULTS). Handles and
-- hinges are open-ended (many models), so they get a managed catalogue, the
-- counterpart to pcd_benchtop_materials.
--
-- Assignment is per cabinet: a chosen handle (counted per door/drawer front)
-- and a chosen hinge model (counted per hinge), each freezing its unit cost
-- onto the item — the design tool sets these from this catalogue, and the quote
-- import adds a "Hardware" line for each. NB the import already charges hinge
-- DRILLING (per hole); the hinge model here adds the SUPPLY cost, which was
-- never charged before, so it's additive — not a double-charge.
--
-- Seeded rates are PLACEHOLDERS — adjust to PCD's real ex-GST unit costs.

create table if not exists public.pcd_hardware (
  id           uuid primary key default gen_random_uuid(),
  type         text not null default 'handle',   -- 'handle' | 'hinge'
  name         text not null,
  unit_cost_ex_gst numeric not null default 0,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.pcd_hardware enable row level security;

drop policy if exists pcd_hardware_admin_all on public.pcd_hardware;
create policy pcd_hardware_admin_all
  on public.pcd_hardware
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

insert into public.pcd_hardware (type, name, unit_cost_ex_gst, sort_order)
values
  ('handle', 'Bar Handle 128mm',   9, 10),
  ('handle', 'D-Handle 96mm',      7, 20),
  ('handle', 'Round Knob',         5, 30),
  ('handle', 'Edge Pull (handleless)', 12, 40),
  ('hinge',  'Standard Hinge',     3, 10),
  ('hinge',  'Soft-close Hinge',   6, 20)
on conflict do nothing;

-- Per-cabinet hardware selection + frozen unit cost (mirrors benchtop_material /
-- benchtop_cost_per_sqm). NULL = not supplied by PCD (customer's own).
alter table public.pcd_design_items
  add column if not exists handle_name        text,
  add column if not exists handle_cost_ex_gst numeric,
  add column if not exists hinge_model         text,
  add column if not exists hinge_cost_ex_gst   numeric;

notify pgrst, 'reload schema';
