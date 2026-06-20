-- Design Tool tables
-- Run once in your Supabase SQL editor.

-- ---- Projects ----

create table if not exists public.pcd_design_projects (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  status     text        not null default 'draft',  -- draft / ready / imported
  notes      text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_pcd_design_projects_updated_at on public.pcd_design_projects;
create trigger trg_pcd_design_projects_updated_at
  before update on public.pcd_design_projects
  for each row execute function public.set_updated_at_timestamp();

alter table public.pcd_design_projects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pcd_design_projects'
      and policyname = 'Authenticated users can manage design projects'
  ) then
    create policy "Authenticated users can manage design projects"
      on public.pcd_design_projects for all to authenticated
      using (true) with check (true);
  end if;
end$$;

-- ---- Rooms ----

create table if not exists public.pcd_design_rooms (
  id                 uuid        primary key default gen_random_uuid(),
  design_project_id  uuid        not null references public.pcd_design_projects(id) on delete cascade,
  name               text        not null,
  width_mm           integer,
  depth_mm           integer,
  height_mm          integer,
  sort_order         integer     not null default 0,
  created_at         timestamptz not null default timezone('utc', now()),
  updated_at         timestamptz not null default timezone('utc', now())
);

create index if not exists idx_pcd_design_rooms_project
  on public.pcd_design_rooms(design_project_id);

alter table public.pcd_design_rooms enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pcd_design_rooms'
      and policyname = 'Authenticated users can manage design rooms'
  ) then
    create policy "Authenticated users can manage design rooms"
      on public.pcd_design_rooms for all to authenticated
      using (true) with check (true);
  end if;
end$$;

-- ---- Items ----

create table if not exists public.pcd_design_items (
  id                        uuid        primary key default gen_random_uuid(),
  design_project_id         uuid        not null references public.pcd_design_projects(id) on delete cascade,
  room_id                   uuid        references public.pcd_design_rooms(id) on delete set null,
  item_type                 text        not null,  -- base_cabinet / wall_cabinet / tall_cabinet / door / drawer_front / panel
  label                     text,
  sort_order                integer     not null default 0,
  wall                      text,                  -- top / bottom / left / right / island
  x_mm                      integer     not null default 0,
  width_mm                  integer,
  height_mm                 integer,
  depth_mm                  integer,
  qty                       integer     not null default 1,
  material                  text,
  finish                    text,
  colour                    text,
  thickness                 text,
  profile_type              text,
  profile                   text,
  edge_mould                text,
  hinge_holes               boolean     not null default false,
  hinge_supply              boolean     not null default false,
  hinge_qty                 text,
  notes                     text,
  carcass_thickness_mm      integer     not null default 16,
  back_panel_included       boolean     not null default true,
  back_panel_thickness_mm   integer     not null default 16,
  shelf_qty                 integer     not null default 0,
  shelf_material            text,
  shelf_finish              text,
  shelf_colour              text,
  shelf_thickness_mm        integer     not null default 16,
  shelf_heights_mm          jsonb       not null default '[]',
  cost_per_sqm_carcass      numeric,
  cost_per_sqm_shelf        numeric,
  unit_cost_per_sqm_ex_gst  numeric,
  unit_cost_mode            text        not null default 'auto',
  created_at                timestamptz not null default timezone('utc', now()),
  updated_at                timestamptz not null default timezone('utc', now())
);

create index if not exists idx_pcd_design_items_project
  on public.pcd_design_items(design_project_id);

create index if not exists idx_pcd_design_items_room
  on public.pcd_design_items(room_id);

drop trigger if exists trg_pcd_design_items_updated_at on public.pcd_design_items;
create trigger trg_pcd_design_items_updated_at
  before update on public.pcd_design_items
  for each row execute function public.set_updated_at_timestamp();

alter table public.pcd_design_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pcd_design_items'
      and policyname = 'Authenticated users can manage design items'
  ) then
    create policy "Authenticated users can manage design items"
      on public.pcd_design_items for all to authenticated
      using (true) with check (true);
  end if;
end$$;
