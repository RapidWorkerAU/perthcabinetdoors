create extension if not exists "pgcrypto";

alter table public.pcd_quotes
  add column if not exists client_notes text,
  add column if not exists assumptions text,
  add column if not exists exclusions text,
  add column if not exists labour_hours numeric(12,2) not null default 0,
  add column if not exists worker_hourly_rate numeric(12,2) not null default 0,
  add column if not exists travel_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists delivery_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists installation_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists other_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists markup_percent numeric(8,2) not null default 0,
  add column if not exists markup_amount_ex_gst numeric(12,2) not null default 0;

alter table public.pcd_quote_line_items
  add column if not exists product_type text,
  add column if not exists material text,
  add column if not exists profile_type text,
  add column if not exists hinge_holes boolean not null default false,
  add column if not exists hinge_supply boolean not null default false,
  add column if not exists hinge_qty text,
  add column if not exists hinge_drilling_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists hinge_supply_cost_ex_gst numeric(12,2) not null default 0;

alter table public.pcd_quote_line_items
  alter column markup_percent set default 40;

alter table public.pcd_orders
  add column if not exists deposit_required boolean not null default true,
  add column if not exists deposit_amount numeric(12,2) not null default 0,
  add column if not exists deposit_paid boolean not null default false,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists target_completion_date date,
  add column if not exists customer_comms text,
  add column if not exists internal_notes text;

alter table public.pcd_order_line_items
  add column if not exists product_type text,
  add column if not exists material text,
  add column if not exists profile_type text,
  add column if not exists fulfilment_method text not null default 'in_house' check (
    fulfilment_method in ('in_house', 'supplier_ready_made')
  ),
  add column if not exists supplier_name text,
  add column if not exists supplier_order_ref text,
  add column if not exists supplier_ordered_at date,
  add column if not exists supplier_eta date,
  add column if not exists board_required boolean not null default false,
  add column if not exists board_ordered boolean not null default false,
  add column if not exists board_available boolean not null default false,
  add column if not exists production_stage text not null default 'Not Started' check (
    production_stage in (
      'Not Started',
      'Materials Ready',
      'Cutting',
      'Edging',
      'Profiling',
      'Thermolaminating',
      'Drilling',
      'Quality Check',
      'Packed',
      'Ready for Install',
      'Complete',
      'Issue Follow-Up'
    )
  ),
  add column if not exists production_notes text;

create table if not exists public.pcd_colour_finishes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pcd_colour_tiles (
  id uuid primary key default gen_random_uuid(),
  finish_id uuid not null references public.pcd_colour_finishes(id) on delete cascade,
  supplier text not null default 'Polytec',
  name text not null,
  image_url text not null,
  image_path text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (finish_id, name, image_url)
);

create table if not exists public.pcd_colour_tile_materials (
  colour_tile_id uuid not null references public.pcd_colour_tiles(id) on delete cascade,
  material_key text not null check (material_key in ('thermolaminate', '16mm', '18mm', 'compact')),
  cost_per_sqm_ex_gst numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (colour_tile_id, material_key)
);

alter table public.pcd_colour_tile_materials
  add column if not exists cost_per_sqm_ex_gst numeric(12,2) not null default 0;

create index if not exists idx_pcd_colour_tiles_finish
  on public.pcd_colour_tiles(finish_id);

alter table public.pcd_colour_tiles
  add column if not exists supplier text not null default 'Polytec';

update public.pcd_colour_tiles
set supplier = 'Polytec'
where supplier is null
  or btrim(supplier) = '';

create index if not exists idx_pcd_colour_tile_materials_material
  on public.pcd_colour_tile_materials(material_key);

create table if not exists public.pcd_quote_attachments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.pcd_quotes(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_url text not null,
  file_type text,
  file_size bigint,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_pcd_quote_attachments_quote
  on public.pcd_quote_attachments(quote_id);

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do update
set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('colour-tiles', 'colour-tiles', true)
on conflict (id) do update
set public = excluded.public;

alter table public.pcd_colour_finishes enable row level security;
alter table public.pcd_colour_tiles enable row level security;
alter table public.pcd_colour_tile_materials enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_colour_finishes'
      and policyname = 'Public can read colour finishes'
  ) then
    create policy "Public can read colour finishes"
      on public.pcd_colour_finishes
      for select
      to public
      using (is_active = true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_colour_tiles'
      and policyname = 'Public can read colour tiles'
  ) then
    create policy "Public can read colour tiles"
      on public.pcd_colour_tiles
      for select
      to public
      using (is_active = true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_colour_tile_materials'
      and policyname = 'Public can read colour tile materials'
  ) then
    create policy "Public can read colour tile materials"
      on public.pcd_colour_tile_materials
      for select
      to public
      using (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_colour_finishes'
      and policyname = 'Authenticated users can manage colour finishes'
  ) then
    create policy "Authenticated users can manage colour finishes"
      on public.pcd_colour_finishes
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_colour_tiles'
      and policyname = 'Authenticated users can manage colour tiles'
  ) then
    create policy "Authenticated users can manage colour tiles"
      on public.pcd_colour_tiles
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_colour_tile_materials'
      and policyname = 'Authenticated users can manage colour tile materials'
  ) then
    create policy "Authenticated users can manage colour tile materials"
      on public.pcd_colour_tile_materials
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

alter table public.pcd_quote_attachments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_quote_attachments'
      and policyname = 'Authenticated users can manage quote attachments'
  ) then
    create policy "Authenticated users can manage quote attachments"
      on public.pcd_quote_attachments
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public can read quote attachments'
  ) then
    create policy "Public can read quote attachments"
      on storage.objects
      for select
      to public
      using (bucket_id = 'attachments');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload quote attachments'
  ) then
    create policy "Authenticated users can upload quote attachments"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'attachments');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can update quote attachments'
  ) then
    create policy "Authenticated users can update quote attachments"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'attachments')
      with check (bucket_id = 'attachments');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can delete quote attachments'
  ) then
    create policy "Authenticated users can delete quote attachments"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'attachments');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public can read colour tile images'
  ) then
    create policy "Public can read colour tile images"
      on storage.objects
      for select
      to public
      using (bucket_id = 'colour-tiles');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload colour tile images'
  ) then
    create policy "Authenticated users can upload colour tile images"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'colour-tiles');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can update colour tile images'
  ) then
    create policy "Authenticated users can update colour tile images"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'colour-tiles')
      with check (bucket_id = 'colour-tiles');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can delete colour tile images'
  ) then
    create policy "Authenticated users can delete colour tile images"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'colour-tiles');
  end if;
end;
$$;

notify pgrst, 'reload schema';
