-- Stable panel numbers for the production sheet.
--
-- The number printed beside a panel is stuck to physical timber, so it cannot
-- be a position in a list. If it were, removing one panel by variation and
-- reprinting would shift every number after it, and a label already on a piece
-- would then point at the wrong row.
--
-- So a number is assigned once, the first time a production document is
-- generated for that panel, and stored. A variation adding a panel takes the
-- next free number. A removed panel's number is retired, never reused, so an
-- old label can never come to mean something else.
--
-- panel_key identifies a panel within an order the same way panel_planning
-- does: "line:<item id>" for a plain line, or
-- "cabinet:<copy>:<piece label>:<piece index>" for one panel of a base cabinet.

create table if not exists public.pcd_order_panel_numbers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pcd_orders(id) on delete cascade,
  order_line_item_id uuid references public.pcd_order_line_items(id) on delete set null,
  panel_key text not null,
  panel_no integer not null check (panel_no > 0),
  created_at timestamptz not null default timezone('utc', now())
);

-- One number per panel, and one panel per number, both scoped to the order.
-- The second index is what makes "never reused" a rule the database enforces
-- rather than a promise the application makes.
create unique index if not exists idx_pcd_order_panel_numbers_key
  on public.pcd_order_panel_numbers(order_id, panel_key);
create unique index if not exists idx_pcd_order_panel_numbers_no
  on public.pcd_order_panel_numbers(order_id, panel_no);

alter table public.pcd_order_panel_numbers enable row level security;

-- Admin only, like the order it belongs to. Nothing customer facing reads this.
drop policy if exists "pcd_order_panel_numbers_admin_all" on public.pcd_order_panel_numbers;
create policy "pcd_order_panel_numbers_admin_all"
on public.pcd_order_panel_numbers
for all
to authenticated
using (true)
with check (true);

notify pgrst, 'reload schema';
