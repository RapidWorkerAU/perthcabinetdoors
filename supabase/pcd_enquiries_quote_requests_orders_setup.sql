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

create table if not exists public.pcd_enquiries (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  customer_email text,
  customer_phone text,
  postcode text,
  topic text,
  message text,
  status text not null default 'new' check (
    status in ('new', 'in_progress', 'responded', 'closed', 'not_required')
  ),
  internal_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pcd_quote_requests (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'request_quote' check (
    source in ('request_quote', 'product_detail')
  ),
  status text not null default 'new' check (
    status in ('new', 'reviewing', 'waiting_on_customer', 'converted_to_quote', 'closed')
  ),
  converted_quote_id uuid,
  product_id text,
  product_name text,
  customer_name text,
  customer_email text,
  customer_phone text,
  delivery_suburb text,
  cabinet_brand text,
  notes text,
  internal_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pcd_quote_request_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.pcd_quote_requests(id) on delete cascade,
  sort_order integer not null default 0,
  product_type text,
  product_name text,
  material text,
  thickness text,
  width_mm numeric(12,2),
  height_mm numeric(12,2),
  finish text,
  colour text,
  profile_type text,
  profile text,
  edge_mould text,
  qty numeric(12,2) not null default 1,
  hinge_holes boolean not null default false,
  hinge_supply boolean not null default false,
  hinge_qty text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pcd_orders (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid unique references public.pcd_quotes(id) on delete set null,
  customer_id uuid references public.pcd_customers(id) on delete set null,
  order_number text not null unique,
  name text,
  customer_name text,
  customer_email text,
  customer_phone text,
  site_address text,
  status text not null default 'active' check (
    status in ('active', 'on_hold', 'complete', 'cancelled')
  ),
  accepted_at timestamptz,
  subtotal_ex_gst numeric(12,2) not null default 0,
  gst_amount numeric(12,2) not null default 0,
  total_inc_gst numeric(12,2) not null default 0,
  admin_viewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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

create table if not exists public.pcd_order_line_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pcd_orders(id) on delete cascade,
  quote_line_item_id uuid references public.pcd_quote_line_items(id) on delete set null,
  sort_order integer not null default 0,
  title text,
  description text,
  material text,
  thickness text,
  width_mm numeric(12,2),
  height_mm numeric(12,2),
  finish text,
  colour text,
  profile text,
  edge_mould text,
  qty numeric(12,2) not null default 1,
  line_total_ex_gst numeric(12,2) not null default 0,
  status text not null default 'Not Ordered' check (
    status in (
      'Not Ordered',
      'Ordered',
      'Received',
      'Checked',
      'Installed',
      'Complete',
      'Issue Follow-Up'
    )
  ),
  notes text,
  status_updated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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

alter table public.pcd_quotes
  add column if not exists order_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pcd_quotes_order_id_fkey'
  ) then
    alter table public.pcd_quotes
      add constraint pcd_quotes_order_id_fkey
      foreign key (order_id) references public.pcd_orders(id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pcd_quote_requests_converted_quote_id_fkey'
  ) then
    alter table public.pcd_quote_requests
      add constraint pcd_quote_requests_converted_quote_id_fkey
      foreign key (converted_quote_id) references public.pcd_quotes(id) on delete set null;
  end if;
end;
$$;

create index if not exists idx_pcd_enquiries_status on public.pcd_enquiries(status);
create index if not exists idx_pcd_enquiries_created on public.pcd_enquiries(created_at);
create index if not exists idx_pcd_quote_requests_status on public.pcd_quote_requests(status);
create index if not exists idx_pcd_quote_requests_created on public.pcd_quote_requests(created_at);
create index if not exists idx_pcd_quote_request_lines_request on public.pcd_quote_request_line_items(quote_request_id);
create index if not exists idx_pcd_orders_quote on public.pcd_orders(quote_id);
create index if not exists idx_pcd_orders_customer on public.pcd_orders(customer_id);
create index if not exists idx_pcd_order_line_items_order on public.pcd_order_line_items(order_id);
create index if not exists idx_pcd_order_line_items_status on public.pcd_order_line_items(status);
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

drop trigger if exists trg_pcd_enquiries_updated_at on public.pcd_enquiries;
create trigger trg_pcd_enquiries_updated_at
before update on public.pcd_enquiries
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_pcd_quote_requests_updated_at on public.pcd_quote_requests;
create trigger trg_pcd_quote_requests_updated_at
before update on public.pcd_quote_requests
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_pcd_quote_request_line_items_updated_at on public.pcd_quote_request_line_items;
create trigger trg_pcd_quote_request_line_items_updated_at
before update on public.pcd_quote_request_line_items
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_pcd_orders_updated_at on public.pcd_orders;
create trigger trg_pcd_orders_updated_at
before update on public.pcd_orders
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_pcd_order_line_items_updated_at on public.pcd_order_line_items;
create trigger trg_pcd_order_line_items_updated_at
before update on public.pcd_order_line_items
for each row execute function public.set_updated_at_timestamp();

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

notify pgrst, 'reload schema';
