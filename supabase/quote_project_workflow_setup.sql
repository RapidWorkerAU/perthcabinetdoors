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

create table if not exists public.pcd_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text,
  email text,
  phone text,
  site_address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pcd_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  access_code text not null unique,
  project_id uuid,
  customer_id uuid references public.pcd_customers(id) on delete set null,
  title text not null default 'Cabinetry Quote',
  status text not null default 'draft' check (
    status in ('draft', 'sent', 'viewed', 'approved', 'rejected')
  ),
  customer_name text,
  customer_email text,
  customer_phone text,
  site_address text,
  project_name text,
  currency text not null default 'AUD',
  gst_rate numeric(6,4) not null default 0.1,
  material_cost_ex_gst numeric(12,2) not null default 0,
  labour_cost_ex_gst numeric(12,2) not null default 0,
  subtotal_ex_gst numeric(12,2) not null default 0,
  gst_amount numeric(12,2) not null default 0,
  total_inc_gst numeric(12,2) not null default 0,
  notes text,
  terms text,
  sent_at timestamptz,
  viewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pcd_quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.pcd_quotes(id) on delete cascade,
  sort_order integer not null default 0,
  product_id uuid references public.products(id) on delete set null,
  product_type text,
  product_name text,
  description text,
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
  product_unit_cost_ex_gst numeric(12,2) not null default 0,
  material_cost_ex_gst numeric(12,2) not null default 0,
  hinge_drilling_cost_ex_gst numeric(12,2) not null default 0,
  hinge_supply_cost_ex_gst numeric(12,2) not null default 0,
  hinge_drilling_qty numeric(12,2) not null default 0,
  hinge_supply_qty numeric(12,2) not null default 0,
  labour_hours numeric(12,2) not null default 0,
  worker_hourly_rate numeric(12,2) not null default 0,
  labour_cost_ex_gst numeric(12,2) not null default 0,
  travel_cost_ex_gst numeric(12,2) not null default 0,
  delivery_cost_ex_gst numeric(12,2) not null default 0,
  installation_cost_ex_gst numeric(12,2) not null default 0,
  other_cost_ex_gst numeric(12,2) not null default 0,
  markup_percent numeric(8,2) not null default 0,
  markup_amount_ex_gst numeric(12,2) not null default 0,
  unit_price_ex_gst numeric(12,2) not null default 0,
  line_total_ex_gst numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pcd_quote_actions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.pcd_quotes(id) on delete cascade,
  action text not null check (action in ('viewed', 'approved', 'rejected')),
  client_name text,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pcd_projects (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.pcd_quotes(id) on delete cascade,
  customer_id uuid references public.pcd_customers(id) on delete set null,
  project_number text not null unique,
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
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pcd_project_line_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.pcd_projects(id) on delete cascade,
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

alter table public.pcd_quotes
  add column if not exists customer_id uuid;

alter table public.pcd_projects
  add column if not exists customer_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pcd_quotes_project_id_fkey'
  ) then
    alter table public.pcd_quotes
      add constraint pcd_quotes_project_id_fkey
      foreign key (project_id) references public.pcd_projects(id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pcd_quotes_customer_id_fkey'
  ) then
    alter table public.pcd_quotes
      add constraint pcd_quotes_customer_id_fkey
      foreign key (customer_id) references public.pcd_customers(id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pcd_projects_customer_id_fkey'
  ) then
    alter table public.pcd_projects
      add constraint pcd_projects_customer_id_fkey
      foreign key (customer_id) references public.pcd_customers(id) on delete set null;
  end if;
end;
$$;

insert into public.pcd_customers (name, email, phone, site_address)
select distinct on (lower(coalesce(nullif(q.customer_email, ''), q.customer_name, q.customer_phone, q.site_address)))
  coalesce(nullif(q.customer_name, ''), nullif(q.customer_email, ''), nullif(q.customer_phone, ''), 'Customer') as name,
  nullif(q.customer_email, '') as email,
  nullif(q.customer_phone, '') as phone,
  nullif(q.site_address, '') as site_address
from public.pcd_quotes q
where q.customer_id is null
  and (
    nullif(q.customer_name, '') is not null
    or nullif(q.customer_email, '') is not null
    or nullif(q.customer_phone, '') is not null
  )
  and not exists (
    select 1
    from public.pcd_customers existing
    where lower(coalesce(nullif(existing.email, ''), existing.name, existing.phone, existing.site_address)) =
      lower(coalesce(nullif(q.customer_email, ''), q.customer_name, q.customer_phone, q.site_address))
  );

update public.pcd_quotes quote
set customer_id = customer.id
from public.pcd_customers customer
where quote.customer_id is null
  and lower(coalesce(nullif(customer.email, ''), customer.name, customer.phone, customer.site_address)) =
    lower(coalesce(nullif(quote.customer_email, ''), quote.customer_name, quote.customer_phone, quote.site_address));

update public.pcd_projects project
set customer_id = quote.customer_id
from public.pcd_quotes quote
where project.customer_id is null
  and project.quote_id = quote.id
  and quote.customer_id is not null;

create unique index if not exists idx_pcd_customers_email_unique
  on public.pcd_customers (lower(email))
  where email is not null and email <> '';
create index if not exists idx_pcd_customers_name on public.pcd_customers(name);
create index if not exists idx_pcd_customers_active on public.pcd_customers(is_active);
create index if not exists idx_pcd_quotes_status on public.pcd_quotes(status);
create index if not exists idx_pcd_quotes_access_code on public.pcd_quotes(access_code);
create index if not exists idx_pcd_quotes_customer on public.pcd_quotes(customer_id);
create index if not exists idx_pcd_quote_line_items_quote on public.pcd_quote_line_items(quote_id);
create index if not exists idx_pcd_projects_quote on public.pcd_projects(quote_id);
create index if not exists idx_pcd_projects_customer on public.pcd_projects(customer_id);
create index if not exists idx_pcd_project_line_items_project on public.pcd_project_line_items(project_id);
create index if not exists idx_pcd_project_line_items_status on public.pcd_project_line_items(status);

drop trigger if exists trg_pcd_customers_updated_at on public.pcd_customers;
create trigger trg_pcd_customers_updated_at
before update on public.pcd_customers
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_pcd_quotes_updated_at on public.pcd_quotes;
create trigger trg_pcd_quotes_updated_at
before update on public.pcd_quotes
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_pcd_quote_line_items_updated_at on public.pcd_quote_line_items;
create trigger trg_pcd_quote_line_items_updated_at
before update on public.pcd_quote_line_items
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_pcd_projects_updated_at on public.pcd_projects;
create trigger trg_pcd_projects_updated_at
before update on public.pcd_projects
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_pcd_project_line_items_updated_at on public.pcd_project_line_items;
create trigger trg_pcd_project_line_items_updated_at
before update on public.pcd_project_line_items
for each row execute function public.set_updated_at_timestamp();

-- Suggested policy model:
-- 1. Keep RLS enabled and allow only authenticated admin users to manage pcd_customers,
--    pcd_quotes, pcd_quote_line_items, pcd_quote_actions, pcd_projects, and pcd_project_line_items.
-- 2. Public quote approval in this app is handled by server API routes using access_code,
--    so direct public table access is not required.
-- 3. If you do not want to use the service-role API routes, add explicit RLS policies
--    for the admin email and tighten them before production.
