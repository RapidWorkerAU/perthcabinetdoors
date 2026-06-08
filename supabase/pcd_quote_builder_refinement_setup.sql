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

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_business_defaults'
      and policyname = 'Authenticated users can manage business defaults'
  ) then
    create policy "Authenticated users can manage business defaults"
      on public.pcd_business_defaults
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

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
  add column if not exists markup_amount_ex_gst numeric(12,2) not null default 0,
  add column if not exists deposit_required boolean not null default false,
  add column if not exists deposit_percent numeric(6,2) not null default 0;

alter table public.pcd_quote_line_items
  add column if not exists product_type text,
  add column if not exists material text,
  add column if not exists thickness text,
  add column if not exists profile_type text,
  add column if not exists hinge_holes boolean not null default false,
  add column if not exists hinge_supply boolean not null default false,
  add column if not exists hinge_qty text,
  add column if not exists hinge_drilling_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists hinge_supply_cost_ex_gst numeric(12,2) not null default 0,
  add column if not exists hinge_drilling_qty numeric(12,2) not null default 0,
  add column if not exists hinge_supply_qty numeric(12,2) not null default 0;

alter table public.pcd_quote_line_items
  alter column markup_percent set default 40;

update public.pcd_quote_line_items
set
  hinge_drilling_qty = case
    when hinge_holes and hinge_qty ~ '^[0-9]+(\.[0-9]+)?$' then hinge_qty::numeric * qty
    else 0
  end,
  hinge_supply_qty = case
    when hinge_supply and hinge_qty ~ '^[0-9]+(\.[0-9]+)?$' then hinge_qty::numeric * qty
    else 0
  end
where coalesce(hinge_drilling_qty, 0) = 0
  and coalesce(hinge_supply_qty, 0) = 0
  and (hinge_holes or hinge_supply);

alter table public.pcd_orders
  add column if not exists deposit_required boolean not null default false,
  add column if not exists deposit_amount numeric(12,2) not null default 0,
  add column if not exists deposit_paid boolean not null default false,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists target_completion_date date,
  add column if not exists customer_comms text,
  add column if not exists internal_notes text;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pcd_orders'
      and column_name = 'admin_viewed_at'
  ) then
    alter table public.pcd_orders
      add column admin_viewed_at timestamptz;

    update public.pcd_orders
    set admin_viewed_at = coalesce(created_at, timezone('utc', now()));
  end if;
end $$;

alter table public.pcd_orders
  alter column quote_id drop not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'pcd_orders_quote_id_fkey'
      and conrelid = 'public.pcd_orders'::regclass
  ) then
    alter table public.pcd_orders
      drop constraint pcd_orders_quote_id_fkey;
  end if;

  alter table public.pcd_orders
    add constraint pcd_orders_quote_id_fkey
    foreign key (quote_id) references public.pcd_quotes(id) on delete set null;
end;
$$;

alter table public.pcd_quote_request_line_items
  add column if not exists thickness text;

alter table public.pcd_order_line_items
  add column if not exists thickness text;

alter table public.pcd_orders
  alter column deposit_required set default false;

create table if not exists public.pcd_order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pcd_orders(id) on delete cascade,
  payment_type text not null default 'progress' check (
    payment_type in ('deposit', 'progress', 'final', 'other')
  ),
  amount numeric(12,2) not null default 0,
  is_paid boolean not null default false,
  paid_at date,
  request_status text not null default 'not_requested',
  requested_at timestamptz,
  request_url text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_payment_status text,
  receipt_number text,
  receipt_sent_at timestamptz,
  receipt_pdf_url text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_pcd_order_payments_order on public.pcd_order_payments(order_id);
create unique index if not exists idx_pcd_order_payments_stripe_session
  on public.pcd_order_payments(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
create index if not exists idx_pcd_order_payments_request_status
  on public.pcd_order_payments(request_status);

alter table public.pcd_quotes
  drop constraint if exists pcd_quotes_deposit_percent_check;

alter table public.pcd_quotes
  add constraint pcd_quotes_deposit_percent_check
  check (deposit_percent >= 0 and deposit_percent <= 100);

drop trigger if exists trg_pcd_order_payments_updated_at on public.pcd_order_payments;
create trigger trg_pcd_order_payments_updated_at
before update on public.pcd_order_payments
for each row execute function public.set_updated_at_timestamp();

create table if not exists public.pcd_order_activity (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.pcd_orders(id) on delete cascade,
  quote_id uuid references public.pcd_quotes(id) on delete set null,
  quote_request_id uuid references public.pcd_quote_requests(id) on delete set null,
  actor_type text not null default 'system' check (
    actor_type in ('system', 'admin', 'customer')
  ),
  action_type text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  event_key text unique,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_pcd_order_activity_order on public.pcd_order_activity(order_id);
create index if not exists idx_pcd_order_activity_quote on public.pcd_order_activity(quote_id);
create index if not exists idx_pcd_order_activity_quote_request on public.pcd_order_activity(quote_request_id);
create index if not exists idx_pcd_order_activity_created on public.pcd_order_activity(created_at);

alter table public.pcd_order_activity enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pcd_order_activity'
      and policyname = 'Authenticated users can manage order activity'
  ) then
    create policy "Authenticated users can manage order activity"
      on public.pcd_order_activity
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

insert into public.pcd_order_activity (
  quote_request_id,
  actor_type,
  action_type,
  title,
  description,
  metadata,
  event_key,
  created_at
)
select
  request.id,
  'customer',
  'quote_request_submitted',
  'Quote request submitted',
  concat_ws(' - ', nullif(request.customer_name, ''), nullif(request.delivery_suburb, ''), nullif(request.source, '')),
  jsonb_build_object('source', request.source, 'line_items', line_counts.line_count),
  'quote_request:' || request.id || ':submitted',
  request.created_at
from public.pcd_quote_requests request
left join (
  select quote_request_id, count(*)::integer as line_count
  from public.pcd_quote_request_line_items
  group by quote_request_id
) line_counts on line_counts.quote_request_id = request.id
on conflict (event_key) do nothing;

insert into public.pcd_order_activity (
  quote_id,
  actor_type,
  action_type,
  title,
  description,
  metadata,
  event_key,
  created_at
)
select
  quote.id,
  'admin',
  'quote_created',
  'Quote created',
  concat_ws(' - ', quote.quote_number, nullif(quote.customer_name, '')),
  jsonb_build_object('status', quote.status, 'total_inc_gst', quote.total_inc_gst),
  'quote:' || quote.id || ':created',
  quote.created_at
from public.pcd_quotes quote
on conflict (event_key) do nothing;

insert into public.pcd_order_activity (
  quote_id,
  quote_request_id,
  actor_type,
  action_type,
  title,
  description,
  metadata,
  event_key,
  created_at
)
select
  request.converted_quote_id,
  request.id,
  'admin',
  'quote_request_converted',
  'Quote request converted to quote',
  concat_ws(' - ', quote.quote_number, nullif(request.customer_name, '')),
  jsonb_build_object('quote_number', quote.quote_number),
  'quote_request:' || request.id || ':converted',
  coalesce(quote.created_at, request.updated_at, request.created_at)
from public.pcd_quote_requests request
join public.pcd_quotes quote on quote.id = request.converted_quote_id
where request.converted_quote_id is not null
on conflict (event_key) do nothing;

insert into public.pcd_order_activity (
  order_id,
  quote_id,
  actor_type,
  action_type,
  title,
  description,
  metadata,
  event_key,
  created_at
)
select
  orders.id,
  orders.quote_id,
  'customer',
  'quote_approved_order_created',
  'Quote accepted and order created',
  concat_ws(' - ', orders.order_number, nullif(orders.customer_name, '')),
  jsonb_build_object('order_number', orders.order_number, 'total_inc_gst', orders.total_inc_gst),
  'order:' || orders.id || ':created',
  coalesce(orders.accepted_at, orders.created_at)
from public.pcd_orders orders
on conflict (event_key) do nothing;

create table if not exists public.pcd_colour_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  image_path text,
  is_active boolean not null default true,
  supplier_name text not null default 'Polytec',
  material_type text not null check (
    material_type in (
      'decorative board',
      'compact laminate',
      'thermolaminate'
    )
  ),
  thickness text,
  finish_type text not null,
  order_type text not null default 'supply board' check (
    order_type in ('supply board', 'made to order MTO')
  ),
  preferred_board_width_mm numeric(12,2) not null default 0,
  preferred_board_height_mm numeric(12,2) not null default 0,
  cost_per_board_ex_gst numeric(12,2) not null default 0,
  cost_per_sqm_ex_gst numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.pcd_colour_library
  add column if not exists thickness text;

alter table public.pcd_colour_library
  add column if not exists order_types text[] not null default array['supply board'];

alter table public.pcd_colour_library
  drop constraint if exists pcd_colour_library_material_type_check;

alter table public.pcd_colour_library
  add constraint pcd_colour_library_material_type_check
  check (material_type in ('decorative board', 'thermolaminate', 'compact laminate'));

update public.pcd_colour_library
set order_types = array[order_type]
where (order_types is null or cardinality(order_types) = 0)
  and order_type is not null;

alter table public.pcd_colour_library
  drop constraint if exists pcd_colour_library_order_types_check;

alter table public.pcd_colour_library
  add constraint pcd_colour_library_order_types_check
  check (
    order_types <@ array['supply board', 'made to order MTO']
    and cardinality(order_types) > 0
  );

create index if not exists idx_pcd_colour_library_material
  on public.pcd_colour_library(material_type);

create index if not exists idx_pcd_colour_library_material_thickness
  on public.pcd_colour_library(material_type, thickness);

create index if not exists idx_pcd_colour_library_finish
  on public.pcd_colour_library(finish_type);

create index if not exists idx_pcd_colour_library_active
  on public.pcd_colour_library(is_active);

drop trigger if exists trg_pcd_colour_library_updated_at on public.pcd_colour_library;
create trigger trg_pcd_colour_library_updated_at
before update on public.pcd_colour_library
for each row execute function public.set_updated_at_timestamp();

alter table public.pcd_order_line_items
  add column if not exists product_type text,
  add column if not exists material text,
  add column if not exists thickness text,
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
  add column if not exists panel_planning jsonb not null default '{}'::jsonb,
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
