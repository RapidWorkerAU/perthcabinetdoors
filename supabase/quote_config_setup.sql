create extension if not exists "pgcrypto";

create table if not exists public.quote_option_sets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (
    kind in (
      'finish',
      'colour_map',
      'profile_type',
      'profile_map',
      'edge_mould',
      'hinge'
    )
  ),
  config_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_quote_configs (
  product_id uuid primary key references public.products(id) on delete cascade,
  is_enabled boolean not null default true,
  quote_title text,
  quote_description text,
  finish_set_id uuid references public.quote_option_sets(id) on delete set null,
  colour_set_id uuid references public.quote_option_sets(id) on delete set null,
  profile_type_set_id uuid references public.quote_option_sets(id) on delete set null,
  profile_set_id uuid references public.quote_option_sets(id) on delete set null,
  edge_set_id uuid references public.quote_option_sets(id) on delete set null,
  hinge_set_id uuid references public.quote_option_sets(id) on delete set null,
  groups_json jsonb not null default '{}'::jsonb,
  dimensions_json jsonb not null default '{}'::jsonb,
  pricing_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_quote_option_sets_kind
  on public.quote_option_sets(kind);

create index if not exists idx_product_quote_configs_enabled
  on public.product_quote_configs(is_enabled);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_quote_option_sets_updated_at on public.quote_option_sets;
create trigger trg_quote_option_sets_updated_at
before update on public.quote_option_sets
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_product_quote_configs_updated_at on public.product_quote_configs;
create trigger trg_product_quote_configs_updated_at
before update on public.product_quote_configs
for each row execute function public.set_updated_at_timestamp();

-- Recommended policies:
-- 1. Admin-authenticated users can select/insert/update/delete from quote_option_sets and product_quote_configs.
-- 2. Public read can be allowed for product_quote_configs and quote_option_sets if you prefer direct client reads.
--    This project currently reads quote config through server/API code, so public policies are optional.
