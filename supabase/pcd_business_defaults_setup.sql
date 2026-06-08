create extension if not exists "pgcrypto";

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.pcd_business_defaults (
  id uuid primary key default '00000000-0000-0000-0000-000000000001',
  markup_percent numeric(8,2) not null default 40,
  hinge_drilling_unit_cost_ex_gst numeric(12,2) not null default 10,
  hinge_supply_unit_cost_ex_gst numeric(12,2) not null default 15,
  worker_hourly_rate numeric(12,2) not null default 85,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (markup_percent >= 0),
  check (hinge_drilling_unit_cost_ex_gst >= 0),
  check (hinge_supply_unit_cost_ex_gst >= 0),
  check (worker_hourly_rate >= 0)
);

insert into public.pcd_business_defaults (
  id,
  markup_percent,
  hinge_drilling_unit_cost_ex_gst,
  hinge_supply_unit_cost_ex_gst,
  worker_hourly_rate
)
values (
  '00000000-0000-0000-0000-000000000001',
  40,
  10,
  15,
  85
)
on conflict (id) do nothing;

drop trigger if exists trg_pcd_business_defaults_updated_at on public.pcd_business_defaults;
create trigger trg_pcd_business_defaults_updated_at
before update on public.pcd_business_defaults
for each row execute function public.set_updated_at_timestamp();

alter table public.pcd_business_defaults enable row level security;

drop policy if exists "pcd_business_defaults_admin_all" on public.pcd_business_defaults;
create policy "pcd_business_defaults_admin_all"
on public.pcd_business_defaults
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
