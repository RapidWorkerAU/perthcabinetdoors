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

create table if not exists public.pcd_board_material_costs (
  id uuid primary key default gen_random_uuid(),
  material_name text not null unique,
  cost_per_sqm_ex_gst numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pcd_board_material_costs_material_name_not_blank
    check (length(trim(material_name)) > 0),
  constraint pcd_board_material_costs_cost_non_negative
    check (cost_per_sqm_ex_gst >= 0)
);

create table if not exists public.pcd_cabinet_configs (
  id uuid primary key default gen_random_uuid(),
  line_item_id uuid not null references public.pcd_quote_line_items(id) on delete cascade,
  quote_id uuid not null references public.pcd_quotes(id) on delete cascade,
  label text,
  height_mm numeric(12,2) not null default 0,
  width_mm numeric(12,2) not null default 0,
  depth_mm numeric(12,2) not null default 0,
  carcass_material text,
  carcass_finish text,
  carcass_colour text,
  carcass_thickness_mm numeric(12,2) not null default 16,
  back_panel_included boolean not null default true,
  back_panel_material text,
  back_panel_thickness_mm numeric(12,2) not null default 16,
  shelf_qty integer not null default 0,
  shelf_material text,
  shelf_finish text,
  shelf_colour text,
  shelf_thickness_mm numeric(12,2) not null default 16,
  shelf_heights_mm jsonb not null default '[]'::jsonb,
  cost_per_sqm_carcass numeric(12,2) not null default 0,
  cost_per_sqm_shelf numeric(12,2) not null default 0,
  -- HOURS, not dollars: priced against worker_hourly_rate at quote time.
  labour_hours numeric(12,2) not null default 0,
  calculated_cut_list jsonb not null default '[]'::jsonb,
  calculated_material_cost_ex_gst numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pcd_cabinet_configs_line_item_unique unique (line_item_id),
  constraint pcd_cabinet_configs_dimensions_non_negative
    check (height_mm >= 0 and width_mm >= 0 and depth_mm >= 0),
  constraint pcd_cabinet_configs_thicknesses_non_negative
    check (
      carcass_thickness_mm >= 0
      and back_panel_thickness_mm >= 0
      and shelf_thickness_mm >= 0
    ),
  constraint pcd_cabinet_configs_costs_non_negative
    check (
      cost_per_sqm_carcass >= 0
      and cost_per_sqm_shelf >= 0
      and labour_hours >= 0
      and calculated_material_cost_ex_gst >= 0
    ),
  constraint pcd_cabinet_configs_shelf_qty_non_negative
    check (shelf_qty >= 0),
  constraint pcd_cabinet_configs_shelf_heights_is_array
    check (jsonb_typeof(shelf_heights_mm) = 'array'),
  constraint pcd_cabinet_configs_cut_list_is_array
    check (jsonb_typeof(calculated_cut_list) = 'array')
);

alter table public.pcd_cabinet_configs
  add column if not exists shelf_heights_mm jsonb not null default '[]'::jsonb;

alter table public.pcd_cabinet_configs
  add column if not exists carcass_finish text;

alter table public.pcd_cabinet_configs
  add column if not exists carcass_colour text;

alter table public.pcd_cabinet_configs
  add column if not exists shelf_finish text;

alter table public.pcd_cabinet_configs
  add column if not exists shelf_colour text;

alter table public.pcd_cabinet_configs
  alter column back_panel_thickness_mm set default 16;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pcd_cabinet_configs_shelf_heights_is_array'
  ) then
    alter table public.pcd_cabinet_configs
      add constraint pcd_cabinet_configs_shelf_heights_is_array
      check (jsonb_typeof(shelf_heights_mm) = 'array');
  end if;
end $$;

create index if not exists idx_pcd_board_material_costs_material_name
  on public.pcd_board_material_costs(material_name);

create index if not exists idx_pcd_cabinet_configs_quote
  on public.pcd_cabinet_configs(quote_id);

create index if not exists idx_pcd_cabinet_configs_line_item
  on public.pcd_cabinet_configs(line_item_id);

drop trigger if exists trg_pcd_board_material_costs_updated_at on public.pcd_board_material_costs;
create trigger trg_pcd_board_material_costs_updated_at
before update on public.pcd_board_material_costs
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_pcd_cabinet_configs_updated_at on public.pcd_cabinet_configs;
create trigger trg_pcd_cabinet_configs_updated_at
before update on public.pcd_cabinet_configs
for each row execute function public.set_updated_at_timestamp();

alter table public.pcd_board_material_costs enable row level security;
alter table public.pcd_cabinet_configs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_board_material_costs'
      and policyname = 'Authenticated users can manage board material costs'
  ) then
    create policy "Authenticated users can manage board material costs"
      on public.pcd_board_material_costs
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_cabinet_configs'
      and policyname = 'Authenticated users can manage cabinet configs'
  ) then
    create policy "Authenticated users can manage cabinet configs"
      on public.pcd_cabinet_configs
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
