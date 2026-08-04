create table if not exists public.pcd_order_variations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pcd_orders(id) on delete cascade,
  variation_number text not null unique,
  access_code text not null unique,
  title text not null default 'Order Variation',
  status text not null default 'draft' check (
    status in ('draft', 'sent', 'viewed', 'approved', 'approved_pending_payment', 'applied', 'rejected', 'cancelled')
  ),
  customer_name text,
  customer_email text,
  customer_phone text,
  site_address text,
  currency text not null default 'AUD',
  gst_rate numeric(6,4) not null default 0.1,
  subtotal_ex_gst numeric(12,2) not null default 0,
  gst_amount numeric(12,2) not null default 0,
  total_inc_gst numeric(12,2) not null default 0,
  revised_order_total_inc_gst numeric(12,2) not null default 0,
  deposit_required boolean not null default false,
  deposit_percent numeric(6,2) not null default 0 check (deposit_percent >= 0 and deposit_percent <= 100),
  deposit_topup_required numeric(12,2) not null default 0,
  notes text,
  terms text,
  sent_at timestamptz,
  viewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pcd_order_variation_lines (
  id uuid primary key default gen_random_uuid(),
  variation_id uuid not null references public.pcd_order_variations(id) on delete cascade,
  order_line_item_id uuid references public.pcd_order_line_items(id) on delete set null,
  action text not null check (action in ('add', 'change', 'remove', 'price_adjustment')),
  sort_order integer not null default 0,
  title text,
  description text,
  product_type text,
  material text,
  supplier_name text,
  thickness text,
  width_mm numeric(12,2),
  height_mm numeric(12,2),
  finish text,
  colour text,
  profile_type text,
  profile text,
  edge_mould text,
  qty numeric(12,2) not null default 1,
  original_line_total_ex_gst numeric(12,2) not null default 0,
  proposed_line_total_ex_gst numeric(12,2) not null default 0,
  line_total_ex_gst numeric(12,2) not null default 0,
  original_item_snapshot jsonb,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.pcd_order_variation_lines
  add column if not exists supplier_name text,
  add column if not exists original_item_snapshot jsonb;

create table if not exists public.pcd_order_variation_actions (
  id uuid primary key default gen_random_uuid(),
  variation_id uuid not null references public.pcd_order_variations(id) on delete cascade,
  action text not null check (action in ('viewed', 'approved', 'rejected')),
  client_name text,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.pcd_order_line_items
  add column if not exists variation_id uuid references public.pcd_order_variations(id) on delete set null,
  add column if not exists removed_by_variation_id uuid references public.pcd_order_variations(id) on delete set null,
  add column if not exists variation_status text;

alter table public.pcd_order_activity
  add column if not exists variation_id uuid references public.pcd_order_variations(id) on delete set null;

alter table public.pcd_order_payments
  add column if not exists variation_id uuid references public.pcd_order_variations(id) on delete set null;

create index if not exists idx_pcd_order_variations_order on public.pcd_order_variations(order_id);
create index if not exists idx_pcd_order_variations_status on public.pcd_order_variations(status);
create index if not exists idx_pcd_order_variations_access_code on public.pcd_order_variations(access_code);
create index if not exists idx_pcd_order_variation_lines_variation on public.pcd_order_variation_lines(variation_id);
create index if not exists idx_pcd_order_variation_lines_order_item on public.pcd_order_variation_lines(order_line_item_id);
create index if not exists idx_pcd_order_variation_actions_variation on public.pcd_order_variation_actions(variation_id);
create index if not exists idx_pcd_order_activity_variation on public.pcd_order_activity(variation_id);
create index if not exists idx_pcd_order_payments_variation on public.pcd_order_payments(variation_id);

drop trigger if exists trg_pcd_order_variations_updated_at on public.pcd_order_variations;
create trigger trg_pcd_order_variations_updated_at
before update on public.pcd_order_variations
for each row execute function public.set_updated_at();

drop trigger if exists trg_pcd_order_variation_lines_updated_at on public.pcd_order_variation_lines;
create trigger trg_pcd_order_variation_lines_updated_at
before update on public.pcd_order_variation_lines
for each row execute function public.set_updated_at();
