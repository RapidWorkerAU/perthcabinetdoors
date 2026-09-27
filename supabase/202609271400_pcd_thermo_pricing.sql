-- THE THERMOLAMINATE RATE CARD.
--
-- Polytec thermolaminate is made to order, and used to be priced by keying each
-- size into the Polytec portal. lib/pcd-thermo-pricing.js now works the price
-- out from a rate card: the size steps, the rates for each profile category,
-- and the charges for each finish tier. Those are what Polytec changes when it
-- changes its prices, so they live here and are edited in Settings, never in
-- the code.
--
--   rate_card    the card, as jsonb. Empty means nobody has saved one yet, and
--                the rates measured from the portal on 27 September 2026 are
--                used (they are written out in lib/pcd-thermo-pricing.js). The
--                Settings screen says which it is.
--   updated_at   when it was last saved.
--
-- One row. Read and written by signed-in staff through the admin API only.
--
-- One block, so an error anywhere undoes the lot. Safe to run twice.

do $$
begin
  create table if not exists public.pcd_thermo_pricing (
    id text primary key default 'polytec',
    rate_card jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    constraint pcd_thermo_pricing_single_row check (id = 'polytec')
  );

  insert into public.pcd_thermo_pricing (id) values ('polytec')
    on conflict (id) do nothing;

  comment on table public.pcd_thermo_pricing is
    'The Polytec thermolaminate rate card the quote editor prices from. One row. See lib/pcd-thermo-pricing.js.';
  comment on column public.pcd_thermo_pricing.rate_card is
    'Size steps, category rates and finish tier charges. Empty means the rates measured from the portal on 27 September 2026.';

  alter table public.pcd_thermo_pricing enable row level security;

  drop policy if exists pcd_thermo_pricing_rw on public.pcd_thermo_pricing;
  create policy pcd_thermo_pricing_rw on public.pcd_thermo_pricing
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
end $$;
