-- THE WEBSITE'S OWN SETTINGS: THE SHOP SWITCH, THE LEAD TIME, AND THE MESSAGES.
--
-- Whether the online shop is open, how many working days we quote for a shop
-- order, and the banner and notices shown to customers used to be written into
-- the code. They live here and are edited in Settings > Shop and Site Messages,
-- so opening the shop or running a sale is not a deploy. The rules are in
-- lib/pcd-site-settings.js.
--
--   settings     the lot, as jsonb: shop_open, lead_time_days (decorative
--                board), thermo_lead_time_days and messages. Empty means
--                nothing has been saved yet, which reads as the shop closed,
--                ten working days for both and no messages.
--   updated_at   when it was last saved.
--
-- One row. Read by the public site on the server and written by signed-in
-- staff through the admin API only.
--
-- One block, so an error anywhere undoes the lot. Safe to run twice.

do $$
begin
  create table if not exists public.pcd_site_settings (
    id text primary key default 'main',
    settings jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    constraint pcd_site_settings_single_row check (id = 'main')
  );

  insert into public.pcd_site_settings (id) values ('main')
    on conflict (id) do nothing;

  comment on table public.pcd_site_settings is
    'Whether the online shop is open, the shop lead time, and the banner and notices on the website. One row. See lib/pcd-site-settings.js.';
  comment on column public.pcd_site_settings.settings is
    'shop_open, lead_time_days, thermo_lead_time_days and messages (banner, shop, checkout, quote). Empty means the shop is closed, ten working days, no messages.';

  alter table public.pcd_site_settings enable row level security;

  drop policy if exists pcd_site_settings_rw on public.pcd_site_settings;
  create policy pcd_site_settings_rw on public.pcd_site_settings
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
end $$;
