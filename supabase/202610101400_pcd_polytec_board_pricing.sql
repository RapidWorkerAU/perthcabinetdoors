-- THE POLYTEC DECORATIVE BOARD RATE CARD.
--
-- Every piece sold on the web shop is made by Polytec. lib/pcd-polytec-board-pricing.js
-- works out what Polytec charges for a piece from the colour's board cost and
-- this card: the size steps, the per piece, edge and area figures, the finish
-- factors and our margin. They are what changes when Polytec changes its
-- prices, so they live here and are edited in Settings, never in the code.
--
--   rate_card    the card, as jsonb. Empty means nobody has saved one yet, and
--                the figures measured from the portal on 10 October 2026 are
--                used (written out in lib/pcd-polytec-board-pricing.js).
--   updated_at   when it was last saved.
--
-- One row. Read and written by signed-in staff through the admin API only.
--
-- One block, so an error anywhere undoes the lot. Safe to run twice.

do $$
begin
  create table if not exists public.pcd_polytec_board_pricing (
    id text primary key default 'polytec',
    rate_card jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    constraint pcd_polytec_board_pricing_single_row check (id = 'polytec')
  );

  insert into public.pcd_polytec_board_pricing (id) values ('polytec')
    on conflict (id) do nothing;

  comment on table public.pcd_polytec_board_pricing is
    'The Polytec decorative board rate card the web shop prices from. One row. See lib/pcd-polytec-board-pricing.js.';
  comment on column public.pcd_polytec_board_pricing.rate_card is
    'Size steps, per piece, edge and area figures, finish factors and margin. Empty means the figures measured from the portal on 10 October 2026.';

  alter table public.pcd_polytec_board_pricing enable row level security;

  drop policy if exists pcd_polytec_board_pricing_rw on public.pcd_polytec_board_pricing;
  create policy pcd_polytec_board_pricing_rw on public.pcd_polytec_board_pricing
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
end $$;
